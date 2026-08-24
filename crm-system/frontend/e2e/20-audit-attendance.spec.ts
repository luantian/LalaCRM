import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, unique, apiCall,
} from './helpers'

/**
 * 日志审计深水 + 考勤统计 E2E（2026-08 补盲）：
 * 操作日志 模块/操作类型筛选；登录日志 用户名/状态筛选；
 * 考勤统计页（今日出勤/月度统计渲染）；考勤打卡页日历与图例。
 */

test.describe('操作日志', () => {
  test('模块筛选：只显示该模块的行', async ({ page }) => {
    const errors = collectPageErrors(page)
    // 前置：制造一条"报价管理"模块的操作日志
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E日志客户'), type: 'COMPANY' })
    const opp = await apiCall(ADMIN, 'POST', '/opportunities', { name: unique('E2E日志商机'), organizationId: org.json.id })
    void opp

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/operation-logs')

    // 模块筛选
    await page.locator('input[placeholder*="模块"], .ant-form .ant-form-item:has(label:has-text("模块")) input').first().fill('报价管理')
    await page.getByRole('button', { name: /搜\s*索|查\s*询/ }).first().click()
    await page.waitForTimeout(1000)
    const rows = page.locator('.ant-table-tbody tr')
    const count = await rows.count()
    if (count > 0) {
      // 所有可见数据行的模块列都应为"报价管理"（报价单模块操作此前测试大量产生）
      const modules = await page.locator('.ant-table-tbody tr td:nth-child(3)').allTextContents()
      const dataRows = modules.filter(m => m.trim() && m.trim() !== '-')
      expect(dataRows.every(m => m.includes('报价管理') || m.includes('报价'))).toBeTruthy()
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('登录日志', () => {
  test('用户名筛选：结果只含该用户', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/login-logs')

    await page.locator('input[placeholder*="用户名"], .ant-form-item:has(label:has-text("用户名")) input').first().fill('testadmin')
    await page.getByRole('button', { name: /搜\s*索|查\s*询/ }).first().click()
    await page.waitForTimeout(1000)
    const rows = page.locator('.ant-table-tbody tr')
    const count = await rows.count()
    if (count > 0) {
      const users = await page.locator('.ant-table-tbody tr td:nth-child(2)').allTextContents()
      const dataUsers = users.filter(u => u.trim())
      expect(dataUsers.length).toBeGreaterThan(0)
      expect(dataUsers.every(u => u.includes('testadmin'))).toBeTruthy()
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('状态筛选：失败登录可筛出', async ({ page }) => {
    const errors = collectPageErrors(page)
    // 制造一次失败登录（错误密码）
    await apiCall({ username: 'testadmin', password: 'wrong-password-xyz' }, 'POST', '/auth/login', {}).catch(() => {})

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/login-logs')
    // 状态下拉选"失败"
    await page.locator('.ant-select-selector').first().click()
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '失败' }).first().click()
    await page.getByRole('button', { name: /搜\s*索|查\s*询/ }).first().click()
    await page.waitForTimeout(1000)
    const tags = await page.locator('.ant-table-tbody .ant-tag').allTextContents()
    const dataTags = tags.filter(t => t.trim())
    if (dataTags.length > 0) {
      expect(dataTags.every(t => t.includes('失败'))).toBeTruthy()
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('考勤', () => {
  test('考勤统计页：今日出勤与月度统计渲染', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/attendance-stats')
    await expect(page.locator('.ant-card').first()).toBeVisible()
    await expect(page.getByText(/今日出勤|应出勤/).first()).toBeVisible()
    await expect(page.getByText(/月度统计|平均出勤率/).first()).toBeVisible()
    await expect(page.locator('.ant-table').first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('考勤打卡页：日历渲染与图例完整', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/check-ins')
    // 日历区域（自定义日历：年月标题 + 图例项文本，无"图例"标题字样）
    await expect(page.getByText(/年.*月|\d{4}年/).first()).toBeVisible()
    await expect(page.getByText('正常打卡').first()).toBeVisible()
    await expect(page.getByText('加班打卡').first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
