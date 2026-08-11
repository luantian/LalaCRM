const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('开始清空数据库...')
  
  // 获取所有表名
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  
  console.log(`找到 ${tables.length} 个表`)
  
  // 禁用外键约束
  await prisma.$executeRaw`SET session_replication_role = replica;`
  
  // 清空所有表
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table.tablename}" CASCADE;`)
      console.log(`已清空表: ${table.tablename}`)
    } catch (error) {
      console.error(`清空表 ${table.tablename} 失败:`, error.message)
    }
  }
  
  // 重新启用外键约束
  await prisma.$executeRaw`SET session_replication_role = DEFAULT;`
  
  console.log('数据库已清空')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
