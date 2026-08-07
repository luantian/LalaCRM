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

## 工作流偏好

- **改完代码不要自动打包部署**，等用户明确说"打包"再执行 docker build / deploy
- **改代码都是在开发环境改**，本地启动前后端服务进行开发测试

## 部署信息

- 群晖 DS223j，IP: 192.168.2.13
- DSM 端口: 8081（HTTP）
- CRM 端口: 8880
- 镜像名: crm-backend:arm64, crm-frontend:arm64, postgres:15-alpine-arm64
- 数据库: crm_db / crm_user / Crm2026!Secure

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

### 数据权限
- `applyDataScope('字段名')` 中间件，参数为所属字段名
- 支持 ALL/DEPARTMENT/DEPARTMENT_BELOW/SELF/CUSTOM 五种范围
- 常用字段：`userId`（日报）、`ownerId`（发票/费用）、`assignedTo`（采购）

### 数据库菜单结构
- 20 个目录/菜单 + 73 个 BUTTON 权限节点（2026-08-07 删除"编辑任务"权限）
- RoleMenu 关联表存储角色-菜单/按钮的权限分配
- 管理员（admin）拥有全部权限（*）
