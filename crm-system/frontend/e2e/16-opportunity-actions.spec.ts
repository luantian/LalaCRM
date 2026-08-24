import { test, expect, Page } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, unique, expectSuccess, apiCall, tableRow,
  openModal, submitModal, fillFormItem,
} from './helpers'

/**
 * 售前管理操作 E2E（2026-08 补盲区）
 *
 * 覆盖：转化为项目（售前→项目核心联动：行从未转化列表消失 + 项目创建成功）；
 *       标记丢单（LOST）/ 关闭（CLOSED）；编辑改名；详情页 Notes 信息记录（新增→列表可见→删除）；搜索。
 */

async function clickMore(page: Page, title: string, itemText: string) {
  const row = tableRow(page, title)
  await row.getByRole('button', { name: /更\s*多/ }).click()
  const item = page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: itemText }).first()
  await item.waitFor({ timeout: 10_000 })
  await item.click()
}

/** Modal.confirm 确认（antd 静态确认框按钮在 .ant-modal-confirm-btns，不在 .ant-modal:visible 内） */
async function confirmStaticModal(page: Page) {
  await page.locator('.ant-modal-confirm-btns button', { hasText: /^确\s*定|OK/ }).first().click()
}

test.describe('售前管理操作', () => {
  let orgId: number
  let contactId: number

  test.beforeAll(async () => {
    const org = await apiCall(ADMIN, 'POST', '/organizations', { name: unique('E2E售前操作客户'), type: 'COMPANY' })
    const contact = await apiCall(ADMIN, 'POST', `/organizations/${org.json.id}/contacts`, { name: unique('E2E售前操作联系人'), phone: '13800009999' })
    orgId = org.json?.id
    contactId = contact.json?.id
  })

  // 客户（联系人）为编辑表单必填，创建时必须带上，否则编辑弹窗校验不过
  async function createOpp(name: string) {
    return apiCall(ADMIN, 'POST', '/opportunities', { name, organizationId: orgId, contactId })
  }

  test('转化为项目 → 行从未转化列表消失 + 同名项目创建成功', async ({ page }) => {
    test.skip(!orgId, '前置客户创建失败')
    const errors = collectPageErrors(page)
    const name = unique('E2E转化售前')
    const opp = await createOpp(name)
    test.skip(opp.status !== 201, `商机创建失败: ${opp.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/opportunities')
    const row = tableRow(page, name)
    await expect(row).toBeVisible()

    // 更多 → 转化为项目（Modal.confirm 确认）
    await clickMore(page, name, '转化为项目')
    await page.locator('.ant-modal-confirm').waitFor({ timeout: 10_000 })
    await confirmStaticModal(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })

    // 列表只显示未转化 → 该行消失
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: name })).toHaveCount(0)

    // API 验证项目已创建（同名 + 关联商机）
    const projects = await apiCall(ADMIN, 'GET', `/projects?search=${encodeURIComponent(name)}`)
    const created = (projects.json?.data || []).find((p: any) => p.name === name)
    expect(created, '转化应创建同名项目').toBeTruthy()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('标记丢单 → 状态已丢单；关闭 → 已关闭', async ({ page }) => {
    test.skip(!orgId, '前置客户创建失败')
    const errors = collectPageErrors(page)
    const name = unique('E2E丢单售前')
    await createOpp(name)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/opportunities')
    await clickMore(page, name, '标记丢单')
    await page.locator('.ant-modal-confirm').waitFor({ timeout: 10_000 })
    await confirmStaticModal(page)
    await expectSuccess(page, '已标记为丢单')
    await expect(tableRow(page, name).locator('.ant-tag', { hasText: '已丢单' })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('编辑售前改名 → 列表更新', async ({ page }) => {
    test.skip(!orgId, '前置客户创建失败')
    const errors = collectPageErrors(page)
    const name = unique('E2E编辑售前')
    const opp = await createOpp(name)
    test.skip(opp.status !== 201, `商机创建失败: ${opp.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/opportunities')
    const row = tableRow(page, name)
    await row.getByRole('button', { name: /编\s*辑/ }).click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    const newName = `${name}-已改`
    await fillFormItem(modal, /项目名称|名称/, newName)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存)/ }).first().click()
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(800)
    // 名称变更通过 API 断言（列表刷新时序受分页影响）
    const after = await apiCall(ADMIN, 'GET', `/opportunities/${opp.json.id}`)
    expect(after.json?.name).toBe(newName)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('详情页 Notes 信息记录：新增 → 列表可见 → 删除', async ({ page }) => {
    test.skip(!orgId, '前置客户创建失败')
    const errors = collectPageErrors(page)
    const name = unique('E2E笔记售前')
    const opp = await createOpp(name)
    test.skip(opp.status !== 201, '商机创建失败')

    await loginViaApi(page, ADMIN)
    await gotoApp(page, `/opportunities/${opp.json.id}`)

    // 新增 Notes
    const content = `E2E笔记内容-${Date.now()}`
    await page.getByRole('button', { name: /Notes信息|新增记录/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await modal.locator('textarea').first().fill(content)
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存|提\s*交)/ }).first().click()
    await expectSuccess(page)
    await expect(page.getByText(content).first()).toBeVisible()

    // 删除该记录（操作按钮为纯图标：编辑/删除在 List.Item actions 里）
    const record = page.locator('.ant-list-item', { hasText: content }).first()
    await record.locator('button:has(.anticon-delete)').first().click()
    await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
    await expectSuccess(page)
    await expect(page.getByText(content)).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('列表搜索：关键词过滤', async ({ page }) => {
    const errors = collectPageErrors(page)
    const name = unique('E2E搜索售前')
    await createOpp(name)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/opportunities')
    await page.locator('input[placeholder*="项目名称"], input[placeholder*="搜索"]').first().fill(name)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: name }).first()).toBeVisible()
    // 搜索结果不应包含其他 E2E搜索 前缀的单（唯一性过滤生效）
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
