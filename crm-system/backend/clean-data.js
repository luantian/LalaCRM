// 清理重复数据并重新创建
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanAndRecreate() {
  try {
    console.log('🔄 开始清理重复数据...\n');

    // 删除所有关联数据
    console.log('📋 删除关联数据...');
    await prisma.sale.deleteMany({});
    await prisma.contract.deleteMany({});
    await prisma.project.deleteMany({});
    console.log('✅ 关联数据已删除\n');

    // 删除所有客户（保留admin用户）
    console.log('📋 删除所有客户...');
    await prisma.customer.deleteMany({});
    console.log('✅ 客户数据已删除\n');

    console.log('🎉 数据清理完成！');
    console.log('现在可以在前端重新创建数据，或运行 reset-data.js 创建测试数据');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanAndRecreate();
