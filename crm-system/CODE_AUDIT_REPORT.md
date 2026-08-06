# LalaCRM 代码审计报告

**审计时间**：2026-08-06  
**审计范围**：后端路由、认证、业务逻辑  
**检查文件数**：14个核心路由文件 + 6个中间件

---

## 🔴 高危问题（共 11 个）

### 1. 搜索条件覆盖权限过滤 — 越权访问（2处）

**文件**：`projects.ts:43-73`、`opportunities.ts:40-66`

**问题描述**：
非管理员用户的访问控制通过 `where.OR` 设置（只能看自己相关的项目/商机），但搜索功能直接用新的 `OR` 条件**覆盖**了原权限条件，导致权限过滤完全失效。

**漏洞利用**：任何登录用户，在搜索框输入任意关键词，可以看到所有匹配的项目/商机，不论是否与自己相关。

**修复方案**：
```typescript
// ❌ 错误：直接覆盖 where.OR
if (search) {
  where.OR = [  // ← 覆盖了上面的权限条件
    { name: { contains: searchTerm, mode: 'insensitive' } }
  ]
}

// ✅ 正确：用 AND 合并搜索条件
if (search) {
  conditions.push({
    OR: [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { projectNo: { contains: searchTerm, mode: 'insensitive' } }
    ]
  })
}
```

---

### 2. 日报详情接口缺少数据权限 — IDOR漏洞

**文件**：`dailyReports.ts:244-263`

**问题描述**：
获取日报详情只有 `authenticateToken` + `checkPermission('office:dailyreport:list')`，**没有 applyDataScope 也没有所有权检查**。

**漏洞利用**：任何登录用户，只要知道日报ID（自增数字，容易猜测），就能查看任何人的日报内容。

**修复方案**：添加 `applyDataScope('userId')` 中间件，或在查询中加入数据权限过滤。

---

### 3. 日报导出CSV/Excel缺少数据权限

**文件**：`dailyReports.ts:151-241`（CSV）、`dailyReports.ts:1083-1095`（Excel）

**问题描述**：
列表接口有 `applyDataScope('userId')`，但导出接口**完全没有**。用户只能看到自己权限范围内的日报列表，但导出的文件包含**所有用户的日报**。

**漏洞利用**：用户点击"导出Excel"，得到的数据比屏幕上看到的多得多。

**修复方案**：导出接口同样添加 `applyDataScope('userId')`，并将 `dataScopeWhere` 合并到查询条件。

---

### 4. 日报审批缺少自审批防护

**文件**：`dailyReports.ts:434-464`

**问题描述**：
审批日报时**没有防止审批自己提交的日报**（expenses.ts 和 contracts.ts 都有这个防护）。

**修复方案**：
```typescript
if (report.userId === req.user!.id && !(await isAdmin(req.user!.id))) {
  return res.status(403).json({ error: '不能审批自己的日报' })
}
```

---

### 5. 项目删除无所有权校验

**文件**：`projects.ts:390-416`

**问题描述**：
删除项目只检查了功能权限 `project:project:edit`，但**没有验证当前用户是否是项目负责人或团队成员**。任何有编辑权限的用户可以删除其他用户的项目。

**修复方案**：
```typescript
const project = await prisma.project.findFirst({
  where: { id: numericId, deletedAt: null }
})
if (project.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
  const isTeam = await prisma.projectTeamMember.findFirst({
    where: { projectId: numericId, userId: req.user!.id, deletedAt: null }
  })
  if (!isTeam) return res.status(403).json({ error: '无权删除此项目' })
}
```

---

### 6. 项目归档无所有权校验

**文件**：`projects.ts:369-387`

同上，任何有编辑权限的用户可以归档其他用户的项目。

---

### 7. 采购单删除无所有权校验

**文件**：`procurements.ts:243-266`

删除采购单没有验证 `assignedTo` 或项目负责人，有编辑权限的人可以删除任何采购单。

---

### 8. 采购明细 CRUD 无归属校验

**文件**：`procurements.ts:302-333`

更新和删除采购明细时，**没有检查该明细是否属于当前用户有权访问的采购单**。

---

### 9. Token 通过 URL 参数传递 — 泄露风险

**文件**：`middleware/auth.ts:19-21`

```typescript
if (!token && req.query?.token) {
  token = req.query.token as string
}
```

**问题描述**：
允许从 URL query 参数获取 token，会导致：
- Token 泄露到服务器访问日志
- Token 泄露到浏览器历史记录
- Token 可能被 Referer 头泄露

