/**
 * 角色种子数据脚本
 * 运行方式: cd backend && node prisma/seed-roles.js
 * 
 * 创建以下角色并分配菜单权限：
 * 1. 系统管理员 - 所有权限
 * 2. 销售经理 - 售前、客户、报价
 * 3. 销售专员 - 售前、客户、报价（仅自己）
 * 4. 项目经理 - 项目、客户
 * 5. 财务专员 - 项目归档、费用报销
 * 6. 普通员工 - 日常办公（日报、出差、打卡）
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始创建角色...')

  // 清空角色菜单关联
  await prisma.$executeRawUnsafe('DELETE FROM "RoleMenu"')
  await prisma.$executeRawUnsafe('DELETE FROM "UserRole"')
  await prisma.$executeRawUnsafe('DELETE FROM "RoleModel"')
  console.log('✅ 已清空旧角色数据')

  // 菜单ID对照表（来自 seed.js）
  // 1=工作总览, 5=售前管理, 20=报价单, 2=客户管理, 4=项目管理
  // 3=项目归档, 9=费用报销
  // 6=日常办公, 7=日报管理, 8=出差管理, 22=考勤打卡
  // 10=系统管理, 11=用户管理, 12=角色管理, 13=菜单管理, 14=部门管理, 15=字典管理
  // 16=日志审计, 17=操作日志, 18=登录日志

  // 定义角色
  const roles = [
    {
      id: 1,
      name: 'SYSTEM_ADMIN',
      displayName: '系统管理员',
      description: '拥有所有权限，管理系统配置',
      dataScope: 'ALL',
      menuIds: [1, 5, 20, 2, 4, 3, 9, 6, 7, 8, 22, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    },
    {
      id: 2,
      name: 'SALES_MANAGER',
      displayName: '销售经理',
      description: '负责售前管理、客户管理、报价审批，可查看团队数据',
      dataScope: 'DEPARTMENT_BELOW',
      menuIds: [1, 5, 20, 2, 9, 6, 7, 8, 22]
    },
    {
      id: 3,
      name: 'SALES_REP',
      displayName: '销售专员',
      description: '负责售前跟进、客户维护、报价制作',
      dataScope: 'SELF',
      menuIds: [1, 5, 20, 2, 9, 6, 7, 8, 22]
    },
    {
      id: 4,
      name: 'PROJECT_MANAGER',
      displayName: '项目经理',
      description: '负责项目全生命周期管理、团队协作',
      dataScope: 'DEPARTMENT',
      menuIds: [1, 2, 4, 9, 6, 7, 8, 22]
    },
    {
      id: 5,
      name: 'FINANCE_SPECIALIST',
      displayName: '财务专员',
      description: '负责项目归档、收支记录、费用报销管理',
      dataScope: 'ALL',
      menuIds: [1, 3, 9, 6, 7, 8, 22]
    },
    {
      id: 6,
      name: 'EMPLOYEE',
      displayName: '普通员工',
      description: '日常办公：日报、出差、打卡',
      dataScope: 'SELF',
      menuIds: [1, 9, 6, 7, 8, 22]
    }
  ]

  // 创建角色并分配菜单
  for (const role of roles) {
    const created = await prisma.roleModel.create({
      data: {
        id: role.id,
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        dataScope: role.dataScope,
        permissions: []
      }
    })

    // 分配菜单
    for (const menuId of role.menuIds) {
      await prisma.roleMenu.create({
        data: { roleId: role.id, menuId }
      }).catch(() => {})
    }

    console.log(`✅ ${role.displayName} (${role.name}) - ${role.menuIds.length} 个菜单`)
  }

  // 为所有用户分配角色（根据旧的 role 字段映射）
  const allUsers = await prisma.user.findMany()
  const roleMapping = {
    'ADMIN': 1,              // 系统管理员
    'PROJECT_DIRECTOR': 1,   // 项目总监 → 系统管理员（高权限）
    'PROJECT_MANAGER': 4,    // 项目经理
    'USER': 6,               // 普通用户 → 普通员工
    'VIEWER': 6,             // 观察者 → 普通员工
  }

  let assignedCount = 0
  for (const user of allUsers) {
    const mappedRoleId = roleMapping[user.role] || 6 // 默认普通员工
    await prisma.userRole.create({
      data: { userId: user.id, roleId: mappedRoleId }
    }).catch(() => {}) // 忽略重复
    assignedCount++
    const roleName = Object.entries(roleMapping).find(([k]) => k === user.role)?.[1] 
      ? roles.find(r => r.id === mappedRoleId)?.displayName || '未知'
      : '普通员工'
    console.log(`✅ 用户 ${user.username} (role=${user.role}) → ${roleName}`)
  }
  console.log(`\n共为 ${assignedCount} 个用户分配了角色`)

  console.log('\n🎉 角色创建完成！')
  console.log('\n📋 角色权限对照表:')
  console.log('┌──────────────┬────────┬────────┬────────┬────────┬────────┬────────┐')
  console.log('│ 模块         │ 管理员 │ 销售经理│ 销售专员│ 项目经理│ 财务专员│ 普通员工│')
  console.log('├──────────────┼────────┼────────┼────────┼────────┼────────┼────────┤')
  console.log('│ 工作总览       │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │')
  console.log('│ 售前管理     │   ✅   │   ✅   │   ✅   │   ❌   │   ❌   │   ❌   │')
  console.log('│ 报价单       │   ✅   │   ✅   │   ✅   │   ❌   │   ❌   │   ❌   │')
  console.log('│ 客户管理     │   ✅   │   ✅   │   ✅   │   ✅   │   ❌   │   ❌   │')
  console.log('│ 项目管理     │   ✅   │   ❌   │   ❌   │   ✅   │   ❌   │   ❌   │')
  console.log('│ 项目归档     │   ✅   │   ❌   │   ❌   │   ❌   │   ✅   │   ❌   │')
  console.log('│ 费用报销     │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │')
  console.log('│ 日报管理     │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │')
  console.log('│ 出差管理     │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │')
  console.log('│ 考勤打卡     │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │')
  console.log('│ 系统管理     │   ✅   │   ❌   │   ❌   │   ❌   │   ❌   │   ❌   │')
  console.log('│ 日志审计     │   ✅   │   ❌   │   ❌   │   ❌   │   ❌   │   ❌   │')
  console.log('└──────────────┴────────┴────────┴────────┴────────┴────────┴────────┘')
  console.log('\n数据权限范围:')
  console.log('  系统管理员: 全部数据')
  console.log('  销售经理:   本部门及以下数据')
  console.log('  销售专员:   仅自己数据')
  console.log('  项目经理:   本部门数据')
  console.log('  财务专员:   全部数据')
  console.log('  普通员工:   仅自己数据')
}

main()
  .catch(e => { console.error('❌ 失败:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
