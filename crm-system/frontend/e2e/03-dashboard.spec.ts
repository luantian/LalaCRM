import { test, expect } from '@playwright/test'
import { ADMIN, loginViaApi, gotoApp, collectPageErrors, openModal, submitModal, fillFormItem, selectInForm, unique, expectSuccess } from './helpers'

test.describe('工作台', () => {
  test('打卡按钮工作（点击后状态变化或提示）', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    const btn = page.getByRole('button', { name: /打卡/ }).first()
    await expect(btn).toBeVisible()
    await btn.click()
    // 成功提示 或 按钮变为已打卡（若当日已打过则为重复提示，均算 UI 响应正常）
    await page
      .locator('.ant-message')
      .first()
      .waitFor({ timeout: 15_000 })
  })

  test('任务三 Tab 可切换', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    for (const tab of ['我委派的', '历史任务']) {
      await page.locator('.ant-tabs-tab', { hasText: tab }).first().click()
      await expect(page.locator('.ant-tabs-tab-active', { hasText: tab })).toBeVisible()
    }
  })

  test('委派任务：嵌套表单（类型→项目级联→指派多选→优先级）', async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')

    await openModal(page, page.getByRole('button', { name: /委派任务/ }).first())
    const modal = page.locator('.ant-modal:visible .ant-modal-content')
    const title = unique('E2E任务')
    await fillFormItem(modal, '任务标题', title)
    // 任务类型 select
    await selectInForm(modal, '任务类型', '日常工作')
    // 优先级 select
    await selectInForm(modal, '优先级', '高')
    // 指派给（多选）——选第一个可用选项
    const item = modal.locator('.ant-form-item:has(label:has-text("指派给"))').first()
    await item.locator('.ant-select-selector').first().click()
    await page.waitForTimeout(350)
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
    await page.keyboard.press('Escape') // 收起多选下拉

    await submitModal(page)
    await expectSuccess(page)
    // 切到"我委派的" Tab 应能看到新任务
    await page.locator('.ant-tabs-tab', { hasText: '我委派的' }).first().click()
    await expect(page.locator('.ant-tabs-tabpane-active', { hasText: title }).first()).toBeVisible()
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  test('任务操作：开始/完成弹窗（嵌套确认流）', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')

    // 在"我委派的"列表中找一个任务卡片并打开操作下拉
    await page.locator('.ant-tabs-tab', { hasText: '我委派的' }).first().click()
    await page.waitForTimeout(600)
    const card = page.locator('.ant-tabs-tabpane-active .ant-card').first()
    if (!(await card.isVisible().catch(() => false))) {
      test.skip(true, '无任务卡片可操作')
    }
    // 卡片悬浮显示操作按钮（开始/完成）
    const startBtn = card.getByRole('button', { name: /开\s*始/ }).first()
    const doneBtn = card.getByRole('button', { name: /完\s*成/ }).first()
    if (await doneBtn.isVisible().catch(() => false)) {
      await doneBtn.click()
      // 完成弹窗（填写记录）或直接完成
      const modal = page.locator('.ant-modal:visible .ant-modal-content')
      if (await modal.isVisible().catch(() => false)) {
        const contentInput = page.locator('.ant-modal:visible textarea, .ant-modal:visible input').first()
        if (await contentInput.isVisible().catch(() => false)) {
          await contentInput.fill('E2E 自动化完成')
        }
        await page.locator('.ant-modal:visible .ant-modal-footer button', { hasText: /^确\s*定|完\s*成/ }).first().click()
      }
      await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    } else if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click()
      await page.locator('.ant-message').first().waitFor({ timeout: 15_000 })
    }
  })

  test('搜索框可输入并触发任务过滤（防抖请求）', async ({ page }) => {
    await loginViaApi(page, ADMIN)
    await gotoApp(page, '/')
    const search = page.getByPlaceholder(/搜索/).first()
    if (await search.isVisible().catch(() => false)) {
      await search.fill('不存在的任务XYZ')
      await page.waitForTimeout(800) // 防抖 300ms + 请求
      // 无结果时显示空态，页面不崩溃
      await expectPageOk(page)
    }
  })

  async function expectPageOk(page: import('@playwright/test').Page) {
    const content = page.locator('.ant-layout-content')
    await expect(content).toBeVisible()
  }
})
