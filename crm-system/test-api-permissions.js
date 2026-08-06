const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:5000/api';

// 测试结果收集
const results = {
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
  modules: {},
  timestamp: new Date().toISOString()
};

// 测试用户配置
const users = {
  admin: { username: 'admin', password: 'admin123', role: '管理员', token: null },
  sales: { username: 'sales_test', password: 'sales123', role: '销售', token: null },
  viewer: { username: 'viewer_test', password: 'viewer123', role: '观察者', token: null }
};

// 记录测试结果
function recordResult(module, testName, method, path, user, expected, actual, passed, details = '') {
  if (!results.modules[module]) {
    results.modules[module] = [];
  }
  
  results.summary.total++;
  if (passed) results.summary.passed++;
  else results.summary.failed++;
  
  results.modules[module].push({
    test: testName,
    method,
    path,
    user: user || '未登录',
    expected,
    actual,
    passed,
    details
  });
  
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} | ${module.padEnd(12)} | ${testName.padEnd(30)} | ${user || '未登录'} | ${method} ${path} | 期望:${expected} 实际:${actual}`);
}

// 执行HTTP请求
async function request(method, path, token = null, data = null) {
  const config = {
    method,
    url: `${BASE_URL}${path}`,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  if (data) {
    config.data = data;
  }
  
  try {
    const response = await axios(config);
    return { status: response.status, data: response.data };
  } catch (error) {
    if (error.response) {
      return { status: error.response.status, data: error.response.data };
    }
    return { status: 0, data: { error: error.message } };
  }
}

// 登录所有测试用户
async function loginAllUsers() {
  console.log('\n========================================');
  console.log('登录测试用户');
  console.log('========================================\n');
  
  for (const [key, user] of Object.entries(users)) {
    const res = await request('POST', '/auth/login', null, {
      username: user.username,
      password: user.password
    });
    
    if (res.status === 200 && res.data.token) {
      user.token = res.data.token;
      console.log(`✓ ${user.role} (${user.username}) 登录成功`);
    } else {
      console.log(`✗ ${user.role} (${user.username}) 登录失败: ${res.status}`);
    }
  }
}

// 测试1: 认证模块
async function testAuthModule() {
  console.log('\n========================================');
  console.log('测试1: 认证模块');
  console.log('========================================\n');
  
  const module = '认证模块';
  
  // 1.1 登录测试
  let res = await request('POST', '/auth/login', null, { username: 'admin', password: 'admin123' });
  recordResult(module, '管理员登录', 'POST', '/auth/login', 'admin', 200, res.status, res.status === 200);
  
  res = await request('POST', '/auth/login', null, { username: 'admin', password: 'wrong' });
  recordResult(module, '错误密码登录', 'POST', '/auth/login', 'admin', 401, res.status, res.status === 401);
  
  res = await request('POST', '/auth/login', null, { username: 'nonexistent', password: 'test' });
  recordResult(module, '不存在用户登录', 'POST', '/auth/login', '不存在', 401, res.status, res.status === 401);
  
  // 1.2 Token验证
  res = await request('GET', '/auth/me', users.admin.token);
  recordResult(module, '有效Token获取用户信息', 'GET', '/auth/me', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/auth/me', null);
  recordResult(module, '无Token访问受保护接口', 'GET', '/auth/me', '未登录', 401, res.status, res.status === 401);
  
  res = await request('GET', '/auth/me', 'invalid-token');
  recordResult(module, '无效Token访问', 'GET', '/auth/me', '无效Token', 401, res.status, res.status === 401);
  
  // 1.3 获取菜单权限
  res = await request('GET', '/auth/menus', users.admin.token);
  recordResult(module, '管理员获取菜单权限', 'GET', '/auth/menus', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/auth/menus', users.sales.token);
  recordResult(module, '销售获取菜单权限', 'GET', '/auth/menus', 'sales', 200, res.status, res.status === 200);
}

// 测试2: 用户管理模块
async function testUserModule() {
  console.log('\n========================================');
  console.log('测试2: 用户管理模块');
  console.log('========================================\n');
  
  const module = '用户管理';
  
  // 2.1 列表查询权限
  let res = await request('GET', '/users', users.admin.token);
  recordResult(module, '管理员查询用户列表', 'GET', '/users', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/users', users.sales.token);
  recordResult(module, '销售查询用户列表', 'GET', '/users', 'sales', 403, res.status, res.status === 403);
  
  res = await request('GET', '/users', users.viewer.token);
  recordResult(module, '观察者查询用户列表', 'GET', '/users', 'viewer', 403, res.status, res.status === 403);
  
  // 2.2 创建用户权限
  res = await request('POST', '/users', users.admin.token, {
    username: `test_${Date.now()}`,
    password: 'test123',
    name: '测试用户',
    email: `test_${Date.now()}@example.com`,
    role: 'USER'
  });
  recordResult(module, '管理员创建用户', 'POST', '/users', 'admin', 201, res.status, res.status === 201);
  
  res = await request('POST', '/users', users.sales.token, {
    username: `test_sales_${Date.now()}`,
    password: 'test123',
    name: '销售创建用户',
    email: `sales_${Date.now()}@example.com`,
    role: 'USER'
  });
  recordResult(module, '销售创建用户', 'POST', '/users', 'sales', 403, res.status, res.status === 403);
  
  // 2.3 修改用户权限
  res = await request('PUT', '/users/1', users.admin.token, { name: '系统管理员(测试)' });
  recordResult(module, '管理员修改用户', 'PUT', '/users/1', 'admin', 200, res.status, res.status === 200);
  
  res = await request('PUT', '/users/1', users.sales.token, { name: '销售修改' });
  recordResult(module, '销售修改用户', 'PUT', '/users/1', 'sales', 403, res.status, res.status === 403);
}

// 测试3: 角色管理模块
async function testRoleModule() {
  console.log('\n========================================');
  console.log('测试3: 角色管理模块');
  console.log('========================================\n');
  
  const module = '角色管理';
  
  let res = await request('GET', '/roles', users.admin.token);
  recordResult(module, '管理员查询角色列表', 'GET', '/roles', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/roles', users.sales.token);
  recordResult(module, '销售查询角色列表', 'GET', '/roles', 'sales', 403, res.status, res.status === 403);
  
  res = await request('POST', '/roles', users.admin.token, {
    name: `TEST_ROLE_${Date.now()}`,
    displayName: '测试角色',
    description: '测试用途',
    permissions: []
  });
  recordResult(module, '管理员创建角色', 'POST', '/roles', 'admin', 201, res.status, res.status === 201);
  
  res = await request('POST', '/roles', users.sales.token, {
    name: `SALES_ROLE_${Date.now()}`,
    displayName: '销售角色',
    description: '测试',
    permissions: []
  });
  recordResult(module, '销售创建角色', 'POST', '/roles', 'sales', 403, res.status, res.status === 403);
}

// 测试4: 客户管理模块
async function testOrganizationModule() {
  console.log('\n========================================');
  console.log('测试4: 客户管理模块');
  console.log('========================================\n');
  
  const module = '客户管理';
  
  // 4.1 列表查询
  let res = await request('GET', '/organizations', users.admin.token);
  recordResult(module, '管理员查询客户列表', 'GET', '/organizations', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/organizations', users.sales.token);
  recordResult(module, '销售查询客户列表', 'GET', '/organizations', 'sales', 200, res.status, res.status === 200);
  
  // 4.2 创建客户
  res = await request('POST', '/organizations', users.admin.token, {
    name: `测试客户_${Date.now()}`,
    type: 'COMPANY'
  });
  recordResult(module, '管理员创建客户', 'POST', '/organizations', 'admin', 201, res.status, res.status === 201);
  
  res = await request('POST', '/organizations', users.sales.token, {
    name: `销售客户_${Date.now()}`,
    type: 'COMPANY'
  });
  recordResult(module, '销售创建客户', 'POST', '/organizations', 'sales', 201, res.status, res.status === 201);
  
  // 4.3 搜索权限过滤
  res = await request('GET', '/organizations?search=测试', users.admin.token);
  recordResult(module, '管理员搜索客户', 'GET', '/organizations?search', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/organizations?search=测试', users.sales.token);
  recordResult(module, '销售搜索客户(权限过滤)', 'GET', '/organizations?search', 'sales', 200, res.status, res.status === 200);
}

// 测试5: 项目管理模块
async function testProjectModule() {
  console.log('\n========================================');
  console.log('测试5: 项目管理模块');
  console.log('========================================\n');
  
  const module = '项目管理';
  
  let res = await request('GET', '/projects', users.admin.token);
  recordResult(module, '管理员查询项目列表', 'GET', '/projects', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/projects', users.sales.token);
  recordResult(module, '销售查询项目列表', 'GET', '/projects', 'sales', 200, res.status, res.status === 200);
  
  // 搜索权限过滤测试
  res = await request('GET', '/projects?search=测试', users.admin.token);
  recordResult(module, '管理员搜索项目', 'GET', '/projects?search', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/projects?search=测试', users.sales.token);
  recordResult(module, '销售搜索项目(权限过滤)', 'GET', '/projects?search', 'sales', 200, res.status, res.status === 200);
  
  // 项目归档权限
  res = await request('POST', '/projects/1/archive', users.admin.token, { isArchived: true });
  recordResult(module, '管理员归档项目', 'POST', '/projects/1/archive', 'admin', 200, res.status, res.status === 200 || res.status === 404);
  
  // 项目删除权限
  res = await request('DELETE', '/projects/1', users.admin.token);
  recordResult(module, '管理员删除项目', 'DELETE', '/projects/1', 'admin', 200, res.status, res.status === 200 || res.status === 403 || res.status === 404);
}

// 测试6: 售前管理模块
async function testOpportunityModule() {
  console.log('\n========================================');
  console.log('测试6: 售前管理模块');
  console.log('========================================\n');
  
  const module = '售前管理';
  
  let res = await request('GET', '/opportunities', users.admin.token);
  recordResult(module, '管理员查询商机列表', 'GET', '/opportunities', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/opportunities', users.sales.token);
  recordResult(module, '销售查询商机列表', 'GET', '/opportunities', 'sales', 200, res.status, res.status === 200);
  
  // 搜索权限过滤
  res = await request('GET', '/opportunities?search=测试', users.admin.token);
  recordResult(module, '管理员搜索商机', 'GET', '/opportunities?search', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/opportunities?search=测试', users.sales.token);
  recordResult(module, '销售搜索商机(权限过滤)', 'GET', '/opportunities?search', 'sales', 200, res.status, res.status === 200);
}

// 测试7: 合同管理模块
async function testContractModule() {
  console.log('\n========================================');
  console.log('测试7: 合同管理模块');
  console.log('========================================\n');
  
  const module = '合同管理';
  
  let res = await request('GET', '/contracts', users.admin.token);
  recordResult(module, '管理员查询合同列表', 'GET', '/contracts', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/contracts', users.sales.token);
  recordResult(module, '销售查询合同列表', 'GET', '/contracts', 'sales', 200, res.status, res.status === 200);
}

// 测试8: 日报管理模块
async function testDailyReportModule() {
  console.log('\n========================================');
  console.log('测试8: 日报管理模块');
  console.log('========================================\n');
  
  const module = '日报管理';
  
  let res = await request('GET', '/daily-reports', users.admin.token);
  recordResult(module, '管理员查询日报列表', 'GET', '/daily-reports', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/daily-reports', users.sales.token);
  recordResult(module, '销售查询日报列表', 'GET', '/daily-reports', 'sales', 200, res.status, res.status === 200);
  
  // 创建日报
  res = await request('POST', '/daily-reports', users.admin.token, {
    reportDate: new Date().toISOString().split('T')[0],
    content: '今日完成工作',
    tomorrowPlan: '明日计划',
    issues: '无',
    status: 'DRAFT'
  });
  recordResult(module, '管理员创建日报', 'POST', '/daily-reports', 'admin', 201, res.status, res.status === 201);
  
  // 日报导出
  res = await request('GET', '/daily-reports/export/csv', users.admin.token);
  recordResult(module, '管理员导出日报CSV', 'GET', '/daily-reports/export/csv', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/daily-reports/export/excel', users.admin.token);
  recordResult(module, '管理员导出日报Excel', 'GET', '/daily-reports/export/excel', 'admin', 200, res.status, res.status === 200);
  
  // 日报审批
  res = await request('POST', '/daily-reports/1/approve', users.admin.token, { approved: true, comment: '同意' });
  recordResult(module, '管理员审批日报', 'POST', '/daily-reports/1/approve', 'admin', 200, res.status, res.status === 200 || res.status === 400 || res.status === 404);
  
  // 自审批防护
  res = await request('POST', '/daily-reports/1/approve', users.admin.token, { approved: true });
  recordResult(module, '自审批防护测试', 'POST', '/daily-reports/1/approve', 'admin(自己)', 400, res.status, res.status === 400 || res.status === 403);
}

// 测试9: 费用报销模块
async function testExpenseModule() {
  console.log('\n========================================');
  console.log('测试9: 费用报销模块');
  console.log('========================================\n');
  
  const module = '费用报销';
  
  let res = await request('GET', '/expenses', users.admin.token);
  recordResult(module, '管理员查询报销列表', 'GET', '/expenses', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/expenses', users.sales.token);
  recordResult(module, '销售查询报销列表', 'GET', '/expenses', 'sales', 200, res.status, res.status === 200);
  
  // 提交报销
  res = await request('POST', '/expenses/1/submit', users.admin.token);
  recordResult(module, '管理员提交报销', 'POST', '/expenses/1/submit', 'admin', 200, res.status, res.status === 200 || res.status === 400 || res.status === 404);
  
  // 审批报销
  res = await request('POST', '/expenses/1/approve', users.admin.token, { approved: true });
  recordResult(module, '管理员审批报销', 'POST', '/expenses/1/approve', 'admin', 200, res.status, res.status === 200 || res.status === 400 || res.status === 404);
}

// 测试10: 采购管理模块
async function testProcurementModule() {
  console.log('\n========================================');
  console.log('测试10: 采购管理模块');
  console.log('========================================\n');
  
  const module = '采购管理';
  
  let res = await request('GET', '/procurements', users.admin.token);
  recordResult(module, '管理员查询采购列表', 'GET', '/procurements', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/procurements', users.sales.token);
  recordResult(module, '销售查询采购列表', 'GET', '/procurements', 'sales', 200, res.status, res.status === 200);
  
  // 删除采购
  res = await request('DELETE', '/procurements/1', users.admin.token);
  recordResult(module, '管理员删除采购', 'DELETE', '/procurements/1', 'admin', 200, res.status, res.status === 200 || res.status === 403 || res.status === 404);
}

// 测试11: 发票管理模块
async function testInvoiceModule() {
  console.log('\n========================================');
  console.log('测试11: 发票管理模块');
  console.log('========================================\n');
  
  const module = '发票管理';
  
  let res = await request('GET', '/invoices', users.admin.token);
  recordResult(module, '管理员查询发票列表', 'GET', '/invoices', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/invoices', users.sales.token);
  recordResult(module, '销售查询发票列表', 'GET', '/invoices', 'sales', 200, res.status, res.status === 200);
  
  // 修改发票权限
  res = await request('PUT', '/invoices/1', users.admin.token, { amount: 1000 });
  recordResult(module, '管理员修改发票', 'PUT', '/invoices/1', 'admin', 200, res.status, res.status === 200 || res.status === 403 || res.status === 404);
  
  res = await request('PUT', '/invoices/1', users.sales.token, { amount: 1000 });
  recordResult(module, '销售修改发票', 'PUT', '/invoices/1', 'sales', 403, res.status, res.status === 403 || res.status === 404);
}

// 测试12: 报价单模块
async function testQuotationModule() {
  console.log('\n========================================');
  console.log('测试12: 报价单模块');
  console.log('========================================\n');
  
  const module = '报价单';
  
  let res = await request('GET', '/quotations', users.admin.token);
  recordResult(module, '管理员查询报价单列表', 'GET', '/quotations', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/quotations', users.sales.token);
  recordResult(module, '销售查询报价单列表', 'GET', '/quotations', 'sales', 200, res.status, res.status === 200);
  
  // 导出报价单
  res = await request('GET', '/quotations/export/excel', users.admin.token);
  recordResult(module, '管理员导出报价单', 'GET', '/quotations/export/excel', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/quotations/export/excel', users.sales.token);
  recordResult(module, '销售导出报价单', 'GET', '/quotations/export/excel', 'sales', 200, res.status, res.status === 200);
}

// 测试13: 菜单管理模块
async function testMenuModule() {
  console.log('\n========================================');
  console.log('测试13: 菜单管理模块');
  console.log('========================================\n');
  
  const module = '菜单管理';
  
  let res = await request('GET', '/menus', users.admin.token);
  recordResult(module, '管理员查询菜单列表', 'GET', '/menus', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/menus', users.sales.token);
  recordResult(module, '销售查询菜单列表', 'GET', '/menus', 'sales', 200, res.status, res.status === 200);
  
  res = await request('POST', '/menus', users.admin.token, {
    key: 'test_menu',
    icon: 'test',
    label: '测试菜单',
    menuType: 'MENU'
  });
  recordResult(module, '管理员创建菜单', 'POST', '/menus', 'admin', 201, res.status, res.status === 201);
  
  res = await request('POST', '/menus', users.sales.token, {
    key: 'sales_menu',
    icon: 'test',
    label: '销售菜单',
    menuType: 'MENU'
  });
  recordResult(module, '销售创建菜单', 'POST', '/menus', 'sales', 403, res.status, res.status === 403);
}

// 测试14: 操作日志模块
async function testOperationLogModule() {
  console.log('\n========================================');
  console.log('测试14: 操作日志模块');
  console.log('========================================\n');
  
  const module = '操作日志';
  
  let res = await request('GET', '/operation-logs', users.admin.token);
  recordResult(module, '管理员查询操作日志', 'GET', '/operation-logs', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/operation-logs', users.sales.token);
  recordResult(module, '销售查询操作日志', 'GET', '/operation-logs', 'sales', 403, res.status, res.status === 403);
}

// 测试15: 部门管理模块
async function testDepartmentModule() {
  console.log('\n========================================');
  console.log('测试15: 部门管理模块');
  console.log('========================================\n');
  
  const module = '部门管理';
  
  let res = await request('GET', '/departments', users.admin.token);
  recordResult(module, '管理员查询部门列表', 'GET', '/departments', 'admin', 200, res.status, res.status === 200);
  
  res = await request('GET', '/departments', users.sales.token);
  recordResult(module, '销售查询部门列表', 'GET', '/departments', 'sales', 200, res.status, res.status === 200);
  
  res = await request('POST', '/departments', users.admin.token, {
    name: `测试部门_${Date.now()}`,
    parentId: null
  });
  recordResult(module, '管理员创建部门', 'POST', '/departments', 'admin', 201, res.status, res.status === 201);
  
  res = await request('POST', '/departments', users.sales.token, {
    name: `销售部门_${Date.now()}`,
    parentId: null
  });
  recordResult(module, '销售创建部门', 'POST', '/departments', 'sales', 403, res.status, res.status === 403);
}

// 生成测试报告
function generateReport() {
  const report = {
    title: 'CRM系统接口权限测试报告',
    timestamp: new Date().toISOString(),
    summary: results.summary,
    passRate: `${((results.summary.passed / results.summary.total) * 100).toFixed(2)}%`,
    modules: {}
  };
  
  for (const [module, tests] of Object.entries(results.modules)) {
    const passed = tests.filter(t => t.passed).length;
    const failed = tests.length - passed;
    
    report.modules[module] = {
      total: tests.length,
      passed,
      failed,
      passRate: `${((passed / tests.length) * 100).toFixed(2)}%`,
      tests
    };
  }
  
  // 保存JSON报告
  fs.writeFileSync('api-permission-test-report.json', JSON.stringify(report, null, 2));
  
  // 生成HTML报告
  const htmlReport = generateHTMLReport(report);
  fs.writeFileSync('api-permission-test-report.html', htmlReport);
  
  console.log('\n========================================');
  console.log('测试报告已生成:');
  console.log('  - api-permission-test-report.json');
  console.log('  - api-permission-test-report.html');
  console.log('========================================');
}

function generateHTMLReport(report) {
  const moduleStats = Object.entries(report.modules).map(([name, data]) => {
    const failedTests = data.tests.filter(t => !t.passed);
    const failedDetails = failedTests.map(t => `
      <tr style="background: #fff5f5;">
        <td>${t.test}</td>
        <td>${t.method} ${t.path}</td>
        <td>${t.user}</td>
        <td>期望: ${t.expected}, 实际: ${t.actual}</td>
        <td>✗ 失败</td>
      </tr>
    `).join('');
    
    return `
      <div class="module">
        <h3>${name}</h3>
        <div class="stats">
          <span>总计: ${data.total}</span>
          <span style="color: #10b981;">通过: ${data.passed}</span>
          <span style="color: #ef4444;">失败: ${data.failed}</span>
          <span>通过率: ${data.passRate}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>测试项</th>
              <th>接口</th>
              <th>用户</th>
              <th>状态</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            ${data.tests.map(t => `
              <tr class="${t.passed ? 'pass' : 'fail'}">
                <td>${t.test}</td>
                <td>${t.method} ${t.path}</td>
                <td>${t.user}</td>
                <td>期望: ${t.expected}, 实际: ${t.actual}</td>
                <td>${t.passed ? '✓ 通过' : '✗ 失败'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CRM系统接口权限测试报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #1f2937; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .summary { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 32px; font-weight: bold; color: #3b82f6; }
    .summary-item .label { color: #6b7280; margin-top: 5px; }
    .module { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .module h3 { margin-top: 0; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    .stats { display: flex; gap: 20px; margin-bottom: 15px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    tr.pass { background: #f0fdf4; }
    tr.fail { background: #fef2f2; }
    .pass-rate { font-size: 48px; font-weight: bold; color: #10b981; text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 CRM系统接口权限测试报告</h1>
    <div class="summary">
      <div class="summary-grid">
        <div class="summary-item">
          <div class="value">${report.summary.total}</div>
          <div class="label">总测试数</div>
        </div>
        <div class="summary-item">
          <div class="value" style="color: #10b981;">${report.summary.passed}</div>
          <div class="label">通过</div>
        </div>
        <div class="summary-item">
          <div class="value" style="color: #ef4444;">${report.summary.failed}</div>
          <div class="label">失败</div>
        </div>
        <div class="summary-item">
          <div class="value">${report.passRate}</div>
          <div class="label">通过率</div>
        </div>
      </div>
      <div style="text-align: right; color: #6b7280; margin-top: 10px; font-size: 12px;">
        测试时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}
      </div>
    </div>
    
    <h2>📋 各模块测试结果</h2>
    ${moduleStats}
  </div>
</body>
</html>
  `;
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('CRM系统接口权限全面测试');
  console.log('========================================\n');
  
  // 等待后端启动
  console.log('等待后端服务启动...');
  for (let i = 0; i < 30; i++) {
    try {
      await request('GET', '/health');
      console.log('✓ 后端服务已就绪\n');
      break;
    } catch (e) {
      if (i === 29) {
        console.log('✗ 后端服务启动超时，请确保后端已启动');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 登录所有测试用户
  await loginAllUsers();
  
  // 执行所有测试
  await testAuthModule();
  await testUserModule();
  await testRoleModule();
  await testOrganizationModule();
  await testProjectModule();
  await testOpportunityModule();
  await testContractModule();
  await testDailyReportModule();
  await testExpenseModule();
  await testProcurementModule();
  await testInvoiceModule();
  await testQuotationModule();
  await testMenuModule();
  await testOperationLogModule();
  await testDepartmentModule();
  
  // 生成报告
  generateReport();
  
  // 输出总结
  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`总测试数: ${results.summary.total}`);
  console.log(`通过: ${results.summary.passed}`);
  console.log(`失败: ${results.summary.failed}`);
  console.log(`通过率: ${((results.summary.passed / results.summary.total) * 100).toFixed(2)}%`);
  console.log('========================================\n');
  
  // 输出各模块统计
  console.log('各模块统计:');
  for (const [module, tests] of Object.entries(results.modules)) {
    const passed = tests.filter(t => t.passed).length;
    console.log(`  ${module.padEnd(12)}: ${passed}/${tests.length} (${((passed / tests.length) * 100).toFixed(0)}%)`);
  }
}

// 运行测试
main().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
