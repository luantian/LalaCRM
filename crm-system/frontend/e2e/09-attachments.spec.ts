import { test, expect } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import {
  ADMIN, TESTER, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall, tableRow,
} from './helpers'

/**
 * 附件流 E2E + 金额权限脱敏（2026-08 补盲区）
 *
 * 覆盖：报价单详情页附件 Tab 上传真实文件 → 列表可见 → 删除消失；
 *       费用报销「管理发票」弹窗上传；无金额权限用户（TESTER）看报价总额为
 *       "—"（— 是 em dash）而明细单价正常（后端只脱敏单据级金额）。
 */

/** 生成一个真实临时文件供 setInputFiles 上传 */
function makeUploadFile(name: string, content: string): string {
  const p = path.join(os.tmpdir(), name)
  fs.writeFileSync(p, content, 'utf-8')
  return p
}

test.describe('报价单附件', () => {
  test('上传真实文件 → 附件列表可见 → 删除后消失', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 前置：TESTER 自建宿主报价单（附件操作仅限 owner/admin）
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E附件客户'), type: 'COMPANY' })
    const opp = await apiCall(TESTER, 'POST', '/opportunities', { name: unique('E2E附件商机'), organizationId: org.json.id })
    const q = await apiCall(TESTER, 'POST', '/quotations', {
      name: unique('E2E附件单'), opportunityId: opp.json.id, organizationId: org.json.id, totalAmount: 10,
      items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }],
    })
    test.skip(q.status !== 201, `宿主创建失败: ${q.status}`)

    await loginViaApi(page, TESTER)
    await gotoApp(page, `/quotations/${q.json.id}`)

    // 切到附件 Tab（默认打开报价明细）
    await page.getByRole('tab', { name: /附件/ }).click()
    await expect(page.getByRole('button', { name: /上传附件/ })).toBeVisible()

    // 上传真实 .txt 文件（multer 白名单内）
    const fileName = `E2E附件-${Date.now()}.txt`
    const filePath = makeUploadFile(fileName, 'e2e attachment content')
    await page.locator('.ant-upload input[type="file"]').setInputFiles(filePath)
    await expectSuccess(page, '上传成功')

    // 列表出现该文件（含大小列）
    const row = page.locator('.ant-table-tbody tr', { hasText: fileName }).first()
    await expect(row).toBeVisible()

    // 删除（Popconfirm 确认）→ 消失
    await row.getByRole('button', { name: /删\s*除/ }).click()
    await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
    await expectSuccess(page, '删除成功')
    await expect(page.locator('.ant-table-tbody tr', { hasText: fileName })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('费用报销「管理发票」弹窗上传附件', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 前置：ADMIN 建报销单（表单必填项目）
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E发票客户'), type: 'COMPANY' })
    const proj = await apiCall(ADMIN, 'POST', '/projects', { name: unique('E2E发票项目'), organizationId: org.json.id })
    const exp = await apiCall(ADMIN, 'POST', '/expenses', {
      title: unique('E2E发票报销'), projectId: proj.json.id, totalAmount: 100,
      items: [{ category: '办公用品', amount: 100, expenseDate: new Date().toISOString().slice(0, 10) }],
    })
    test.skip(exp.status !== 201, `报销创建失败: ${exp.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/expenses')

    // 操作列 更多 → 管理发票
    const row = tableRow(page, exp.json.title)
    await row.getByRole('button', { name: /更\s*多/ }).click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: '管理发票' }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()

    // 上传 .txt（发票/凭证）：该弹窗用隐藏原生 input（#expense-file-upload），非 antd Upload
    const fileName = `E2E凭证-${Date.now()}.txt`
    const filePath = makeUploadFile(fileName, 'e2e expense invoice')
    await page.locator('#expense-file-upload').setInputFiles(filePath)
    await expectSuccess(page)
    await expect(modal.locator('.ant-table-tbody tr, .ant-list-item', { hasText: fileName }).first()).toBeVisible()

    // 关闭弹窗
    await page.locator('.ant-modal:visible .ant-modal-footer button, .ant-modal:visible .ant-modal-close', { hasText: /^取\s*消/ }).first()
      .isVisible().catch(() => {})
    await page.locator('.ant-modal .ant-modal-close').first().click()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('金额权限脱敏（TESTER 无金额权限）', () => {
  test('报价总额显示 — 而明细单价正常', async ({ page }) => {
    const errors = collectPageErrors(page)

    // TESTER 自建一张有金额的单
    const org = await apiCall(TESTER, 'POST', '/organizations', { name: unique('E2E脱敏客户'), type: 'COMPANY' })
    const opp = await apiCall(TESTER, 'POST', '/opportunities', { name: unique('E2E脱敏商机'), organizationId: org.json.id })
    const q = await apiCall(TESTER, 'POST', '/quotations', {
      name: unique('E2E脱敏单'), opportunityId: opp.json.id, organizationId: org.json.id, totalAmount: 100,
      items: [{ name: '脱敏明细项', quantity: 1, unit: '套', unitPrice: 100, totalPrice: 100 }],
    })
    test.skip(q.status !== 201, `宿主创建失败: ${q.status}`)

    // API 层：totalAmount 被置 null，明细 unitPrice 保留
    const detail = await apiCall(TESTER, 'GET', `/quotations/${q.json.id}`)
    expect(detail.json.totalAmount).toBeNull()
    expect(Number(detail.json.items[0].unitPrice)).toBe(100)

    // UI 层：TESTER 视角总额为 —，明细单价正常
    await loginViaApi(page, TESTER)
    await gotoApp(page, `/quotations/${q.json.id}`)
    await expect(page.locator('.ant-card', { hasText: '报价总额' }).first()).toBeVisible()
    await expect(page.getByText('报价总额:').locator('..').getByText('—').first()).toBeVisible()
    // 默认 Tab 即报价明细：单价 ¥100 正常渲染
    await expect(page.locator('.ant-table-tbody').getByText('¥100').first()).toBeVisible()

    // ADMIN 视角：总额正常显示
    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/quotations/${q.json.id}`)
    await expect(page.getByText('¥100').first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
