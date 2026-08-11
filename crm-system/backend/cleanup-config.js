const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 清理联系方式权限配置
  const contactConfig = await prisma.systemConfig.findUnique({
    where: { key: 'contact_info_viewable_roles' }
  });
  console.log('清理前 - contact_info_viewable_roles:', contactConfig?.value);

  // 清理项目金额权限配置
  const amountConfig = await prisma.systemConfig.findUnique({
    where: { key: 'project_amount_viewable_roles' }
  });
  console.log('清理前 - project_amount_viewable_roles:', amountConfig?.value);

  // 删除这两条旧配置
  await prisma.systemConfig.deleteMany({
    where: {
      key: { in: ['contact_info_viewable_roles', 'project_amount_viewable_roles'] }
    }
  });

  console.log('清理完成');

  // 验证
  const after = await prisma.systemConfig.findMany({
    where: {
      key: { in: ['contact_info_viewable_roles', 'project_amount_viewable_roles'] }
    }
  });
  console.log('清理后记录数:', after.length);

  await prisma.$disconnect();
}

main().catch(console.error);
