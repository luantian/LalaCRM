# LalaCRM 项目记忆

## 项目命名说明

- **组织模块** → 软件中实际叫 **客户管理**（不叫"组织"）
- 菜单显示为"客户管理"，数据模型和代码中是 organization 相关命名
- **商机模块** → 软件中实际叫 **售前管理**（不叫"商机"）
- 所有用户界面文案用"售前"替代"商机"，代码中仍保留 opportunity 命名

## 角色设计

- 现有系统角色（ADMIN/PROJECT_DIRECTOR/PROJECT_MANAGER/USER）更像职位
- 应该设计成功能权限角色：系统管理员、销售经理、销售专员、项目经理、财务专员、普通员工等
- 角色与组织架构的职位解耦，一个职位可以拥有多个角色

## 审批权限规则（2026-08-06 确立）

- **所有审批权限（合同/采购/费用报销/日报/出差）只给管理员**
- 项目经理、普通用户、销售专员均无审批权限
- 合同/采购列表：只允许管理员或对应负责人（ownerId）访问，项目团队成员不可见

## 工作流偏好

- **改完代码不要自动打包部署**，等用户明确说"打包"再执行 docker build / deploy
- **改代码都是在开发环境改**，本地启动前后端服务进行开发测试

## 部署信息

- 群晖 DS223j，IP: 192.168.2.13
- DSM 端口: 8081（HTTP）
- CRM 端口: 8880
- 镜像名: crm-backend:arm64, crm-frontend:arm64, postgres:15-alpine-arm64
- 数据库: crm_db / crm_user / Crm2026!Secure
- 部署流程：本地 `docker buildx build --no-cache --platform linux/arm64` → 上传 tar → 群晖 `docker load` → `docker-compose restart` → `docker exec npx prisma db push`

## 软删除统一模式（所有带 deletedAt 的表必须遵守）

- **查询/权限检查**：必须加 `deletedAt: null`，否则软删除记录会泄漏权限
  - 例：`teamMembers: { some: { userId, deletedAt: null } }`
- **添加成员/唯一约束**：先 `findFirst`（含已删除），若 `deletedAt` 非空则恢复更新，否则创建
- **返回详情**：关联表加 `where: { deletedAt: null }` 过滤
- 涉及文件：opportunities/projects/procurements/expenses 等所有 routes

## 权限系统架构（2026-08-01 若依化改造后）

### 核心结构
- **权限来源**：RoleMenu → MenuItem.perm（三段式，如 `crm:organization:list`）
- **权限获取**：`getUserPerms(userId)` 通过 UserRole → RoleMenu → MenuItem.perm 链路聚合
- **后端权限检查**：`checkPermission('office:dailyreport:list')` 中间件
- **前端权限控制**：
  - `HasPermission` / `PermissionButton` 组件控制按钮显示
  - `routeConfig.ts` + `PermissionRoute` 控制路由访问
  - 动态路由根据用户菜单数据生成

### 权限标识格式
- **三段式**：`module:entity:action`
- 示例：`crm:organization:list`、`project:project:edit`、`office:trip:approve`

### 数据权限（2026-08-12 全角色改为 TEAM 后）
- `applyDataScope(config)` 中间件，参数为 `ModelScopeConfig` 对象：`{ ownerField, teamMemberField?, relations? }`
- 支持 ALL/DEPARTMENT/DEPARTMENT_BELOW/SELF/CUSTOM/TEAM 六种范围，多角色取并集
- **所有角色（含管理员）数据范围统一为 TEAM**：只能看到自己是负责人或团队成员的数据
- **isAdmin bypass 已移除**：管理员不再自动跳过数据范围过滤（但路由内编辑/删除/审批等操作权限仍通过 `isAdmin()` 检查）
- TEAM 范围 = `ownerId === userId OR teamMembers.some(userId === userId)`，含关联模型
- 创建项目/商机时自动把创建者加为团队成员（MANAGER/SALES 角色）
- `relations` 支持嵌套关联：Contract/Procurement 通过 `project` 关联查 owner/teamMembers
- 所有 11 个业务模块统一使用此中间件，不再有内联逻辑或死代码
- Dashboard 特殊处理：去掉中间件，路由内按模型分别调用 `getDataScopeWhere`（basicScope/projectScope/contractScope）
- 各模块配置：
  - Organization/Quotation/Invoice/Expense/BusinessTrip → `{ ownerField: 'ownerId' }`
  - DailyReport → `{ ownerField: 'userId' }`
  - Opportunity/Project → `{ ownerField: 'ownerId', teamMemberField: 'teamMembers' }`
  - Contract → `{ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }`
  - Procurement → `{ ownerField: 'assignedTo', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }`

### 数据库菜单结构
- 20 个目录/菜单 + 73 个 BUTTON 权限节点（2026-08-07 删除"编辑任务"权限）
- RoleMenu 关联表存储角色-菜单/按钮的权限分配
- 管理员（admin）拥有全部权限（*）

## 常用接口约定

- 基础数据下拉（客户树、用户列表）应设计为**无需特殊权限**，避免无权限用户看不到下拉框
- 例：`OrgTreeSelect` 组件用 `getOrganizationsSimple()` 而非 `/tree`
