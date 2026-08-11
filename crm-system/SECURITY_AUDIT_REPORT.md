# LalaCRM 后端路由安全审计报告

审计范围：`backend/src/routes/` 下全部 36 个路由文件
审计日期：2026-08-12

严重级别说明：
- **P0** = 严重（可直接导致数据泄露/系统被攻破）
- **P1** = 高危（可导致越权访问/数据泄露）
- **P2** = 中危（权限校验不完整/逻辑缺陷）
- **P3** = 低危（代码质量/类型安全/一致性问题）

---

## 汇总统计

| 级别 | 数量 |
|------|------|
| P0   | 0    |
| P1   | 15   |
| P2   | 38   |
| P3   | 25   |
| **总计** | **78** |

---

## 1. `auth.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 100-130 | P3 | GET `/me` 和 GET `/menus` 手动验证 JWT 而非使用 `authenticateToken` 中间件，逻辑重复且可能与中间件不一致 | 统一使用 `authenticateToken` 中间件 |

## 2. `users.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/dropdown` | P2 | 仅 `authenticateToken`，返回所有用户列表无数据范围过滤，可能泄露人员信息 | 添加 `checkPermission` 或限制返回字段 |

## 3. `organizations.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/contacts/simple` | P2 | 仅 `authenticateToken`，缺少 `checkPermission` | 添加 `checkPermission('crm:organization:contact:list')` |
| GET `/contacts` | P2 | 有 `checkPermission` 但缺少 `applyDataScope` | 添加 `applyDataScope({ ownerField: 'ownerId' })` |
| GET `/contacts/:id` | P2 | 缺少 `checkPermission` | 添加权限校验 |
| GET `/:id` | P2 | 有 `applyDataScope` 但缺少 `checkPermission` | 添加 `checkPermission('crm:organization:list')` |
| GET `/:id/contacts` | P2 | 缺少 `checkPermission` | 添加权限校验 |

## 4. `projects.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 82-166 | P1 | Raw SQL `ORDER BY p."${sortBy}"` 直接插值，虽有 `sortValidation` 白名单但仍是 SQL 注入风险点 | 使用参数化或 Prisma orderBy 代替 |
| GET `/export/excel` | P2 | 有 `applyDataScope` 但缺少 `checkPermission` | 添加 `checkPermission('project:project:list')` |
| GET `/export/csv` | P2 | 同上 | 同上 |
| DELETE `/:id` | P3 | 使用 `checkPermission('project:project:edit')` 而非独立的删除权限 | 考虑添加 `project:project:delete` 权限 |

## 5. `tasks.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 全部路由 | P1 | 所有路由仅 `authenticateToken`，无 `checkPermission`，依赖自定义的 isAssigner/isAssignee 检查 | 至少为管理路由添加 `checkPermission('project:task:*')` |

## 6. `contracts.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/files/:fileId/download` | P1 | 有 `checkPermission` 但无所有权/dataScope 检查，任何有 list 权限的用户可下载任意合同文件 | 添加文件所属合同的所有权校验 |
| GET `/files/:fileId/preview` | P1 | 同上 | 同上 |
| POST `/import` | P3 | 使用 `as any` 类型转换 | 定义正确的类型 |

## 7. `contractReceipts.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/` | P2 | 缺少 `checkPermission`，仅 `authenticateToken` | 添加 `checkPermission('project:contract:list')` |
| GET `/:id/files` | P2 | 缺少 `checkPermission` | 添加权限校验 |
| GET `/files/:fileId/download` | P1 | 缺少 `checkPermission` 且缺少所有权检查 | 添加权限和所有权校验 |
| GET `/files/:fileId/preview` | P1 | 同上 | 同上 |

## 8. `invoices.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/stats/overview` | P2 | 使用 `finance:expense:list` 权限，应为 `finance:invoice:list` | 修正权限字符串 |
| GET `/:id/files` | P2 | 缺少 `checkPermission` | 添加 `checkPermission('finance:invoice:list')` |
| GET `/files/:fileId/download` | P2 | 使用 `req.user!.role === 'ADMIN'` 而非 `isAdmin()` 函数 | 使用 `isAdmin(req.user!.id)` |
| GET `/files/:fileId/preview` | P2 | 同上 | 同上 |
| POST `/` | P2 | 使用 `finance:expense:edit` 权限，应为 invoice 相关权限 | 修正权限字符串 |

