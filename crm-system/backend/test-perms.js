const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 查询所有用户和角色
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, deptId: true, userRoles: { include: { role: true } } }
  });
  console.log('=== 用户列表 ===');
  for (const u of users) {
    const roles = u.userRoles.map(ur => ur.role.roleKey).join(', ') || '无角色';
    console.log(`id=${u.id} username=${u.username} User.role=${u.role} deptId=${u.deptId || '-'} UserRole=[${roles}]`);
  }

  // 查询所有角色
  const roles = await prisma.roleModel.findMany({
    include: { _count: { select: { userRoles: true, roleMenus: true } } }
  });
  console.log('\n=== 角色列表 ===');
  for (const r of roles) {
    console.log(`id=${r.id} roleKey=${r.roleKey} name=${r.name} dataScope=${r.dataScope} users=${r._count.userRoles} menus=${r._count.menus}`);
  }

  // 查询每个角色的权限标识
  for (const r of roles) {
    const menus = await prisma.roleMenu.findMany({
      where: { roleId: r.id },
      include: { menu: { select: { perm: true, label: true, menuType: true } } }
    });
    const perms = menus.map(m => m.menu.perm).filter(p => p && p.trim());
    console.log(`\n=== 角色 ${r.roleKey} (${r.name}) 的权限 (${perms.length}个) ===`);
    if (perms.length > 0) console.log(perms.join('\n'));
  }

  // 查询用户UserRole和User.role不一致的情况
  console.log('\n=== 一致性检查 ===');
  for (const u of users) {
    const userRoleKeys = u.userRoles.map(ur => ur.role.roleKey);
    const hasAdminInUserRole = userRoleKeys.includes('ADMIN');
    const isAdminInUser = u.role === 'ADMIN';
    if (hasAdminInUserRole !== isAdminInUser) {
      console.log(`[不一致] user=${u.username}: User.role=${u.role}, UserRole有ADMIN=${hasAdminInUserRole}`);
    }
  }
  console.log('一致性检查完成');
}

main().catch(console.error).finally(() => prisma.$disconnect());
