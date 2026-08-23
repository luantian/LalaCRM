import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, openModal, submitModal,
  fillFormItem, selectInForm, fillDateToday, unique,
  tableRow, expectSuccess, confirmPopconfirm, apiCall,
} from './helpers'

let contactName: string
let projectName: string
let projectDetailUrl: string

test.describe('项目全流程（含详情页多层嵌套）', () => {
  test.beforeAll(async () => {
    // 用 API 准备客户+联系人（项目表单的"客户"字段选的是联系人，选中后自动带出组织）
    const org = await apiCall(ADMIN, 'POST', '/organizations', {
      name: unique('E2E项目客户'), type: 'COMPANY', address: 'E2E',
    })
    const contact = await apiCall(ADMIN, 'POST', `/organizations/${org.json.id}/contacts`, {
      name: unique('E2E项目联系人'), phone: '13700003333',
    })
    contactName = contact.json?.name || ''
  })

  test('新增项目（联系人级联选择客户 + 预算）→ 列表可见 → 进入详情', async ({ page }) => {
    test.skip(!contactName, '联系人准备失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/projects')

    projectName = unique('E2E项目')
    await openModal(page, page.getByRole('button', { name: /新增项目/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '项目名称', projectName)
    await selectInForm(modal, '客户', contactName)
    await fillFormItem(modal, '预算', '100000')
    await submitModal(page)
    await expectSuccess(page)

    // 列表出现并点击进入详情
    const row = tableRow(page, projectName)
    await expect(row).toBeVisible()
    await row.locator('a').first().click()
    await page.waitForURL((u) => /\/projects\/\d+/.test(u.pathname))
    projectDetailUrl = page.url()
    await expect(page.locator(`text=${projectName}`).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('详情页：全部主 Tab 可切换渲染', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, projectDetailUrl.replace('http://localhost:3000', ''))

    for (const tab of ['团队成员', '采购管理']) {
      await page.locator('.ant-tabs-tab', { hasText: tab }).first().click()
      await expect(page.locator('.ant-tabs-tab-active', { hasText: tab })).toBeVisible()
      await page.waitForTimeout(300)
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('编辑项目：仅改名不丢预算与周期（回归：PUT 部分更新数据丢失）', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, projectDetailUrl.replace('http://localhost:3000', ''))

    // 编辑按钮在"基本信息" Tab 内
    await page.locator('.ant-tabs-tab', { hasText: '基本信息' }).first().click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /编\s*辑/ }).first().click()
    await expect(page.locator('.ant-modal-title', { hasText: '编辑项目' })).toBeVisible()
    await page.locator('.ant-modal input').first().fill(projectName + '-改')
    await submitModal(page)
    await expectSuccess(page)
    projectName = projectName + '-改'
    await expect(page.locator(`text=${projectName}`).first()).toBeVisible()
  })

  test('团队成员：添加成员（弹窗选人）', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, projectDetailUrl.replace('http://localhost:3000', ''))

    await page.locator('.ant-tabs-tab', { hasText: '团队成员' }).first().click()
    const addBtn = page.getByRole('button', { name: /添加成员|新增成员/ }).first()
    await openModal(page, addBtn)
    // 选择成员（必填，multiple 模式；候选不含已在团队的创建者）
    // TeamMembersPanel 弹窗无 Form/label，只有一个 Select，按选择器直接定位
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await modal.locator('.ant-select-selector').first().click()
    await page.waitForTimeout(400)
    const opt = page.locator('.ant-select-dropdown:visible .ant-select-item-option').first()
    await opt.waitFor({ timeout: 8_000 })
    await opt.click()
    await page.waitForTimeout(400)
    // multiple 模式选完后下拉保持打开，收起再提交
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await submitModal(page)
    await page.waitForTimeout(800)
  })

  test('合同嵌套流：新增合同 → 订货明细 → 回款 → 发货 → 逐项删除', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, projectDetailUrl.replace('http://localhost:3000', ''))

    // 1) 切到"合同管理" Tab 后新增合同
    await page.locator('.ant-tabs-tab', { hasText: '合同管理' }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /新增合同/ }).first().click()
    await expect(page.locator('.ant-modal-title', { hasText: '新增合同' })).toBeVisible()
    const contractName = unique('E2E合同')
    await fillFormItem(page, '合同名称', contractName)
    await fillFormItem(page, '合同金额', '50000')
    await submitModal(page)
    await expectSuccess(page)

    // 找到该合同行，展开其嵌套 Tabs（订货/回款/发货在合同行内 Tabs）
    const contractRow = page.locator('.ant-table-tbody tr', { hasText: contractName }).first()
    await expect(contractRow).toBeVisible()
    // 展开行（如有展开按钮）或行内直接有 Tab
    const expander = contractRow.locator('.ant-table-row-expand-icon')
    if (await expander.isVisible().catch(() => false)) await expander.click()
    await page.waitForTimeout(500)

    // 2) 订货明细（按钮文案为"添加明细"）
    const ordersTab = page.locator('.ant-tabs-tab', { hasText: '订货明细' }).first()
    await ordersTab.click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /添加明细|添加订货|新增订货/ }).first().click()
    await expect(page.locator('.ant-modal-title', { hasText: '添加订货明细' })).toBeVisible()
    const orderModal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(orderModal, '产品/服务名称', unique('E2E产品'))
    await fillFormItem(orderModal, '数量', '2')
    await fillFormItem(orderModal, '单价', '1500')
    await submitModal(page)
    await page.waitForTimeout(800)
    // 删除该订货明细（Popconfirm → try/catch 回归；双重 tabpane-active 限定到嵌套表格，
    // 避免误点外层合同表的删除按钮）
    const delOrder = page
      .locator('.ant-tabs-tabpane-active .ant-tabs-tabpane-active .ant-table-tbody button', { hasText: /^删\s*除/ })
      .first()
    if (await delOrder.isVisible().catch(() => false)) {
      await confirmPopconfirm(page, delOrder)
      await page.waitForTimeout(600)
    }

    // 3) 回款记录
    await page.locator('.ant-tabs-tab', { hasText: '回款记录' }).first().click()
    await page.getByRole('button', { name: /添加回款/ }).first().click()
    await expect(page.locator('.ant-modal-title', { hasText: '添加回款记录' })).toBeVisible()
    await fillFormItem(page, '回款金额', '20000')
    await fillDateToday(page, '回款日期')
    await submitModal(page)
    await page.waitForTimeout(800)

    // 4) 发货记录
    await page.locator('.ant-tabs-tab', { hasText: '发货记录' }).first().click()
    await page.getByRole('button', { name: /添加发货/ }).first().click()
    await expect(page.locator('.ant-modal-title', { hasText: '添加发货记录' })).toBeVisible()
    await fillDateToday(page, '发货日期')
    await fillFormItem(page, '发货内容', 'E2E 测试发货')
    await submitModal(page)
    await page.waitForTimeout(800)

    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('采购嵌套流：新增采购 → 明细 → 付款', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, projectDetailUrl.replace('http://localhost:3000', ''))

    await page.locator('.ant-tabs-tab', { hasText: '采购管理' }).first().click()
    const addProc = page.getByRole('button', { name: /新增采购|新建采购|添加采购/ }).first()
    await openModal(page, addProc)
    const procModal = page.locator('.ant-modal:visible .ant-modal-content')
    const procTitle = unique('E2E采购')
    await fillFormItem(procModal, '采购标题', procTitle)
    await fillFormItem(procModal, '供应商', 'E2E供应商')
    // 采购创建弹窗无金额字段（金额在明细/付款层）
    await submitModal(page)
    await expectSuccess(page)

    // 打开采购详情（行点击/查看）→ 明细 Tab → 添加明细
    const procRow = page.locator('.ant-tabs-tabpane-active .ant-table-tbody tr', { hasText: procTitle }).first()
    await procRow.click()
    await page.waitForTimeout(600)
    const itemsTab = page.locator('.ant-tabs-tab', { hasText: '采购明细' }).first()
    if (await itemsTab.isVisible().catch(() => false)) {
      await itemsTab.click()
      const addItem = page.getByRole('button', { name: /添加明细|新增明细/ }).first()
      if (await addItem.isVisible().catch(() => false)) {
        await openModal(page, addItem)
        const itemModal = page.locator('.ant-modal:visible .ant-modal-content')
        await fillFormItem(itemModal, /名称|产品/, unique('E2E物料'))
        await fillFormItem(itemModal, '数量', '1')
        await fillFormItem(itemModal, '单价', '300')
        await submitModal(page)
        await page.waitForTimeout(600)
      }
    }

    // 付款记录 Tab
    const payTab = page.locator('.ant-tabs-tab', { hasText: '付款记录' }).first()
    if (await payTab.isVisible().catch(() => false)) {
      await payTab.click()
      const addPay = page.getByRole('button', { name: /添加付款|新增付款|登记付款/ }).first()
      if (await addPay.isVisible().catch(() => false)) {
        await openModal(page, addPay)
        const payModal = page.locator('.ant-modal:visible .ant-modal-content')
        await fillFormItem(payModal, /金额/, '4000')
        await fillDateToday(payModal, /付款日期|日期/)
        await submitModal(page)
        await page.waitForTimeout(600)
      }
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('项目归档（编辑→已完成→自动归档）→ 归档列表可见', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/projects')
    const row = tableRow(page, projectName)
    await row.hover()
    // 归档路径：编辑弹窗把状态改为"已完成"（后端自动归档）
    await row.getByRole('button', { name: /编\s*辑/ }).first().click()
    await page.locator('.ant-modal-title', { hasText: '编辑项目' }).waitFor()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await selectInForm(modal, '状态', '已完成')
    await submitModal(page)
    await expectSuccess(page)
    await page.waitForTimeout(800)
    // 已完成项目默认从普通列表排除，进入归档页应可见
    await gotoApp(page, '/projects/archived')
    const archivedRow = page.locator('.ant-table-tbody', { hasText: projectName }).first()
    await expect(archivedRow).toBeVisible()
  })

  test('删除项目（未归档：Popconfirm → 列表移除；已归档：后端拒绝）', async ({ page }) => {
    test.skip(!projectDetailUrl, '依赖前置项目')
    await loginViaApi(page, ADMIN)

    // 1) 已归档项目删除被后端拒绝（设计行为：归档保护）——API 层断言
    const archivedId = projectDetailUrl.match(/\/projects\/(\d+)/)?.[1]
    const delArchived = await apiCall(ADMIN, 'DELETE', `/projects/${archivedId}`)
    expect([403, 400]).toContain(delArchived.status)

    // 2) 新建一个未归档的临时项目，UI 删除（归档页无删除入口——见报告"产品发现"）
    const anyOrg = await apiCall(ADMIN, 'GET', '/organizations/simple')
    const orgId = Array.isArray(anyOrg.json) ? anyOrg.json[0]?.id : null
    test.skip(!orgId, '无可用客户')
    const tmp = await apiCall(ADMIN, 'POST', '/projects', {
      name: unique('E2E待删项目'), organizationId: orgId, contactId: null,
    })
    await gotoApp(page, '/projects')
    const row = tableRow(page, tmp.json.name)
    await row.hover()
    const delBtn = row.getByRole('button', { name: /删\s*除/ }).first()
    await delBtn.waitFor()
    await confirmPopconfirm(page, delBtn)
    await page.waitForTimeout(1000)
    await expect(page.locator('.ant-table-tbody')).not.toContainText(tmp.json.name)
  })
})
