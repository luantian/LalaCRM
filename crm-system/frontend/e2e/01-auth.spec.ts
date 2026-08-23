import { test, expect } from '@playwright/test'
import { ADMIN, gotoApp, collectPageErrors } from './helpers'

test.describe('认证流程', () => {
  test('登录页正常渲染', async ({ page }) => {
    await gotoApp(page, '/login')
    await expect(page.locator('input[id="username"], input').first()).toBeVisible()
    await expect(page.getByText('CRM客户管理系统').first()).toBeVisible()
  })

  test('空表单提交显示校验提示', async ({ page }) => {
    await gotoApp(page, '/login')
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible()
  })

  test('错误密码提示不泄露用户存在性', async ({ page }) => {
    await gotoApp(page, '/login')
    await page.locator('input').first().fill(ADMIN.username)
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await expect(page.locator('.ant-message', { hasText: '用户名或密码错误' })).toBeVisible()
    // 仍停留在登录页
    await expect(page).toHaveURL(/\/login/)
  })

  test('管理员 UI 登录成功进入工作台', async ({ page }) => {
    const errors = collectPageErrors(page)
    await gotoApp(page, '/login')
    await page.locator('input').first().fill(ADMIN.username)
    await page.locator('input[type="password"]').fill(ADMIN.password)
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 })
    // 侧边栏菜单渲染
    await expect(page.locator('.ant-layout-sider')).toBeVisible()
    // 登录成功后写入 localStorage
    const hasToken = await page.evaluate(() => !!localStorage.getItem('token'))
    expect(hasToken).toBe(true)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('改密码：旧密码错误显示具体原因（回归：拦截器 status 修复）', async ({ page }) => {
    await gotoApp(page, '/login')
    await page.locator('input').first().fill(ADMIN.username)
    await page.locator('input[type="password"]').fill(ADMIN.password)
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await page.waitForURL((u) => !u.pathname.includes('/login'))

    // 打开右上角用户下拉 → 修改密码
    await page.locator('.ant-layout-header').getByRole('img', { name: 'user' }).first().click()
    await page.locator('.ant-dropdown-menu-item', { hasText: '修改密码' }).click()
    await expect(page.locator('.ant-modal-title', { hasText: '修改密码' })).toBeVisible()

    // 输入错误的旧密码
    await page.locator('.ant-modal input').nth(0).fill('wrong-old-password')
    await page.locator('.ant-modal input').nth(1).fill('NewPass123!')
    await page.locator('.ant-modal input').nth(2).fill('NewPass123!')
    await page.locator('.ant-modal-footer button', { hasText: /确认修改/ }).click()

    // 回归断言：应显示后端的具体原因，而不是笼统的"密码修改失败"
    await expect(page.locator('.ant-message', { hasText: '当前密码错误' })).toBeVisible({ timeout: 15_000 })
  })

  test('退出登录返回登录页并清空凭据', async ({ page }) => {
    await gotoApp(page, '/login')
    await page.locator('input').first().fill(ADMIN.username)
    await page.locator('input[type="password"]').fill(ADMIN.password)
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await page.waitForURL((u) => !u.pathname.includes('/login'))

    await page.locator('.ant-layout-header').getByRole('img', { name: 'user' }).first().click()
    const logoutItem = page.locator('.ant-dropdown-menu-item', { hasText: '退出登录' })
    await logoutItem.click()
    // Popconfirm 或直接退出
    const confirmBtn = page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first()
    if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click()
    await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 15_000 })
    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeNull()
  })
})
