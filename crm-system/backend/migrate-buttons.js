/**
 * 若依风格权限迁移 - 第二步：创建按钮节点 + 重建 RoleMenu
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BUTTON_DEFS = {
  'users': [
    { key: 'system:user:list', label: '用户列表' },
    { key: 'system:user:query', label: '用户查询' },
    { key: 'system:user:add', label: '用户新增' },
    { key: 'system:user:edit', label: '用户编辑' },
    { key: 'system:user:delete', label: '用户删除' },
    { key: 'system:user:resetpwd', label: '重置密码' },
  ],
  'roles': [
    { key: 'system:role:list', label: '角色列表' },
    { key: 'system:role:query', label: '角色查询' },
    { key: 'system:role:add', label: '角色新增' },
    { key: 'system:role:edit', label: '角色编辑' },
    { key: 'system:role:delete', label: '角色删除' },
  ],
  'menus': [
    { key: 'system:menu:list', label: '菜单列表' },
    { key: 'system:menu:add', label: '菜单新增' },
    { key: 'system:menu:edit', label: '菜单编辑' },
    { key: 'system:menu:delete', label: '菜单删除' },
  ],
  'departments': [
    { key: 'system:dept:list', label: '部门列表' },
    { key: 'system:dept:add', label: '部门新增' },
    { key: 'system:dept:edit', label: '部门编辑' },
    { key: 'system:dept:delete', label: '部门删除' },
  ],
  'dicts': [
    { key: 'system:dict:list', label: '字典列表' },
    { key: 'system:dict:add', label: '字典新增' },
    { key: 'system:dict:edit', label: '字典编辑' },
    { key: 'system:dict:delete', label: '字典删除' },
  ],
  'operation-logs': [
    { key: 'monitor:operlog:list', label: '日志列表' },
    { key: 'monitor:operlog:delete', label: '日志删除' },
    { key: 'monitor:operlog:export', label: '日志导出' },
  ],
  'login-logs': [
    { key: 'monitor:loginlog:list', label: '登录日志列表' },
    { key: 'monitor:loginlog:delete', label: '日志删除' },
  ],
  'opportunities': [
    { key: 'crm:opportunity:list', label: '售前列表' },
    { key: 'crm:opportunity:query', label: '售前查询' },
    { key: 'crm:opportunity:add', label: '售前新增' },
    { key: 'crm:opportunity:edit', label: '售前编辑' },
    { key: 'crm:opportunity:delete', label: '售前删除' },
  ],
  'quotations': [
    { key: 'crm:quotation:list', label: '报价列表' },
    { key: 'crm:quotation:query', label: '报价查询' },
    { key: 'crm:quotation:add', label: '报价新增' },
    { key: 'crm:quotation:edit', label: '报价编辑' },
    { key: 'crm:quotation:delete', label: '报价删除' },
    { key: 'crm:quotation:approve', label: '报价审批' },
  ],
  'organizations': [
    { key: 'crm:organization:list', label: '客户列表' },
    { key: 'crm:organization:query', label: '客户查询' },
    { key: 'crm:organization:add', label: '客户新增' },
    { key: 'crm:organization:edit', label: '客户编辑' },
    { key: 'crm:organization:delete', label: '客户删除' },
  ],
  'projects': [
    { key: 'project:project:list', label: '项目列表' },
    { key: 'project:project:query', label: '项目查询' },
    { key: 'project:project:add', label: '项目新增' },
    { key: 'project:project:edit', label: '项目编辑' },
    { key: 'project:project:delete', label: '项目删除' },
    { key: 'project:project:archive', label: '项目归档' },
  ],
  'sales': [
    { key: 'project:archive:list', label: '归档列表' },
    { key: 'project:archive:query', label: '归档查询' },
    { key: 'project:archive:view', label: '归档查看' },
  ],
  'expenses': [
    { key: 'finance:expense:list', label: '费用列表' },
    { key: 'finance:expense:query', label: '费用查询' },
    { key: 'finance:expense:add', label: '费用新增' },
    { key: 'finance:expense:edit', label: '费用编辑' },
    { key: 'finance:expense:delete', label: '费用删除' },
    { key: 'finance:expense:approve', label: '费用审批' },
  ],
  'daily-reports': [
    { key: 'office:dailyreport:list', label: '日报列表' },
    { key: 'office:dailyreport:query', label: '日报查询' },
    { key: 'office:dailyreport:add', label: '日报新增' },
    { key: 'office:dailyreport:edit', label: '日报编辑' },
    { key: 'office:dailyreport:delete', label: '日报删除' },
    { key: 'office:dailyreport:approve', label: '日报审批' },
  ],
  'business-trips': [
    { key: 'office:trip:list', label: '出差列表' },
    { key: 'office:trip:query', label: '出差查询' },
    { key: 'office:trip:add', label: '出差新增' },
    { key: 'office:trip:edit', label: '出差编辑' },
    { key: 'office:trip:delete', label: '出差删除' },
    { key: 'office:trip:approve', label: '出差审批' },
  ],
  'check-ins': [
    { key: 'office:checkin:list', label: '打卡列表' },
    { key: 'office:checkin:add', label: '打卡签到' },
  ],
  'dashboard': [
    { key: 'portal:dashboard:view', label: '工作总览' },
  ],
};

// 旧权限标识 -> 新三段式
const OLD_TO_NEW = {
  'view_organizations': 'crm:organization:list',
  'edit_organizations': 'crm:organization:edit',
  'view_projects': 'project:project:list',
  'edit_projects': 'project:project:edit',
  'create_projects': 'project:project:add',
  'view_opportunities': 'crm:opportunity:list',
  'edit_opportunities': 'crm:opportunity:edit',
  'view_quotations': 'crm:quotation:list',
  'edit_quotations': 'crm:quotation:edit',
  'approve_quotations': 'crm:quotation:approve',
  'view_contracts': 'project:archive:list',
  'edit_contracts': 'project:archive:edit',
  'approve_contracts': 'project:archive:approve',
  'view_procurements': 'project:archive:list',
  'edit_procurements': 'project:archive:edit',
  'approve_procurements': 'project:archive:approve',
  'view_business_trips': 'office:trip:list',
  'submit_trips': 'office:trip:add',
  'approve_business_trips': 'office:trip:approve',
  'view_expenses': 'finance:expense:list',
  'submit_expenses': 'finance:expense:add',
  'approve_expenses': 'finance:expense:approve',
  'view_invoices': 'finance:expense:list',
  'edit_invoices': 'finance:expense:edit',
  'view_reports': 'office:dailyreport:list',
  'create_reports': 'office:dailyreport:add',
  'manage_system': 'system:manage',
};

async function main() {
  console.log('=== 步骤2: 创建 BUTTON 权限节点 ===\n');
  
  const existingMenus = await prisma.menuItem.findMany();
  const menuByKey = {};
  existingMenus.forEach(m => { menuByKey[m.key] = m; });
  
  let created = 0;
  for (const [parentKey, buttons] of Object.entries(BUTTON_DEFS)) {
    const parentMenu = menuByKey[parentKey];
    if (!parentMenu) {
      console.log('  跳过 ' + parentKey + ': 父菜单不存在');
      continue;
    }
    
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const existing = await prisma.menuItem.findUnique({ where: { key: btn.key } });
      if (existing) {
        continue;
      }
      
      await prisma.menuItem.create({
        data: {
          key: btn.key,
          label: btn.label,
          menuType: 'BUTTON',
          perm: btn.key,
          order: i,
          parentId: parentMenu.id,
          isVisible: false,
          icon: ''
        }
      });
      console.log('  创建: ' + btn.key + ' -> parent:' + parentMenu.id);
      created++;
    }
  }
  console.log('\n  共创建 ' + created + ' 个按钮权限节点');

  // 步骤3: 重建 RoleMenu 关联
  console.log('\n=== 步骤3: 重建角色-菜单关联 ===\n');
  
  const allMenus = await prisma.menuItem.findMany();
  const allMenuByKey = {};
  const allMenuById = {};
  allMenus.forEach(m => { allMenuByKey[m.key] = m; allMenuById[m.id] = m; });
  
  // 定义每个角色应该拥有的按钮权限（直接定义，不依赖旧permissions）
  const ROLE_BUTTON_PERMS = {
    'admin': 'ALL', // 所有权限
    'sales_manager': [
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add', 'office:dailyreport:edit',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add', 'finance:expense:edit',
      'finance:expense:approve',
      'office:trip:list', 'office:trip:query', 'office:trip:add', 'office:trip:edit',
      'project:archive:list', 'project:archive:query', 'project:archive:view',
      'crm:quotation:list', 'crm:quotation:query', 'crm:quotation:add', 'crm:quotation:edit', 'crm:quotation:approve',
      'crm:opportunity:list', 'crm:opportunity:query', 'crm:opportunity:add', 'crm:opportunity:edit',
      'crm:organization:list', 'crm:organization:query', 'crm:organization:add', 'crm:organization:edit',
    ],
    'sales_rep': [
      'crm:organization:list', 'crm:organization:query', 'crm:organization:add', 'crm:organization:edit',
      'crm:opportunity:list', 'crm:opportunity:query', 'crm:opportunity:add', 'crm:opportunity:edit',
      'crm:quotation:list', 'crm:quotation:query', 'crm:quotation:add', 'crm:quotation:edit',
      'project:archive:list', 'project:archive:query', 'project:archive:view',
      'office:trip:list', 'office:trip:query', 'office:trip:add', 'office:trip:edit',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add', 'finance:expense:edit',
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add', 'office:dailyreport:edit',
    ],
    'project_manager': [
      'project:project:list', 'project:project:query', 'project:project:add', 'project:project:edit',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add', 'finance:expense:edit',
      'office:trip:list', 'office:trip:query', 'office:trip:add', 'office:trip:edit',
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add', 'office:dailyreport:edit', 'office:dailyreport:approve',
      'project:archive:list', 'project:archive:query', 'project:archive:view',
    ],
    'finance_specialist': [
      'crm:organization:list', 'crm:organization:query', 'crm:organization:edit',
      'project:project:list', 'project:project:query', 'project:project:add', 'project:project:edit',
      'crm:opportunity:list', 'crm:opportunity:query', 'crm:opportunity:edit',
      'crm:quotation:list', 'crm:quotation:query', 'crm:quotation:edit',
      'project:archive:list', 'project:archive:query', 'project:archive:view',
      'office:trip:list', 'office:trip:query', 'office:trip:add',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add', 'finance:expense:edit', 'finance:expense:approve',
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add',
    ],
    'employee': [
      'project:project:list', 'project:project:query',
      'office:trip:list', 'office:trip:query', 'office:trip:add',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add',
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add',
      'portal:dashboard:view',
    ],
    'tech_staff': [
      'project:project:list', 'project:project:query',
      'crm:organization:list', 'crm:organization:query',
      'office:trip:list', 'office:trip:query', 'office:trip:add',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add',
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add',
      'office:checkin:list', 'office:checkin:add',
      'portal:dashboard:view',
    ],
    'business_manager': [
      'crm:organization:list', 'crm:organization:query', 'crm:organization:add', 'crm:organization:edit',
      'crm:opportunity:list', 'crm:opportunity:query', 'crm:opportunity:add', 'crm:opportunity:edit',
      'crm:quotation:list', 'crm:quotation:query', 'crm:quotation:add', 'crm:quotation:edit', 'crm:quotation:approve',
      'office:trip:list', 'office:trip:query', 'office:trip:add', 'office:trip:edit',
      'office:dailyreport:list', 'office:dailyreport:query', 'office:dailyreport:add', 'office:dailyreport:edit',
      'finance:expense:list', 'finance:expense:query', 'finance:expense:add', 'finance:expense:edit',
    ],
  };
  
  const roles = await prisma.roleModel.findMany();
  
  for (const role of roles) {
    const permKeys = ROLE_BUTTON_PERMS[role.roleKey];
    if (!permKeys) {
      console.log('  跳过 ' + role.displayName + ': 未定义权限');
      continue;
    }
    
    // 收集需要关联的菜单 ID
    const menuIds = new Set();
    
    // 添加已有的父菜单关联（保留原有菜单可见性）
    const existingRoleMenus = await prisma.roleMenu.findMany({
      where: { roleId: role.id }
    });
    existingRoleMenus.forEach(rm => {
      const m = allMenuById[rm.menuId];
      // 只保留非 BUTTON 类型的已有菜单
      if (m && m.menuType !== 'BUTTON') {
        menuIds.add(rm.menuId);
      }
    });
    
    if (permKeys === 'ALL') {
      // 管理员: 所有菜单 + 所有按钮
      allMenus.forEach(m => menuIds.add(m.id));
    } else {
      for (const permKey of permKeys) {
        const menu = allMenuByKey[permKey];
        if (menu) {
          menuIds.add(menu.id);
          // 确保父菜单链也被关联
          let current = menu;
          while (current.parentId) {
            menuIds.add(current.parentId);
            current = allMenuById[current.parentId];
            if (!current) break;
          }
        }
      }
    }
    
    // 删除旧关联，创建新关联
    await prisma.roleMenu.deleteMany({ where: { roleId: role.id } });
    
    const idsArray = Array.from(menuIds);
    for (const menuId of idsArray) {
      await prisma.roleMenu.create({
        data: { roleId: role.id, menuId: menuId }
      });
    }
    
    const buttonCount = idsArray.filter(id => allMenuById[id] && allMenuById[id].menuType === 'BUTTON').length;
    const menuCount = idsArray.length - buttonCount;
    console.log('  ' + role.displayName + ': ' + menuCount + ' 个菜单 + ' + buttonCount + ' 个按钮 = ' + idsArray.length + ' 个关联');
  }
  
  // 最终统计
  const totalMenus = await prisma.menuItem.count();
  const totalButtons = await prisma.menuItem.count({ where: { menuType: 'BUTTON' } });
  const totalRoleMenus = await prisma.roleMenu.count();
  
  console.log('\n=== 完成 ===');
  console.log('菜单总数: ' + totalMenus + ' (按钮: ' + totalButtons + ')');
  console.log('角色-菜单关联: ' + totalRoleMenus);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('失败:', err.message);
  prisma.$disconnect();
  process.exit(1);
});
