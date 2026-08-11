const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. 查找 test10 用户
  const user = await prisma.user.findFirst({
    where: { username: 'test10' },
    include: {
      userRoles: { include: { role: true } },
      dept: true,
      roleRef: true
    }
  });

  if (!user) {
    console.log('test10 用户不存在');
    const users = await prisma.user.findMany({
      where: { username: { contains: 'test' } },
      select: { id: true, username: true, name: true, roleId: true }
    });
    console.log('包含 test 的用户:', JSON.stringify(users, null, 2));
    await prisma.$disconnect();
    return;
  }

  console.log('=== 用户信息 ===');
  console.log('ID:', user.id, '| Username:', user.username, '| Name:', user.name);
  console.log('Enum Role:', user.role);
  console.log('roleId:', user.roleId);
  console.log('roleRef:', user.roleRef ? user.roleRef.name + ' (' + user.roleRef.code + ')' : 'null');
  console.log('Department:', user.dept?.name || '无');
  console.log('');

  console.log('=== UserRole 关联 ===');
  if (user.userRoles.length === 0) {
    console.log('  无 UserRole 关联!');
  }
  for (const ur of user.userRoles) {
    console.log('  UserRole ID:', ur.id, '| Role ID:', ur.roleId, '| Role:', ur.role.name, '| Code:', ur.role.code);
  }
  console.log('');

  // 2. 查找角色-菜单映射
  // 收集所有角色ID（包括 roleRef 和 userRoles）
  const roleIds = new Set();
  if (user.roleRef) roleIds.add(user.roleRef.id);
  for (const ur of user.userRoles) roleIds.add(ur.roleId);

  if (roleIds.size === 0) {
    console.log('该用户没有任何角色！');
    await prisma.$disconnect();
    return;
  }

  for (const roleId of roleIds) {
    const role = await prisma.roleModel.findUnique({ where: { id: roleId } });
    const roleMenus = await prisma.roleMenu.findMany({
      where: { roleId },
      include: { menu: true }
    });
    console.log('=== 角色: ' + role.name + ' (ID:' + roleId + ', Code:' + role.code + ') 的菜单权限 (' + roleMenus.length + ' 条) ===');
    for (const rm of roleMenus) {
      console.log('  [' + rm.menu.type + '] ' + (rm.menu.perm || 'N/A') + ' | ' + rm.menu.name + ' | path: ' + (rm.menu.path || 'N/A'));
    }
    console.log('');
  }

  // 3. 查看后端 getUserPerms 逻辑
  console.log('=== 后端权限获取逻辑 ===');
  const allMenus = await prisma.menuItem.findMany({
    where: { type: { in: ['DIRECTORY', 'MENU'] } },
    orderBy: { order: 'asc' }
  });
  console.log('系统中所有目录/菜单 (' + allMenus.length + ' 个):');
  for (const m of allMenus) {
    console.log('  [' + m.type + '] ' + (m.perm || 'N/A') + ' | ' + m.name + ' | path: ' + (m.path || 'N/A'));
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
