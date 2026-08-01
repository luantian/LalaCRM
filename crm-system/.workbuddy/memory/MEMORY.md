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
