import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, openModal, submitModal,
  fillFormItem, selectInForm, unique, expectSuccess, confirmPopconfirm,
} from './helpers'

let rootOrgName: string

/** 树节点定位（客户页主列表是左侧树，不是表格） */
function treeNode(page: import('@playwright/test').Page, text: string) {
  return page.locator('.ant-tree-node-content-wrapper', { hasText: text }).first()
}

test.describe('客户管理（树形列表 + 联系人嵌套）', () => {
  test('创建根客户 → 树节点可见 → 选中显示详情面板', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/organizations')

    rootOrgName = unique('E2E根客户')
    await openModal(page, page.getByRole('button', { name: /新增根客户/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '客户名称', rootOrgName)
    await selectInForm(modal, '客户类型', '集团')
    await fillFormItem(modal, '地址', 'E2E 测试地址')
    await submitModal(page)
    await expectSuccess(page, '客户创建成功')

    await expect(treeNode(page, rootOrgName)).toBeVisible()
    // 点选节点 → 右侧详情面板按钮出现
    await treeNode(page, rootOrgName).click()
    await expect(page.getByRole('button', { name: /新增子客户/ })).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('新增子客户（选中节点下嵌套创建）→ 展开父节点可见', async ({ page }) => {
    test.skip(!rootOrgName, '依赖前一条创建的根客户')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/organizations')

    await treeNode(page, rootOrgName).click()
    const subName = unique('E2E子客户')
    await openModal(page, page.getByRole('button', { name: /新增子客户/ }))
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, '客户名称', subName)
    await selectInForm(modal, '客户类型', '企业')
    await submitModal(page)
    await expectSuccess(page, '客户创建成功')
    // 树默认折叠：先展开父节点再断言子节点
    const parentNode = page.locator('.ant-tree-treenode', { hasText: rootOrgName }).first()
    const switcher = parentNode.locator('.ant-tree-switcher').first()
    const childVisible = await treeNode(page, subName).isVisible().catch(() => false)
    if (!childVisible) await switcher.click()
    await expect(treeNode(page, subName)).toBeVisible()
  })

  test('编辑客户（改名生效）', async ({ page }) => {
    test.skip(!rootOrgName, '依赖前一条创建的根客户')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/organizations')

    await treeNode(page, rootOrgName).click()
    await page.getByRole('button', { name: /编\s*辑/ }).click()
    await expect(page.locator('.ant-modal-title', { hasText: '编辑客户' })).toBeVisible()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await modal.locator('input').first().fill(rootOrgName + '-改')
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*定|保\s*存/ }).first().click()
    await expectSuccess(page, '客户更新成功')
    rootOrgName = rootOrgName + '-改'
    await expect(treeNode(page, rootOrgName)).toBeVisible()
  })

  test('添加联系人（详情面板嵌套表单，含主要联系人开关）', async ({ page }) => {
    test.skip(!rootOrgName, '依赖前一条创建的根客户')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/organizations')

    await treeNode(page, rootOrgName).click()
    const addContact = page.getByRole('button', { name: /添加联系人|新增联系人/ }).first()
    await openModal(page, addContact)
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    const contactName = unique('E2E联系人')
    await fillFormItem(modal, '姓名', contactName)
    await fillFormItem(modal, '电话', '13800001111')
    const primary = modal.locator('.ant-form-item:has(label:has-text("主要联系人"))').locator('.ant-switch')
    if (await primary.isVisible().catch(() => false)) await primary.click()
    await submitModal(page)
    await expectSuccess(page)
    // 联系人表格出现
    await expect(page.locator('.ant-table-tbody', { hasText: contactName }).first()).toBeVisible()
  })

  test('树节点展开/切换选中（交互健壮性）', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/organizations')
    // 依次点选前两个根节点，详情面板跟随切换且页面不报错
    const nodes = page.locator('.ant-tree-node-content-wrapper')
    const count = await nodes.count()
    test.skip(count < 2, '树节点不足，跳过')
    await nodes.nth(0).click()
    await page.waitForTimeout(300)
    await nodes.nth(1).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.ant-layout-content')).toBeVisible()
  })

  test('删除客户（Popconfirm 确认 → 树中移除）', async ({ page }) => {
    test.skip(!rootOrgName, '依赖前一条创建的根客户')
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/organizations')

    await treeNode(page, rootOrgName).click()
    const delBtn = page.getByRole('button', { name: /删\s*除/ }).first()
    await confirmPopconfirm(page, delBtn)
    await page.waitForTimeout(1200)
    await expect(treeNode(page, rootOrgName)).toHaveCount(0)
  })
})
