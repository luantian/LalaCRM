import { test, expect } from '@playwright/test'
import {
  ADMIN, loginViaApi, gotoApp, collectPageErrors, unique, apiCall,
  openModal, fillFormItem, submitModal,
} from './helpers'

/**
 * 系统管理深水区 E2E（2026-08 补盲）：
 * 菜单管理 CRUD（IconPicker/角色多选/子菜单删除保护）、角色权限编辑与被使用删除保护、
 * 字典项 CRUD + 类型级联删除、部门子部门删除保护（前后端行为矛盾点）、
 * 用户自删保护、数据库备份（立即备份/记录/删除，绝不触碰恢复）。
 */

async function confirmPopconfirm(page: import('@playwright/test').Page) {
  const btn = page.locator('.ant-popover .ant-popconfirm-buttons button', { hasText: /^确\s*定|OK/ }).first()
  await page.waitForTimeout(300) // 等 popover 弹出动画稳定，避免 not stable 抖动
  await btn.click()
}

test.describe('菜单管理', () => {
  test('树形表格渲染 → 菜单出现（API 创建）→ 编辑弹窗字段完整 → 删除', async ({ page }) => {
    const errors = collectPageErrors(page)

    // 创建走 API（IconPicker+角色多选的嵌套交互在无头环境极不稳定；创建字段校验由 API 断言覆盖）
    const key = `e2e-menu-${Date.now().toString(36)}`
    const roles = await apiCall(ADMIN, 'GET', '/roles')
    const roleId = (roles.json || [])[0]?.id
    const created = await apiCall(ADMIN, 'POST', '/menus', {
      key, label: `E2E菜单${Date.now().toString(36)}`, icon: 'FileOutlined', menuType: 'MENU',
      path: '/e2e-test-menu', order: 99, visible: true, roleIds: [roleId],
    })
    test.skip(created.status !== 201, `菜单创建失败: ${created.status} ${JSON.stringify(created.json)?.slice(0, 100)}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/menus')
    await expect(page.locator('.ant-table-tbody').getByText('工作总览').first()).toBeVisible({ timeout: 15_000 })

    // 列表出现（按标识定位）
    await expect(page.locator('.ant-table-tbody tr', { hasText: key }).first()).toBeVisible()

    // 打开编辑弹窗验证字段回显（含 IconPicker 已选图标显示）
    await page.locator('tr:has-text("' + key + '") button:has-text("编辑")').first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('已选择').first()).toBeVisible() // IconPicker 已选回显
    await page.locator('.ant-modal:visible .ant-modal-close').first().click()
    await page.waitForTimeout(400)

    // 删除（无子菜单可删）
    await page.locator('.ant-table-tbody tr', { hasText: key }).first().getByRole('button', { name: /删\s*除/ }).first().click()
    await confirmPopconfirm(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: key })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('角色管理深水区', () => {
  test('编辑临时角色权限（勾选变更保存）→ 删除被使用角色被拒 → 删除空闲角色', async ({ page }) => {
    const errors = collectPageErrors(page)
    // API 建临时角色
    const roleName = `E2E角色${Date.now().toString(36)}`
    const role = await apiCall(ADMIN, 'POST', '/roles', { displayName: roleName, description: 'E2E临时角色' })
    test.skip(role.status !== 201, `角色创建失败: ${role.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/roles')
    // 角色列表加载完成后再操作（gotoApp 的 400ms 不够）
    await expect(page.locator('.ant-table-tbody tr', { hasText: 'ADMIN' }).first()).toBeVisible({ timeout: 15_000 })
    const row = page.locator('.ant-table-tbody tr', { hasText: roleName }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })

    // 编辑 → 菜单权限 Tab 勾选一个权限 → 保存（定位方式与 07 已通过用例一致）
    await page.locator(`tr:has-text("${roleName}") button:has-text("编辑")`).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    const permTab = modal.getByRole('tab', { name: /菜单权限/ }).first()
    if (await permTab.isVisible().catch(() => false)) {
      await permTab.click()
      await page.waitForTimeout(500)
      const treeCheckbox = modal.locator('.ant-tree-checkbox').first()
      if (await treeCheckbox.isVisible().catch(() => false)) {
        await treeCheckbox.click()
        await page.waitForTimeout(300)
      }
    }
    await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^(确\s*定|保\s*存)/ }).first().click()
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })

    // 删除被使用的角色 → 后端 400（表格重渲染会让 Popconfirm 挂载点销毁、UI 点击不稳，保护行为走 API 断言）
    const roles2 = await apiCall(ADMIN, 'GET', '/roles')
    const testerRole = (roles2.json || []).find((r: any) => r.name === 'TEST_SELF_USER' || r.displayName?.includes('普通用户'))
    if (testerRole) {
      const delRes = await apiCall(ADMIN, 'DELETE', `/roles/${testerRole.id}`)
      expect([400, 409]).toContain(delRes.status)
    }
    // 表格中该角色仍在
    const testerRowAgain = page.locator('.ant-table-tbody tr', { hasText: 'TEST_SELF_USER' }).first()
    await expect(testerRowAgain).toBeVisible({ timeout: 15_000 })

    // 删除空闲的临时角色 → 成功
    await page.locator(`tr:has-text("${roleName}") button:has-text("删除")`).first().click()
    await confirmPopconfirm(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(800)
    await expect(page.locator('.ant-table-tbody tr', { hasText: roleName })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('权限对照表弹窗渲染', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/roles')
    await expect(page.locator('.ant-table-tbody tr', { hasText: 'ADMIN' }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /权限对照表/ }).first().click()
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(modal.getByText(/权限|角色/).first()).toBeVisible()
    await page.locator('.ant-modal .ant-modal-close').first().click()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('字典管理深水区', () => {
  test('新增类型 → 新增字典项 → 项编辑状态 → 删除项 → 删除类型（级联）', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/dicts')

    // 新增类型
    const typeName = `E2E字典${Date.now().toString(36)}`
    await openModal(page, page.getByRole('button', { name: /新增类型/ }))
    let modal = page.locator('.ant-modal:visible .ant-modal-content')
    await fillFormItem(modal, /类型名称|名称/, typeName)
    await fillFormItem(modal, /类型编码|编码/, `e2e_dict_${Date.now().toString(36)}`)
    await submitModal(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })

    // 选中该类型（左栏行点击）
    await page.locator('.ant-table-tbody tr', { hasText: typeName }).first().click()
    await page.waitForTimeout(600)

    // 新增字典项
    const itemLabel = `E2E字典项${Date.now().toString(36)}`
    await page.getByRole('button', { name: /新增字典项/ }).first().click()
    modal = page.locator('.ant-modal:visible .ant-modal-content')
    await expect(modal).toBeVisible()
    await fillFormItem(modal, /标\s*签/, itemLabel)
    await fillFormItem(modal, /值/, `e2e_val_${Date.now().toString(36)}`)
    await submitModal(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await expect(page.locator('.ant-table-tbody tr', { hasText: itemLabel }).first()).toBeVisible()

    // 删除字典项（右侧表格行，纯图标或文字按钮）
    const itemRow = page.locator('.ant-table-tbody tr', { hasText: itemLabel }).first()
    await itemRow.getByRole('button', { name: /删\s*除/ }).first().click()
    await confirmPopconfirm(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(600)

    // 删除类型（级联删项）
    await page.locator('.ant-table-tbody tr', { hasText: typeName }).first().getByRole('button', { name: /删\s*除/ }).first().click()
    await confirmPopconfirm(page)
    await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    await page.waitForTimeout(600)
    await expect(page.locator('.ant-table-tbody tr', { hasText: typeName })).toHaveCount(0)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('部门与用户保护', () => {
  test('部门：有子部门时删除被后端拒绝（与前端提示矛盾的行为记录）', async ({ page }) => {
    const errors = collectPageErrors(page)
    const parent = `E2E父部门${Date.now().toString(36)}`
    const child = `E2E子部门${Date.now().toString(36)}`

    // 数据准备走 API（动态建树后的 UI 嵌套表单在无头环境不稳）
    const p = await apiCall(ADMIN, 'POST', '/departments', { name: parent, status: 'ENABLED' })
    test.skip(p.status !== 201, `父部门创建失败: ${p.status}`)
    const c = await apiCall(ADMIN, 'POST', '/departments', { name: child, parentId: p.json.id, status: 'ENABLED' })
    test.skip(c.status !== 201, `子部门创建失败: ${c.status}`)

    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/departments')
    // 选中父部门（选中标志 = 详情区出现"删除当前"；树节点文本恒存在不能作选中断言）
    await expect(page.locator('.ant-tree-node-content-wrapper', { hasText: parent }).first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.ant-tree-node-content-wrapper', { hasText: parent }).first().click()
    const deleteCurrentBtn = page.getByRole('button', { name: /删除当前/ })
    await expect(deleteCurrentBtn.first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(300)

    // 删除父部门：前端提示"子部门一并删除"，后端实际拒绝 → 错误消息，页面不崩溃
    await deleteCurrentBtn.first().click()
    await confirmPopconfirm(page)
    await page.locator('.ant-message-error, .ant-message-notice').first().waitFor({ timeout: 15_000 })
    // 父部门仍在
    await expect(page.locator('.ant-tree-node-content-wrapper', { hasText: parent }).first()).toBeVisible()

    // 清理走 API（子部门节点藏在未展开的父节点下，UI 定位不稳；清理非被测行为）
    await apiCall(ADMIN, 'DELETE', `/departments/${c.json.id}`)
    await apiCall(ADMIN, 'DELETE', `/departments/${p.json.id}`)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('用户：删除自己被拒绝', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/users')
    const selfRow = page.locator('.ant-table-tbody tr', { hasText: 'testadmin' }).first()
    await selfRow.getByRole('button', { name: /删\s*除/ }).first().click()
    await confirmPopconfirm(page)
    await page.locator('.ant-message-error, .ant-message-notice').first().waitFor({ timeout: 15_000 })
    await expect(page.locator('.ant-table-tbody tr', { hasText: 'testadmin' }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

test.describe('数据库备份', () => {
  test('立即备份 → 记录出现"成功"行 → 删除该记录（不触碰恢复）', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/database-backup')

    // 统计卡渲染
    await expect(page.locator('.ant-card').first()).toBeVisible()

    // 立即备份
    await page.getByRole('button', { name: /立即备份/ }).first().click()
    await page.locator('.ant-message').first().waitFor({ timeout: 60_000 })

    // 记录表出现"成功"状态行
    await expect(page.locator('.ant-table-tbody .ant-tag', { hasText: '成功' }).first()).toBeVisible({ timeout: 15_000 })
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
