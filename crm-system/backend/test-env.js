const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. 所有用户
  const users = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } }, dept: true }
  });
  console.log('=== 用户列表 ===');
  for (const u of users) {
    const roles = u.userRoles.map(ur => `${ur.role.roleKey}(${ur.role.name})`).join(', ') || '无角色';
    console.log(`  id=${u.id} username=${u.username} name=${u.name} role=${u.role} dept=${u.dept?.name||'-'} UserRole=[${roles}]`);
  }

  // 2. 所有角色
  const roles = await prisma.roleModel.findMany({
    include: { _count: { select: { roleMenus: true, userRoles: true } } }
  });
  console.log('\n=== 角色列表 ===');
  for (const r of roles) {
    console.log(`  id=${r.id} key=${r.roleKey} name=${r.name} dataScope=${r.dataScope} menus=${r._count.menus} users=${r._count.userRoles}`);
  }

  // 3. 每个角色的权限列表
  console.log('\n=== 角色权限详情 ===');
  for (const r of roles) {
    const menus = await prisma.roleMenu.findMany({
      where: { roleId: r.id },
      include: { menu: { select: { perm: true, name: true, type: true } } }
    });
    const perms = menus.filter(m => m.menu.perm && m.menu.perm.trim()).map(m => m.menu.perm);
    console.log(`\n  [${r.roleKey}] ${r.name} (${perms.length}个权限):`);
    console.log(`    ${perms.join(', ')}`);
  }

  // 4. 部门
  const depts = await prisma.department.findMany({ where: { deletedAt: null } });
  console.log('\n=== 部门列表 ===');
  for (const d of depts) {
    console.log(`  id=${d.id} name=${d.name} parentId=${d.parentId||'-'}`);
  }

  // 5. 菜单项统计
  const menuCount = await prisma.menuItem.count();
  const buttonCount = await prisma.menuItem.count({ where: { type: 'BUTTON' } });
  console.log(`\n=== 菜单统计: 总计${menuCount}个, 其中按钮权限${buttonCount}个 ===`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
