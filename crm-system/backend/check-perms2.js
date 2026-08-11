const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 查看所有角色
  const roles = await prisma.roleModel.findMany({
    include: {
      _count: { select: { roleMenus: true, userRoles: true, users: true } }
    },
    orderBy: { id: 'asc' }
  });

  console.log('=== 所有角色 ===');
  for (const r of roles) {
    console.log('ID:', r.id, '| name:', r.name, '| displayName:', r.displayName, '| roleKey:', r.roleKey, '| dataScope:', r.dataScope, '| status:', r.status, '| menuCount:', r._count.roleMenus, '| userCount:', r._count.userRoles + r._count.users);
  }
  console.log('');

  // 查看 test10 的角色详情
  const role3 = await prisma.roleModel.findUnique({
    where: { id: 3 },
    include: {
      roleMenus: { include: { menu: true } },
      userRoles: { include: { user: { select: { id: true, username: true, name: true } } } },
      users: { select: { id: true, username: true, name: true } }
    }
  });

  console.log('=== 角色 ID:3 详情 ===');
  console.log('name:', role3.name);
  console.log('displayName:', role3.displayName);
  console.log('roleKey:', role3.roleKey);
  console.log('dataScope:', role3.dataScope);
  console.log('status:', role3.status);
  console.log('');
  console.log('通过 userRoles 关联的用户:', role3.userRoles.map(ur => ur.user.username));
  console.log('通过 roleId 直接关联的用户:', role3.users.map(u => u.username));
  console.log('');
  console.log('菜单权限数量:', role3.roleMenus.length);

  // 查看所有菜单
  const allMenus = await prisma.menuItem.findMany({
    orderBy: { order: 'asc' }
  });
  console.log('\n=== 所有菜单项 (' + allMenus.length + ' 个) ===');
  for (const m of allMenus) {
    console.log('  ID:', m.id, '| menuType:', m.menuType, '| label:', m.label, '| perm:', m.perm || 'N/A', '| path:', m.path || 'N/A', '| parentId:', m.parentId);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
