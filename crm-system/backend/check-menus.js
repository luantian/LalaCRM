const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. 查询菜单数据
  const menus = await prisma.menuItem.findMany({
    orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
    select: {
      id: true,
      key: true,
      label: true,
      menuType: true,
      perm: true,
      path: true,
      parentId: true,
      order: true,
      component: true,
      icon: true,
      isVisible: true
    }
  });
  
  console.log('=== 菜单表(MenuItem)数据 ===');
  menus.forEach(m => {
    const indent = m.parentId ? '  ' : '';
    console.log(`${indent}ID:${m.id} | ${String(m.menuType).padEnd(9)} | key:${String(m.key).padEnd(20)} | label:${String(m.label).padEnd(15)} | perm:${String(m.perm || '-').padEnd(25)} | parent:${String(m.parentId || '根').padEnd(5)} | path:${m.path || ''} | icon:${m.icon || ''} | visible:${m.isVisible}`);
  });
  
  // 2. 查询角色数据
  const roles = await prisma.roleModel.findMany({
    select: {
      id: true,
      name: true,
      displayName: true,
      roleKey: true,
      permissions: true,
      dataScope: true,
      customDeptIds: true
    }
  });
  
  console.log('\n=== 角色表(RoleModel)数据 ===');
  roles.forEach(r => {
    console.log(`ID:${r.id} | name:${r.name.padEnd(15)} | displayName:${r.displayName.padEnd(10)} | roleKey:${(r.roleKey || '无').padEnd(15)} | dataScope:${r.dataScope} | perms:${JSON.stringify(r.permissions)}`);
  });
  
  // 3. 查询用户-角色关联
  const userRoles = await prisma.userRole.findMany({
    select: {
      userId: true,
      roleId: true,
      user: { select: { username: true, name: true } },
      role: { select: { name: true, displayName: true } }
    }
  });
  
  console.log('\n=== 用户-角色关联(UserRole) ===');
  userRoles.forEach(ur => {
    console.log(`用户:${ur.user.username}(${ur.user.name}) -> 角色:${ur.role.name}(${ur.role.displayName}) [userId:${ur.userId}, roleId:${ur.roleId}]`);
  });
  
  // 4. 查询角色-菜单关联数量
  const roleMenus = await prisma.roleMenu.findMany({
    select: {
      roleId: true,
      role: { select: { name: true, displayName: true } },
      menuId: true
    }
  });
  
  console.log('\n=== 角色-菜单关联(RoleMenu) ===');
  const roleMenuMap = {};
  roleMenus.forEach(rm => {
    const key = `${rm.role.name}(${rm.role.displayName})`;
    if (!roleMenuMap[key]) roleMenuMap[key] = [];
    roleMenuMap[key].push(rm.menuId);
  });
  Object.entries(roleMenuMap).forEach(([role, menuIds]) => {
    console.log(`${role} -> 菜单IDs: [${menuIds.join(', ')}]`);
  });
  
  // 5. 统计信息
  console.log('\n=== 统计 ===');
  console.log(`菜单总数: ${menus.length}`);
  console.log(`  目录(DIRECTORY): ${menus.filter(m => m.menuType === 'DIRECTORY').length}`);
  console.log(`  菜单(MENU): ${menus.filter(m => m.menuType === 'MENU').length}`);
  console.log(`  按钮(BUTTON): ${menus.filter(m => m.menuType === 'BUTTON').length}`);
  console.log(`有perm字段的菜单: ${menus.filter(m => m.perm).length}`);
  console.log(`角色总数: ${roles.length}`);
  console.log(`角色-菜单关联: ${roleMenus.length}`);
  
  // 6. 检查所有路由中的 checkPermission 调用
  console.log('\n=== 角色权限(permissions字段)中使用的权限标识 ===');
  const allPerms = new Set();
  roles.forEach(r => {
    (r.permissions || []).forEach(p => allPerms.add(p));
  });
  console.log(`去重后的权限标识: ${JSON.stringify(Array.from(allPerms))}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
