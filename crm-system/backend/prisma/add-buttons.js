/**
 * 补充 BUTTON 权限节点（不删除现有菜单）
 * 运行方式: cd backend && node prisma/add-buttons.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('添加 BUTTON 权限节点...')

  const buttons = [
    // 客户管理 BUTTON（parentId=2）
    { key: 'crm:organization:add',    icon: '', label: '创建客户',     order: 1, menuType: 'BUTTON', perm: 'crm:organization:add',             parentId: 2 },
    { key: 'crm:organization:edit',   icon: '', label: '编辑客户',     order: 2, menuType: 'BUTTON', perm: 'crm:organization:edit',            parentId: 2 },
    { key: 'crm:organization:delete', icon: '', label: '删除客户',     order: 3, menuType: 'BUTTON', perm: 'crm:organization:delete',          parentId: 2 },
    { key: 'crm:organization:contact:list',    icon: '', label: '查看联系人', order: 4, menuType: 'BUTTON', perm: 'crm:organization:contact:list',    parentId: 2 },
    { key: 'crm:organization:contact:add',     icon: '', label: '添加联系人', order: 5, menuType: 'BUTTON', perm: 'crm:organization:contact:add',     parentId: 2 },
    { key: 'crm:organization:contact:edit',    icon: '', label: '编辑联系人', order: 6, menuType: 'BUTTON', perm: 'crm:organization:contact:edit',    parentId: 2 },
    { key: 'crm:organization:contact:delete',  icon: '', label: '删除联系人', order: 7, menuType: 'BUTTON', perm: 'crm:organization:contact:delete',  parentId: 2 },
    // 售前管理 BUTTON（parentId=5）
    { key: 'crm:opportunity:edit',  icon: '', label: '编辑售前', order: 1, menuType: 'BUTTON', perm: 'crm:opportunity:edit',  parentId: 5 },
    // 报价单 BUTTON（parentId=20）
    { key: 'crm:quotation:edit',    icon: '', label: '编辑报价', order: 1, menuType: 'BUTTON', perm: 'crm:quotation:edit',    parentId: 20 },
    { key: 'crm:quotation:approve', icon: '', label: '审批报价', order: 2, menuType: 'BUTTON', perm: 'crm:quotation:approve', parentId: 20 },
    // 项目管理 BUTTON（parentId=4）
    { key: 'project:project:add', icon: '', label: '创建项目', order: 1,  menuType: 'BUTTON', perm: 'project:project:add',  parentId: 4 },
    { key: 'project:project:edit', icon: '', label: '编辑项目', order: 2,  menuType: 'BUTTON', perm: 'project:project:edit', parentId: 4 },
    // 项目合同 BUTTON（parentId=4）
    { key: 'project:contract:list',    icon: '', label: '查看合同', order: 3,  menuType: 'BUTTON', perm: 'project:contract:list',    parentId: 4 },
    { key: 'project:contract:add',     icon: '', label: '创建合同', order: 4,  menuType: 'BUTTON', perm: 'project:contract:add',     parentId: 4 },
    { key: 'project:contract:edit',    icon: '', label: '编辑合同', order: 5,  menuType: 'BUTTON', perm: 'project:contract:edit',    parentId: 4 },
    { key: 'project:contract:approve', icon: '', label: '审批合同', order: 6,  menuType: 'BUTTON', perm: 'project:contract:approve', parentId: 4 },
    { key: 'project:contract:delete',  icon: '', label: '删除合同', order: 7,  menuType: 'BUTTON', perm: 'project:contract:delete',  parentId: 4 },
    // 项目采购 BUTTON（parentId=4）
    { key: 'project:procurement:list',    icon: '', label: '查看采购', order: 8,  menuType: 'BUTTON', perm: 'project:procurement:list',    parentId: 4 },
    { key: 'project:procurement:edit',    icon: '', label: '编辑采购', order: 9,  menuType: 'BUTTON', perm: 'project:procurement:edit',    parentId: 4 },
    { key: 'project:procurement:approve', icon: '', label: '审批采购', order: 10, menuType: 'BUTTON', perm: 'project:procurement:approve', parentId: 4 },
    // 项目任务 BUTTON（parentId=4）
    { key: 'project:task:edit', icon: '', label: '编辑任务', order: 11, menuType: 'BUTTON', perm: 'project:task:edit', parentId: 4 },
    // 费用报销 BUTTON（parentId=9）
    { key: 'finance:expense:add',     icon: '', label: '创建报销', order: 1, menuType: 'BUTTON', perm: 'finance:expense:add',     parentId: 9 },
    { key: 'finance:expense:edit',    icon: '', label: '编辑报销', order: 2, menuType: 'BUTTON', perm: 'finance:expense:edit',    parentId: 9 },
    { key: 'finance:expense:approve', icon: '', label: '审批报销', order: 3, menuType: 'BUTTON', perm: 'finance:expense:approve', parentId: 9 },
    // 日报管理 BUTTON（parentId=7）
    { key: 'office:dailyreport:add',     icon: '', label: '创建日报', order: 1, menuType: 'BUTTON', perm: 'office:dailyreport:add',     parentId: 7 },
    { key: 'office:dailyreport:approve', icon: '', label: '审批日报', order: 2, menuType: 'BUTTON', perm: 'office:dailyreport:approve', parentId: 7 },
    // 出差管理 BUTTON（parentId=8）
    { key: 'office:trip:add',     icon: '', label: '创建出差', order: 1, menuType: 'BUTTON', perm: 'office:trip:add',     parentId: 8 },
    { key: 'office:trip:approve', icon: '', label: '审批出差', order: 2, menuType: 'BUTTON', perm: 'office:trip:approve', parentId: 8 },
    // 考勤打卡 BUTTON（parentId=22）
    { key: 'office:checkin:add', icon: '', label: '打卡',   order: 1, menuType: 'BUTTON', perm: 'office:checkin:add',   parentId: 22 },
    // 用户管理 BUTTON（parentId=11）
    { key: 'system:user:add',    icon: '', label: '创建用户', order: 1, menuType: 'BUTTON', perm: 'system:user:add',    parentId: 11 },
    { key: 'system:user:edit',   icon: '', label: '编辑用户', order: 2, menuType: 'BUTTON', perm: 'system:user:edit',   parentId: 11 },
    { key: 'system:user:delete', icon: '', label: '删除用户', order: 3, menuType: 'BUTTON', perm: 'system:user:delete', parentId: 11 },
    // 角色管理 BUTTON（parentId=12）
    { key: 'system:role:add',    icon: '', label: '创建角色', order: 1, menuType: 'BUTTON', perm: 'system:role:add',    parentId: 12 },
    { key: 'system:role:edit',   icon: '', label: '编辑角色', order: 2, menuType: 'BUTTON', perm: 'system:role:edit',   parentId: 12 },
    { key: 'system:role:delete', icon: '', label: '删除角色', order: 3, menuType: 'BUTTON', perm: 'system:role:delete', parentId: 12 },
    // 菜单管理 BUTTON（parentId=13）
    { key: 'system:menu:add',    icon: '', label: '创建菜单', order: 1, menuType: 'BUTTON', perm: 'system:menu:add',    parentId: 13 },
    { key: 'system:menu:edit',   icon: '', label: '编辑菜单', order: 2, menuType: 'BUTTON', perm: 'system:menu:edit',   parentId: 13 },
    { key: 'system:menu:delete', icon: '', label: '删除菜单', order: 3, menuType: 'BUTTON', perm: 'system:menu:delete', parentId: 13 },
    // 部门管理 BUTTON（parentId=14）
    { key: 'system:department:add',    icon: '', label: '创建部门', order: 1, menuType: 'BUTTON', perm: 'system:department:add',    parentId: 14 },
    { key: 'system:department:edit',   icon: '', label: '编辑部门', order: 2, menuType: 'BUTTON', perm: 'system:department:edit',   parentId: 14 },
    { key: 'system:department:delete', icon: '', label: '删除部门', order: 3, menuType: 'BUTTON', perm: 'system:department:delete', parentId: 14 },
    // 字典管理 BUTTON（parentId=15）
    { key: 'system:dict:add',    icon: '', label: '创建字典', order: 1, menuType: 'BUTTON', perm: 'system:dict:add',    parentId: 15 },
    { key: 'system:dict:edit',   icon: '', label: '编辑字典', order: 2, menuType: 'BUTTON', perm: 'system:dict:edit',   parentId: 15 },
    { key: 'system:dict:delete', icon: '', label: '删除字典', order: 3, menuType: 'BUTTON', perm: 'system:dict:delete', parentId: 15 },
    // 操作日志 BUTTON（parentId=17）
    { key: 'system:log:delete',  icon: '', label: '清理日志', order: 1, menuType: 'BUTTON', perm: 'system:log:delete', parentId: 17 },
    // 系统设置 BUTTON（parentId=10 系统管理）
    { key: 'system:settings:edit', icon: '', label: '编辑设置', order: 5, menuType: 'BUTTON', perm: 'system:settings:edit', parentId: 10 },
  ]

  let created = 0
  let skipped = 0

  for (const btn of buttons) {
    try {
      await prisma.menuItem.create({
        data: {
          ...btn,
          isVisible: true,
          requiredRoles: [],
        }
      })
      created++
    } catch (e) {
      // key 重复则跳过
      skipped++
    }
  }

  console.log(`\n完成：新增 ${created} 个 BUTTON，跳过 ${skipped} 个（已存在）`)

  // 为管理员角色分配所有新 BUTTON
  const adminRoleId = 1
  const allMenus = await prisma.menuItem.findMany({ where: { menuType: 'BUTTON' } })
  
  let roleMenuCreated = 0
  for (const m of allMenus) {
    try {
      await prisma.roleMenu.create({
        data: { roleId: adminRoleId, menuId: m.id }
      })
      roleMenuCreated++
    } catch (e) {
      // 忽略重复
    }
  }

  console.log(`为管理员分配了 ${roleMenuCreated} 个 BUTTON 权限\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
