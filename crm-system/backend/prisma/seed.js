/**
 * 菜单种子数据脚本
 * 运行方式: cd backend && node prisma/seed.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding menus...')

  // 清空关联数据
  await prisma.$executeRawUnsafe('DELETE FROM "RoleMenu"')
  await prisma.$executeRawUnsafe('DELETE FROM "MenuItem"')

  // 菜单数据（按 CRM 业务流程排列）
  const menus = [
    // 工作台
    { id: 1,  key: 'dashboard',      icon: 'DashboardOutlined',    label: '仪表盘',   order: 1,  menuType: 'MENU',      path: '/',                component: 'Dashboard' },
    // 售前
    { id: 5,  key: 'opportunities',   icon: 'FundOutlined',         label: '商机管理', order: 2,  menuType: 'MENU',      path: '/opportunities',  component: 'OpportunityList',  perm: 'view_opportunities' },
    { id: 20, key: 'quotations',      icon: 'FileTextOutlined',     label: '报价单',   order: 3,  menuType: 'MENU',      path: '/quotations',     component: 'QuotationList',    perm: 'view_quotations' },
    // 客户与项目
    { id: 2,  key: 'customers',       icon: 'TeamOutlined',         label: '客户管理', order: 4,  menuType: 'MENU',      path: '/customers',      component: 'CustomerList',     perm: 'view_customers' },
    { id: 4,  key: 'projects',        icon: 'ProjectOutlined',      label: '项目管理', order: 5,  menuType: 'MENU',      path: '/projects',       component: 'ProjectList',      perm: 'view_projects' },
    // 财务相关（平铺）
    { id: 3,  key: 'sales',           icon: 'DollarOutlined',       label: '项目归档', order: 6,  menuType: 'MENU',      path: '/sales',          component: 'SaleList' },
    { id: 9,  key: 'expenses',        icon: 'MoneyCollectOutlined', label: '费用报销', order: 7,  menuType: 'MENU',      path: '/expenses',       component: 'ExpenseList',      perm: 'view_expenses' },
    // 日常办公
    { id: 6,  key: 'office',          icon: 'ScheduleOutlined',     label: '日常办公', order: 8,  menuType: 'DIRECTORY' },
    { id: 7,  key: 'daily-reports',   icon: 'FileTextOutlined',     label: '日报管理', order: 1,  menuType: 'MENU',      path: '/daily-reports',  component: 'DailyReportList',  perm: 'view_reports',       parentId: 6 },
    { id: 8,  key: 'business-trips',  icon: 'CarOutlined',          label: '出差管理', order: 2,  menuType: 'MENU',      path: '/business-trips', component: 'BusinessTripList', perm: 'view_business_trips', parentId: 6 },
    { id: 22, key: 'check-ins',       icon: 'ClockCircleOutlined',  label: '考勤打卡', order: 3,  menuType: 'MENU',      path: '/check-ins',      component: 'CheckInList',                                  parentId: 6 },
    // 系统管理
    { id: 10, key: 'system',          icon: 'SettingOutlined',      label: '系统管理', order: 9,  menuType: 'DIRECTORY' },
    { id: 11, key: 'users',           icon: 'UserOutlined',         label: '用户管理', order: 1,  menuType: 'MENU',      path: '/users',          component: 'UserManagement',                               parentId: 10 },
    { id: 12, key: 'roles',           icon: 'SafetyOutlined',       label: '角色管理', order: 2,  menuType: 'MENU',      path: '/roles',          component: 'RoleManagement',                                 parentId: 10 },
    { id: 13, key: 'menus',           icon: 'MenuOutlined',         label: '菜单管理', order: 3,  menuType: 'MENU',      path: '/menus',          component: 'MenuManagement',                                 parentId: 10 },
    { id: 14, key: 'departments',     icon: 'ApartmentOutlined',    label: '部门管理', order: 4,  menuType: 'MENU',      path: '/departments',    component: 'DepartmentManagement',                           parentId: 10 },
    { id: 15, key: 'dicts',           icon: 'BookOutlined',         label: '字典管理', order: 5,  menuType: 'MENU',      path: '/dicts',          component: 'DictManagement',                                   parentId: 10 },
    // 日志审计
    { id: 16, key: 'logs',            icon: 'FileSearchOutlined',   label: '日志审计', order: 10, menuType: 'DIRECTORY' },
    { id: 17, key: 'operation-logs',  icon: 'FileTextOutlined',     label: '操作日志', order: 1,  menuType: 'MENU',      path: '/operation-logs', component: 'OperationLogList',                               parentId: 16 },
    { id: 18, key: 'login-logs',      icon: 'LoginOutlined',        label: '登录日志', order: 2,  menuType: 'MENU',      path: '/login-logs',     component: 'LoginLogList',                                     parentId: 16 },
  ]

  for (const menu of menus) {
    await prisma.menuItem.create({
      data: {
        ...menu,
        isVisible: true,
        requiredRoles: [],
      }
    })
  }

  // 确保管理员角色存在
  await prisma.roleModel.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'ADMIN',
      displayName: '管理员',
      description: '系统管理员，拥有所有权限',
      permissions: [],
      dataScope: 'ALL',
    }
  })

  // 为管理员分配所有菜单
  const allMenus = await prisma.menuItem.findMany()
  for (const m of allMenus) {
    await prisma.roleMenu.create({
      data: { roleId: 1, menuId: m.id }
    }).catch(() => {}) // ignore duplicates
  }

  console.log(`Done: ${menus.length} menus created, all assigned to ADMIN role`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
