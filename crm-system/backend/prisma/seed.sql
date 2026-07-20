-- 清空现有菜单
DELETE FROM "RoleMenu";
DELETE FROM "MenuItem";

-- 插入顶级菜单和子菜单
INSERT INTO "MenuItem" (id, key, icon, label, "parentId", "order", "isVisible", "requiredRoles", "menuType", path, component, "createdAt", "updatedAt") VALUES
-- 仪表盘
(1, 'dashboard', 'DashboardOutlined', '仪表盘', NULL, 1, true, '{}', 'MENU', '/', 'Dashboard', NOW(), NOW()),

-- 客户管理
(2, 'customers', 'TeamOutlined', '客户管理', NULL, 2, true, '{}', 'MENU', '/customers', 'CustomerList', NOW(), NOW()),

-- 项目归档
(3, 'sales', 'InboxOutlined', '项目归档', NULL, 3, true, '{}', 'MENU', '/sales', 'SaleList', NOW(), NOW()),

-- 项目管理
(4, 'projects', 'ProjectOutlined', '项目管理', NULL, 4, true, '{}', 'MENU', '/projects', 'ProjectList', NOW(), NOW()),

-- 商机管理
(5, 'opportunities', 'FundOutlined', '商机管理', NULL, 5, true, '{}', 'MENU', '/opportunities', 'OpportunityList', NOW(), NOW()),

-- 财务管理（目录）
(19, 'finance', 'AccountBookOutlined', '财务管理', NULL, 6, true, '{}', 'DIRECTORY', NULL, NULL, NOW(), NOW()),
-- 发票管理
(20, 'invoices', 'AuditOutlined', '发票管理', 19, 1, true, '{}', 'MENU', '/invoices', 'InvoiceList', NOW(), NOW()),

-- 办公管理（目录）
(6, 'office', 'ScheduleOutlined', '办公管理', NULL, 7, true, '{}', 'DIRECTORY', NULL, NULL, NOW(), NOW()),
-- 日报
(7, 'daily-reports', 'FileTextOutlined', '日报管理', 6, 1, true, '{}', 'MENU', '/daily-reports', 'DailyReportList', NOW(), NOW()),
-- 出差管理
(8, 'business-trips', 'CarOutlined', '出差管理', 6, 2, true, '{}', 'MENU', '/business-trips', 'BusinessTripList', NOW(), NOW()),
-- 费用报销
(9, 'expenses', 'AccountBookOutlined', '费用报销', 6, 3, true, '{}', 'MENU', '/expenses', 'ExpenseList', NOW(), NOW()),

-- 系统管理（目录）
(10, 'system', 'SettingOutlined', '系统管理', NULL, 7, true, '{}', 'DIRECTORY', NULL, NULL, NOW(), NOW()),
-- 用户管理
(11, 'users', 'UserOutlined', '用户管理', 10, 1, true, '{}', 'MENU', '/users', 'UserManagement', NOW(), NOW()),
-- 角色管理
(12, 'roles', 'SafetyOutlined', '角色管理', 10, 2, true, '{}', 'MENU', '/roles', 'RoleManagement', NOW(), NOW()),
-- 菜单管理
(13, 'menus', 'MenuOutlined', '菜单管理', 10, 3, true, '{}', 'MENU', '/menus', 'MenuManagement', NOW(), NOW()),
-- 部门管理
(14, 'departments', 'TeamOutlined', '部门管理', 10, 4, true, '{}', 'MENU', '/departments', 'DepartmentManagement', NOW(), NOW()),
-- 字典管理
(15, 'dicts', 'BookOutlined', '字典管理', 10, 5, true, '{}', 'MENU', '/dicts', 'DictManagement', NOW(), NOW()),

-- 日志管理（目录）
(16, 'logs', 'FileSearchOutlined', '日志管理', NULL, 8, true, '{}', 'DIRECTORY', NULL, NULL, NOW(), NOW()),
-- 操作日志
(17, 'operation-logs', 'FileTextOutlined', '操作日志', 16, 1, true, '{}', 'MENU', '/operation-logs', 'OperationLogList', NOW(), NOW()),
-- 登录日志
(18, 'login-logs', 'LoginOutlined', '登录日志', 16, 2, true, '{}', 'MENU', '/login-logs', 'LoginLogList', NOW(), NOW());

-- 重置序列
SELECT setval('"MenuItem_id_seq"', (SELECT MAX(id) FROM "MenuItem"));

-- 创建管理员角色
INSERT INTO "RoleModel" (id, name, "displayName", description, permissions, "dataScope", "createdAt", "updatedAt")
VALUES (1, 'ADMIN', '管理员', '系统管理员，拥有所有权限', '{}', 'ALL', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('"RoleModel_id_seq"', (SELECT MAX(id) FROM "RoleModel"));

-- 为管理员角色分配所有菜单
INSERT INTO "RoleMenu" ("roleId", "menuId", "createdAt")
SELECT 1, id, NOW() FROM "MenuItem";
