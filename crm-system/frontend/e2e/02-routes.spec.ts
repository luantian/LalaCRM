import { test, expect } from '@playwright/test'
import { ADMIN, TESTER, loginViaApi, gotoApp, collectPageErrors, expectPageRendered } from './helpers'

/** 管理员可见的全部列表/系统页路由（详情页在业务套件中覆盖） */
const ADMIN_ROUTES = [
  '/',
  '/organizations',
  '/opportunities',
  '/quotations',
  '/projects',
  '/projects/archived',
  '/sales',
  '/expenses',
  '/daily-reports',
  '/business-trips',
  '/check-ins',
  '/attendance-stats',
  '/users',
  '/roles',
  '/menus',
  '/departments',
  '/dicts',
  '/database-backup',
  '/operation-logs',
  '/login-logs',
]

test.describe('全路由渲染冒烟（管理员）', () => {
  for (const route of ADMIN_ROUTES) {
    test(`渲染 ${route}`, async ({ page }) => {
      // 工作总览是最大的懒加载页面（冷编译 + 多数据源并发），放宽超时
      if (route === '/') test.slow()
      const errors = collectPageErrors(page)
      await loginViaApi(page, ADMIN)
      await gotoApp(page, route)
      await expectPageRendered(page)
      expect(errors, errors.join('\n')).toHaveLength(0)
    })
  }
})

test.describe('全路由渲染冒烟（普通用户 SELF 范围）', () => {
  const TESTER_ROUTES = ['/', '/organizations', '/projects', '/daily-reports', '/check-ins']

  for (const route of TESTER_ROUTES) {
    test(`渲染 ${route}`, async ({ page }) => {
      if (route === '/') test.slow()
      const errors = collectPageErrors(page)
      await loginViaApi(page, TESTER)
      await gotoApp(page, route)
      await expectPageRendered(page)
      expect(errors, errors.join('\n')).toHaveLength(0)
    })
  }

  test('普通用户直连系统管理 URL 被拦回（路由未注册）', async ({ page }) => {
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/users')
    // 未注册路由命中通配 * → 重定向回首页，不应渲染用户管理
    await page.waitForTimeout(800)
    const url = page.url()
    const renderedUserMgmt = await page.locator('text=用户管理').count()
    expect(url.includes('/users')).toBe(false)
    expect(renderedUserMgmt).toBe(0)
  })

  test('普通用户侧边栏不含系统管理/日志审计', async ({ page }) => {
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/')
    const siderText = await page.locator('.ant-layout-sider').innerText()
    expect(siderText).not.toContain('系统管理')
    expect(siderText).not.toContain('日志审计')
    expect(siderText).toContain('客户管理')
  })

  test('管理员侧边栏包含完整菜单', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    const siderText = await page.locator('.ant-layout-sider').innerText()
    for (const item of ['工作总览', '客户管理', '项目管理', '系统管理', '日志审计']) {
      expect(siderText, `侧边栏应含「${item}」`).toContain(item)
    }
  })

  test('侧边栏菜单点击导航（嵌套子菜单展开）', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    // 点击"系统管理"目录 → 展开子菜单 → 点击"用户管理"
    await page.locator('.ant-layout-sider .ant-menu-submenu-title', { hasText: '系统管理' }).click()
    await page.locator('.ant-layout-sider .ant-menu-item', { hasText: '用户管理' }).first().click()
    await page.waitForURL((u) => u.pathname.includes('/users'))
    await expectPageRendered(page)
    // 展开"日常办公"目录 → 点击"出差管理"
    await page.locator('.ant-layout-sider .ant-menu-submenu-title', { hasText: '日常办公' }).click()
    await page.locator('.ant-layout-sider .ant-menu-item', { hasText: '出差管理' }).first().click()
    await page.waitForURL((u) => u.pathname.includes('/business-trips'))
    await expectPageRendered(page)
  })
})