**修复方案**：
```typescript
// 移除 query 参数获取 token 的逻辑
// 如果必须支持（如文件预览），使用短期一次性 token
if (!token) {
  return res.status(401).json({ error: '未提供认证令牌' })
}
```

---

### 10. 注册接口角色注入风险

**文件**：`routes/auth.ts:350`

```typescript
role: role || 'USER'
```

**问题描述**：
虽然注册接口需要权限，但代码直接将用户输入的 `role` 值存入数据库，没有验证合法性。

**修复方案**：
```typescript
const validRoles = ['ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER', 'USER']
if (role && !validRoles.includes(role)) {
  return res.status(400).json({ error: '无效的角色类型' })
}
if (role === 'ADMIN' && req.user?.role !== 'ADMIN') {
  return res.status(403).json({ error: '只有管理员才能创建管理员账户' })
}
```

---

### 11. 组织详情接口缺少权限检查

**文件**：`organizations.ts:423-474`

获取组织详情只有 `authenticateToken`，**没有 checkPermission 也没有 applyDataScope**。任何登录用户通过 ID 可查看任何组织的详细信息。

---

## 🟡 中危问题（共 11 个）

### 1. 文件下载/预览缺少父资源权限校验

**文件**：
- `opportunities.ts:527-550`（商机文件下载）
- `opportunities.ts:840-880`（记录附件下载/预览）
- `contracts.ts:135-178`（合同文件下载/预览）
- `projects.ts:419-468`（项目文件下载/预览）

**问题描述**：
只检查文件是否存在于数据库，**没有验证文件所属的父资源是否在当前用户权限范围内**。知道 fileId 就能下载任何文件。

---

### 2. 采购付款附件无权限检查

**文件**：`procurements.ts:617-656`

这两个端点只有 `authenticateToken`，**完全没有 checkPermission**，任何登录用户都能下载/预览采购付款附件。

---

### 3. 采购单更新无所有权校验

**文件**：`procurements.ts:201-240`

更新采购单只通过权限检查，但没验证用户是否是 `assignedTo` 或关联项目的负责人。

---

### 4. 组织树接口缺少数据权限

**文件**：`organizations.ts:284-311`

获取组织树只用了 `checkPermission('crm:organization:list')`，**没有 `applyDataScope`**。而列表接口是应用了数据权限的。

---

### 5. 密码强度要求过低

**文件**：`routes/auth.ts:324`

```typescript
if (password.length < 6) {
  return res.status(400).json({ error: '密码长度至少6位' })
}
```

**修复建议**：至少8位，建议包含大小写字母和数字。

---

### 6. `/me` 和 `/menus` 路由手动解析 JWT

**文件**：`routes/auth.ts:212-310`

这两个路由没有使用 `authenticateToken` 中间件，而是手动解析 JWT，导致：
- 重复代码
- 错误处理不一致（JWT验证失败返回403而不是401）

---

### 7. 修改密码后旧 Token 仍然有效

用户修改密码后，之前签发的 JWT token 在过期前（7天）仍然有效。

**修复建议**：在 User 模型添加 `tokenVersion` 字段，修改密码时递增，JWT 验证时检查版本。

---

### 8. 更新用户接口缺少输入验证

**文件**：`routes/users.ts:146-210`

没有验证 `email` 格式、`password` 强度，`updateData` 使用 `any` 类型。

---

### 9. 用户列表没有分页

**文件**：`routes/users.ts:21`

如果用户数量很多，会导致内存溢出和响应缓慢，可能被利用进行 DoS 攻击。

---

### 10. 费用报销权限粒度不够

**文件**：`expenses.ts:236/317/346`

PUT（编辑）、DELETE（删除）、POST /submit（提交）都使用 `checkPermission('finance:expense:add')`，无法实现"能创建但不能删除"的细粒度权限控制。

---

### 11. 日报评分缺少自评分防护

**文件**：`dailyReports.ts:498-526`

审批人可以给自己提交的日报评分。

---

## 🟢 低危问题（共 7 个）

### 1. parseInt 缺少 NaN 检查（全局）

**涉及文件**：projects.ts、opportunities.ts、contracts.ts、expenses.ts、procurements.ts、dailyReports.ts

```typescript
const id = parseInt(req.params.id as string)
if (isNaN(id)) return res.status(400).json({ error: 'ID格式不正确' })
```

---

### 2. sortOrder 未校验

**文件**：`projects.ts:92`、`opportunities.ts:81`、`contracts.ts:70`

