/**
 * 菜单种子数据脚本（含 BUTTON 权限节点）
 * 运行方式: cd backend && node prisma/seed.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding menus...')

  // 清空关联数据
  await prisma.$executeRawUnsafe('DELETE FROM "RoleMenu"')
  await prisma.$executeRawUnsafe('DELETE FROM "MenuItem"')

  // 菜单数据（MENU/DIRECTORY + BUTTON 权限节点）
  const menus = [
    // ═══════════ 目录/菜单 ═══════════
    // 工作台
    { id: 1,  key: 'dashboard',      icon: 'DashboardOutlined',    label: '工作总览', order: 1,  menuType: 'MENU', path: '/', component: 'Dashboard', perm: 'dashboard:view' },
    // 售前
    { id: 5,  key: 'opportunities',   icon: 'FundOutlined',         label: '售前管理', order: 2,  menuType: 'MENU', path: '/opportunities', component: 'OpportunityList', perm: 'crm:opportunity:list' },
    { id: 20, key: 'quotations',      icon: 'FileTextOutlined',     label: '报价单',   order: 3,  menuType: 'MENU', path: '/quotations', component: 'QuotationList', perm: 'crm:quotation:list' },
    // 客户与项目
    { id: 2,  key: 'organizations',   icon: 'TeamOutlined',         label: '客户管理', order: 4,  menuType: 'MENU', path: '/organizations', component: 'OrganizationList', perm: 'crm:organization:list' },
    { id: 4,  key: 'projects',        icon: 'ProjectOutlined',      label: '项目管理', order: 5,  menuType: 'MENU', path: '/projects', component: 'ProjectList', perm: 'project:project:list' },
    // 财务
    { id: 3,  key: 'sales',           icon: 'DollarOutlined',       label: '项目归档', order: 6,  menuType: 'MENU', path: '/sales', component: 'SaleList' },
    { id: 9,  key: 'expenses',        icon: 'MoneyCollectOutlined', label: '费用报销', order: 7,  menuType: 'MENU', path: '/expenses', component: 'ExpenseList', perm: 'finance:expense:list' },
    // 日常办公
    { id: 6,  key: 'office',          icon: 'ScheduleOutlined',     label: '日常办公', order: 8,  menuType: 'DIRECTORY' },
    { id: 7,  key: 'daily-reports',   icon: 'FileTextOutlined',     label: '日报管理', order: 1,  menuType: 'MENU', path: '/daily-reports', component: 'DailyReportList', perm: 'office:dailyreport:list', parentId: 6 },
    { id: 8,  key: 'business-trips',  icon: 'CarOutlined',          label: '出差管理', order: 2,  menuType: 'MENU', path: '/business-trips', component: 'BusinessTripList', perm: 'office:trip:list', parentId: 6 },
    { id: 22, key: 'check-ins',       icon: 'ClockCircleOutlined',  label: '考勤打卡', order: 3,  menuType: 'MENU', path: '/check-ins', component: 'CheckInList', perm: 'office:checkin:list', parentId: 6 },
    // 系统管理
    { id: 10, key: 'system',          icon: 'SettingOutlined',      label: '系统管理', order: 9,  menuType: 'DIRECTORY' },
    { id: 11, key: 'users',           icon: 'UserOutlined',         label: '用户管理', order: 1,  menuType: 'MENU', path: '/users', component: 'UserManagement', perm: 'system:user:list', parentId: 10 },
    { id: 12, key: 'roles',           icon: 'SafetyOutlined',       label: '角色管理', order: 2,  menuType: 'MENU', path: '/roles', component: 'RoleManagement', perm: 'system:role:list', parentId: 10 },
    { id: 13, key: 'menus',           icon: 'MenuOutlined',         label: '菜单管理', order: 3,  menuType: 'MENU', path: '/menus', component: 'MenuManagement', perm: 'system:menu:list', parentId: 10 },
    { id: 14, key: 'departments',     icon: 'ApartmentOutlined',    label: '部门管理', order: 4,  menuType: 'MENU', path: '/departments', component: 'DepartmentManagement', perm: 'system:department:list', parentId: 10 },
    { id: 15, key: 'dicts',           icon: 'BookOutlined',         label: '字典管理', order: 5,  menuType: 'MENU', path: '/dicts', component: 'DictManagement', perm: 'system:dict:list', parentId: 10 },
    // 日志审计
    { id: 16, key: 'logs',            icon: 'FileSearchOutlined',   label: '日志审计', order: 10, menuType: 'DIRECTORY' },
    { id: 17, key: 'operation-logs',  icon: 'FileTextOutlined',     label: '操作日志', order: 1,  menuType: 'MENU', path: '/operation-logs', component: 'OperationLogList', perm: 'system:log:list', parentId: 16 },
    { id: 18, key: 'login-logs',      icon: 'LoginOutlined',        label: '登录日志', order: 2,  menuType: 'MENU', path: '/login-logs', component: 'LoginLogList', perm: 'system:log:login', parentId: 16 },

    // ═══════════ BUTTON 权限节点 ═══════════
    // 客户管理 BUTTON（parentId=2）
    { id: 100, key: 'crm:organization:add',    icon: '', label: '创建客户',     order: 1, menuType: 'BUTTON', perm: 'crm:organization:add',             parentId: 2 },
    { id: 101, key: 'crm:organization:edit',   icon: '', label: '编辑客户',     order: 2, menuType: 'BUTTON', perm: 'crm:organization:edit',            parentId: 2 },
    { id: 102, key: 'crm:organization:delete', icon: '', label: '删除客户',     order: 3, menuType: 'BUTTON', perm: 'crm:organization:delete',          parentId: 2 },
    { id: 103, key: 'crm:organization:contact:list',    icon: '', label: '查看联系人', order: 4, menuType: 'BUTTON', perm: 'crm:organization:contact:list',    parentId: 2 },
    { id: 104, key: 'crm:organization:contact:add',     icon: '', label: '添加联系人', order: 5, menuType: 'BUTTON', perm: 'crm:organization:contact:add',     parentId: 2 },
    { id: 105, key: 'crm:organization:contact:edit',    icon: '', label: '编辑联系人', order: 6, menuType: 'BUTTON', perm: 'crm:organization:contact:edit',    parentId: 2 },
    { id: 106, key: 'crm:organization:contact:delete',  icon: '', label: '删除联系人', order: 7, menuType: 'BUTTON', perm: 'crm:organization:contact:delete',  parentId: 2 },
    // 售前管理 BUTTON（parentId=5）
    { id: 110, key: 'crm:opportunity:edit',  icon: '', label: '编辑售前', order: 1, menuType: 'BUTTON', perm: 'crm:opportunity:edit',  parentId: 5 },
    // 报价单 BUTTON（parentId=20）
    { id: 120, key: 'crm:quotation:edit',    icon: '', label: '编辑报价', order: 1, menuType: 'BUTTON', perm: 'crm:quotation:edit',    parentId: 20 },
    { id: 121, key: 'crm:quotation:approve', icon: '', label: '审批报价', order: 2, menuType: 'BUTTON', perm: 'crm:quotation:approve', parentId: 20 },
    // 项目管理 BUTTON（parentId=4）
    { id: 130, key: 'project:project:add', icon: '', label: '创建项目', order: 1,  menuType: 'BUTTON', perm: 'project:project:add',  parentId: 4 },
    { id: 131, key: 'project:project:edit', icon: '', label: '编辑项目', order: 2,  menuType: 'BUTTON', perm: 'project:project:edit', parentId: 4 },
    // 项目合同 BUTTON（parentId=4）
    { id: 132, key: 'project:contract:list',    icon: '', label: '查看合同', order: 3,  menuType: 'BUTTON', perm: 'project:contract:list',    parentId: 4 },
    { id: 133, key: 'project:contract:add',     icon: '', label: '创建合同', order: 4,  menuType: 'BUTTON', perm: 'project:contract:add',     parentId: 4 },
    { id: 134, key: 'project:contract:edit',    icon: '', label: '编辑合同', order: 5,  menuType: 'BUTTON', perm: 'project:contract:edit',    parentId: 4 },
    { id: 135, key: 'project:contract:approve', icon: '', label: '审批合同', order: 6,  menuType: 'BUTTON', perm: 'project:contract:approve', parentId: 4 },
    { id: 136, key: 'project:contract:delete',  icon: '', label: '删除合同', order: 7,  menuType: 'BUTTON', perm: 'project:contract:delete',  parentId: 4 },
    // 项目采购 BUTTON（parentId=4）
    { id: 140, key: 'project:procurement:list',    icon: '', label: '查看采购', order: 8,  menuType: 'BUTTON', perm: 'project:procurement:list',    parentId: 4 },
    { id: 141, key: 'project:procurement:edit',    icon: '', label: '编辑采购', order: 9,  menuType: 'BUTTON', perm: 'project:procurement:edit',    parentId: 4 },
    { id: 142, key: 'project:procurement:approve', icon: '', label: '审批采购', order: 10, menuType: 'BUTTON', perm: 'project:procurement:approve', parentId: 4 },
    // 项目任务 BUTTON（parentId=4）
    { id: 145, key: 'project:task:edit', icon: '', label: '编辑任务', order: 11, menuType: 'BUTTON', perm: 'project:task:edit', parentId: 4 },
    // 费用报销 BUTTON（parentId=9）
    { id: 150, key: 'finance:expense:add',     icon: '', label: '创建报销', order: 1, menuType: 'BUTTON', perm: 'finance:expense:add',     parentId: 9 },
    { id: 151, key: 'finance:expense:edit',    icon: '', label: '编辑报销', order: 2, menuType: 'BUTTON', perm: 'finance:expense:edit',    parentId: 9 },
    { id: 152, key: 'finance:expense:approve', icon: '', label: '审批报销', order: 3, menuType: 'BUTTON', perm: 'finance:expense:approve', parentId: 9 },
    // 日报管理 BUTTON（parentId=7）
    { id: 160, key: 'office:dailyreport:add',     icon: '', label: '创建日报', order: 1, menuType: 'BUTTON', perm: 'office:dailyreport:add',     parentId: 7 },
    { id: 161, key: 'office:dailyreport:approve', icon: '', label: '审批日报', order: 2, menuType: 'BUTTON', perm: 'office:dailyreport:approve', parentId: 7 },
    // 出差管理 BUTTON（parentId=8）
    { id: 170, key: 'office:trip:add',     icon: '', label: '创建出差', order: 1, menuType: 'BUTTON', perm: 'office:trip:add',     parentId: 8 },
    { id: 171, key: 'office:trip:approve', icon: '', label: '审批出差', order: 2, menuType: 'BUTTON', perm: 'office:trip:approve', parentId: 8 },
    // 考勤打卡 BUTTON（parentId=22）
    { id: 175, key: 'office:checkin:add', icon: '', label: '打卡',   order: 1, menuType: 'BUTTON', perm: 'office:checkin:add',   parentId: 22 },
    // 用户管理 BUTTON（parentId=11）
    { id: 180, key: 'system:user:add',    icon: '', label: '创建用户', order: 1, menuType: 'BUTTON', perm: 'system:user:add',    parentId: 11 },
    { id: 181, key: 'system:user:edit',   icon: '', label: '编辑用户', order: 2, menuType: 'BUTTON', perm: 'system:user:edit',   parentId: 11 },
    { id: 182, key: 'system:user:delete', icon: '', label: '删除用户', order: 3, menuType: 'BUTTON', perm: 'system:user:delete', parentId: 11 },
    // 角色管理 BUTTON（parentId=12）
    { id: 185, key: 'system:role:add',    icon: '', label: '创建角色', order: 1, menuType: 'BUTTON', perm: 'system:role:add',    parentId: 12 },
    { id: 186, key: 'system:role:edit',   icon: '', label: '编辑角色', order: 2, menuType: 'BUTTON', perm: 'system:role:edit',   parentId: 12 },
    { id: 187, key: 'system:role:delete', icon: '', label: '删除角色', order: 3, menuType: 'BUTTON', perm: 'system:role:delete', parentId: 12 },
    // 菜单管理 BUTTON（parentId=13）
    { id: 190, key: 'system:menu:add',    icon: '', label: '创建菜单', order: 1, menuType: 'BUTTON', perm: 'system:menu:add',    parentId: 13 },
    { id: 191, key: 'system:menu:edit',   icon: '', label: '编辑菜单', order: 2, menuType: 'BUTTON', perm: 'system:menu:edit',   parentId: 13 },
    { id: 192, key: 'system:menu:delete', icon: '', label: '删除菜单', order: 3, menuType: 'BUTTON', perm: 'system:menu:delete', parentId: 13 },
    // 部门管理 BUTTON（parentId=14）
    { id: 195, key: 'system:department:add',    icon: '', label: '创建部门', order: 1, menuType: 'BUTTON', perm: 'system:department:add',    parentId: 14 },
    { id: 196, key: 'system:department:edit',   icon: '', label: '编辑部门', order: 2, menuType: 'BUTTON', perm: 'system:department:edit',   parentId: 14 },
    { id: 197, key: 'system:department:delete', icon: '', label: '删除部门', order: 3, menuType: 'BUTTON', perm: 'system:department:delete', parentId: 14 },
    // 字典管理 BUTTON（parentId=15）
    { id: 200, key: 'system:dict:add',    icon: '', label: '创建字典', order: 1, menuType: 'BUTTON', perm: 'system:dict:add',    parentId: 15 },
    { id: 201, key: 'system:dict:edit',   icon: '', label: '编辑字典', order: 2, menuType: 'BUTTON', perm: 'system:dict:edit',   parentId: 15 },
    { id: 202, key: 'system:dict:delete', icon: '', label: '删除字典', order: 3, menuType: 'BUTTON', perm: 'system:dict:delete', parentId: 15 },
    // 操作日志 BUTTON（parentId=17）
    { id: 205, key: 'system:log:delete',  icon: '', label: '清理日志', order: 1, menuType: 'BUTTON', perm: 'system:log:delete', parentId: 17 },
    // 系统设置 BUTTON（parentId=10 系统管理）
    { id: 210, key: 'system:settings:edit', icon: '', label: '编辑设置', order: 5, menuType: 'BUTTON', perm: 'system:settings:edit', parentId: 10 },
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
      roleKey: 'admin',
      displayName: '管理员',
      description: '系统管理员，拥有所有权限',
      permissions: [],
      dataScope: 'ALL',
    }
  })

  // 为管理员分配所有菜单（含 BUTTON）
  const allMenus = await prisma.menuItem.findMany()
  for (const m of allMenus) {
    await prisma.roleMenu.create({
      data: { roleId: 1, menuId: m.id }
    }).catch(() => {}) // ignore duplicates
  }

  console.log(`Done: ${menus.length} menus created (${menus.filter(m => m.menuType === 'BUTTON').length} buttons), all assigned to ADMIN role`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
