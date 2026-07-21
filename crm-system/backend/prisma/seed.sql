-- 清空现有菜单
DELETE FROM "RoleMenu";
DELETE FROM "MenuItem";

-- ============================================
-- 导航菜单结构（按 CRM 业务流程排列）
--
-- 核心流程: 售前 → 客户 → 项目 → 合同财务 → 日常办公 → 系统管理
-- ============================================

INSERT INTO "MenuItem" (id, key, icon, label, "parentId", "order", "isVisible", "requiredRoles", "menuType", path, component, perm, "createdAt", "updatedAt") VALUES

-- ===== 1. 仪表盘 =====
(1, 'dashboard', 'DashboardOutlined', '仪表盘', NULL, 1, true, '{}', 'MENU', '/', 'Dashboard', NULL, NOW(), NOW()),

-- ===== 2. 售前管理（漏斗上游）=====
(5, 'opportunities', 'FundOutlined', '商机管理', NULL, 2, true, '{}', 'MENU', '/opportunities', 'OpportunityList', 'view_opportunities', NOW(), NOW()),
(20, 'quotations', 'FileTextOutlined', '报价单', NULL, 3, true, '{}', 'MENU', '/quotations', 'QuotationList', 'view_quotations', NOW(), NOW()),

-- ===== 3. 客户管理 =====
(2, 'customers', 'TeamOutlined', '客户管理', NULL, 4, true, '{}', 'MENU', '/customers', 'CustomerList', 'view_customers', NOW(), NOW()),

-- ===== 4. 项目管理 =====
(4, 'projects', 'ProjectOutlined', '项目管理', NULL, 5, true, '{}', 'MENU', '/projects', 'ProjectList', 'view_projects', NOW(), NOW()),

-- ===== 5. 财务管理（目录）=====
(19, 'finance', 'AccountBookOutlined', '财务管理', NULL, 6, true, '{}', 'DIRECTORY', NULL, NULL, NULL, NOW(), NOW()),
(21, 'invoices', 'AuditOutlined', '发票管理', 19, 1, true, '{}', 'MENU', '/invoices', 'InvoiceList', 'view_invoices', NOW(), NOW()),
(3, 'sales', 'DollarOutlined', '项目收支', 19, 2, true, '{}', 'MENU', '/sales', 'SaleList', NULL, NOW(), NOW()),

-- ===== 6. 日常办公（目录）=====
(6, 'office', 'ScheduleOutlined', '日常办公', NULL, 7, true, '{}', 'DIRECTORY', NULL, NULL, NULL, NOW(), NOW()),
(7, 'daily-reports', 'FileTextOutlined', '日报管理', 6, 1, true, '{}', 'MENU', '/daily-reports', 'DailyReportList', 'view_reports', NOW(), NOW()),
(8, 'business-trips', 'CarOutlined', '出差管理', 6, 2, true, '{}', 'MENU', '/business-trips', 'BusinessTripList', 'view_business_trips', NOW(), NOW()),
(9, 'expenses', 'MoneyCollectOutlined', '费用报销', 6, 3, true, '{}', 'MENU', '/expenses', 'ExpenseList', 'view_expenses', NOW(), NOW()),
(22, 'check-ins', 'ClockCircleOutlined', '考勤打卡', 6, 4, true, '{}', 'MENU', '/check-ins', 'CheckInList', NULL, NOW(), NOW()),

-- ===== 7. 系统管理（目录）=====
(10, 'system', 'SettingOutlined', '系统管理', NULL, 8, true, '{}', 'DIRECTORY', NULL, NULL, NULL, NOW(), NOW()),
(11, 'users', 'UserOutlined', '用户管理', 10, 1, true, '{}', 'MENU', '/users', 'UserManagement', NULL, NOW(), NOW()),
(12, 'roles', 'SafetyOutlined', '角色管理', 10, 2, true, '{}', 'MENU', '/roles', 'RoleManagement', NULL, NOW(), NOW()),
(13, 'menus', 'MenuOutlined', '菜单管理', 10, 3, true, '{}', 'MENU', '/menus', 'MenuManagement', NULL, NOW(), NOW()),
(14, 'departments', 'ApartmentOutlined', '部门管理', 10, 4, true, '{}', 'MENU', '/departments', 'DepartmentManagement', NULL, NOW(), NOW()),
(15, 'dicts', 'BookOutlined', '字典管理', 10, 5, true, '{}', 'MENU', '/dicts', 'DictManagement', NULL, NOW(), NOW()),

-- ===== 8. 日志审计（目录）=====
(16, 'logs', 'FileSearchOutlined', '日志审计', NULL, 9, true, '{}', 'DIRECTORY', NULL, NULL, NULL, NOW(), NOW()),
(17, 'operation-logs', 'FileTextOutlined', '操作日志', 16, 1, true, '{}', 'MENU', '/operation-logs', 'OperationLogList', NULL, NOW(), NOW()),
(18, 'login-logs', 'LoginOutlined', '登录日志', 16, 2, true, '{}', 'MENU', '/login-logs', 'LoginLogList', NULL, NOW(), NOW());

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
