const axios = require('axios');
const BASE = 'http://localhost:5000/api';

let adminToken = null;
let salesToken = null;
let viewerToken = null;

function req(method, path, token, data) {
  const config = { method, url: BASE + path, headers: { 'Content-Type': 'application/json' } };
  if (token) config.headers.Authorization = 'Bearer ' + token;
  if (data) config.data = data;
  return axios(config).then(r => ({ status: r.status, data: r.data })).catch(e => {
    if (e.response) return { status: e.response.status, data: e.response.data };
    return { status: 0, data: { error: e.message } };
  });
}

async function loginAll() {
  const r1 = await req('POST', '/auth/login', null, { username: 'admin', password: 'admin123' });
  adminToken = r1.data.token;
  const r2 = await req('POST', '/auth/login', null, { username: 'sales_test', password: 'sales123' });
  salesToken = r2.data.token;
  const r3 = await req('POST', '/auth/login', null, { username: 'viewer_test', password: 'viewer123' });
  viewerToken = r3.data.token;
  console.log('✓ 三个用户登录成功');
}

// ==================== 角色管理深入测试 ====================
async function testRoleManagement() {
  console.log('\n========== 角色管理深入测试 ==========');
  let pass = 0, fail = 0, total = 0;

  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name + ': ' + actual); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 1. 创建测试角色
  console.log('\n[1] 角色CRUD');
  const createRes = await req('POST', '/roles', adminToken, {
    name: 'TEST_ROLE_' + Date.now(),
    displayName: '测试角色',
    description: '用于测试的角色',
    permissions: []
  });
  check('管理员创建角色', createRes.status, 201);
  const testRoleId = createRes.data?.id || createRes.data?.role?.id;

  // 2. 销售创建角色应该403
  const salesCreate = await req('POST', '/roles', salesToken, {
    name: 'SALES_ROLE_' + Date.now(), displayName: '销售创建', description: '测试', permissions: []
  });
  check('销售创建角色(应403)', salesCreate.status, 403);

  // 3. 查询角色列表
  const rolesRes = await req('GET', '/roles', adminToken);
  check('管理员查询角色', rolesRes.status, 200);
  const roles = rolesRes.data?.roles || rolesRes.data || [];
  console.log('    角色数量:', Array.isArray(roles) ? roles.length : '非数组');

  // 4. 销售查询角色应该403
  const salesRoles = await req('GET', '/roles', salesToken);
  check('销售查询角色(应403)', salesRoles.status, 403);

  // 5. 更新角色
  if (testRoleId) {
    const updateRes = await req('PUT', '/roles/' + testRoleId, adminToken, {
      displayName: '更新后的测试角色', description: '已更新'
    });
    check('管理员更新角色', updateRes.status, 200);

    // 销售更新角色应该403
    const salesUpdate = await req('PUT', '/roles/' + testRoleId, salesToken, {
      displayName: '销售更新', description: '测试'
    });
    check('销售更新角色(应403)', salesUpdate.status, 403);

    // 6. 删除测试角色
    const deleteRes = await req('DELETE', '/roles/' + testRoleId, adminToken);
    check('管理员删除角色', deleteRes.status, 200);
  }

  console.log('\n角色管理测试结果: ' + pass + '/' + total + ' 通过');
  return { pass, fail, total };
}

// ==================== 用户-角色分配测试 ====================
async function testUserRoleAssignment() {
  console.log('\n========== 用户-角色分配测试 ==========');
  let pass = 0, fail = 0, total = 0;

  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name + ': ' + actual); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 获取所有角色和用户
  const rolesRes = await req('GET', '/roles', adminToken);
  const roles = rolesRes.data?.roles || rolesRes.data || [];
  const usersRes = await req('GET', '/users', adminToken);
  const users = usersRes.data?.users || usersRes.data || [];
  console.log('  角色数:', roles.length, '用户数:', users.length);

  // 1. 创建新角色
  const newRole = await req('POST', '/roles', adminToken, {
    name: 'TEMP_ROLE_' + Date.now(), displayName: '临时角色', description: '用于分配测试', permissions: []
  });
  check('创建临时角色', newRole.status, 201);
  const newRoleId = newRole.data?.id || newRole.data?.role?.id;

  if (newRoleId) {
    // 2. 将新角色分配给 sales_test
    const salesUser = users.find(u => u.username === 'sales_test');
    if (salesUser) {
      const assignRes = await req('PUT', '/users/' + salesUser.id, adminToken, {
        roleId: newRoleId
      });
      check('分配角色给用户', assignRes.status, 200);

      // 3. 检查用户是否获得新角色的权限（应该变成无权限，因为临时角色没有菜单分配）
      const meRes = await req('GET', '/auth/me', salesToken);
      check('获取更新后用户信息', meRes.status, 200);
      if (meRes.status === 200) {
        console.log('    用户权限:', JSON.stringify(meRes.data.permissions || []).substring(0, 100));
      }
    }

    // 4. 清理：删除临时角色前先移除分配
    if (salesUser) {
      const restoreRes = await req('PUT', '/users/' + salesUser.id, adminToken, {
        roleId: 6  // USER角色
      });
      check('恢复用户原始角色', restoreRes.status, 200);
    }

    const deleteRole = await req('DELETE', '/roles/' + newRoleId, adminToken);
    check('删除临时角色', deleteRole.status, 200);
  }

  // 5. 销售不能修改用户角色
  const salesAssign = await req('PUT', '/users/1', salesToken, { roleId: 6 });
  check('销售修改用户角色(应403)', salesAssign.status, 403);

  console.log('\n用户-角色分配测试结果: ' + pass + '/' + total + ' 通过');
  return { pass, fail, total };
}

