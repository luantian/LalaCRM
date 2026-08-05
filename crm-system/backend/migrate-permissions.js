/**
 * 若依风格权限迁移脚本
 * 
 * 1. 为所有菜单添加 BUTTON 类型的权限节点（三段式格式）
 * 2. 更新 MENU 的 perm 字段为三段式
 * 3. 更新所有角色的 RoleMenu 关联
 * 4. 清空 RoleModel.permissions[] 字段（后续从菜单表获取）
 * 
 * 三段式格式：module:entity:action
 * 示例：system:user:list, project:project:create, office:dailyreport:submit
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 权限节点定义：每个菜单下的按钮权限
// key = 父菜单key, value = 按钮列表
const BUTTON_DEFS = {
  // 系统管理 - 用户管理
  'users': [
    { key: 'system:user:list', label: '用户列表' },
    { key: 'system:user:query', label: '用户查询' },
    { key: 'system:user:add', label: '用户新增' },
    { key: 'system:user:edit', label: '用户编辑' },
    { key: 'system:user:delete', label: '用户删除' },
    { key: 'system:user:resetpwd', label: '重置密码' },
  ],
  // 系统管理 - 角色管理
  'roles': [
    { key: 'system:role:list', label: '角色列表' },
    { key: 'system:role:query', label: '角色查询' },
    { key: 'system:role:add', label: '角色新增' },
    { key: 'system:role:edit', label: '角色编辑' },
    { key: 'system:role:delete', label: '角色删除' },
  ],
  // 系统管理 - 菜单管理
  'menus': [
    { key: 'system:menu:list', label: '菜单列表' },
    { key: 'system:menu:query', label: '菜单查询' },
    { key: 'system:menu:add', label: '菜单新增' },
    { key: 'system:menu:edit', label: '菜单编辑' },
    { key: 'system:menu:delete', label: '菜单删除' },
  ],
  // 系统管理 - 部门管理
  'departments': [
    { key: 'system:dept:list', label: '部门列表' },
    { key: 'system:dept:query', label: '部门查询' },
    { key: 'system:dept:add', label: '部门新增' },
    { key: 'system:dept:edit', label: '部门编辑' },
    { key: 'system:dept:delete', label: '部门删除' },
  ],
  // 系统管理 - 字典管理
  'dicts': [
    { key: 'system:dict:list', label: '字典列表' },
    { key: 'system:dict:query', label: '字典查询' },
    { key: 'system:dict:add', label: '字典新增' },
    { key: 'system:dict:edit', label: '字典编辑' },
    { key: 'system:dict:delete', label: '字典删除' },
  ],
  // 日志
  'operation-logs': [
    { key: 'monitor:operlog:list', label: '日志列表' },
    { key: 'monitor:operlog:delete', label: '日志删除' },
    { key: 'monitor:operlog:export', label: '日志导出' },
  ],
  'login-logs': [
    { key: 'monitor:loginlog:list', label: '日志列表' },
    { key: 'monitor:loginlog:delete', label: '日志删除' },
  ],
  // 售前管理
  'opportunities': [
    { key: 'crm:opportunity:list', label: '售前列表' },
    { key: 'crm:opportunity:query', label: '售前查询' },
    { key: 'crm:opportunity:add', label: '售前新增' },
    { key: 'crm:opportunity:edit', label: '售前编辑' },
    { key: 'crm:opportunity:delete', label: '售前删除' },
  ],
  // 报价单
  'quotations': [
    { key: 'crm:quotation:list', label: '报价列表' },
    { key: 'crm:quotation:query', label: '报价查询' },
    { key: 'crm:quotation:add', label: '报价新增' },
    { key: 'crm:quotation:edit', label: '报价编辑' },
    { key: 'crm:quotation:delete', label: '报价删除' },
    { key: 'crm:quotation:approve', label: '报价审批' },
  ],
  // 客户管理
  'organizations': [
    { key: 'crm:organization:list', label: '客户列表' },
    { key: 'crm:organization:query', label: '客户查询' },
    { key: 'crm:organization:add', label: '客户新增' },
    { key: 'crm:organization:edit', label: '客户编辑' },
    { key: 'crm:organization:delete', label: '客户删除' },
  ],
  // 项目管理
  'projects': [
    { key: 'project:project:list', label: '项目列表' },
    { key: 'project:project:query', label: '项目查询' },
    { key: 'project:project:add', label: '项目新增' },
    { key: 'project:project:edit', label: '项目编辑' },
    { key: 'project:project:delete', label: '项目删除' },
    { key: 'project:project:archive', label: '项目归档' },
  ],
  // 项目归档
  'sales': [
    { key: 'project:archive:list', label: '归档列表' },
    { key: 'project:archive:query', label: '归档查询' },
    { key: 'project:archive:view', label: '归档查看' },
  ],
  // 费用报销
  'expenses': [
    { key: 'finance:expense:list', label: '费用列表' },
    { key: 'finance:expense:query', label: '费用查询' },
    { key: 'finance:expense:add', label: '费用新增' },
    { key: 'finance:expense:edit', label: '费用编辑' },
    { key: 'finance:expense:delete', label: '费用删除' },
    { key: 'finance:expense:approve', label: '费用审批' },
  ],
  // 日报管理
  'daily-reports': [
    { key: 'office:dailyreport:list', label: '日报列表' },
    { key: 'office:dailyreport:query', label: '日报查询' },
    { key: 'office:dailyreport:add', label: '日报新增' },
    { key: 'office:dailyreport:edit', label: '日报编辑' },
    { key: 'office:dailyreport:delete', label: '日报删除' },
    { key: 'office:dailyreport:approve', label: '日报审批' },
  ],
  // 出差管理
  'business-trips': [
    { key: 'office:trip:list', label: '出差列表' },
    { key: 'office:trip:query', label: '出差查询' },
    { key: 'office:trip:add', label: '出差新增' },
    { key: 'office:trip:edit', label: '出差编辑' },
    { key: 'office:trip:delete', label: '出差删除' },
    { key: 'office:trip:approve', label: '出差审批' },
  ],
  // 考勤打卡
  'check-ins': [
    { key: 'office:checkin:list', label: '打卡列表' },
    { key: 'office:checkin:add', label: '打卡签到' },
  ],
  // 工作总览
  'dashboard': [
    { key: 'portal:dashboard:view', label: '工作总览' },
  ],
};

// 菜单的三段式 perm 映射（DIRECTORY 和根菜单的 perm）
const MENU_PERM_MAP = {
  'dashboard': 'portal:dashboard:view',
  'organizations': 'crm:organization:list',
  'opportunities': 'crm:opportunity:list',
  'quotations': 'crm:quotation:list',
  'projects': 'project:project:list',
  'sales': 'project:archive:list',
  'expenses': 'finance:expense:list',
  'office': null,  // 目录不需要 perm
  'daily-reports': 'office:dailyreport:list',
  'business-trips': 'office:trip:list',
  'check-ins': 'office:checkin:list',
  'system': null,  // 目录不需要 perm
  'users': 'system:user:list',
  'roles': 'system:role:list',
  'menus': 'system:menu:list',
  'departments': 'system:dept:list',
  'dicts': 'system:dict:list',
  'logs': null,  // 目录不需要 perm
  'operation-logs': 'monitor:operlog:list',
  'login-logs': 'monitor:loginlog:list',
};

// 旧权限标识 -> 新三段式权限标识 的映射
const OLD_TO_NEW_PERM = {
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
  console.log('=== 若依风格权限迁移开始 ===\n');

  // 获取所有现有菜单
  const existingMenus = await prisma.menuItem.findMany();
  const menuByKey = {};
  existingMenus.forEach(m => { menuByKey[m.key] = m; });

  // 步骤1：更新现有菜单的 perm 字段为三段式
  console.log('步骤1：更新菜单 perm 字段为三段式');
  for (const [key, perm] of Object.entries(MENU_PERM_MAP)) {
    const menu = menuByKey[key];
    if (!menu) continue;
    
    // 目录不需要 perm，菜单需要
    const newPerm = perm;
    if (menu.perm !== newPerm) {
      await prisma.menuItem.update({
        where: { id: menu.id },
        data: { perm: newPerm }
      });
      console.log(`  更新菜单 ${key}: perm ${menu.perm || '-'} -> ${newPerm || '-'}`);
    }
  }

  // 步骤2：为每个菜单创建 BUTTON 类型权限节点
  console.log('\n步骤2：创建 BUTTON 权限节点');
  let buttonCount = 0;
  for (const [parentKey, buttons] of Object.entries(BUTTON_DEFS)) {
    const parentMenu = menuByKey[parentKey];
    if (!parentMenu) {
      console.log(`  跳过 ${parentKey}: 父菜单不存在`);
      continue;
    }

    for (const btn of buttons) {
      // 检查是否已存在
      const existing = await prisma.menuItem.findUnique({ where: { key: btn.key } });
      if (existing) {
        console.log(`  已存在: ${btn.key}`);
        buttonCount++;
        continue;
      }

      // 创建按钮权限节点
      await prisma.menuItem.create({
        data: {
          key: btn.key,
          label: btn.label,
          menuType: 'BUTTON',
          perm: btn.key,
          order: buttons.indexOf(btn),
          parentId: parentMenu.id,
          isVisible: false,  // 按钮不显示在菜单中
        }
      });
      console.log(`  创建: ${btn.key} (${btn.label}) -> parent:${parentMenu.id}`);
      buttonCount++;
    }
  }
  console.log(`  共创建/更新 ${buttonCount} 个按钮权限节点`);

  // 步骤3：重新获取所有菜单（包括新创建的按钮）
  console.log('\n步骤3：重建角色-菜单关联');
  const allMenus = await prisma.menuItem.findMany();
  const allMenuByKey = {};
  allMenus.forEach(m => { allMenuByKey[m.key] = m; });

  // 定义每个角色应该拥有的按钮权限（基于旧 permissions 映射）
  const roles = await prisma.roleModel.findMany();
  
  for (const role of roles) {
    // 获取该角色当前关联的菜单
    const existingRoleMenus = await prisma.roleMenu.findMany({
      where: { roleId: role.id }
    });
    const existingMenuIds = new Set(existingRoleMenus.map(rm => rm.menuId));

    // 获取该角色的旧权限列表
    const oldPerms = role.permissions || [];
    
    // 将旧权限映射到新权限，找出对应的按钮菜单
    const newPermKeys = new Set();
    for (const oldPerm of oldPerms) {
      const newPerm = OLD_TO_NEW_PERM[oldPerm];
      if (newPerm) {
        // 获取新权限对应的菜单
        const menu = allMenuByKey[newPerm];
        if (menu) {
          newPermKeys.add(newPerm);
          // 同时添加该菜单下的相关按钮
          // 规则：如果角色有 list 权限，则自动拥有该菜单下所有按钮
          const parentMenu = await prisma.menuItem.findUnique({ where: { id: menu.parentId || 0 } });
          if (parentMenu) {
            const childButtons = allMenus.filter(m => m.parentId === parentMenu.id && m.menuType === 'BUTTON');
            // 根据旧权限类型决定分配哪些按钮
            if (oldPerm.startsWith('view_') || oldPerm.startsWith('manage_')) {
              // view 权限 -> list + query 按钮
              childButtons.filter(b => b.key.endsWith(':list') || b.key.endsWith(':query') || b.key.endsWith(':view')).forEach(b => newPermKeys.add(b.key));
            }
            if (oldPerm.startsWith('edit_')) {
              // edit 权限 -> list + query + add + edit 按钮
              childButtons.filter(b => b.key.endsWith(':list') || b.key.endsWith(':query') || b.key.endsWith(':add') || b.key.endsWith(':edit')).forEach(b => newPermKeys.add(b.key));
            }
            if (oldPerm.startsWith('create_') || oldPerm.startsWith('submit_')) {
              // create/submit 权限 -> list + query + add 按钮
              childButtons.filter(b => b.key.endsWith(':list') || b.key.endsWith(':query') || b.key.endsWith(':add')).forEach(b => newPermKeys.add(b.key));
            }
            if (oldPerm.startsWith('approve_')) {
              // approve 权限 -> list + query + approve 按钮
              childButtons.filter(b => b.key.endsWith(':list') || b.key.endsWith(':query') || b.key.endsWith(':approve')).forEach(b => newPermKeys.add(b.key));
            }
          }
        }
      }
    }

    // 系统管理员拥有所有权限
    if (role.roleKey === 'admin') {
      const allButtons = allMenus.filter(m => m.menuType === 'BUTTON');
      allButtons.forEach(b => newPermKeys.add(b.key));
      // 添加所有菜单的权限
      allMenus.forEach(m => { if (m.perm) newPermKeys.add(m.perm); });
    }

    // 将该角色关联的菜单 ID 更新
    // 先删除旧的 RoleMenu 关联
    await prisma.roleMenu.deleteMany({ where: { roleId: role.id } });
    
    // 重新创建关联
    const menuIdsToLink = [];
    for (const permKey of newPermKeys) {
      const menu = allMenuByKey[permKey];
      if (menu) {
        menuIdsToLink.push(menu.id);
        // 同时关联父目录（如果还没关联）
        if (menu.parentId) {
          menuIdsToLink.push(menu.parentId);
          // 再往上找祖父目录
          const parentMenu = await prisma.menuItem.findUnique({ where: { id: menu.parentId } });
          if (parentMenu && parentMenu.parentId) {
            menuIdsToLink.push(parentMenu.parentId);
          }
        }
      }
    }

    // 去重并创建
    const uniqueMenuIds = [...new Set(menuIdsToLink)];
    for (const menuId of uniqueMenuIds) {
      await prisma.roleMenu.create({
        data: {
          roleId: role.id,
          menuId: menuId
        }
      });
    }
    console.log(`  ${role.displayName}(${role.name}): ${uniqueMenuIds.length} 个菜单/按钮关联`);
  }

  // 步骤4：清空 RoleModel.permissions[]（后续改为从菜单表获取）
  console.log('\n步骤4：清空 RoleModel.permissions[] 字段');
  console.log('  注意：先保留旧数据作为备份，后续代码改造完成后再清空');
  // 暂不清空，等代码验证通过后再执行

  // 统计
  const finalMenuCount = await prisma.menuItem.count();
  const finalButtonCount = await prisma.menuItem.count({ where: { menuType: 'BUTTON' } });
  const finalRoleMenuCount = await prisma.roleMenu.count();

  console.log('\n=== 迁移完成 ===');
  console.log(`菜单总数: ${finalMenuCount} (其中 BUTTON: ${finalButtonCount})`);
  console.log(`角色-菜单关联: ${finalRoleMenuCount}`);
  console.log('\n!!! 注意：RoleModel.permissions[] 暂时保留，待代码改造验证后再清空 !!!');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('迁移失败:', err);
  prisma.$disconnect();
  process.exit(1);
});
