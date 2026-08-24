import { test, expect, Page } from '@playwright/test'
import {
  ADMIN, TESTER, APPROVER, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall, tableRow,
} from './helpers'

/**
 * 费用报销审批 UI E2E（2026-08 补最大盲区）
 *
 * 覆盖：列表"更多"菜单 提交申请 → 批准（弹窗展示明细+备注）→ 标记已支付；
 *       驳回（原因必填拦截）→ 重新提交。双账号：TESTER 报销人 / APPROVER 审批人。
 */

async function clickExpenseMore(page: Page, title: string, itemText: string) {
  const row = tableRow(page, title)
  const item = page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: itemText }).first()
  // 表格行重渲染可能把刚打开的下拉一并销毁（全量跑时的时序抖动）——等不到就再点一次
  for (let attempt = 0; attempt < 3; attempt++) {
    await row.getByRole('button', { name: /更\s*多/ }).click()
    if (await item.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)) break
  }
  await item.click()
}

test.describe('费用报销审批流', () => {
  let projectId: number

  test.beforeAll(async () => {
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E报销审批客户'), type: 'COMPANY' })
    const proj = await apiCall(TESTER, 'POST', '/projects', { name: unique('E2E报销审批项目'), organizationId: org.json.id })
    projectId = proj.json?.id
  })

  test('TESTER 提交申请 → APPROVER 批准（弹窗明细+备注）→ 标记已支付', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)

    // TESTER API 建报销（UI 创建已由 06 覆盖）
    const today = new Date().toISOString().slice(0, 10)
    const title = unique('E2E审批报销A')
    const e = await apiCall(TESTER, 'POST', '/expenses', {
      title, projectId, totalAmount: 100,
      items: [{ category: '办公用品', amount: 100, expenseDate: today, description: 'E2E审批明细-打印纸' }],
    })
    test.skip(e.status !== 201, `报销创建失败: ${e.status}`)

    // TESTER 提交
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/expenses')
    await clickExpenseMore(page, title, '提交申请')
    await expectSuccess(page, '已提交申请')
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '待审批' })).toBeVisible()

    // APPROVER 批准：弹窗展示明细
    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/expenses')
    await clickExpenseMore(page, title, '批准')
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('E2E审批明细-打印纸')).toBeVisible()
    await modal.locator('textarea').fill('E2E审批备注-合规')
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认批准/ }).click()
    await expectSuccess(page, '已批准')
    // 先等表格行状态刷新为"已批准"再打开菜单（菜单项按行状态计算，避免拿到旧状态的菜单）
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '已批准' })).toBeVisible()

    // 标记已支付
    await clickExpenseMore(page, title, '标记已支付')
    await expectSuccess(page)
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '已支付' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('驳回（原因必填）→ 重新提交 → 详情页审批人可见', async ({ page }) => {
    test.skip(!projectId, '前置项目创建失败')
    const errors = collectPageErrors(page)

    const today = new Date().toISOString().slice(0, 10)
    const title = unique('E2E审批报销B')
    const e = await apiCall(TESTER, 'POST', '/expenses', {
      title, projectId, totalAmount: 200,
      items: [{ category: '差旅费', amount: 200, expenseDate: today, description: 'E2E待驳回车费' }],
    })
    await apiCall(TESTER, 'POST', `/expenses/${e.json.id}/submit`, {})

    // APPROVER 驳回：空原因被拦截
    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/expenses')
    await clickExpenseMore(page, title, '驳回')
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认驳回/ }).click()
    await expect(page.locator('.ant-message-error, .ant-message-notice', { hasText: '请填写驳回原因' }).first()).toBeVisible()
    const reason = 'E2E驳回原因-缺行程单'
    await modal.locator('textarea').fill(reason)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认驳回/ }).click()
    await expectSuccess(page, '已驳回')
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '已驳回' })).toBeVisible()

    // TESTER 重新提交
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/expenses')
    await clickExpenseMore(page, title, '重新提交')
    await expectSuccess(page)
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '待审批' })).toBeVisible()

    // 详情页：审批人信息展示
    await tableRow(page, title).locator('a').first().click()
    await page.waitForURL((u) => /\/expenses\/\d+/.test(u.pathname), { timeout: 10_000 })
    await expect(page.getByText('测试审批人').first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
