const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  // 测试用户列表
  const testUsers = [
    { username: 'luantian', password: 'test123' },
    { username: 'sales_test', password: 'test123' },
    { username: 'viewer_test', password: 'test123' },
    { username: 'team_test_user', password: 'test123' },
  ]

  console.log('开始重置测试用户密码...\n')

  for (const { username, password } of testUsers) {
    const hashedPassword = await bcrypt.hash(password, 10)
    
    const user = await prisma.user.findUnique({
      where: { username }
    })

    if (!user) {
      console.log(`❌ 用户 ${username} 不存在`)
      continue
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    console.log(`✅ 用户 ${username} (ID: ${user.id}) 密码已重置为: ${password}`)
  }

  console.log('\n密码重置完成！')
  await prisma.$disconnect()
}

main().catch(console.error)
