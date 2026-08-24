import { test, expect, Page } from '@playwright/test'
import {
  ADMIN, TESTER, APPROVER, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall, tableRow,
} from './helpers'

/**
 * 三组页面补盲 E2E（2026-08）：日常办公 / 系统管理 / 日志审计
 *
 * 出差审批流（提交→批准→完成 / 驳回→重新提交）；
 * 菜单管理 CRUD；日报编辑/删除；用户/角色/字典/部门深度操作；日志筛选与导出。
 */

async function clickMoreRetry(page: Page, title: string, itemText: string) {
  const row = tableRow(page, title)
  const item = page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: itemText }).first()
  for (let attempt = 0; attempt < 3; attempt++) {
    await row.getByRole('button', { name: /更\s*多/ }).click()
    if (await item.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)) break
  }
  await item.click()
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

test.describe('出差审批流（日常办公）', () => {
  let contactId: number

  test.beforeAll(async () => {
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E出差审批客户'), type: 'COMPANY' })
    const contact = await apiCall(TESTER, 'POST', `/organizations/${org.json.id}/contacts`, { name: unique('E2E出差审批联系人'), phone: '13800008888' })
    contactId = contact.json?.id
  })

  test('TESTER 提交 → APPROVER 批准 → 标记完成', async ({ page }) => {
    test.skip(!contactId, '前置联系人创建失败')
    const errors = collectPageErrors(page)
    const title = unique('E2E审批出差A')
    const t = await apiCall(TESTER, 'POST', '/business-trips', {
      title, destination: '上海', purpose: 'E2E审批出差目的', contactId, startDate: day(1), endDate: day(3), days: 3,
    })
    test.skip(t.status !== 201, `出差创建失败: ${t.status}`)

    await loginViaApi(page, TESTER)
    await gotoApp(page, '/business-trips')
    await clickMoreRetry(page, title, '提交申请')
    await expectSuccess(page, '已提交申请')
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '待审批' })).toBeVisible()

    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/business-trips')
    await clickMoreRetry(page, title, '批准')
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认批准/ }).click()
    await expectSuccess(page, '已批准')
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '已批准' })).toBeVisible()

    // 完成由申请人操作
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/business-trips')
    await clickMoreRetry(page, title, '标记完成')
    await expectSuccess(page)
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '已完成' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('驳回（原因必填）→ 重新提交', async ({ page }) => {
    test.skip(!contactId, '前置联系人创建失败')
    const errors = collectPageErrors(page)
    const title = unique('E2E审批出差B')
    const t = await apiCall(TESTER, 'POST', '/business-trips', {
      title, destination: '北京', purpose: 'E2E待驳回目的', contactId, startDate: day(2), endDate: day(4), days: 3,
    })
    await apiCall(TESTER, 'POST', `/business-trips/${t.json.id}/submit`, {})

    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/business-trips')
    await clickMoreRetry(page, title, '驳回')
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认驳回/ }).click()
    await expect(page.locator('.ant-message-error, .ant-message-notice', { hasText: '请填写驳回原因' }).first()).toBeVisible()
    await modal.locator('textarea').fill('E2E驳回原因-预算不足')
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认驳回/ }).click()
    await expectSuccess(page, '已驳回')
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '已驳回' })).toBeVisible()

    await loginViaApi(page, TESTER)
    await gotoApp(page, '/business-trips')
    await clickMoreRetry(page, title, '重新提交')
    await expectSuccess(page)
    await expect(tableRow(page, title).locator('.ant-tag', { hasText: '待审批' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('日报编辑与删除（日常办公）', () => {
  test('搜索定位 → 编辑 Notes → 删除', async ({ page }) => {
    const errors = collectPageErrors(page)
    // API 建一条带唯一关键字的日报（ADMIN 本人——行内编辑/删除按钮需 office:dailyreport:delete 权限）
    const keyword = unique('E2E日报编辑')
    const rep = await apiCall(ADMIN, 'POST', '/daily-reports', {
      reportDate: new Date().toISOString().slice(0, 10),
      entries: [{ content: `${keyword} 初始内容`, hours: 1 }],
    })
    const rid = rep.json?.id

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/daily-reports')

    // 搜索定位
    await page.locator('input[placeholder*="搜索"]').first().fill(keyword)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const row = page.locator('.ant-table-tbody tr', { hasText: keyword }).first()
    await expect(row).toBeVisible()

    // 编辑：修改 Notes 内容
    await row.getByRole('button', { name: /编\s*辑/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    const updated = `${keyword} 已编辑内容`
    await modal.locator('textarea').first().fill(updated)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存|提\s*交)/ }).first().click()
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(800)
    await expect(page.getByText(updated).first()).toBeVisible()

    // 删除（Popconfirm）——结果以 API 为准（表格刷新/rowSpan 合并的显示时序不稳）
    const row2 = page.locator('.ant-table-tbody tr', { hasText: updated }).first()
    await row2.getByRole('button', { name: /删\s*除/ }).first().click()
    await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(800)
    const after = await apiCall(ADMIN, 'GET', `/daily-reports/${rid}`)
    expect(after.status).toBe(404)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('日报可见性（ALL 范围角色看全部）', () => {
  test('APPROVER(ALL) 能在日报页看到 TESTER 的日报', async ({ page }) => {
    const errors = collectPageErrors(page)
    // TESTER 建一条唯一内容日报
    const content = unique('E2E他人日报可见')
    const rep = await apiCall(TESTER, 'POST', '/daily-reports', {
      reportDate: new Date().toISOString().slice(0, 10),
      entries: [{ content, hours: 1.5 }],
    })
    test.skip(rep.status !== 201, `日报创建失败: ${rep.status}`)

    // APPROVER（dataScope=ALL，非管理员）打开日报页搜索应能看到
    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/daily-reports')
    await page.locator('input[placeholder*="搜索"]').first().fill(content)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: content }).first()).toBeVisible({ timeout: 15_000 })
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('出差详情页（关联费用联动）', () => {
  test('详情页添加费用报销（预填关联出差）→ 费用表格出现', async ({ page }) => {
    const errors = collectPageErrors(page)
    // 前置：TESTER 客户/联系人/项目 + 出差
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E出差详情客户'), type: 'COMPANY' })
    const contact = await apiCall(TESTER, 'POST', `/organizations/${org.json.id}/contacts`, { name: unique('E2E出差详情联系人'), phone: '13600007777' })
    const proj = await apiCall(TESTER, 'POST', '/projects', { name: unique('E2E出差详情项目'), organizationId: org.json.id })
    const title = unique('E2E出差详情单')
    const t = await apiCall(TESTER, 'POST', '/business-trips', {
      title, destination: '深圳', purpose: 'E2E详情页目的', contactId: contact.json?.id, startDate: day(1), endDate: day(2), days: 2,
    })
    test.skip(t.status !== 201, `出差创建失败: ${t.status}`)

    await loginViaApi(page, TESTER)
    await gotoApp(page, `/business-trips/${t.json.id}`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    // 添加费用（就地打开 ExpenseCreateModal，出差已锁定预填）
    await page.getByRole('button', { name: /添加费用/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    const expTitle = unique('E2E出差关联报销')
    await modal.locator('.ant-form-item:has(label:has-text("报销标题")) input').first().fill(expTitle)
    // 关联项目（必填）
    const projItem = modal.locator('.ant-form-item:has(label:has-text("关联项目"))').first()
    await projItem.locator('.ant-select-selector').click()
    await page.waitForTimeout(400)
    await page.keyboard.type(proj.json.name)
    await page.waitForTimeout(500)
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: proj.json.name }).first().click()
    // 明细行（默认已有一条：填类别/金额/日期）
    const today = new Date().toISOString().slice(0, 10)
    const catSelect = modal.locator('.ant-select:has(.ant-select-selection-placeholder:has-text("费用类别"))').first()
    if (await catSelect.isVisible().catch(() => false)) {
      await catSelect.click()
      await page.waitForTimeout(400)
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '交通费' }).first().click()
    }
    await modal.locator('input[placeholder="金额（元）"]').first().fill('88')
    await modal.locator('.ant-picker input').first().click()
    await page.waitForTimeout(400)
    await page.locator('.ant-picker-dropdown:visible .ant-picker-cell-today .ant-picker-cell-inner').first().click()
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存|提\s*交|创\s*建)/ }).first().click()
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })

    // 费用表格出现该报销
    await expect(page.locator('.ant-table-tbody tr, .ant-table-tbody a', { hasText: expTitle }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
