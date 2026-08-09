const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function fixRoleKeys() {
  console.log('开始修复角色 roleKey 大小写问题...\n')
  
  // 定义需要修复的角色映射（小写 -> 大写）
  const fixes = [
    { oldKey: 'admin', newKey: 'ADMIN' },
    { oldKey: 'sales_manager', newKey: 'SALES_MANAGER' },
    { oldKey: 'sales_rep', newKey: 'SALES_REP' },
    { oldKey: 'project_manager', newKey: 'PROJECT_MANAGER' },
    { oldKey: 'finance_specialist', newKey: 'FINANCE_SPECIALIST' },
    { oldKey: 'employee', newKey: 'EMPLOYEE' },
    { oldKey: 'tech_staff', newKey: 'TECH_STAFF' },
    { oldKey: 'business_manager', newKey: 'BUSINESS_MANAGER' }
  ]
  
  let fixedCount = 0
  
  for (const fix of fixes) {
    try {
      // 查找使用该 roleKey 的角色
      const roles = await prisma.roleModel.findMany({
        where: { roleKey: fix.oldKey }
      })
      
      if (roles.length > 0) {
        for (const role of roles) {
          // 检查是否已经存在大写版本的 roleKey
          const existingUpper = await prisma.roleModel.findFirst({
            where: { roleKey: fix.newKey }
          })
          
          if (existingUpper) {
            console.log(`⚠ 角色 "${fix.oldKey}" (ID: ${role.id}) 已存在大写版本 "${fix.newKey}" (ID: ${existingUpper.id})，需要手动处理`)
          } else {
            // 更新为小写
            await prisma.roleModel.update({
              where: { id: role.id },
              data: { roleKey: fix.newKey }
            })
            console.log(`✓ 角色 "${fix.oldKey}" (ID: ${role.id}) -> "${fix.newKey}"`)
            fixedCount++
          }
        }
      }
    } catch (error) {
      console.error(`✗ 修复 "${fix.oldKey}" 失败:`, error.message)
    }
  }
  
  console.log(`\n修复完成！共更新 ${fixedCount} 个角色的 roleKey`)
  
  // 验证结果
  const allRoles = await prisma.roleModel.findMany({
    select: { id: true, name: true, displayName: true, roleKey: true }
  })
  
  console.log('\n当前所有角色：')
  allRoles.forEach(role => {
    console.log(`  ID: ${role.id}, name: ${role.name}, displayName: ${role.displayName}, roleKey: ${role.roleKey}`)
  })
}

fixRoleKeys()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
