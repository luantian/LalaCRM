import { Page, Locator, expect } from '@playwright/test'

/** 测试账号（由 backend/test/seed-test-data.mjs 写入测试库） */
export const ADMIN = { username: 'testadmin', password: 'Test123456!' }
export const TESTER = { username: 'testuser', password: 'Test123456!' } // SELF 范围，报价单可建可提交、无审批权
export const APPROVER = { username: 'testapprover', password: 'Test123456!' } // 报价单审批权，非管理员（防自审批对其生效）

const API = 'http://localhost:5000/api'

/** 登录结果缓存：登录接口限流 5 次/分钟/IP，全测试套件只登录一次/账号 */
const loginCache = new Map<string, { token: string; user: any; menus: any }>()

async function doLogin(account: { username: string; password: string }) {
  const cached = loginCache.get(account.username)
  if (cached) return cached

  let res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  })
  // 撞上登录限流窗口（01-auth 的 UI 登录测试也占额度）→ 等窗口过期重试一次
  if (res.status === 429) {
    console.log(`  [helpers] 登录限流，等待 65s 重试（${account.username}）`)
    await new Promise((r) => setTimeout(r, 65_000))
    res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    })
  }
  if (!res.ok) throw new Error(`API 登录失败: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const entry = { token: data.token, user: data.user, menus: data.menus }
  loginCache.set(account.username, entry)
  return entry
}

/**
 * 通过 API 登录并把 token/user/menus 注入 localStorage（比每次走 UI 登录快且稳定）。
 * UI 登录流程本身在 01-auth.spec.ts 中单独覆盖。
 */
export async function loginViaApi(page: Page, account = ADMIN) {
  const { token, user, menus } = await doLogin(account)
  await page.addInitScript(
    ({ token, user, menus }) => {
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('menus', JSON.stringify(menus))
    },
    { token, user, menus }
  )
}

/** 直接调用后端 API（用于准备/清理测试数据，复用登录缓存） */
export async function apiCall(
  account: { username: string; password: string } | string,
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  const token =
    typeof account === 'string' ? account : (await doLogin(account)).token
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

/** 打开应用页面并等待渲染稳定 */
export async function gotoApp(page: Page, path = '/') {
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  // 等内容区出现（Layout 渲染完成）
  await page.locator('.ant-layout-content, .login-page').first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(400) // 等 lazy chunk + 首屏数据请求
}

/** 收集未捕获 JS 异常（页面级 bug 的强信号） */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

/** 断言内容区已渲染且非空白（防止路由未注册导致的白屏） */
export async function expectPageRendered(page: Page) {
  const content = page.locator('.ant-layout-content')
  await expect(content).toBeVisible()
  const text = (await content.innerText().catch(() => '')) || ''
  expect(
    text.trim().length,
    `页面疑似白屏：${page.url()}`
  ).toBeGreaterThan(0)
}

/** 打开「新建/编辑」弹窗：点击触发按钮并等待 modal 出现 */
export async function openModal(page: Page, trigger: Locator) {
  await trigger.click()
  await page.locator('.ant-modal:visible .ant-modal-content').first().waitFor()
}

/** 点击弹窗底部的确定/保存/提交/确认按钮，并等待弹窗关闭 */
export async function submitModal(page: Page) {
  // 先点弹窗标题处收起仍开着的下拉/日期面板（防止面板遮挡 footer 按钮）
  const title = page.locator('.ant-modal:visible .ant-modal-title').first()
  if (await title.isVisible().catch(() => false)) {
    await title.click().catch(() => {})
    await page.waitForTimeout(250)
  }
  await page
    .locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|确\s*认|保\s*存|提\s*交|创\s*建|添\s*加)/ })
    .first()
    .click()
  // 等待任一结果：弹窗关闭 或 成功提示出现
  await Promise.race([
    page.locator('.ant-modal:visible .ant-modal-content').first().waitFor({ state: 'hidden', timeout: 15_000 }),
    page.locator('.ant-message-success, .ant-message-error').first().waitFor({ timeout: 15_000 }),
  ])
}

/** 点击 Popconfirm 确认按钮 */
export async function confirmPopconfirm(page: Page, trigger: Locator) {
  await trigger.click()
  await page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first().click()
}

/** 表单作用域：Page 或 Locator（如弹窗内容，避免与页面搜索栏同名 label 冲突） */
type Scope = Page | Locator

/** 从 Scope 取 Page（Locator.page() / Page 自身）——antd 下拉/日期面板渲染在 body 层级 */
function pageOf(scope: Scope): Page {
  const s = scope as any
  return typeof s.page === 'function' ? s.page() : (scope as Page)
}

/** 按 label 定位 Form.Item（antd label 常带 * 必填标记，用包含匹配）。
 *  scope 传弹窗内容定位器可避免命中页面顶部搜索栏的同名字段。
 *  用 CSS :has(label:has-text()) 实现（filter({has}) 在嵌套 locator 链上不生效） */
export function formItem(scope: Scope, labelText: string | RegExp): Locator {
  const root = scope as any
  if (typeof labelText === 'string') {
    // 转义引号，走 CSS 引擎精确匹配"内部 label 含该文本"的 form-item
    const esc = labelText.replace(/"/g, '\\"')
    return root.locator(`.ant-form-item:has(label:has-text("${esc}"))`).first()
  }
  return root.locator('.ant-form-item', { hasText: labelText }).first()
}

/** 按 Form.Item 的 label 文本填充输入框 */
export async function fillFormItem(scope: Scope, labelText: string | RegExp, value: string) {
  const item = formItem(scope, labelText)
  await item.locator('input:not([type=hidden]), textarea').first().fill(value)
}

/** antd Select：按 label 打开并选择指定选项文本（下拉渲染在 body，用页面级可见下拉匹配）。
 *  应对虚拟列表：目标选项可能不在渲染窗口内 —— 可搜索 Select 直接键入文本过滤后再点 */
export async function selectInForm(scope: Scope, labelText: string | RegExp, optionText: string) {
  const page = pageOf(scope)
  const item = formItem(scope, labelText)
  const optionLoc = () =>
    page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: optionText }).first()

  await item.locator('.ant-select-selector').first().click()
  await page.waitForTimeout(350)

  if (!(await optionLoc().isVisible().catch(() => false))) {
    // 键入过滤（焦点已在 Select 的搜索输入上；不可搜索的 Select 键入无副作用）
    await page.keyboard.type(optionText)
    await page.waitForTimeout(450)
  }
  if (!(await optionLoc().isVisible().catch(() => false))) {
    // 仍不可见：收起重开一次（弹窗动画吞点击的场景）
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    await item.locator('.ant-select-selector').first().click()
    await page.waitForTimeout(400)
    if (!(await optionLoc().isVisible().catch(() => false))) {
      await page.keyboard.type(optionText)
      await page.waitForTimeout(450)
    }
  }
  const option = optionLoc()
  await option.waitFor({ timeout: 10_000 })
  await option.click()
}

/** antd TreeSelect（如客户树）：按 label 打开并点选树节点 */
export async function selectTreeInForm(scope: Scope, labelText: string | RegExp, nodeText: string) {
  const page = pageOf(scope)
  const item = formItem(scope, labelText)
  await item.locator('.ant-select-selector').first().click()
  await page.waitForTimeout(350)
  const node = page
    .locator('.ant-select-tree-dropdown:visible .ant-select-tree-node-content-wrapper', { hasText: nodeText })
    .first()
  await node.waitFor({ timeout: 10_000 })
  await node.click()
}

/** antd DatePicker：按 label 打开并点"今天"单元格（比 footer 今天按钮更稳定） */
export async function fillDateToday(scope: Scope, labelText: string | RegExp) {
  const page = pageOf(scope)
  const item = formItem(scope, labelText)
  await item.locator('input').first().click()
  await page.waitForTimeout(400)
  await page
    .locator('.ant-picker-dropdown:visible .ant-picker-cell-today .ant-picker-cell-inner')
    .first()
    .click()
  await page.waitForTimeout(250)
}

/** 生成唯一业务名称（避免列表断言撞名） */
export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
}

/** 在表格中定位包含指定文本的行 */
export function tableRow(page: Page, text: string): Locator {
  return page.locator('.ant-table-tbody tr', { hasText: text }).first()
}

/** 等待成功提示（antd message） */
export async function expectSuccess(page: Page, text?: string) {
  const loc = text
    ? page.locator('.ant-message-success, .ant-message-notice', { hasText: text }).first()
    : page.locator('.ant-message-success').first()
  await loc.waitFor({ timeout: 15_000 })
}

/** 关闭所有弹窗（兜底清理） */
export async function closeModals(page: Page) {
  const cancel = page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^取\s*消|Cancel/ }).first()
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click()
    await page.waitForTimeout(300)
  }
}
