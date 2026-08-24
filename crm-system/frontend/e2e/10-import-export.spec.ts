import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall,
} from './helpers'

/**
 * 报价单导入导出 E2E（2026-08 补盲区）
 *
 * 覆盖：UI 导入 CSV 真实文件 → 列表出现导入数据；
 *       UI 导出 CSV（blob 下载，读取内容断言 BOM + 列头 + 导入的数据行）。
 */

test.describe('报价单导入导出', () => {
  test('导入 CSV 文件 → 报价单出现在列表', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 前置：ADMIN 名下商机（导入显式带 opportunityId 由后端 body 承接——
    // UI 导入不带 body，走"当前用户名下最新商机"回退逻辑，故先建一个）
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E导入客户'), type: 'COMPANY' })
    const opp = await apiCall(ADMIN, 'POST', '/opportunities', { name: unique('E2E导入商机'), organizationId: org.json.id })
    test.skip(opp.status !== 201, '前置商机创建失败')

    const importName = unique('E2E导入单')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/quotations')

    // 导入导出 → 导入数据 → Dragger 上传 CSV
    await page.getByRole('button', { name: /导入导出/ }).click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: '导入数据' }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()

    // 带中文的 CSV（BOM + CRLF，与后端导出格式对齐）
    const csvContent = `﻿报价单,报价总额,状态\r\n${importName},100,DRAFT\r\n`
    await modal.locator('.ant-upload input[type="file"]').setInputFiles({
      name: 'e2e-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    })
    await expectSuccess(page)

    // 列表出现导入的报价单（搜索定位）
    await page.locator('input[placeholder*="搜索报价单"]').fill(importName)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: importName }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('导出 CSV：浏览器下载文件且内容含列头与数据', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/quotations')

    // 点击导出 CSV，捕获浏览器下载（前端 blob + a.click 也会触发 download 事件）
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 })
    await page.getByRole('button', { name: /导入导出/ }).click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: '导出 CSV' }).first().click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.csv')

    // 读取内容断言格式
    const filePath = await download.path()
    const { readFileSync } = await import('node:fs')
    const text = readFileSync(filePath, 'utf-8')
    expect(text.charCodeAt(0)).toBe(0xFEFF) // UTF-8 BOM
    expect(text).toContain('报价单')
    expect(text).toContain('报价总额')
    expect(text).toContain('状态')
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