## 9. `opportunities.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/records/files/:fileId/download` | P1 | 无所有权检查 | 添加文件所属商机的所有权校验 |
| GET `/records/files/:fileId/preview` | P1 | 同上 | 同上 |
| GET `/:id/records/:recordId/files` | P3 | 缺少 `checkPermission` | 添加权限校验 |
| POST `/:id/close-project` | P2 | 修改项目状态为 CANCELLED 但无状态机校验 | 添加项目状态转换校验 |

## 10. `procurements.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/files/:fileId/download` | P1 | 无所有权检查 | 添加文件所属采购单的所有权校验 |
| GET `/files/:fileId/preview` | P1 | 同上 | 同上 |
| GET `/item-files/:fileId/download` | P1 | 无所有权检查 | 同上 |
| GET `/item-files/:fileId/preview` | P1 | 同上 | 同上 |
| GET `/payment-files/:fileId/download` | P1 | 无所有权检查 | 同上 |
| GET `/payment-files/:fileId/preview` | P1 | 同上 | 同上 |
| DELETE `/files/:fileId` | P2 | 未删除磁盘物理文件 | 添加 `fs.unlinkSync` |
| DELETE `/items/:itemId` (343-371) | P3 | 重复的 `procurementItemFile.updateMany` 调用 | 删除重复代码 |
| DELETE `/items/:itemId` | P2 | 权限检查注释为 `project:procurement:delete` 但代码仅检查 `isAdmin()` | 添加 `checkPermission` |
| PUT `/items/:itemId` | P2 | 无采购单存在性/所有权检查 | 添加 procurement 关联和所有权校验 |

## 11. `dailyReports.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| POST `/:id/items` | P3 | 检查 `report.userId !== req.user!.id` 但无 admin 覆盖 | 添加 `isAdmin()` admin 覆盖 |
| 1048 | P2 | `report: where` 传递 where 对象作为关系过滤器，Prisma 中可能不正确 | 使用 `report: { ... }` 正确的 Prisma 关系过滤语法 |
| POST `/import` | P3 | 使用 `as any` 类型转换 | 定义正确的类型 |

## 12. `checkIns.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 733-755 | P2 | 补卡创建两条记录（早上+晚上）无事务，若第二条失败则数据不一致 | 使用 `prisma.$transaction` 包裹 |
| 17 | P3 | `serializeCheckIn(record: any)` 使用 `any` 类型 | 定义明确的类型 |
| 470-471 | P3 | `period as any`, `type as any` 类型转换 | 使用 Prisma 生成的枚举类型 |
| 483 | P3 | `period as any` 类型转换 | 同上 |

## 13. `businessTrips.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/` (16) | P2 | 有 `applyDataScope` 但缺少 `checkPermission` | 添加 `checkPermission('office:trip:list')` |
| GET `/stats/overview` (87) | P2 | 同上 | 同上 |
| GET `/:id` (126) | P2 | 同上 | 同上 |
| POST `/:id/submit` (208) | P2 | 有 `checkPermission` 但无所有权检查，任何用户可提交他人的出差申请 | 添加 `trip.ownerId !== req.user!.id` 校验 |
| GET `/export/excel` (511) | P2 | 有 `applyDataScope` 但缺少 `checkPermission` | 添加 `checkPermission('office:trip:list')` |
| POST `/import` (545) | P3 | 使用 `as any` 类型转换 | 定义正确的类型 |

## 14. `expenses.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| POST `/:id/pay` (545) | P2 | 有 `checkPermission` 但无所有权检查，任何有 approve 权限的用户可标记任意报销为已支付 | 添加所有权或角色校验 |

## 15. `dashboard.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| - | - | 无重大问题。使用 `getDataScopeWhere` 进行数据范围过滤 | - |

## 16. `menus.ts`

无问题发现。所有路由均有正确的 `checkPermission`。

## 17. `roles.ts`

无问题发现。所有路由均有正确的 `checkPermission`。

## 18. `departments.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/tree` (22) | P3 | 仅 `authenticateToken`，缺少 `checkPermission`（用于下拉选择） | 可接受，或添加 `checkPermission('system:department:list')` |
| GET `/:id` (51) | P3 | 仅 `authenticateToken`，缺少 `checkPermission` | 添加 `checkPermission('system:department:list')` |

## 19. `dicts.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/types/:id/data` (124) | P3 | 仅 `authenticateToken`，缺少 `checkPermission`（用于下拉选项） | 可接受，或添加 `checkPermission('system:dict:list')` |
| GET `/code/:code` (233) | P3 | 同上 | 同上 |

