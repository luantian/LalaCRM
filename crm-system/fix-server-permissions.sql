-- ========================================
-- 修复服务器打卡权限问题
-- 问题：服务器数据库缺少菜单ID=175（打卡按钮，perm=office:checkin:add）
-- 导致非管理员用户打卡时报"权限不足"
-- ========================================

-- 第1步：插入缺失的菜单项
INSERT INTO "MenuItem" (
  "id", 
  "key", 
  "icon", 
  "label", 
  "parentId", 
  "order", 
  "isVisible", 
  "requiredRoles", 
  "menuType", 
  "perm", 
  "path", 
  "component", 
  "createdAt", 
  "updatedAt"
) VALUES (
  175,
  'office:checkin:add',
  '',
  '打卡',
  22,  -- 父菜单是"考勤打卡"
  1,
  true,
  '{}',
  'BUTTON',
  'office:checkin:add',
  NULL,
  NULL,
  NOW(),
  NOW()
);

-- 第2步：给需要打卡权限的角色分配这个菜单
-- 角色ID=44（系统管理员）
INSERT INTO "RoleMenu" ("roleId", "menuId", "createdAt") 
VALUES (44, 175, NOW());

-- 角色ID=45（测试工程师）
INSERT INTO "RoleMenu" ("roleId", "menuId", "createdAt") 
VALUES (45, 175, NOW());

-- 角色ID=50（如果存在）
INSERT INTO "RoleMenu" ("roleId", "menuId", "createdAt") 
VALUES (50, 175, NOW());

-- 如果有其他角色也需要打卡权限，取消下面的注释并修改角色ID
-- INSERT INTO "RoleMenu" ("roleId", "menuId", "createdAt") 
-- VALUES (你的角色ID, 175, NOW());

-- ========================================
-- 执行完成后验证
-- ========================================
-- SELECT m.id, m.label, m.perm, m.type 
-- FROM "MenuItem" m 
-- WHERE m.id = 175;
--
-- SELECT rm."roleId", r.name, rm."menuId"
-- FROM "RoleMenu" rm
-- JOIN "Role" r ON rm."roleId" = r.id
-- WHERE rm."menuId" = 175;
