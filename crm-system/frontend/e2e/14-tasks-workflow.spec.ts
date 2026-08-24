import { test, expect, Page } from '@playwright/test'
import {
  ADMIN, TESTER, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall, tableRow,
} from './helpers'

/**
 * 任务工作流 E2E（2026-08 补盲区：双视角状态流转闭环）
 *
 * 覆盖：TESTER（被指派人）在"我的待办"开始任务→提交完成（弹窗填说明）；
 *       ADMIN（委派人）在"我委派的"确认完成/驳回（弹窗填理由）；
 *       流转后双方通知到位（TASK_COMPLETED / TASK_REJECTED）。
 * 通知的 WS 推送与铃铛 UI 已由 11-notifications 覆盖，此处用 API 断言通知内容。
 */

/** 切换 Dashboard 任务 Tab 并等待数据加载 */
async function gotoTab(page: Page, tabText: string) {
  await page.locator('.ant-tabs-tab', { hasText: tabText }).first().click()
  await page.waitForTimeout(600)
}

test.describe('任务工作流（双视角）', () => {
  test('TESTER 开始任务 → 提交完成说明', async ({ page }) => {
    const errors = collectPageErrors(page)

    // ADMIN 委派一个任务给 TESTER
    const title = unique('E2E工作流任务')
    const t = await apiCall(ADMIN, 'POST', '/tasks', { title, assigneeIds: [2], priority: 'HIGH', description: 'E2E 双视角流转测试' })
    test.skip(t.status !== 201, `任务创建失败: ${t.status} ${JSON.stringify(t.json)?.slice(0, 80)}`)

    await loginViaApi(page, TESTER)
    await gotoApp(page, '/')

    // 卡片网格前端每页仅 6 张——历史数据多时新任务在第 2 页，用搜索定位
    await page.getByPlaceholder(/搜索/).first().fill(title)
    await page.waitForTimeout(800)
    const card = page.locator('.ant-tabs-tabpane-active', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    // 开始任务
    const startBtn = card.getByRole('button', { name: /开\s*始/ }).first()
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click()
      await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    }

    // 提交任务：弹窗填写完成说明
    const submitBtn = card.getByRole('button', { name: /提\s*交/ }).first()
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    if (await modal.isVisible().catch(() => false)) {
      const textarea = modal.locator('textarea').first()
      if (await textarea.isVisible().catch(() => false)) {
        await textarea.fill('E2E 自动化提交的任务完成说明')
      }
      await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*定|提\s*交/ }).first().click()
    }
    await expectSuccess(page, '任务已提交')

    // 提交后通知委派人
    const adminNotes = await apiCall(ADMIN, 'GET', '/notifications')
    expect((adminNotes.json?.data || []).some((n: any) => n.type === 'TASK_SUBMITTED' && (n.message || '').includes(title))).toBeTruthy()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('ADMIN 确认完成 → TESTER 收到完成通知', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 承接上一用例的任务：查 TESTER 名下 SUBMITTED 的 E2E工作流任务
    const list = await apiCall(TESTER, 'GET', '/tasks?type=assigned&pageSize=100&status=SUBMITTED')
    const arr = Array.isArray(list.json) ? list.json : (list.json?.data || [])
    const mine = arr.find((t: any) => (t.title || '').includes('E2E工作流任务') && t.status === 'SUBMITTED')
    test.skip(!mine, '未找到上一用例提交的任务（可能上一用例失败）')
    const title = mine.title

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    await gotoTab(page, '我委派的')

    const card = page.locator('.ant-tabs-tabpane-active', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    // 确认完成
    const confirmBtn = card.getByRole('button', { name: /确\s*认/ }).first()
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()
    // 可能有确认弹窗
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    if (await modal.isVisible().catch(() => false)) {
      await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*定|完\s*成/ }).first().click()
    }
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })

    // TESTER 收到完成通知
    const testerNotes = await apiCall(TESTER, 'GET', '/notifications')
    expect((testerNotes.json?.data || []).some((n: any) => n.type === 'TASK_COMPLETED' && (n.message || '').includes(title))).toBeTruthy()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('ADMIN 驳回（填理由）→ TESTER 收到驳回通知', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 准备：ADMIN 委派 → TESTER 开始并提交（API 快捷准备）
    const title = unique('E2E驳回任务')
    const t = await apiCall(ADMIN, 'POST', '/tasks', { title, assigneeIds: [2] })
    test.skip(t.status !== 201, `任务创建失败: ${t.status}`)
    await apiCall(TESTER, 'PUT', `/tasks/${t.json.id}`, { status: 'IN_PROGRESS' })
    await apiCall(TESTER, 'PUT', `/tasks/${t.json.id}`, { status: 'SUBMITTED', completionNote: 'E2E 待驳回的提交' })

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    await gotoTab(page, '我委派的')

    const card = page.locator('.ant-tabs-tabpane-active', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    // 驳回：弹窗填理由（空理由应被拦截）
    await card.getByRole('button', { name: /驳\s*回/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*定|驳\s*回/ }).first().click()
    await expect(page.locator('.ant-message-error, .ant-message-notice', { hasText: '请填写驳回理由' }).first()).toBeVisible()

    const reason = 'E2E自动化驳回理由-需返工'
    await modal.locator('textarea').fill(reason)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*定|驳\s*回/ }).first().click()
    await expectSuccess(page, '已驳回任务')

    // TESTER 收到驳回通知
    const testerNotes = await apiCall(TESTER, 'GET', '/notifications')
    expect((testerNotes.json?.data || []).some((n: any) => n.type === 'TASK_REJECTED' && (n.message || '').includes(title))).toBeTruthy()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