## 20. `notifications.ts`

无问题发现。所有路由为自数据访问，有所有权校验。

## 21. `contractOrderItems.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/` (16) | P2 | 仅 `authenticateToken`，缺少 `checkPermission` 和所有权检查 | 添加 `checkPermission` 和合同所有权校验 |
| GET `/:id/files` (222) | P2 | 仅 `authenticateToken`，缺少 `checkPermission` 和所有权检查 | 同上 |
| GET `/files/:fileId/download` (237) | P1 | 仅 `authenticateToken`，任何认证用户可下载任意订货明细文件 | 添加 `checkPermission` 和所有权校验 |
| GET `/files/:fileId/preview` (256) | P1 | 同上 | 同上 |
| DELETE `/:id/files/:fileId` (276) | P2 | 有 `checkPermission` 但缺少所有权检查 | 添加文件所属明细→合同的所有权校验 |

## 22. `contractShipments.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/` (16) | P2 | 仅 `authenticateToken`，缺少 `checkPermission` 和所有权检查 | 添加 `checkPermission` 和合同所有权校验 |
| GET `/:id/files` (185) | P2 | 仅 `authenticateToken`，缺少 `checkPermission` 和所有权检查 | 同上 |
| GET `/files/:fileId/download` (200) | P1 | 仅 `authenticateToken`，任何认证用户可下载任意发货文件 | 添加 `checkPermission` 和所有权校验 |
| GET `/files/:fileId/preview` (219) | P1 | 同上 | 同上 |
| DELETE `/:id/files/:fileId` (239) | P2 | 有 `checkPermission` 但缺少所有权检查 | 添加所有权校验 |

## 23. `expenseFiles.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/:id/files` (60) | P3 | 仅 `authenticateToken`，缺少 `checkPermission`（有所有权检查） | 添加 `checkPermission('finance:expense:list')` |
| GET `/files/:fileId/download` (121) | P3 | 同上 | 同上 |
| GET `/files/:fileId/preview` (151) | P3 | 同上 | 同上 |

## 24. `quotations.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/opportunity/:oppId/versions` (119) | P2 | 有 `checkPermission` 但缺少 `applyDataScope` | 添加 `applyDataScope({ ownerField: 'ownerId' })` |
| POST `/:id/reject` (399) | P2 | 缺少自驳回预防（approve 有但 reject 没有） | 添加 `existing.ownerId === req.user!.id` 校验 |
| POST `/:id/files` (423) | P2 | 有 `checkPermission` 但缺少所有权检查 | 添加报价单所有权校验 |
| GET `/:id/files` (458) | P2 | 仅 `authenticateToken`，缺少 `checkPermission` 和所有权检查 | 添加权限和所有权校验 |
| DELETE `/:id/files/:fileId` (473) | P2 | 有 `checkPermission` 但缺少所有权检查 | 添加所有权校验 |
| GET `/files/:fileId/download` (505) | P3 | `const isAdmin = req.user!.role === 'ADMIN'` 覆盖了导入的 `isAdmin` 函数，且使用原始角色检查 | 使用 `isAdmin(req.user!.id)` 并重命名局部变量 |
| GET `/files/:fileId/preview` (536) | P3 | 同上 | 同上 |
| GET `/export/excel` (574) | P2 | 有 `applyDataScope` 但缺少 `checkPermission` | 添加 `checkPermission('crm:quotation:list')` |
| GET `/export/csv` (590) | P2 | 同上 | 同上 |

## 25. `projectCosts.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/:projectId/summary` (28) | P3 | 仅 `authenticateToken`，缺少 `checkPermission`（有 `checkProjectAccess` 自定义校验） | 可接受，或添加 `checkPermission('project:project:list')` |

## 26. `projectNotes.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/notes` (37) | P3 | 仅 `authenticateToken`，缺少 `checkPermission`（有 `checkProjectAccess`） | 可接受，或添加 `checkPermission('project:project:list')` |
| GET `/versions` (216) | P3 | 同上 | 同上 |
| POST `/notes/:id/files` (366) | P2 | 有 `checkPermission` 但缺少 `checkProjectAccess()` 校验 | 添加项目访问权限校验 |
| GET `/notes/files/:fileId/preview` (395) | P1 | 仅 `authenticateToken`，任何认证用户可预览任意备注附件 | 添加所有权/项目访问校验 |
| GET `/notes/files/:fileId/download` (411) | P1 | 同上 | 同上 |
| DELETE `/notes/:noteId/files/:fileId` (426) | P2 | 有 `checkPermission` 但缺少所有权检查 | 添加备注→项目→所有权校验 |