`sortOrder` 来自 query 参数，没有校验，可以是任意值。应限制为 `'asc'` 或 `'desc'`。

---

### 3. 删除用户是硬删除

**文件**：`routes/users.ts:234`

硬删除无法恢复，建议改为软删除（添加 `deletedAt` 字段）。

---

### 4. 登录失败日志可能泄露敏感信息

**文件**：`routes/auth.ts:113-114`

记录了失败的用户名，如果日志被泄露，攻击者可以知道系统中存在哪些用户名。

**修复建议**：统一错误消息为"用户名或密码错误"，不区分"用户不存在"和"密码错误"。

---

### 5. 删除附件未清理物理文件

**文件**：`procurements.ts:547-557`、`procurements.ts:659-669`

删除附件时只做了数据库软删除，**没有删除磁盘上的物理文件**。

---

### 6. 费用统计接口加载全量数据到内存

**文件**：`expenses.ts:108-130`

使用 `findMany` 加载所有费用记录到内存再 reduce 计算，数据量大时性能极差。应使用 Prisma 的 `aggregate` / `groupBy`。

---

### 7. 日报统计接口加载全量数据到内存

**文件**：`dailyReports.ts:124-127`

同上，应该用 `aggregate` 替代 `findMany` + `reduce`。

---

## 📊 问题汇总

| 严重度 | 数量 | 主要类型 |
|--------|------|----------|
| 🔴 高 | 11 | 越权访问、IDOR、缺少权限校验、Token泄露 |
| 🟡 中 | 11 | 文件权限、输入验证、密码强度、权限粒度 |
| 🟢 低 | 7 | 类型安全、物理文件清理、性能优化 |

---

## 🎯 修复优先级

### P0 — 立即修复（高危 + 易利用）

1. ✅ **projects.ts / opportunities.ts** — 搜索覆盖权限（#1）
2. ✅ **dailyReports.ts** — 日报详情/导出缺少数据权限（#2, #3）
3. ✅ **dailyReports.ts** — 自审批防护（#4）

### P1 — 尽快修复（高危 + 业务逻辑）

4. ✅ **projects.ts / procurements.ts** — 删除/归档无所有权校验（#5, #6, #7, #8）
5. ✅ **auth.ts** — Token URL参数泄露（#9）
6. ✅ **auth.ts** — 注册接口角色注入（#10）
7. ✅ **organizations.ts** — 详情接口缺少权限（#11）

### P2 — 计划修复（中危）

8. ✅ 文件下载/预览添加父资源权限校验
9. ✅ 密码强度提升
10. ✅ 统一 JWT 中间件使用
11. ✅ 用户列表分页
12. ✅ 权限粒度优化

### P3 — 后续优化（低危）

13. ✅ parseInt NaN 检查
14. ✅ sortOrder 校验
15. ✅ 用户软删除
16. ✅ 物理文件清理
17. ✅ 统计接口性能优化

---

## 🔧 修复建议

### 通用模式：权限过滤

```typescript
// 非管理员只能看到自己相关的
if (req.user!.role !== 'ADMIN') {
  where.OR = [
    { ownerId: req.user!.id },
    { teamMembers: { some: { userId: req.user!.id, deletedAt: null } } }
  ]
}

// 搜索条件用 AND 合并，不要覆盖 OR
if (search) {
  conditions.push({
    OR: [
      { name: { contains: searchTerm, mode: 'insensitive' } }
    ]
  })
}

// 最终 where
where.AND = conditions
```

### 通用模式：所有权校验

```typescript
// 删除/归档等操作前检查所有权
const resource = await prisma.project.findFirst({
  where: { id: numericId, deletedAt: null }
})

if (resource.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
  const isTeam = await prisma.projectTeamMember.findFirst({
    where: { projectId: numericId, userId: req.user!.id, deletedAt: null }
  })
  if (!isTeam) return res.status(403).json({ error: '无权操作此资源' })
}
```

### 通用模式：数据权限

```typescript
// 列表和详情都要应用数据权限
router.get('/:id', authenticateToken, checkPermission('xxx:list'), applyDataScope('userId'), async (req, res) => {
  const where: any = { id: parseInt(req.params.id), deletedAt: null }
  
  // 合并没有数据权限
  if (req.dataScopeWhere) {
    Object.assign(where, req.dataScopeWhere)
  }
  
  const item = await prisma.xxx.findFirst({ where })
  if (!item) return res.status(404).json({ error: '不存在' })
  res.json(item)
})
```