// ==================== 菜单权限分配测试 ====================
async function testMenuPermissions() {
  console.log('\n========== 菜单权限分配测试 ==========');
  let pass = 0, fail = 0, total = 0;

  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name + ': ' + actual); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 1. 获取所有菜单
  const menusRes = await req('GET', '/menus', adminToken);
  const menus = menusRes.data?.menus || menusRes.data || [];
  check('获取菜单列表', menusRes.status, 200);

  const dirMenus = menus.filter(m => m.menuType === 'DIR');
  const btnMenus = menus.filter(m => m.menuType === 'BUTTON');
  console.log('  菜单: 总数=' + menus.length + ' 目录=' + dirMenus.length + ' 按钮=' + btnMenus.length);

  // 2. 创建新菜单（目录）
  const createMenu = await req('POST', '/menus', adminToken, {
    key: 'test-dir-' + Date.now(),
    label: '测试目录',
    icon: 'test',
    path: '/test-dir',
    menuType: 'DIR',
    sortOrder: 99
  });
  check('创建测试菜单', createMenu.status, 201);
  const testMenuId = createMenu.data?.id || createMenu.data?.menu?.id;

  if (testMenuId) {
    // 3. 更新菜单
    const updateMenu = await req('PUT', '/menus/' + testMenuId, adminToken, {
      label: '更新后的测试目录', icon: 'updated'
    });
    check('更新菜单', updateMenu.status, 200);

    // 4. 创建子菜单（按钮类型）
    const createBtn = await req('POST', '/menus', adminToken, {
      label: '测试按钮',
      key: 'test-btn-' + Date.now(),
      parentId: testMenuId,
      menuType: 'BUTTON',
      perm: 'test:entity:action',
      path: '',
      component: '',
      icon: 'button'
    });
    check('创建子按钮', createBtn.status, 201);
    const testBtnId = createBtn.data?.id || createBtn.data?.menu?.id;

    // 5. 删除子菜单
    if (testBtnId) {
      const delBtn = await req('DELETE', '/menus/' + testBtnId, adminToken);
      check('删除子按钮', delBtn.status, 200);
    }

    // 6. 删除父菜单
    const delMenu = await req('DELETE', '/menus/' + testMenuId, adminToken);
    check('删除父菜单', delMenu.status, 200);
  }

  // 7. 销售不能创建菜单
  const salesMenu = await req('POST', '/menus', salesToken, {
    key: 'sales-menu', label: '销售菜单', menuType: 'MENU'
  });
  check('销售创建菜单(应403)', salesMenu.status, 403);

  // 8. 角色菜单分配
  const roleMenusRes = await req('GET', '/role-menus/6', adminToken);
  check('获取USER角色菜单', roleMenusRes.status, 200);
  const roleMenus = roleMenusRes.data?.roleMenus || roleMenusRes.data || [];
  console.log('  USER角色已分配菜单数:', Array.isArray(roleMenus) ? roleMenus.length : '?');

  console.log('\n菜单权限分配测试结果: ' + pass + '/' + total + ' 通过');
  return { pass, fail, total };
}

