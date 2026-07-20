// 清理乱码数据并重新创建测试数据
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetData() {
  try {
    console.log('🔄 开始清理乱码数据...\n');

    // 删除所有关联数据（按依赖顺序）
    console.log('📋 删除销售记录...');
    await prisma.sale.deleteMany({});

    console.log('📋 删除合同文件...');
    await prisma.contractFile.deleteMany({});

    console.log('📋 删除合同...');
    await prisma.contract.deleteMany({});

    console.log('📋 删除出差记录...');
    await prisma.businessTrip.deleteMany({});

    console.log('📋 删除费用报销...');
    await prisma.expense.deleteMany({});

    console.log('📋 删除项目...');
    await prisma.project.deleteMany({});

    console.log('📋 删除客户...');
    await prisma.customer.deleteMany({});

    console.log('📋 删除用户（保留admin）...');
    await prisma.user.deleteMany({
      where: { username: { not: 'admin' } }
    });

    // 修复admin用户的名称
    console.log('\n👤 修复admin用户...');
    await prisma.user.update({
      where: { username: 'admin' },
      data: { name: '管理员' }
    });

    console.log('\n✅ 数据清理完成！');
    console.log('现在可以创建新的测试数据了');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetData();
