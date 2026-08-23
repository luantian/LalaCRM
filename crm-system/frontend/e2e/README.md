# 前端 E2E 测试（Playwright）

真实 Chromium 浏览器驱动，覆盖全部路由渲染、CRUD、嵌套弹窗/Tab/树形操作、
双角色（管理员/普通用户）权限隔离。

**当前状态：71 通过 / 0 失败 / 2 跳过（数据依赖场景）**

## 本套件发现并已修复的产品 bug

| # | Bug | 修复 |
|---|---|---|
| 1 | 界面创建的用户（必选角色）因 UserRole 外键**永远无法删除**，409 文案误导 | `users.ts` 删除前清理 UserRole |
| 2 | 出差表单「出差目的」前端无必填标记，但后端必填——按界面提示填完提交**必然 400** | `BusinessTripList.tsx` 补必填校验 |

## 本套件发现的产品设计问题（未改，待决策）

- 归档页（ProjectArchive）操作列只有「查看」：**无取消归档、无删除入口**。后端 `PUT /projects/:id/archive` 完整支持切换归档，前端 `archiveProject` API 封装**零调用**。项目一旦归档，UI 上无法恢复也无法删除。

## 前置条件

1. **后端**连接测试库 `crm_test` 并运行在 **5000 端口**（vite 代理目标）：
   ```bash
   cd backend
   node test/create-test-db.mjs
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" npx prisma migrate deploy
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node prisma/seed.js
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node prisma/seed-holidays.js
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node test/seed-test-data.mjs
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" PORT=5000 npx ts-node --transpile-only src/index.ts
   ```
2. **前端** dev server 由 Playwright `webServer` 自动拉起（3000 端口，复用已存在的实例）。

## 运行

```bash
cd frontend
npx playwright test              # 全量
npx playwright test e2e/05-projects.spec.ts   # 单个套件
npx playwright test --grep "权限隔离"          # 按名称过滤
npx playwright show-report       # 查看报告
```

## 套件说明

| 文件 | 覆盖 |
|---|---|
| 01-auth | 登录页渲染/空提交/错误密码/UI 登录/改密码(错误提示回归)/退出登录 |
| 02-routes | 管理员 20 条路由渲染 + 普通用户 5 条 + 直连拦截 + 侧边栏菜单嵌套导航 |
| 03-dashboard | 打卡/三 Tab 切换/委派任务嵌套表单/任务操作/搜索防抖 |
| 04-organizations | 根客户→子客户嵌套→编辑→联系人(嵌套表单+开关)→搜索→删除 |
| 05-projects | 项目创建(客户树选择)→详情全 Tab→编辑回归→团队成员→合同(订货/回款/发货三级嵌套)→采购(明细/付款)→归档→删除 |
| 06-business | 售前(联系人级联)→报价(添加行)→报销→日报→出差(日期范围)→打卡/补卡 |
| 07-system | 用户 CRUD→角色(权限树勾选)→部门(树形 CRUD)→字典→日志(时间筛选)→普通用户权限隔离 |

## 注意事项

- **登录限流**：后端 5 次/分钟/IP。helpers 做了 token 全局缓存（每账号只登录一次），
  且 01-auth 的 UI 登录测试占 4 次额度——若冷启动立即重跑，首个 API 登录会等待 65s
  自动重试（控制台有提示），属预期。
- **串行执行**：共享测试库，`workers: 1`。
- **数据隔离**：业务名称均带时间戳后缀（`unique()`），重复运行互不冲突。
- 失败时自动截图 + trace：`test-results/<用例名>/`。
