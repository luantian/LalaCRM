const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAdminName() {
  try {
    console.log('🔧 修复admin用户名称...\n');

    // 查找admin用户
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (!admin) {
      console.log('❌ admin用户不存在');
      return;
    }

    console.log('当前名称:', admin.name);
    console.log('当前名称(bytes):', Buffer.from(admin.name).toString('hex'));

    // 更新为正确的名称
    const updated = await prisma.user.update({
      where: { username: 'admin' },
      data: { name: '管理员' }
    });

    console.log('\n✅ 更新成功!');
    console.log('新名称:', updated.name);

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixAdminName();
