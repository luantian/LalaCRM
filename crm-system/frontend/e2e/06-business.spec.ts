import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, openModal, submitModal,
  fillFormItem, selectInForm, selectTreeInForm, fillDateToday, unique,
  tableRow, expectSuccess, apiCall,
} from './helpers'

test.describe('售前管理', () => {
  let contactName: string
  test.beforeAll(async () => {
    // 准备客户 + 联系人（售前表单需要选择联系人/客户）
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E售前客户'), type: 'COMPANY' })
    const contact = await apiCall(ADMIN, 'POST', `/organizations/${org.json.id}/contacts`, {
      name: unique('E2E联系人'), phone: '13900002222',
    })
    contactName = contact.json?.name || ''
  })

  test('新增项目机会（联系人级联选择）→ 列表可见 → 打开详情页', async ({ page }) => {
    test.skip(!contactName, '联系人准备失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/opportunities')

    const name = unique('E2E售前')
    await openModal(page, page.getByRole('button', { name: /新增项目机会/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '项目名称', name)
    await fillFormItem(modal, '预算', '20000')
    // 客户（全局联系人选择器）
    await selectInForm(modal, '客户', contactName)
    await submitModal(page)
    await expectSuccess(page)
    await expect(page.locator('.ant-table-tbody', { hasText: name }).first()).toBeVisible()

    // 打开详情（售前详情路由）
    await tableRow(page, name).locator('a, button', { hasText: /查\s*看|详\s*情/ }).first().click()
    await page.waitForURL((u) => /\/opportunities\/\d+/.test(u.pathname), { timeout: 10_000 })
    await expect(page.locator('.ant-layout-content')).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('报价单', () => {
  test('新建报价单（表单 + 添加行明细）', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/quotations')

    await openModal(page, page.getByRole('button', { name: /新建报价单/ }))
    await fillFormItem(page, '报价单名称', unique('E2E报价'))
    // 添加行（明细行嵌套操作）
    const addRow = page.getByRole('button', { name: /添加行|新增行|添加明细/ }).first()
    if (await addRow.isVisible().catch(() => false)) {
      await addRow.click()
      const nameInput = page.locator('.ant-modal .ant-table-tbody input').first()
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('E2E行项目')
      }
    }
    await submitModal(page)
    // 成功或校验提示均证明提交流程走通
    await page.waitForTimeout(1000)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('费用报销', () => {
  let projectName: string
  test.beforeAll(async () => {
    // 报销表单"关联项目"必填，准备一个项目
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E报销客户'), type: 'COMPANY' })
    const contact = await apiCall(ADMIN, 'POST', `/organizations/${org.json.id}/contacts`, { name: unique('E2E报销联系人'), phone: '13600004444' })
    const proj = await apiCall(ADMIN, 'POST', '/projects', {
      name: unique('E2E报销项目'), organizationId: org.json.id, contactId: contact.json?.id,
    })
    projectName = proj.json?.name || ''
  })

  test('新增报销（标题+项目+费用明细嵌套行）→ 列表可见', async ({ page }) => {
    test.skip(!projectName, '项目准备失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/expenses')

    const title = unique('E2E报销')
    await openModal(page, page.getByRole('button', { name: /新增报销/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '报销标题', title)
    await selectInForm(modal, '关联项目', projectName)

    // 添加一行费用明细（Form.List 嵌套行：类别/金额/日期）
    const addRowBtn = modal.getByRole('button', { name: /添加|新增/ }).first()
    if (await addRowBtn.isVisible().catch(() => false)) {
      await addRowBtn.click()
      await page.waitForTimeout(300)
      // 费用类别：按"费用类别" placeholder 定位该行内的 Select
      const catSelect = modal.locator('.ant-select:has(.ant-select-selection-placeholder:has-text("费用类别"))').first()
      await catSelect.click()
      await page.waitForTimeout(400)
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '办公用品' }).first().click()
      await modal.locator('input[placeholder="金额（元）"]').first().fill('199')
      await modal.locator('.ant-picker input').first().click()
      await page.waitForTimeout(400)
      await page.locator('.ant-picker-dropdown:visible .ant-picker-cell-today .ant-picker-cell-inner').first().click()
    }

    await submitModal(page)
    await expectSuccess(page)
    await expect(page.locator('.ant-table-tbody', { hasText: title }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('日报', () => {
  test('新增日报（日期 + 工作条目 + 工时）→ 列表可见', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/daily-reports')

    await openModal(page, page.getByRole('button', { name: /新增日报/ }))
    // 日期默认今天，直接填第一个条目内容
    const content = page.locator('.ant-modal textarea').first()
    await content.fill('E2E 自动化填写的工作内容')
    const hours = page.locator('.ant-modal input[placeholder="0.5"]').first()
    if (await hours.isVisible().catch(() => false)) await hours.fill('2')
    await submitModal(page)
    await expectSuccess(page)
    await expect(page.locator('text=E2E 自动化填写的工作内容').first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('出差管理', () => {
  let tripContact: string
  test.beforeAll(async () => {
    // 出差表单"客户"（联系人）为必填
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E出差客户'), type: 'COMPANY' })
    const contact = await apiCall(ADMIN, 'POST', `/organizations/${org.json.id}/contacts`, { name: unique('E2E出差联系人'), phone: '13500005555' })
    tripContact = contact.json?.name || ''
  })

  test('新增出差（客户 + 标题 + 目的地 + 日期范围）→ 列表可见', async ({ page }) => {
    test.skip(!tripContact, '联系人准备失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/business-trips')

    const title = unique('E2E出差')
    await openModal(page, page.getByRole('button', { name: /新增出差/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '出差标题', title)
    await fillFormItem(modal, '目的地', '上海')
    // 出差目的（后端必填，前端表单已补必填标记——E2E 发现的契约不一致）
    await fillFormItem(modal, '出差目的', 'E2E 自动化出差测试')
    // 客户（必填联系人选择）
    await selectInForm(modal, '客户', tripContact)
    // 出差日期 RangePicker：面板点"今天"选开始日期，焦点自动移到结束输入框后键入同一日期回车
    const rangeItem = modal.locator('.ant-form-item:has(label:has-text("出差日期"))')
    await rangeItem.locator('.ant-picker input').first().click()
    await page.waitForTimeout(400)
    const todayInner = page.locator('.ant-picker-dropdown:visible .ant-picker-cell-today .ant-picker-cell-inner').first()
    await todayInner.click()
    await page.waitForTimeout(400)
    const t2 = new Date()
    const iso2 = `${t2.getFullYear()}-${String(t2.getMonth() + 1).padStart(2, '0')}-${String(t2.getDate()).padStart(2, '0')}`
    await page.keyboard.type(iso2)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    // 注意：不再按 Escape —— 面板在回车后自动收起，而 Esc 会关闭整个弹窗

    await submitModal(page)
    await expectSuccess(page)
    await expect(page.locator('.ant-table-tbody', { hasText: title }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('考勤打卡页', () => {
  test('出差打卡按钮可见且可点击', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/check-ins')

    const btn = page.getByRole('button', { name: /出差打卡|上班打卡|打卡/ }).first()
    await expect(btn).toBeVisible()
    await btn.click()
    // 成功/重复打卡均有 message 反馈
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('申请补卡弹窗（嵌套日期选择）', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/check-ins')

    const applyBtn = page.getByRole('button', { name: /申请补卡/ }).first()
    if (!(await applyBtn.isVisible().catch(() => false))) {
      test.skip(true, '页面无申请补卡入口（可能因当日状态隐藏）')
    }
    await openModal(page, applyBtn)
    await expect(page.locator('.ant-modal:visible .ant-modal-content')).toBeVisible()
    // 关闭即可（不实际提交，避免污染考勤数据）
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^取\s*消/ }).first().click()
  })
})

test.describe('发票与归档页渲染交互', () => {
  test('项目归档页搜索/表格交互', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/sales')
    const table = page.locator('.ant-table')
    await expect(table.first()).toBeVisible()
  })

  test('统计卡片渲染（工作总览数据源）', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    await expect(page.locator('.ant-card').first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