// ==================== 权限隔离测试 ====================
async function testPermissionIsolation() {
  console.log('\n========== 权限隔离测试 ==========');
  let pass = 0, fail = 0, total = 0;

  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name + ': ' + actual); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 1. sales_test 不能访问系统管理模块
  const endpoints = [
    { path: '/users', method: 'GET', desc: '用户列表' },
    { path: '/roles', method: 'GET', desc: '角色列表' },
    { path: '/menus', method: 'GET', desc: '菜单列表' },
    { path: '/role-menus/6', method: 'GET', desc: '角色菜单分配' },
    { path: '/operation-logs', method: 'GET', desc: '操作日志' },
    { path: '/departments', method: 'GET', desc: '部门管理' },
  ];

  console.log('  测试销售用户访问系统管理接口：');
  for (const ep of endpoints) {
    const res = await req(ep.method, ep.path, salesToken);
    check('销售访问' + ep.desc + '(应403)', res.status, 403);
  }

  // 2. 管理员可以访问所有接口
  console.log('  测试管理员访问系统管理接口：');
  for (const ep of endpoints) {
    const res = await req(ep.method, ep.path, adminToken);
    check('管理员访问' + ep.desc, res.status, 200);
  }

  // 3. 销售可以访问业务模块
  const bizEndpoints = [
    { path: '/organizations', method: 'GET', desc: '客户列表' },
    { path: '/projects', method: 'GET', desc: '项目列表' },
    { path: '/opportunities', method: 'GET', desc: '售前列表' },
    { path: '/contracts', method: 'GET', desc: '合同列表' },
    { path: '/daily-reports', method: 'GET', desc: '日报列表' },
    { path: '/expenses', method: 'GET', desc: '报销列表' },
    { path: '/procurements', method: 'GET', desc: '采购列表' },
    { path: '/invoices', method: 'GET', desc: '发票列表' },
    { path: '/quotations', method: 'GET', desc: '报价单列表' },
  ];

  console.log('  测试销售用户访问业务模块：');
  for (const ep of bizEndpoints) {
    const res = await req(ep.method, ep.path, salesToken);
    check('销售访问' + ep.desc, res.status, 200);
  }

  console.log('\n权限隔离测试结果: ' + pass + '/' + total + ' 通过');
  return { pass, fail, total };
}

// ==================== 越权操作测试 ====================
async function testUnauthorizedOperations() {
  console.log('\n========== 越权操作测试 ==========');
  let pass = 0, fail = 0, total = 0;

  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name + ': ' + actual); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 1. 销售不能修改其他用户的日报
  const salesCreateReport = await req('POST', '/daily-reports', salesToken, {
    reportDate: new Date().toISOString().split('T')[0],
    content: '销售日报测试',
    tomorrowPlan: '测试',
    issues: '无',
    status: 'DRAFT'
  });
  check('销售创建日报', salesCreateReport.status, 201);
  const reportId = salesCreateReport.data?.id || salesCreateReport.data?.report?.id;

  if (reportId) {
    // viewer尝试修改sales的日报
    const viewerEdit = await req('PUT', '/daily-reports/' + reportId, viewerToken, {
      content: '观察者修改'
    });
    check('观察者修改销售日报(应403)', viewerEdit.status, 403);

    // viewer尝试删除sales的日报
    const viewerDelete = await req('DELETE', '/daily-reports/' + reportId, viewerToken);
    check('观察者删除销售日报(应403)', viewerDelete.status, 403);
  }

  // 2. 销售不能修改其他用户的报销
  const viewerSubmitExpense = await req('POST', '/expenses', viewerToken, {
    title: '观察者报销_' + Date.now(),
    items: [{ category: '交通', amount: 100, description: '测试交通费' }]
  });
  check('观察者创建报销', viewerSubmitExpense.status, 201);
  const expenseId = viewerSubmitExpense.data?.id || viewerSubmitExpense.data?.expense?.id;
  if (viewerSubmitExpense.status !== 201) console.log('    报销创建返回:', JSON.stringify(viewerSubmitExpense.data));

  if (expenseId) {
    // 销售尝试提交观察者的报销
    const salesSubmit = await req('POST', '/expenses/' + expenseId + '/submit', salesToken);
    check('销售提交观察者报销(应403或404)', salesSubmit.status === 403 || salesSubmit.status === 404, true);
  }

  // 3. 销售不能审批日报
  const salesApprove = await req('POST', '/daily-reports/' + (reportId || 1) + '/approve', salesToken, {
    approved: true, comment: '同意'
  });
  check('销售审批日报(应403)', salesApprove.status, 403);

  // 4. 观察者不能创建客户（如果只有查看权限）
  // 先检查viewer的权限
  const viewerMe = await req('GET', '/auth/me', viewerToken);
  if (viewerMe.status === 200) {
    const hasOrgCreate = viewerMe.data.permissions?.includes('crm:organization:create');
    console.log('  观察者有客户创建权限:', hasOrgCreate);
  }

  console.log('\n越权操作测试结果: ' + pass + '/' + total + ' 通过');
  return { pass, fail, total };
}

// ==================== 主函数 ====================
async function main() {
  console.log('========================================');
  console.log('权限与角色管理深入测试');
  console.log('========================================');

  await loginAll();

  const results = [];
  results.push(await testRoleManagement());
  results.push(await testUserRoleAssignment());
  results.push(await testMenuPermissions());
  results.push(await testPermissionIsolation());
  results.push(await testUnauthorizedOperations());

  console.log('\n========================================');
  console.log('最终汇总');
  console.log('========================================');
  const totalPass = results.reduce((sum, r) => sum + r.pass, 0);
  const totalFail = results.reduce((sum, r) => sum + r.fail, 0);
  const totalAll = results.reduce((sum, r) => sum + r.total, 0);
  console.log('总测试数:', totalAll);
  console.log('通过:', totalPass);
  console.log('失败:', totalFail);
  console.log('通过率:', ((totalPass / totalAll) * 100).toFixed(2) + '%');
  console.log('========================================');
}

main().catch(console.error);
