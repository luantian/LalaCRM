import { test, expect, Page } from '@playwright/test'
import {
  ADMIN, TESTER, APPROVER, loginViaApi, gotoApp, collectPageErrors, openModal,
  submitModal, fillFormItem, selectInForm, unique, tableRow, expectSuccess, apiCall,
} from './helpers'

/**
 * 报价单审批流 E2E（2026-08 前端补齐后新增）
 *
 * 覆盖：草稿→提交→批准/驳回 的 UI 全流程、按钮权限显隐、驳回原因必填、
 *       详情页头部按钮、审批留痕展示，以及 API 层状态机/权限回归。
 * 账号：TESTER（SELF，可建可提交无审批权）/ APPROVER（有审批权非管理员）
 *       / ADMIN（管理员，防自审批豁免）。
 */

/** 在行内"更多"下拉中点指定菜单项 */
async function clickMoreMenuItem(page: Page, rowText: string, itemText: string) {
  const row = tableRow(page, rowText)
  await row.getByRole('button', { name: /更\s*多/ }).click()
  const item = page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: itemText }).first()
  await item.waitFor({ timeout: 10_000 })
  await item.click()
}

test.describe('报价单审批流', () => {
  // 本组引入 APPROVER 第三个账号，首次登录可能撞上登录限流窗口，
  // helpers 会等 65s 冷却重试 —— 放宽本组超时以容纳
  test.describe.configure({ timeout: 180_000 })

  let opportunityName: string
  let contactName: string

  test.beforeAll(async () => {
    // 前置：客户 + 联系人 + 商机，全部由 TESTER 创建（SELF 数据范围下
    // 只有自己的商机才会出现在"关联售前"下拉里）
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E审批客户'), type: 'COMPANY' })
    const contact = await apiCall(TESTER, 'POST', `/organizations/${org.json.id}/contacts`, {
      name: unique('E2E审批联系人'), phone: '13800001111',
    })
    const opp = await apiCall(TESTER, 'POST', '/opportunities', {
      name: unique('E2E审批商机'), organizationId: org.json.id, contactId: contact.json?.id,
    })
    contactName = contact.json?.name || ''
    opportunityName = opp.json?.name || ''
  })

  test('TESTER 通过 UI 创建草稿 → 提交审批 → 编辑/删除入口消失', async ({ page }) => {
    test.skip(!opportunityName || !contactName, '前置数据准备失败')
    const errors = collectPageErrors(page)
    await loginViaApi(page, TESTER)
    await gotoApp(page, '/quotations')

    // 创建草稿（明细行填产品名，保证审批弹窗有明细可展示）
    const name = unique('E2E审批单A')
    await openModal(page, page.getByRole('button', { name: /新建报价单/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '报价单名称', name)
    await selectInForm(modal, '关联售前', opportunityName)
    await selectInForm(modal, '客户', contactName)
    const addRow = modal.getByRole('button', { name: /添加行|新增行|添加明细/ }).first()
    if (await addRow.isVisible().catch(() => false)) {
      await addRow.click()
      await modal.locator('.ant-table-tbody input').first().fill('E2E审批明细项')
    }
    await submitModal(page)
    await expectSuccess(page)

    // 草稿态：状态标签 + 编辑/删除/更多(提交审批) 均可见
    const row = tableRow(page, name)
    await expect(row.locator('.ant-tag', { hasText: '草稿' })).toBeVisible()
    await expect(row.getByRole('button', { name: /编\s*辑/ })).toBeVisible()
    await expect(row.getByRole('button', { name: /删\s*除/ })).toBeVisible()

    // 提交审批
    await clickMoreMenuItem(page, name, '提交审批')
    await expectSuccess(page, '已提交审批')
    await expect(row.locator('.ant-tag', { hasText: '已提交' })).toBeVisible()

    // 提交后内容锁定：编辑/删除/更多（TESTER 无审批权）全部消失
    await expect(row.getByRole('button', { name: /编\s*辑/ })).toHaveCount(0)
    await expect(row.getByRole('button', { name: /删\s*除/ })).toHaveCount(0)
    await expect(row.getByRole('button', { name: /更\s*多/ })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('APPROVER 列表批准（弹窗展示明细 + 备注落库）→ 详情显示审批留痕', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/quotations')

    // 上一用例的单（unique 前缀唯一）：已提交态
    const list = await apiCall(APPROVER, 'GET', `/quotations?search=${encodeURIComponent('E2E审批单A')}`)
    const target = (list.json?.data || []).find((q: any) => q.status === 'SUBMITTED')
    test.skip(!target, '未找到上一用例产出的已提交报价单')

    const row = tableRow(page, target.name)
    await expect(row.locator('.ant-tag', { hasText: '已提交' })).toBeVisible()

    // 打开批准弹窗：摘要 + 明细表 + 备注输入
    await row.getByRole('button', { name: /更\s*多/ }).click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: '批准' }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('报价明细')).toBeVisible()
    await expect(modal.locator('tbody tr', { hasText: 'E2E审批明细项' })).toBeVisible()

    // 填备注 → 确认批准
    const remark = 'E2E批准备注-同意按此报价'
    await modal.locator('textarea').fill(remark)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认批准/ }).click()
    await expectSuccess(page, '已批准')
    await expect(row.locator('.ant-tag', { hasText: '已批准' })).toBeVisible()

    // 详情页留痕：审批人 / 审批时间 / 审批意见（默认打开"报价明细"，需先切"基本信息"）
    await row.locator('a').first().click()
    await page.waitForURL((u) => /\/quotations\/\d+/.test(u.pathname), { timeout: 10_000 })
    await page.getByRole('tab', { name: /基本信息/ }).click()
    const desc = page.locator('.ant-descriptions')
    await expect(desc.getByText('测试审批人')).toBeVisible()
    await expect(desc.getByText(remark)).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('驳回必填原因：空原因被前端拦截 → 填写后驳回 → 详情红色意见', async ({ page }) => {
    const errors = collectPageErrors(page)

    // API 准备一张 TESTER 的已提交单（不重复走创建 UI）
    const oppList = await apiCall(ADMIN, 'GET', '/opportunities?pageSize=1000')
    const opp = (oppList.json?.data || []).find((o: any) => o.name === opportunityName)
    const created = await apiCall(TESTER, 'POST', '/quotations', {
      name: unique('E2E审批单B'), opportunityId: opp?.id, organizationId: opp?.organizationId, contactId: null, totalAmount: 50,
      items: [{ name: 'E2E驳回明细', quantity: 1, unit: '套', unitPrice: 50, totalPrice: 50 }],
    })
    test.skip(created.status !== 201, `创建失败: ${created.status} ${JSON.stringify(created.json)}`)
    const name = created.json.name
    await apiCall(TESTER, 'POST', `/quotations/${created.json.id}/submit`, {})

    await loginViaApi(page, APPROVER)
    await gotoApp(page, '/quotations')

    // 驳回弹窗：空原因点确认 → 前端拦截，弹窗不关
    const row = tableRow(page, name)
    await clickMoreMenuItem(page, name, '驳回')
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认驳回/ }).click()
    await expect(page.locator('.ant-message-error, .ant-message-notice', { hasText: '请填写驳回原因' }).first()).toBeVisible()
    await expect(modal).toBeVisible() // 弹窗仍在

    // 填原因 → 确认 → 已拒绝
    const reason = 'E2E驳回原因-折扣超授权'
    await modal.locator('textarea').fill(reason)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /确认驳回/ }).click()
    await expectSuccess(page, '已驳回')
    await expect(row.locator('.ant-tag', { hasText: '已拒绝' })).toBeVisible()

    // 详情页：驳回原因红色展示（先切"基本信息"Tab；bordered Descriptions 直接按文本定位）
    await row.locator('a').first().click()
    await page.waitForURL((u) => /\/quotations\/\d+/.test(u.pathname), { timeout: 10_000 })
    await page.getByRole('tab', { name: /基本信息/ }).click()
    const note = page.locator('.ant-descriptions').getByText(reason)
    await expect(note).toBeVisible()
    await expect(note).toHaveCSS('color', 'rgb(207, 19, 34)')
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('详情页头部按钮：TESTER 提交审批 → APPROVER 详情页批准', async ({ page }) => {
    const errors = collectPageErrors(page)

    // API 建草稿单
    const oppList = await apiCall(ADMIN, 'GET', '/opportunities?pageSize=1000')
    const opp = (oppList.json?.data || []).find((o: any) => o.name === opportunityName)
    const created = await apiCall(TESTER, 'POST', '/quotations', {
      name: unique('E2E审批单C'), opportunityId: opp?.id, organizationId: opp?.organizationId, contactId: null, totalAmount: 30,
      items: [{ name: 'E2E详情明细', quantity: 1, unit: '套', unitPrice: 30, totalPrice: 30 }],
    })
    test.skip(created.status !== 201, `创建失败: ${created.status}`)

    // TESTER 详情页提交
    await loginViaApi(page, TESTER)
    await gotoApp(page, `/quotations/${created.json.id}`)
    const submitBtn = page.getByRole('button', { name: /提交审批/ })
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()
    await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
    await expectSuccess(page, '已提交审批')
    await expect(page.locator('.ant-tag', { hasText: '已提交' }).first()).toBeVisible()
    await expect(submitBtn).toHaveCount(0) // 按钮随状态消失

    // APPROVER 详情页批准（按钮可访问名含图标前缀"check 批准"，不能锚定开头）
    await loginViaApi(page, APPROVER)
    await gotoApp(page, `/quotations/${created.json.id}`)
    const approveBtn = page.getByRole('button', { name: /批\s*准/ })
    await expect(approveBtn).toBeVisible()
    await approveBtn.click()
    await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
    await expectSuccess(page, '已批准')
    await expect(page.locator('.ant-tag', { hasText: '已批准' }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('API 回归：状态机 400 / 权限 403 / 防自审批 / 管理员豁免', async () => {
    const oppList = await apiCall(ADMIN, 'GET', '/opportunities?pageSize=1000')
    const opp = (oppList.json?.data || []).find((o: any) => o.name === opportunityName)

    // ── 状态机 ──
    const q1 = await apiCall(ADMIN, 'POST', '/quotations', {
      name: unique('E2E状态机'), opportunityId: opp?.id, organizationId: opp?.organizationId, totalAmount: 10,
      items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }],
    })
    expect(q1.status, `创建 ${q1.status}`).toBe(201)
    const qid = q1.json.id

    // 草稿不可审批（跳过提交直接 approve）
    expect((await apiCall(ADMIN, 'POST', `/quotations/${qid}/approve`, { remark: 'x' })).status).toBe(400)
    // 草稿不可驳回
    expect((await apiCall(ADMIN, 'POST', `/quotations/${qid}/reject`, { reason: 'x' })).status).toBe(400)
    // 提交
    expect((await apiCall(ADMIN, 'POST', `/quotations/${qid}/submit`, {})).status).toBe(200)
    // 重复提交 → 400
    expect((await apiCall(ADMIN, 'POST', `/quotations/${qid}/submit`, {})).status).toBe(400)
    // 已提交不可编辑 → 400
    expect((await apiCall(ADMIN, 'PUT', `/quotations/${qid}`, { name: 'x2' })).status).toBe(400)
    // 已提交不可删除 → 400
    expect((await apiCall(ADMIN, 'DELETE', `/quotations/${qid}`)).status).toBe(400)
    // 空原因驳回 → 400
    expect((await apiCall(ADMIN, 'POST', `/quotations/${qid}/reject`, { reason: '  ' })).status).toBe(400)
    // 管理员批准自己创建提交的单（豁免防自审批）→ 200 且留痕
    const ap = await apiCall(ADMIN, 'POST', `/quotations/${qid}/approve`, { remark: 'E2E管理员豁免' })
    expect(ap.status).toBe(200)
    expect(ap.json.status).toBe('APPROVED')
    expect(ap.json.approvalNote).toBe('E2E管理员豁免')
    expect(ap.json.approvedBy).toBeTruthy()
    expect(ap.json.approvedAt).toBeTruthy()

    // ── 权限：TESTER 无审批权 ──
    const q2 = await apiCall(APPROVER, 'POST', '/quotations', {
      name: unique('E2E权限'), opportunityId: opp?.id, organizationId: opp?.organizationId, totalAmount: 10,
      items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }],
    })
    expect(q2.status, `APPROVER 创建 ${q2.status}`).toBe(201)
    expect((await apiCall(APPROVER, 'POST', `/quotations/${q2.json.id}/submit`, {})).status).toBe(200)

    // TESTER（无 approve 权限）审批 → 403
    expect((await apiCall(TESTER, 'POST', `/quotations/${q2.json.id}/approve`, {})).status).toBe(403)
    // TESTER（无 approve 权限）驳回 → 403
    expect((await apiCall(TESTER, 'POST', `/quotations/${q2.json.id}/reject`, { reason: 'x' })).status).toBe(403)

    // ── 防自审批：APPROVER 审批自己提交的单 → 403 ──
    expect((await apiCall(APPROVER, 'POST', `/quotations/${q2.json.id}/approve`, {})).status).toBe(403)
    expect((await apiCall(APPROVER, 'POST', `/quotations/${q2.json.id}/reject`, { reason: '自己驳回自己' })).status).toBe(403)

    // ── 所有权：TESTER 提交别人的单 → 403 ──
    const q3 = await apiCall(ADMIN, 'POST', '/quotations', {
      name: unique('E2E所有权'), opportunityId: opp?.id, organizationId: opp?.organizationId, totalAmount: 10,
      items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }],
    })
    expect((await apiCall(TESTER, 'POST', `/quotations/${q3.json.id}/submit`, {})).status).toBe(403)

    // ── 详情返回 approver 对象 ──
    const detail = await apiCall(ADMIN, 'GET', `/quotations/${qid}`)
    expect(detail.json.approver?.name).toBe('测试管理员')

    // ── 驳回落库验证（APPROVER 驳回 TESTER 的单，真实跨用户场景）──
    const q4 = await apiCall(TESTER, 'POST', '/quotations', {
      name: unique('E2E跨用户驳回'), opportunityId: opp?.id, organizationId: opp?.organizationId, totalAmount: 10,
      items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }],
    })
    await apiCall(TESTER, 'POST', `/quotations/${q4.json.id}/submit`, {})
    const rj = await apiCall(APPROVER, 'POST', `/quotations/${q4.json.id}/reject`, { reason: 'E2E跨用户驳回原因' })
    expect(rj.status).toBe(200)
    expect(rj.json.status).toBe('REJECTED')
    expect(rj.json.approvalNote).toBe('E2E跨用户驳回原因')

    // 详情接口返回审批人姓名（include approver）
    const rjDetail = await apiCall(ADMIN, 'GET', `/quotations/${q4.json.id}`)
    expect(rjDetail.json.approver?.name).toBe('测试审批人')
  })
})