## 27. `procurementPayments.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/` (11) | P2 | 仅 `authenticateToken`，缺少 `checkPermission` 和所有权检查 | 添加 `checkPermission('project:procurement:list')` 和采购单所有权校验 |
| DELETE `/:id` (121) | P3 | 软删除付款记录时未级联软删除关联的付款文件 | 添加 `procurementPaymentFile.updateMany` 级联软删除 |

## 28. `settings.ts`

无问题发现。

## 29. `loginLogs.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 48, 78, 99 | P3 | 使用 `console.error` 而非 `logger.error` | 统一使用 `logger.error` |

## 30. `operationLogs.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| GET `/` (9) | P3 | 仅 `authenticateToken`，缺少 `checkPermission`（有 admin 检查） | 添加 `checkPermission('system:log:list')` |
| GET `/stats` (66) | P3 | 同上 | 同上 |
| DELETE `/clean` (104) | P2 | 有 `checkPermission('system:log:delete')` 但缺少 admin 检查 | 添加 `isAdmin` 检查 |
| 60, 98, 116 | P3 | 使用 `console.error` 而非 `logger.error` | 统一使用 `logger.error` |

## 31. `roleMenus.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 96-108 | P2 | `deleteMany` + `createMany` 不在事务中，若 `createMany` 失败则角色所有菜单关联丢失 | 使用 `prisma.$transaction` 包裹 |

## 32. `database.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 279-283 | P1 | `execSync` 拼接 `backup.filePath` 执行删除命令，存在命令注入风险（若 filePath 含特殊字符） | 使用 `fs.unlinkSync` 代替 `execSync` |
| 79 | P3 | `SELECT * FROM ${fullTableName}` 使用原始 SQL，表名来自 information_schema 非用户输入 | 可接受，但建议使用 `pg` 的标识符引用 |
| 140-156 | P3 | `restoreDatabase` 按分号分割 SQL，对含分号的字符串数据会出错 | 使用更健壮的 SQL 解析方式 |
| 162 | P3 | `isBackingUp` 布尔值非分布式锁，多实例部署下无法防并发 | 使用 Redis 分布式锁或数据库锁 |

## 33. `dailyReportReminders.ts`

无问题发现。

## 34. `dailyReportTemplates.ts`

无问题发现。

## 35. `monthlyReports.ts`

| 行号 | 级别 | 问题描述 | 修复建议 |
|------|------|----------|----------|
| 84 | P3 | 详情路由用 `hasAnyRole(req.user!.id, ['MANAGER'])` 检查经理权限，列表路由用 `hasManagerPermission`（检查 `view_all_reports`/`manage_reports` 权限），逻辑不一致 | 统一使用同一种经理权限检查方式 |

## 36. `weeklyReports.ts`

无重大问题发现。

---

## 高频问题模式总结

### 1. 文件下载/预览路由缺少所有权检查（P1，影响 8 个文件）

受影响文件：`contracts.ts`, `contractReceipts.ts`, `procurements.ts`, `opportunities.ts`, `contractOrderItems.ts`, `contractShipments.ts`, `projectNotes.ts`

**统一修复方案**：所有文件下载/预览路由应：
1. 通过文件 ID 查询文件记录时 `include` 父级实体
2. 检查当前用户是否为父级实体的 owner 或 admin
3. 添加对应的 `checkPermission`

### 2. 导出路由缺少 `checkPermission`（P2，影响 5 个文件）

受影响文件：`projects.ts`, `businessTrips.ts`, `quotations.ts`

**统一修复方案**：所有 `/export/*` 路由在 `applyDataScope` 前添加对应的 `checkPermission`。

### 3. `req.user!.role === 'ADMIN'` 代替 `isAdmin()` 函数（P3，影响 3 个文件）

受影响文件：`invoices.ts`, `quotations.ts`

**统一修复方案**：使用 `await isAdmin(req.user!.id)` 异步函数，与代码库保持一致。

### 4. 子资源列表路由缺少权限检查（P2，影响 6 个文件）

受影响文件：`contractOrderItems.ts`, `contractShipments.ts`, `procurementPayments.ts` 等

**统一修复方案**：子资源列表路由（如 `GET /?contractId=x`）应添加父级实体的 `checkPermission` 和所有权校验。
