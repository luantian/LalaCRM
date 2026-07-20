// 修复数据库中文乱码问题
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixChineseEncoding() {
  try {
    console.log('🔧 开始修复中文乱码问题...\n');

    // 检查数据库编码
    const encoding = await prisma.$queryRaw`SHOW server_encoding;`;
    console.log('数据库编码:', encoding);

    // 修复用户表中的乱码数据
    console.log('\n📋 修复用户数据...');
    const users = await prisma.user.findMany();
    for (const user of users) {
      if (user.name && user.name.includes('锟斤拷')) {
        console.log(`  修复用户 ${user.id}: ${user.username}`);
        await prisma.user.update({
          where: { id: user.id },
          data: { name: '管理员' }
        });
      }
    }

    // 修复客户表中的乱码数据
    console.log('\n📋 修复客户数据...');
    const customers = await prisma.customer.findMany();
    for (const customer of customers) {
      if ((customer.name && customer.name.includes('锟斤拷')) ||
          (customer.companyName && customer.companyName.includes('锟斤拷'))) {
        console.log(`  修复客户 ${customer.id}: ${customer.id}号客户`);
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: customer.name?.includes('锟斤拷') ? `客户${customer.id}` : customer.name,
            companyName: customer.companyName?.includes('锟斤拷') ? `公司${customer.id}` : customer.companyName
          }
        });
      }
    }

    // 修复项目表中的乱码数据
    console.log('\n📋 修复项目数据...');
    const projects = await prisma.project.findMany();
    for (const project of projects) {
      if (project.name && project.name.includes('锟斤拷')) {
        console.log(`  修复项目 ${project.id}: ${project.id}号项目`);
        await prisma.project.update({
          where: { id: project.id },
          data: { name: `项目${project.id}` }
        });
      }
    }

    // 修复合同表中的乱码数据
    console.log('\n📋 修复合同数据...');
    const contracts = await prisma.contract.findMany();
    for (const contract of contracts) {
      if (contract.name && contract.name.includes('锟斤拷')) {
        console.log(`  修复合同 ${contract.id}: ${contract.id}号合同`);
        await prisma.contract.update({
          where: { id: contract.id },
          data: { name: `合同${contract.id}` }
        });
      }
    }

    console.log('\n✅ 中文乱码修复完成！');
    console.log('建议：重新创建数据时使用正确的编码');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixChineseEncoding();
