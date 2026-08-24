import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall,
  openModal, fillFormItem, submitModal,
} from './helpers'

/**
 * 财务模块 UI E2E（2026-08 补盲区）
 *
 * 覆盖：项目详情页「合同管理」Tab 新增合同 → 列表可见 → 展开行添加开票记录
 *       （税额/价税合计联动）→「采购管理」Tab 新增采购单。
 * 注：合同/采购的审批后端有状态机但前端无审批按钮（探索确认），
 *     审批流断言由 smoke G13 的 API 层覆盖，此处不重复。
 */

test.describe('财务模块（项目详情页）', () => {
  let projectId: number

  test.beforeAll(async () => {
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E财务客户'), type: 'COMPANY' })
    const proj = await apiCall(ADMIN, 'POST', '/projects', { name: unique('E2E财务项目'), organizationId: org.json.id })
    projectId = proj.json?.id
  })

  test('新增合同 → 合同列表可见', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)

    await page.getByRole('tab', { name: /合同/ }).click()
    const name = unique('E2E合同')
    await openModal(page, page.getByRole('button', { name: /新增合同/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '合同名称', name)
    await fillFormItem(modal, '合同金额', '10000')
    await submitModal(page)
    await expectSuccess(page)
    await expect(page.locator('.ant-table-tbody tr', { hasText: name }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('合同展开行添加开票记录（税额/价税合计联动）', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)

    // 前置：API 建一份合同（UI 上一用例已验证创建，此处直接准备数据）
    const org = await apiCall(ADMIN, 'GET', '/projects/' + projectId)
    const contract = await apiCall(ADMIN, 'POST', '/contracts', {
      name: unique('E2E开票合同'), organizationId: org.json?.organizationId, amount: 20000, projectId,
    })
    test.skip(contract.status !== 201, `合同创建失败: ${contract.status} ${JSON.stringify(contract.json)?.slice(0, 100)}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)
    await page.getByRole('tab', { name: /合同/ }).click()

    // 展开合同行 → 切到"开票记录"嵌套 Tab → 添加开票记录
    const row = page.locator('.ant-table-tbody tr', { hasText: contract.json.name }).first()
    await row.locator('.ant-table-row-expand-icon').click()
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: /开票记录/ }).first().click()
    await page.getByRole('button', { name: /添加开票/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()

    // 填发票号 + 金额 100 + 税率 13 → 联动显示 税额 13.00 / 价税合计 113.00元
    await fillFormItem(modal, '发票号码', `E2E-${Date.now()}`)
    await fillFormItem(modal, /不含税金额|金额/, '100')
    const taxItem = modal.locator('.ant-form-item', { hasText: /税率/ }).first()
    const taxInput = taxItem.locator('input')
    await taxInput.fill('13')
    await page.waitForTimeout(400)
    await expect(modal.getByText('13.00').first()).toBeVisible()
    await expect(modal.getByText('113.00元').first()).toBeVisible()

    await submitModal(page)
    await expectSuccess(page)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('新增采购单 → 采购列表可见', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)

    await page.getByRole('tab', { name: /采购/ }).click()
    const title = unique('E2E采购单')
    await openModal(page, page.getByRole('button', { name: /新增采购单/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, /采购标题|标题/, title)
    await fillFormItem(modal, /供应商/, 'E2E供应商')
    await submitModal(page)
    await expectSuccess(page)
    await expect(page.locator('.ant-table-tbody tr', { hasText: title }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
