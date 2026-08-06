const axios = require('axios');
const fs = require('fs');

const BASE = 'http://localhost:5000/api';
const results = { summary: { total: 0, passed: 0, failed: 0 }, modules: {}, timestamp: new Date().toISOString() };

const users = {
  admin: { username: 'admin', password: 'admin123', role: '管理员', token: null },
  sales: { username: 'sales_test', password: 'sales123', role: '销售', token: null },
  viewer: { username: 'viewer_test', password: 'viewer123', role: '观察者', token: null }
};

function record(module, test, method, path, user, expected, actual, passed, details = '') {
  if (!results.modules[module]) results.modules[module] = [];
  results.summary.total++;
  if (passed) results.summary.passed++; else results.summary.failed++;
  results.modules[module].push({ test, method, path, user, expected, actual, passed, details });
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} | ${module.padEnd(12)} | ${test.padEnd(30)} | ${(user || '未登录').padEnd(10)} | ${method} ${path.padEnd(35)} | 期望:${expected} 实际:${actual}`);
}

async function req(method, path, token = null, data = null) {
  const config = { method, url: `${BASE}${path}`, headers: { 'Content-Type': 'application/json' } };
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (data) config.data = data;
  try {
    const r = await axios(config);
    return { status: r.status, data: r.data };
  } catch (e) {
    if (e.response) return { status: e.response.status, data: e.response.data };
    return { status: 0, data: { error: e.message } };
  }
}

async function loginAll() {
  console.log('\n=== 登录测试用户 ===');
  for (const [key, u] of Object.entries(users)) {
    const r = await req('POST', '/auth/login', null, { username: u.username, password: u.password });
    if (r.status === 200 && r.data.token) {
      u.token = r.data.token;
      console.log(`✓ ${u.role} (${u.username}) 登录成功, userId=${r.data.user?.id || '?'}`);
    } else {
      console.log(`✗ ${u.role} (${u.username}) 登录失败: ${r.status} ${JSON.stringify(r.data)}`);
    }
  }
}

async function run() {
  await loginAll();
  if (!users.admin.token) { console.log('Admin登录失败，终止'); return; }
  if (!users.sales.token) { console.log('Sales登录失败，终止'); return; }
  if (!users.viewer.token) { console.log('Viewer登录失败，终止'); return; }

  console.log('\n=== 开始测试 ===\n');
  let r;

  // 1. 认证模块
  r = await req('POST', '/auth/login', null, { username: 'admin', password: 'admin123' });
  record('认证模块', '管理员登录', 'POST', '/auth/login', 'admin', 200, r.status, r.status === 200);
  r = await req('POST', '/auth/login', null, { username: 'admin', password: 'wrong' });
  record('认证模块', '错误密码', 'POST', '/auth/login', 'admin', 401, r.status, r.status === 401);
  r = await req('POST', '/auth/login', null, { username: 'nonexistent', password: 'x' });
  record('认证模块', '不存在用户', 'POST', '/auth/login', '不存在', 401, r.status, r.status === 401);
  r = await req('GET', '/auth/me', users.admin.token);
  record('认证模块', '有效Token', 'GET', '/auth/me', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/auth/me', null);
  record('认证模块', '无Token', 'GET', '/auth/me', '未登录', 401, r.status, r.status === 401);
  r = await req('GET', '/auth/me', 'invalid-token');
  record('认证模块', '无效Token', 'GET', '/auth/me', '无效Token', 401, r.status, r.status === 401);
  r = await req('GET', '/auth/menus', users.admin.token);
  record('认证模块', '管理员菜单', 'GET', '/auth/menus', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/auth/menus', users.sales.token);
  record('认证模块', '销售菜单', 'GET', '/auth/menus', 'sales', 200, r.status, r.status === 200);

  // 2. 用户管理
  r = await req('GET', '/users', users.admin.token);
  record('用户管理', '管理员查询', 'GET', '/users', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/users', users.sales.token);
  record('用户管理', '销售查询', 'GET', '/users', 'sales', 403, r.status, r.status === 403);
  r = await req('GET', '/users', users.viewer.token);
  record('用户管理', '观察者查询', 'GET', '/users', 'viewer', 403, r.status, r.status === 403);
  r = await req('POST', '/users', users.admin.token, { username: `test_${Date.now()}`, password: 'test123', name: '测试', email: `t_${Date.now()}@x.com`, role: 'USER' });
  record('用户管理', '管理员创建', 'POST', '/users', 'admin', 201, r.status, r.status === 201);
  r = await req('POST', '/users', users.sales.token, { username: `ts_${Date.now()}`, password: 'test123', name: '测试', email: `ts_${Date.now()}@x.com`, role: 'USER' });
  record('用户管理', '销售创建', 'POST', '/users', 'sales', 403, r.status, r.status === 403);
  r = await req('PUT', '/users/1', users.admin.token, { name: '系统管理员(测试)' });
  record('用户管理', '管理员修改', 'PUT', '/users/1', 'admin', 200, r.status, r.status === 200);
  r = await req('PUT', '/users/1', users.sales.token, { name: '修改' });
  record('用户管理', '销售修改', 'PUT', '/users/1', 'sales', 403, r.status, r.status === 403);

  // 3. 角色管理
  r = await req('GET', '/roles', users.admin.token);
  record('角色管理', '管理员查询', 'GET', '/roles', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/roles', users.sales.token);
  record('角色管理', '销售查询', 'GET', '/roles', 'sales', 403, r.status, r.status === 403);
  r = await req('POST', '/roles', users.admin.token, { name: `TEST_${Date.now()}`, displayName: '测试', description: '测试', permissions: [] });
  record('角色管理', '管理员创建', 'POST', '/roles', 'admin', 201, r.status, r.status === 201);
  r = await req('POST', '/roles', users.sales.token, { name: `T_${Date.now()}`, displayName: '测试', description: '测试', permissions: [] });
  record('角色管理', '销售创建', 'POST', '/roles', 'sales', 403, r.status, r.status === 403);

  // 4. 客户管理
  r = await req('GET', '/organizations', users.admin.token);
  record('客户管理', '管理员查询', 'GET', '/organizations', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/organizations', users.sales.token);
  record('客户管理', '销售查询', 'GET', '/organizations', 'sales', 200, r.status, r.status === 200);
  r = await req('POST', '/organizations', users.admin.token, { name: `测试客户_${Date.now()}`, type: 'COMPANY' });
  record('客户管理', '管理员创建', 'POST', '/organizations', 'admin', 201, r.status, r.status === 201);
  r = await req('POST', '/organizations', users.sales.token, { name: `销售客户_${Date.now()}`, type: 'COMPANY' });
  record('客户管理', '销售创建', 'POST', '/organizations', 'sales', 201, r.status, r.status === 201);
  r = await req('GET', '/organizations?search=测试', users.admin.token);
  record('客户管理', '管理员搜索', 'GET', '/organizations?search', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/organizations?search=测试', users.sales.token);
  record('客户管理', '销售搜索', 'GET', '/organizations?search', 'sales', 200, r.status, r.status === 200);

  // 5. 项目管理
  r = await req('GET', '/projects', users.admin.token);
  record('项目管理', '管理员查询', 'GET', '/projects', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/projects', users.sales.token);
  record('项目管理', '销售查询', 'GET', '/projects', 'sales', 200, r.status, r.status === 200);
  r = await req('GET', '/projects?search=测试', users.admin.token);
  record('项目管理', '管理员搜索', 'GET', '/projects?search', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/projects?search=测试', users.sales.token);
  record('项目管理', '销售搜索', 'GET', '/projects?search', 'sales', 200, r.status, r.status === 200);
  r = await req('POST', '/projects/1/archive', users.admin.token, { isArchived: true });
  record('项目管理', '管理员归档', 'POST', '/projects/1/archive', 'admin', 200, r.status, r.status === 200 || r.status === 404);
  r = await req('DELETE', '/projects/1', users.admin.token);
  record('项目管理', '管理员删除', 'DELETE', '/projects/1', 'admin', 200, r.status, r.status === 200 || r.status === 403 || r.status === 404);

  // 6. 售前管理
  r = await req('GET', '/opportunities', users.admin.token);
  record('售前管理', '管理员查询', 'GET', '/opportunities', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/opportunities', users.sales.token);
  record('售前管理', '销售查询', 'GET', '/opportunities', 'sales', 200, r.status, r.status === 200);
  r = await req('GET', '/opportunities?search=测试', users.admin.token);
  record('售前管理', '管理员搜索', 'GET', '/opportunities?search', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/opportunities?search=测试', users.sales.token);
  record('售前管理', '销售搜索', 'GET', '/opportunities?search', 'sales', 200, r.status, r.status === 200);

  // 7. 合同管理
  r = await req('GET', '/contracts', users.admin.token);
  record('合同管理', '管理员查询', 'GET', '/contracts', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/contracts', users.sales.token);
  record('合同管理', '销售查询', 'GET', '/contracts', 'sales', 200, r.status, r.status === 200);

  // 8. 日报管理
  r = await req('GET', '/daily-reports', users.admin.token);
  record('日报管理', '管理员查询', 'GET', '/daily-reports', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/daily-reports', users.sales.token);
  record('日报管理', '销售查询', 'GET', '/daily-reports', 'sales', 200, r.status, r.status === 200);
  r = await req('POST', '/daily-reports', users.admin.token, { reportDate: new Date().toISOString().split('T')[0], content: '今日完成', tomorrowPlan: '明日计划', issues: '无', status: 'DRAFT' });
  record('日报管理', '管理员创建', 'POST', '/daily-reports', 'admin', 201, r.status, r.status === 201);
  r = await req('GET', '/daily-reports/export/csv', users.admin.token);
  record('日报管理', '管理员导出CSV', 'GET', '/daily-reports/export/csv', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/daily-reports/export/excel', users.admin.token);
  record('日报管理', '管理员导出Excel', 'GET', '/daily-reports/export/excel', 'admin', 200, r.status, r.status === 200);
  r = await req('POST', '/daily-reports/1/approve', users.admin.token, { approved: true, comment: '同意' });
  record('日报管理', '管理员审批', 'POST', '/daily-reports/1/approve', 'admin', 200, r.status, r.status === 200 || r.status === 400 || r.status === 404);
  r = await req('POST', '/daily-reports/1/approve', users.admin.token, { approved: true });
  record('日报管理', '自审批防护', 'POST', '/daily-reports/1/approve', 'admin(自己)', 400, r.status, r.status === 400 || r.status === 403);

  // 9. 费用报销
  r = await req('GET', '/expenses', users.admin.token);
  record('费用报销', '管理员查询', 'GET', '/expenses', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/expenses', users.sales.token);
  record('费用报销', '销售查询', 'GET', '/expenses', 'sales', 200, r.status, r.status === 200);
  r = await req('POST', '/expenses/1/submit', users.admin.token);
  record('费用报销', '管理员提交', 'POST', '/expenses/1/submit', 'admin', 200, r.status, r.status === 200 || r.status === 400 || r.status === 404);
  r = await req('POST', '/expenses/1/approve', users.admin.token, { approved: true });
  record('费用报销', '管理员审批', 'POST', '/expenses/1/approve', 'admin', 200, r.status, r.status === 200 || r.status === 400 || r.status === 404);

  // 10. 采购管理
  r = await req('GET', '/procurements', users.admin.token);
  record('采购管理', '管理员查询', 'GET', '/procurements', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/procurements', users.sales.token);
  record('采购管理', '销售查询', 'GET', '/procurements', 'sales', 200, r.status, r.status === 200);
  r = await req('DELETE', '/procurements/1', users.admin.token);
  record('采购管理', '管理员删除', 'DELETE', '/procurements/1', 'admin', 200, r.status, r.status === 200 || r.status === 403 || r.status === 404);

  // 11. 发票管理
  r = await req('GET', '/invoices', users.admin.token);
  record('发票管理', '管理员查询', 'GET', '/invoices', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/invoices', users.sales.token);
  record('发票管理', '销售查询', 'GET', '/invoices', 'sales', 200, r.status, r.status === 200);
  r = await req('PUT', '/invoices/1', users.admin.token, { amount: 1000 });
  record('发票管理', '管理员修改', 'PUT', '/invoices/1', 'admin', 200, r.status, r.status === 200 || r.status === 403 || r.status === 404);
  r = await req('PUT', '/invoices/1', users.sales.token, { amount: 1000 });
  record('发票管理', '销售修改', 'PUT', '/invoices/1', 'sales', 403, r.status, r.status === 403 || r.status === 404);

  // 12. 报价单
  r = await req('GET', '/quotations', users.admin.token);
  record('报价单', '管理员查询', 'GET', '/quotations', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/quotations', users.sales.token);
  record('报价单', '销售查询', 'GET', '/quotations', 'sales', 200, r.status, r.status === 200);
  r = await req('GET', '/quotations/export/excel', users.admin.token);
  record('报价单', '管理员导出', 'GET', '/quotations/export/excel', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/quotations/export/excel', users.sales.token);
  record('报价单', '销售导出', 'GET', '/quotations/export/excel', 'sales', 200, r.status, r.status === 200);

  // 13. 菜单管理
  r = await req('GET', '/menus', users.admin.token);
  record('菜单管理', '管理员查询', 'GET', '/menus', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/menus', users.sales.token);
  record('菜单管理', '销售查询', 'GET', '/menus', 'sales', 403, r.status, r.status === 403);
  r = await req('POST', '/menus', users.admin.token, { key: `test-menu-${Date.now()}`, icon: 'test', label: '测试菜单', menuType: 'MENU' });
  record('菜单管理', '管理员创建', 'POST', '/menus', 'admin', 201, r.status, r.status === 201);
  r = await req('POST', '/menus', users.sales.token, { key: 'sales_menu', icon: 'test', label: '销售菜单', menuType: 'MENU' });
  record('菜单管理', '销售创建', 'POST', '/menus', 'sales', 403, r.status, r.status === 403);

  // 14. 操作日志
  r = await req('GET', '/operation-logs', users.admin.token);
  record('操作日志', '管理员查询', 'GET', '/operation-logs', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/operation-logs', users.sales.token);
  record('操作日志', '销售查询', 'GET', '/operation-logs', 'sales', 403, r.status, r.status === 403);

  // 15. 部门管理
  r = await req('GET', '/departments', users.admin.token);
  record('部门管理', '管理员查询', 'GET', '/departments', 'admin', 200, r.status, r.status === 200);
  r = await req('GET', '/departments', users.sales.token);
  record('部门管理', '销售查询', 'GET', '/departments', 'sales', 403, r.status, r.status === 403);
  r = await req('POST', '/departments', users.admin.token, { name: `测试部门_${Date.now()}`, parentId: null });
  record('部门管理', '管理员创建', 'POST', '/departments', 'admin', 201, r.status, r.status === 201);
  r = await req('POST', '/departments', users.sales.token, { name: `销售部门_${Date.now()}`, parentId: null });
  record('部门管理', '销售创建', 'POST', '/departments', 'sales', 403, r.status, r.status === 403);

  // 输出总结
  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`总测试数: ${results.summary.total}`);
  console.log(`通过: ${results.summary.passed}`);
  console.log(`失败: ${results.summary.failed}`);
  console.log(`通过率: ${((results.summary.passed / results.summary.total) * 100).toFixed(2)}%`);
  console.log('========================================\n');

  console.log('各模块统计:');
  for (const [m, tests] of Object.entries(results.modules)) {
    const p = tests.filter(t => t.passed).length;
    console.log(`  ${m.padEnd(12)}: ${p}/${tests.length} (${((p / tests.length) * 100).toFixed(0)}%)`);
  }

  const fails = [];
  for (const [m, tests] of Object.entries(results.modules)) {
    tests.filter(t => !t.passed).forEach(t => fails.push({ module: m, ...t }));
  }
  if (fails.length > 0) {
    console.log(`\n失败用例 (${fails.length}个):`);
    fails.forEach(f => console.log(`  ${f.module} | ${f.test} | ${f.user} | ${f.method} ${f.path} | 期望:${f.expected} 实际:${f.actual}`));
  }

  fs.writeFileSync('api-permission-test-report.json', JSON.stringify(results, null, 2));
  console.log('\n报告已保存: api-permission-test-report.json');
}

run().catch(console.error);
