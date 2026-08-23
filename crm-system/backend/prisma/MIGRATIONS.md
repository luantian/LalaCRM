# 迁移说明

## 2026-08-23：迁移基线重置

旧迁移历史不完整（原 init 仅建 5 张表，而 schema 有 72+ 模型），导致
`prisma migrate deploy` 在全新数据库上必然失败，团队实际依赖 `prisma db push`。

本次用 `prisma migrate diff --from-empty --to-schema-datamodel` 从当前 schema
生成了完整的基线迁移 `20260823000000_init_baseline`，替换全部旧迁移。
已在全新数据库上验证 `migrate deploy` 全流程可用（建表 → 种子 → 冒烟测试通过）。

## 已有环境的一次性操作

已有的数据库（开发库/生产库）表结构已存在，`_prisma_migrations` 中还留着旧
迁移记录。如果希望切换到 migrate 工作流，执行一次：

```bash
# 在 backend 目录，DATABASE_URL 指向目标库
DATABASE_URL="..." npx prisma migrate resolve --applied 20260823000000_init_baseline
```

之后 `prisma migrate deploy` 会将基线视为已应用，新增迁移正常增量执行。

**不执行上述命令也没关系**：现有部署脚本（deploy-fresh.sh / update.sh /
deploy-to-synology.sh）均使用 `prisma db push`，不受影响。

## 种子数据

| 脚本 | 内容 | 幂等 |
|---|---|---|
| `prisma/seed.js` | 菜单树 + 按钮权限节点 | 重建（先清空 RoleMenu/MenuItem） |
| `prisma/seed-holidays.js` | 2026 法定节假日（21 条） | ✅ upsert |
| `test/seed-test-data.mjs` | 测试角色/用户（仅测试库） | ✅ upsert |

节假日数据不再依赖迁移中的 INSERT（`db push` 流程拿不到），部署脚本已统一
在 `db push` 后调用 `seed-holidays.js`。
