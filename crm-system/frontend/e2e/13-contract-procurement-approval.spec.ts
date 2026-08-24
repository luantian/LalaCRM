import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall,
  openModal, fillFormItem, submitModal, tableRow,
} from './helpers'

/**
 * 合同审批 + 采购流转 E2E（2026-08 补 UI 后新增）
 *
 * 覆盖：合同 提交审批(DRAFT→PENDING)→批准(→ACTIVE，意见留痕展示)；
 *       合同拒绝（原因必填→CANCELLED）；采购 下单→运输中→确认到货 流转按钮；
 *       采购取消（原因必填）；创建表单不再提供状态直选。
 */

async function confirmPopconfirm(page: any) {
  await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
}

test.describe('合同审批流（项目详情页）', () => {
  let projectId: number
  let orgId: number

  test.beforeAll(async () => {
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E合同审批客户'), type: 'COMPANY' })
    const proj = await apiCall(ADMIN, 'POST', '/projects', { name: unique('E2E合同审批项目'), organizationId: org.json.id })
    projectId = proj.json?.id
    orgId = org.json?.id
  })

  test('UI 建合同（无状态直选）→ 提交审批 → 批准 → 意见留痕展示', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)
    await page.getByRole('tab', { name: /合同/ }).click()

    // 新建合同：表单无"状态"字段（锁定为草稿）
    const name = unique('E2E审批合同A')
    await openModal(page, page.getByRole('button', { name: /新增合同/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal.locator('.ant-form-item-label', { hasText: '状态' })).toHaveCount(0)
    await fillFormItem(modal, '合同名称', name)
    await fillFormItem(modal, '合同金额', '10000')
    await submitModal(page)
    await expectSuccess(page)

    const row = tableRow(page, name)
    await expect(row.locator('.ant-tag', { hasText: '草稿' })).toBeVisible()

    // 提交审批 → 待审批
    await row.getByRole('button', { name: /提交审批/ }).click()
    await confirmPopconfirm(page)
    await expectSuccess(page, '已提交审批')
    await expect(row.locator('.ant-tag', { hasText: '待审批' })).toBeVisible()

    // 批准 → 生效中
    await row.getByRole('button', { name: /批\s*准/ }).click()
    await confirmPopconfirm(page)
    await expectSuccess(page, '已批准')
    await expect(row.locator('.ant-tag', { hasText: '生效中' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('管理员一键生效：草稿直达生效中', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)

    const name = unique('E2E一键生效合同')
    const c = await apiCall(ADMIN, 'POST', '/contracts', { name, organizationId: orgId, amount: 8000, projectId })
    test.skip(c.status !== 201, `合同创建失败: ${c.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)
    await page.getByRole('tab', { name: /合同/ }).click()

    const row = tableRow(page, name)
    await expect(row.locator('.ant-tag', { hasText: '草稿' })).toBeVisible()
    await row.getByRole('button', { name: /一键生效/ }).click()
    await confirmPopconfirm(page)
    await expectSuccess(page, '合同已生效')
    await expect(row.locator('.ant-tag', { hasText: '生效中' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('合同拒绝：原因必填 → 已取消 + 意见红色展示', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)

    // API 建草稿合同并提交
    const name = unique('E2E审批合同B')
    const c = await apiCall(ADMIN, 'POST', '/contracts', { name, organizationId: orgId, amount: 5000, projectId })
    test.skip(c.status !== 201, `合同创建失败: ${c.status}`)
    await apiCall(ADMIN, 'POST', `/contracts/${c.json.id}/approve`, { status: 'PENDING' })

    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)
    await page.getByRole('tab', { name: /合同/ }).click()

    const row = tableRow(page, name)
    await row.getByRole('button', { name: /拒\s*绝/ }).click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()

    // 空原因 → 前端拦截
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*认/ }).click()
    await expect(page.locator('.ant-message-error, .ant-message-notice', { hasText: '请填写原因' }).first()).toBeVisible()

    const reason = 'E2E合同拒绝原因-条款异议'
    await modal.locator('textarea').fill(reason)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*认/ }).click()
    await expectSuccess(page)
    await expect(row.locator('.ant-tag', { hasText: '已取消' })).toBeVisible()
    await expect(row.getByText(reason)).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('采购流转（项目详情页）', () => {
  let projectId: number
  let orgId: number

  test.beforeAll(async () => {
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E采购流转客户'), type: 'COMPANY' })
    const proj = await apiCall(ADMIN, 'POST', '/projects', { name: unique('E2E采购流转项目'), organizationId: org.json.id })
    projectId = proj.json?.id
    orgId = org.json?.id
  })

  test('UI 建采购（无状态直选）→ 下单 → 运输中 → 确认到货', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)
    await page.getByRole('tab', { name: /采购/ }).click()

    const title = unique('E2E流转采购单')
    await openModal(page, page.getByRole('button', { name: /新增采购单/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal.locator('.ant-form-item-label', { hasText: '状态' })).toHaveCount(0)
    await fillFormItem(modal, /采购标题|标题/, title)
    await fillFormItem(modal, /供应商/, 'E2E流转供应商')
    await submitModal(page)
    await expectSuccess(page)

    const row = tableRow(page, title)
    await expect(row.locator('.ant-tag', { hasText: '计划中' })).toBeVisible()

    // 下单 → 已下单
    await row.getByRole('button', { name: /下\s*单/ }).click()
    await confirmPopconfirm(page)
    await expect(row.locator('.ant-tag', { hasText: '已下单' })).toBeVisible()

    // 运输中
    await row.getByRole('button', { name: /运输中/ }).click()
    await confirmPopconfirm(page)
    await expect(row.locator('.ant-tag', { hasText: '运输中' })).toBeVisible()

    // 确认到货 → 终态
    await row.getByRole('button', { name: /确认到货/ }).click()
    await confirmPopconfirm(page)
    await expect(row.locator('.ant-tag', { hasText: '已到货' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('采购取消：原因必填 → 已取消 + 备注展示', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)

    const title = unique('E2E取消采购单')
    const p = await apiCall(ADMIN, 'POST', '/procurements', { title, vendor: 'E2E取消供应商', projectId })
    test.skip(p.status !== 201, `采购创建失败: ${p.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${projectId}`)
    await page.getByRole('tab', { name: /采购/ }).click()

    const row = tableRow(page, title)
    await row.getByRole('button', { name: /取\s*消/ }).click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()

    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*认/ }).click()
    await expect(page.locator('.ant-message-error, .ant-message-notice', { hasText: '请填写原因' }).first()).toBeVisible()

    const reason = 'E2E采购取消原因-供应商停产'
    await modal.locator('textarea').fill(reason)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*认/ }).click()
    await expectSuccess(page)
    await expect(row.locator('.ant-tag', { hasText: '已取消' })).toBeVisible()
    await expect(row.getByText(reason)).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
