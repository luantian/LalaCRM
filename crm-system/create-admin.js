const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  const username = 'admin';
  const password = 'admin123';
  const email = 'admin@crm.local';
  const name = '管理员';

  // 检查是否已存在
  const existing = await prisma.user.findFirst({ where: { username } });
  if (existing) {
    console.log('⚠️ 管理员账户已存在：', username);
    await prisma.$disconnect();
    return;
  }

  // 创建管理员
  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      name,
      role: 'ADMIN',
      email
    }
  });

  console.log('✅ 管理员账户创建成功！');
  console.log('用户名:', username);
  console.log('密码:', password);
  
  await prisma.$disconnect();
}

createAdmin().catch(err => {
  console.error('❌ 创建失败:', err.message);
  prisma.$disconnect();
  process.exit(1);
});
