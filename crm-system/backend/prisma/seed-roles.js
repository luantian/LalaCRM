const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function seedRoleKeys() {
  console.log('开始回填角色 roleKey...')
  
  // 定义角色映射
  const roleMappings = [
    { name: 'SYSTEM_ADMIN', roleKey: 'admin' },
    { name: 'SALES_MANAGER', roleKey: 'sales_manager' },
    { name: 'SALES_REP', roleKey: 'sales_rep' },
    { name: 'PROJECT_MANAGER', roleKey: 'project_manager' },
    { name: 'FINANCE_SPECIALIST', roleKey: 'finance_specialist' },
    { name: 'EMPLOYEE', roleKey: 'employee' },
    { name: 'TECH_STAFF', roleKey: 'tech_staff' },
    { name: 'BUSINESS_MANAGER', roleKey: 'business_manager' }
  ]
  
  for (const mapping of roleMappings) {
    try {
      const role = await prisma.roleModel.findUnique({
        where: { name: mapping.name }
      })
      
      if (role) {
        await prisma.roleModel.update({
          where: { id: role.id },
          data: { roleKey: mapping.roleKey }
        })
        console.log(`✓ 角色 ${mapping.name} -> ${mapping.roleKey}`)
      } else {
        console.log(`- 角色 ${mapping.name} 不存在，跳过`)
      }
    } catch (error) {
      console.error(`✗ 角色 ${mapping.name} 回填失败:`, error.message)
    }
  }
  
  console.log('\n回填完成！')
}

seedRoleKeys()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
