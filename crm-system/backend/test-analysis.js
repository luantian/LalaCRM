const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 角色权限分析 ===\n');
  
  const roles = await prisma.roleModel.findMany({
    include: { _count: { select: { roleMenus: true, userRoles: true } } }
  });
  
  for (const role of roles) {
    const menus = await prisma.roleMenu.findMany({
      where: { roleId: role.id },
      include: { menu: { select: { perm: true, name: true, type: true } } }
    });
    
    const perms = menus.filter(m => m.menu.perm && m.menu.perm.trim());
    console.log(`【${role.name}】(${role.roleKey})`);
    console.log(`  菜单总数: ${menus.length}, 按钮权限数: ${perms.length}`);
    console.log(`  分配用户: ${role._count.userRoles}`);
    console.log(`  权限列表:`);
    perms.forEach(p => console.log(`    - ${p.menu.perm} (${p.menu.name})`));
    console.log('');
  }
  
  // 分析 TEST_ENGINEER 缺少的权限
  console.log('\n=== TEST_ENGINEER 权限缺口分析 ===\n');
  
  const testEngineer = await prisma.roleModel.findFirst({
    where: { roleKey: 'TEST_ENGINEER' },
    include: { roleMenus: { include: { menu: { select: { perm: true } } } } }
  });
  
  const admin = await prisma.roleModel.findFirst({
    where: { roleKey: 'ADMIN' },
    include: { roleMenus: { include: { menu: { select: { perm: true } } } } }
  });
  
  const engineerPerms = new Set(testEngineer.roleMenus.map(rm => rm.menu.perm).filter(p => p));
  const adminPerms = admin.roleMenus.map(rm => rm.menu.perm).filter(p => p);
  
  console.log('TEST_ENGINEER 缺少的 ADMIN 权限:');
  adminPerms.forEach(perm => {
    if (!engineerPerms.has(perm)) {
      console.log(`  ❌ ${perm}`);
    }
  });
  
  console.log(`\n总计: ADMIN有${adminPerms.length}个权限, TEST_ENGINEER有${engineerPerms.size}个权限`);
  console.log(`缺口: ${adminPerms.length - engineerPerms.size}个权限`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
