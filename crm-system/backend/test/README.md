# LalaCRM 后端测试套件

本目录存放**测试专用代码**，不修改业务代码。所有测试在独立数据库
`crm_test` 上运行，与开发库 `crm_db` 完全隔离。

## 文件说明

| 文件 | 用途 |
|---|---|
| `create-test-db.mjs` | 删除并重建测试数据库 `crm_test` |
| `seed-test-data.mjs` | 写入测试角色/用户（testadmin / testuser，密码 `Test123456!`） |
| `smoke-test.mjs` | API 冒烟测试主套件（56 个硬断言 + 行为观察） |

## 完整运行步骤（在 backend 目录下）

```bash
# 1. 重建测试库（幂等）
node test/create-test-db.mjs

# 2. 建表 —— 两种方式任选（2026-08-23 迁移基线重置后两者均可用）：
#    a) 迁移方式（验证 migrate deploy 全流程）
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" npx prisma migrate deploy
#    b) db push 方式（与生产部署脚本一致）
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" npx prisma db push

# 3. 写入种子数据
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node prisma/seed.js
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node prisma/seed-holidays.js
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node test/seed-test-data.mjs

# 4. 启动测试服务器（独立端口 5001，勿与开发服务 5000 混淆）
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" \
PORT=5001 npx ts-node --transpile-only src/index.ts

# 5. 运行测试（另开终端）
node test/smoke-test.mjs
```

## 测试账号

| 账号 | 密码 | 角色 | 数据范围 | 权限 |
|---|---|---|---|---|
| `testadmin` | `Test123456!` | ADMIN | ALL | 全部（通配符 *） |
| `testuser` | `Test123456!` | TESTER | SELF | 客户/项目的 list+add+edit+delete（无系统管理权限） |

## 断言与观察

- `verify()`：硬断言，失败即计为失败（当前 56/56 全部通过）
- `observe()`：行为观察，记录安全相关行为的实际表现

修复回归后重跑，全部应为 ✅。注意登录接口限流为每 IP 每分钟 5 次，
冒烟测试恰好用满 5 次登录后验证第 6 次 429——**测试结束后 1 分钟内
再次重跑，限流断言会失败**，属预期（等待窗口过期即可）。
