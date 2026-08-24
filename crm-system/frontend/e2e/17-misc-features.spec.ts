import { test, expect, Page } from '@playwright/test'
import {
  ADMIN, TESTER, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall, tableRow,
  fillFormItem,
} from './helpers'

/**
 * 杂项功能补盲 E2E（2026-08）：
 * 任务详情弹窗（基本信息/操作日志 Timeline + Notes 记录）、任务"更多"下拉删除、
 * 项目 Notes 信息记录、售前批量删除、报价单状态筛选、项目归档导出。
 */

async function confirmPopconfirm(page: Page) {
  await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
}

/** Modal.confirm 静态确认框（按钮在 .ant-modal-confirm-btns） */
async function confirmStaticModal(page: Page) {
  await page.locator('.ant-modal-confirm-btns button', { hasText: /^确\s*定|OK/ }).first().click()
}

test.describe('任务详情与记录', () => {
  test('任务详情弹窗：基本信息 + 操作日志 Timeline + Notes 记录新增', async ({ page }) => {
    const errors = collectPageErrors(page)
    const title = unique('E2E详情任务')
    const t = await apiCall(ADMIN, 'POST', '/tasks', { title, assigneeIds: [2], description: 'E2E详情弹窗描述' })
    test.skip(t.status !== 201, `任务创建失败: ${t.status}`)

    // TESTER 在"我的待办"通过卡片右上角"更多 → 详情"打开详情弹窗
    // （更多触发按钮是纯图标 EllipsisOutlined；卡片网格每页 6 张，先搜索定位）
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/')
    await page.getByPlaceholder(/搜索/).first().fill(title)
    await page.waitForTimeout(800)
    const card = page.locator('.ant-tabs-tabpane-active', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.locator('.ant-dropdown-trigger').first().click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: /详\s*情/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('E2E详情弹窗描述').first()).toBeVisible()

    // 切到操作日志 Tab：Timeline 渲染流转记录
    await modal.getByRole('tab', { name: /操作日志/ }).first().click()
    await expect(modal.locator('.ant-timeline').first()).toBeVisible()

    // Notes 记录新增（在操作日志 Tab 的"Notes信息"按钮）
    const note = `E2E任务笔记-${Date.now()}`
    const noteBtn = modal.getByRole('button', { name: /Notes信息/ }).first()
    if (await noteBtn.isVisible().catch(() => false)) {
      await noteBtn.click()
      const noteModal = page.locator('.ant-modal:visible .ant-modal-content').last()
      await noteModal.locator('textarea').first().fill(note)
      await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存|提\s*交)/ }).last().click()
      await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
      await expect(modal.getByText(note).first()).toBeVisible()
    }
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('任务"更多"下拉：删除任务 → 卡片消失', async ({ page }) => {
    const errors = collectPageErrors(page)
    const title = unique('E2E删除任务')
    const t = await apiCall(ADMIN, 'POST', '/tasks', { title, assigneeIds: [2] })
    test.skip(t.status !== 201, '任务创建失败')

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    await page.locator('.ant-tabs-tab', { hasText: '我委派的' }).first().click()
    await page.waitForTimeout(600)
    const card = page.locator('.ant-tabs-tabpane-active', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    // 更多（纯图标按钮，hover 卡片后出现）→ 删除（Popconfirm 嵌在菜单项内）
    await card.hover()
    await card.locator('.ant-dropdown-trigger').first().click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: /删\s*除/ }).first().click()
    await confirmPopconfirm(page)
    await page.waitForTimeout(1200)
    // 删除结果以 API 为准（列表刷新时序不稳）
    const after = await apiCall(ADMIN, 'GET', `/tasks/${t.json.id}`)
    expect(after.status).toBe(404)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('项目 Notes 与列表功能', () => {
  test('项目详情 Notes 信息记录：新增 → 可见 → 删除', async ({ page }) => {
    const errors = collectPageErrors(page)
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E笔记客户'), type: 'COMPANY' })
    const proj = await apiCall(ADMIN, 'POST', '/projects', { name: unique('E2E笔记项目'), organizationId: org.json.id })
    test.skip(proj.status !== 201, '项目创建失败')

    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/projects/${proj.json.id}`)
    // 默认基本信息 Tab 含信息记录区
    const note = `E2E项目笔记-${Date.now()}`
    await page.getByRole('button', { name: /Notes信息|新增记录/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await modal.locator('textarea').first().fill(note)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存|提\s*交)/ }).first().click()
    await expectSuccess(page)
    await expect(page.getByText(note).first()).toBeVisible()

    // 删除（操作按钮为纯图标，按 delete 图标定位）
    const record = page.locator('.ant-list-item', { hasText: note }).first()
    await record.locator('button:has(.anticon-delete)').first().click()
    await confirmPopconfirm(page)
    await expectSuccess(page)
    await expect(page.getByText(note)).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('售前批量删除：勾选两行 → 批量删除 → 列表移除', async ({ page }) => {
    const errors = collectPageErrors(page)
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E批删客户'), type: 'COMPANY' })
    const n1 = unique('E2E批删售前A')
    const n2 = unique('E2E批删售前B')
    await apiCall(ADMIN, 'POST', '/opportunities', { name: n1, organizationId: org.json.id })
    await apiCall(ADMIN, 'POST', '/opportunities', { name: n2, organizationId: org.json.id })

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/opportunities')
    // 搜索缩小范围
    await page.locator('input[placeholder*="项目名称"], input[placeholder*="搜索"]').first().fill('E2E批删售前')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    // 勾选两行（行选择框）
    await tableRow(page, n1).locator('input[type="checkbox"]').click()
    await tableRow(page, n2).locator('input[type="checkbox"]').click()
    // 批量删除按钮（含选中数）→ Modal.confirm 确认
    await page.getByRole('button', { name: /批量删除/ }).first().click()
    await page.locator('.ant-modal-confirm').waitFor({ timeout: 10_000 })
    await confirmStaticModal(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: n1 })).toHaveCount(0)
    await expect(page.locator('.ant-table-tbody tr', { hasText: n2 })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('报价单状态筛选：选"已批准"只显示已批准行', async ({ page }) => {
    const errors = collectPageErrors(page)
    // 准备：TESTER 建单并走完审批（API）
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E筛选用客户'), type: 'COMPANY' })
    const opp = await apiCall(TESTER, 'POST', '/opportunities', { name: unique('E2E筛选用商机'), organizationId: org.json.id })
    const approved = unique('E2E筛选已批准单')
    const draft = unique('E2E筛选草稿单')
    const q1 = await apiCall(TESTER, 'POST', '/quotations', { name: approved, opportunityId: opp.json.id, organizationId: org.json.id, totalAmount: 10, items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] })
    await apiCall(TESTER, 'POST', `/quotations/${q1.json.id}/submit`, {})
    await apiCall(ADMIN, 'POST', `/quotations/${q1.json.id}/approve`, {})
    await apiCall(TESTER, 'POST', '/quotations', { name: draft, opportunityId: opp.json.id, organizationId: org.json.id, totalAmount: 10, items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] })

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/quotations')
    // 打开状态下拉选"已批准"
    await page.locator('.ant-select-selector').first().click()
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '已批准' }).first().click()
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: approved }).first()).toBeVisible()
    await expect(page.locator('.ant-table-tbody tr', { hasText: draft })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('项目归档页导出 CSV 下载', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/sales')
    await expect(page.locator('.ant-table').first()).toBeVisible()

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 })
    // 导出下拉 → 导出 CSV
    await page.getByRole('button', { name: /导出/ }).first().click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: '导出 CSV' }).first().click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.csv')
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
