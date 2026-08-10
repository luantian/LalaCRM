/**
 * 恢复角色和角色-菜单关联
 * 运行方式: docker exec -it crm-backend node prisma/restore-roles.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('开始恢复角色数据...')

  // 1. 创建默认角色
  const roles = [
    { name: 'ADMIN', displayName: '系统管理员', roleKey: 'admin', description: '拥有所有权限', permissions: ['*'], dataScope: 'ALL' },
    { name: 'SALES_MANAGER', displayName: '销售经理', roleKey: 'sales_manager', description: '销售部门管理者', permissions: ['crm:*'], dataScope: 'DEPARTMENT_BELOW' },
    { name: 'SALES_REP', displayName: '销售专员', roleKey: 'sales_rep', description: '负责客户和商机', permissions: ['crm:organization:*', 'crm:opportunity:*', 'crm:quotation:view'], dataScope: 'SELF' },
    { name: 'PROJECT_MANAGER', displayName: '项目经理', roleKey: 'project_manager', description: '负责项目执行', permissions: ['project:*'], dataScope: 'DEPARTMENT_BELOW' },
    { name: 'FINANCE_SPECIALIST', displayName: '财务专员', roleKey: 'finance_specialist', description: '负责财务审批', permissions: ['finance:*'], dataScope: 'ALL' },
    { name: 'EMPLOYEE', displayName: '普通员工', roleKey: 'employee', description: '普通员工', permissions: ['office:dailyreport:*', 'office:checkin:*'], dataScope: 'SELF' },
    { name: 'TECH_STAFF', displayName: '技术人员', roleKey: 'tech_staff', description: '技术开发人员', permissions: ['project:task:*'], dataScope: 'SELF' },
    { name: 'BUSINESS_MANAGER', displayName: '商务经理', roleKey: 'business_manager', description: '负责商务管理', permissions: ['crm:*'], dataScope: 'ALL' }
  ]

  console.log('创建角色...')
  for (const roleData of roles) {
    try {
      const role = await prisma.roleModel.upsert({
        where: { name: roleData.name },
        update: roleData,
        create: roleData
      })
      console.log(`✓ 角色 ${roleData.displayName} (${roleData.name})`)
    } catch (error) {
      console.error(`✗ 角色 ${roleData.name} 创建失败:`, error.message)
    }
  }

  // 2. 获取 ADMIN 角色并分配所有菜单权限
  console.log('\n分配管理员权限...')
  const adminRole = await prisma.roleModel.findUnique({
    where: { name: 'ADMIN' }
  })

  if (adminRole) {
    // 获取所有菜单
    const allMenus = await prisma.menuItem.findMany()
    
    // 删除旧关联
    await prisma.roleMenu.deleteMany({
      where: { roleId: adminRole.id }
    })

    // 创建新关联
    const roleMenuData = allMenus.map(menu => ({
      roleId: adminRole.id,
      menuId: menu.id
    }))

    await prisma.roleMenu.createMany({
      data: roleMenuData,
      skipDuplicates: true
    })

    console.log(`✓ 已为管理员分配 ${allMenus.length} 个菜单权限`)
  }

  // 3. 为其他角色分配基础权限
  console.log('\n分配其他角色权限...')
  
  const rolePermissions = {
    'SALES_MANAGER': ['dashboard:view', 'crm:opportunity:list', 'crm:opportunity:edit', 'crm:organization:list', 'crm:organization:add', 'crm:organization:edit', 'crm:quotation:list', 'crm:quotation:edit'],
    'SALES_REP': ['dashboard:view', 'crm:organization:list', 'crm:organization:contact:list', 'crm:opportunity:list', 'crm:opportunity:edit', 'crm:quotation:list'],
    'PROJECT_MANAGER': ['dashboard:view', 'project:project:list', 'project:project:add', 'project:project:edit', 'project:contract:list', 'project:task:edit', 'project:procurement:list'],
    'FINANCE_SPECIALIST': ['dashboard:view', 'finance:expense:list', 'finance:expense:approve', 'project:contract:approve', 'project:procurement:approve'],
    'EMPLOYEE': ['dashboard:view', 'office:dailyreport:list', 'office:dailyreport:add', 'office:trip:list', 'office:checkin:list'],
    'TECH_STAFF': ['dashboard:view', 'project:task:edit'],
    'BUSINESS_MANAGER': ['dashboard:view', 'crm:organization:list', 'crm:opportunity:list', 'crm:quotation:list', 'crm:quotation:approve']
  }

  for (const [roleName, permKeys] of Object.entries(rolePermissions)) {
    const role = await prisma.roleModel.findUnique({
      where: { name: roleName }
    })

    if (role) {
      // 获取对应的菜单
      const menus = await prisma.menuItem.findMany({
        where: {
          OR: [
            { perm: { in: permKeys } },
            { menuType: 'MENU', label: { in: ['工作总览', '售前管理', '客户管理', '项目管理', '报价单', '日报管理', '出差管理', '考勤打卡', '费用报销'] } }
          ]
        }
      })

      // 删除旧关联
      await prisma.roleMenu.deleteMany({
        where: { roleId: role.id }
      })

      // 创建新关联
      if (menus.length > 0) {
        const roleMenuData = menus.map(menu => ({
          roleId: role.id,
          menuId: menu.id
        }))

        await prisma.roleMenu.createMany({
          data: roleMenuData,
          skipDuplicates: true
        })

        console.log(`✓ ${roleName} 分配了 ${menus.length} 个菜单权限`)
      }
    }
  }

  console.log('\n角色恢复完成！')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
