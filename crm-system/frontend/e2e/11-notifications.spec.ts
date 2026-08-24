import { test, expect } from '@playwright/test'
import {
  ADMIN, TESTER, loginViaApi, gotoApp, collectPageErrors, unique, apiCall,
} from './helpers'

/**
 * WebSocket 通知 E2E（2026-08 补盲区）
 *
 * 覆盖：ADMIN 创建任务指派 TESTER → TESTER 页面铃铛出现未读徽标
 *       （WS 推送 + 30s 轮询兜底）→ 通知中心展示消息 → 全部已读后徽标消失。
 */

test.describe('通知中心', () => {
  test('任务指派 → 铃铛未读徽标 → 通知中心内容 → 全部已读', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 前置：先把 TESTER 的存量通知清零（保证徽标断言干净）
    await apiCall(TESTER, 'PUT', '/notifications/read-all')
    const me = await apiCall(TESTER, 'GET', '/auth/me')
    test.skip(!me.json?.id, '无法获取 TESTER id')

    // TESTER 先打开页面（建立 WS 连接）
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/')
    const bell = page.locator('.ant-badge', { hasText: '' }).filter({ has: page.locator('.anticon-bell') }).first()
    await expect(bell).toBeVisible()

    // ADMIN 创建任务指派 TESTER → 触发 TASK_ASSIGNED + WS 推送
    const taskTitle = unique('E2E通知任务')
    const task = await apiCall(ADMIN, 'POST', '/tasks', { title: taskTitle, assigneeIds: [me.json.id] })
    expect(task.status).toBe(201)

    // 铃铛出现未读徽标（WS 实时或 30s 轮询，超时给足 40s）
    const badge = bell.locator('.ant-badge-count, .ant-scroll-number')
    await expect(badge.first()).toBeVisible({ timeout: 40_000 })

    // 打开通知中心 → 显示消息
    await bell.click()
    const dropdown = page.locator('.ant-dropdown:visible', { hasText: '通知中心' }).first()
    await expect(dropdown).toBeVisible()
    await expect(dropdown.locator('text=' + taskTitle).first()).toBeVisible()

    // 全部已读 → 徽标消失
    await dropdown.getByText('全部已读').click()
    await expect(badge.first()).toHaveCount(0, { timeout: 15_000 })
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
