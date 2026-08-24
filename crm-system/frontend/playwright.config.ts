import { defineConfig } from '@playwright/test'

/**
 * E2E 测试配置
 *
 * 前置条件：
 *   后端已在 http://localhost:5000 运行并连接测试库 crm_test
 *   （见 backend/test/README.md；测试账号由 backend/test/seed-test-data.mjs 提供）
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  hookTimeout: 120_000, // beforeAll 里首次登录可能撞登录限流，helpers 会等 65s 冷却重试
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // 共享测试库，串行执行保证确定性
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1680, height: 950 },
    locale: 'zh-CN',
    actionTimeout: 10_000,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 90_000,
  },
})
