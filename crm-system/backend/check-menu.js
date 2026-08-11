const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 查找数据库备份相关的菜单
  const backupMenu = await prisma.menuItem.findFirst({
    where: {
      OR: [
        { label: { contains: '数据库备份' } },
        { path: '/database-backup' },
        { perm: 'system:backup:list' }
      ]
    }
  });
  
  console.log('备份菜单配置:', backupMenu);
  
  // 查找系统管理下的所有子菜单
  const systemMenu = await prisma.menuItem.findFirst({
    where: { label: '系统管理' },
    include: {
      children: {
        orderBy: { order: 'asc' }
      }
    }
  });
  
  console.log('\n系统管理下的子菜单:');
  systemMenu?.children.forEach(m => {
    console.log(`  - ${m.label} (path: ${m.path}, perm: ${m.perm}, visible: ${m.isVisible})`);
  });
  
  await prisma.$disconnect();
}

main().catch(console.error);
