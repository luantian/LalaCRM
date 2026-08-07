const { PrismaClient } = require('@prisma/client');
const http = require('http');
const prisma = new PrismaClient();

// 登录函数
function login(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// API请求函数
function apiRequest(method, path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// 定义测试用例
const testCases = [
  // 系统管理模块
  { name: '用户列表', method: 'GET', path: '/api/users', requiredPerm: 'system:user:list', admin: true, user: false },
  { name: '角色列表', method: 'GET', path: '/api/roles', requiredPerm: 'system:role:list', admin: true, user: false },
  { name: '菜单列表', method: 'GET', path: '/api/menus', requiredPerm: 'system:menu:list', admin: true, user: false },
  { name: '部门列表', method: 'GET', path: '/api/departments', requiredPerm: 'system:department:list', admin: true, user: false },
  { name: '字典列表', method: 'GET', path: '/api/dicts/types', requiredPerm: 'system:dict:list', admin: true, user: false },
  { name: '操作日志', method: 'GET', path: '/api/operation-logs', requiredPerm: 'system:log:list', admin: true, user: false },
  
  // CRM模块
  { name: '客户列表', method: 'GET', path: '/api/organizations', requiredPerm: 'crm:organization:list', admin: true, user: true },
  { name: '售前列表', method: 'GET', path: '/api/opportunities', requiredPerm: 'crm:opportunity:list', admin: true, user: true },
  { name: '报价列表', method: 'GET', path: '/api/quotations', requiredPerm: 'crm:quotation:list', admin: true, user: true },
  
  // 项目管理模块
  { name: '项目列表', method: 'GET', path: '/api/projects', requiredPerm: 'project:project:list', admin: true, user: true },
  { name: '合同列表', method: 'GET', path: '/api/contracts', requiredPerm: 'project:contract:list', admin: true, user: true },
  { name: '采购列表', method: 'GET', path: '/api/procurements', requiredPerm: 'project:procurement:list', admin: true, user: true },
  
  // 财务模块
  { name: '费用报销列表', method: 'GET', path: '/api/expenses', requiredPerm: 'finance:expense:list', admin: true, user: true },
  { name: '发票列表', method: 'GET', path: '/api/invoices', requiredPerm: 'finance:invoice:list', admin: true, user: false },
  
  // 日常办公模块
  { name: '日报列表', method: 'GET', path: '/api/daily-reports', requiredPerm: 'office:dailyreport:list', admin: true, user: true },
  { name: '出差列表', method: 'GET', path: '/api/business-trips', requiredPerm: 'office:trip:list', admin: true, user: true },
  { name: '考勤列表', method: 'GET', path: '/api/check-ins', requiredPerm: 'office:checkin:list', admin: true, user: true },
  
  // 仪表盘
  { name: '仪表盘统计', method: 'GET', path: '/api/dashboard/stats', requiredPerm: 'dashboard:view', admin: true, user: true },
];

// 测试用户
const testUsers = [
  { username: 'test_admin', role: '管理员', expectAdmin: true },
  { username: 'test_user1', role: '普通用户', expectAdmin: false },
  { username: 'test_user2', role: '普通用户', expectAdmin: false },
  { username: 'viewer_test', role: '普通用户', expectAdmin: false },
  { username: 'sales_test', role: '普通用户', expectAdmin: false },
];

async function runTests() {
  console.log('========================================');
  console.log('     CRM系统权限全面测试');
  console.log('========================================\n');

  // 1. 登录所有测试用户
  console.log('【步骤1】登录测试用户...');
  const tokens = {};
  
  for (const user of testUsers) {
    const loginRes = await login(user.username, 'test123');
    if (loginRes.status === 200 && loginRes.data.token) {
      tokens[user.username] = {
        token: loginRes.data.token,
        role: user.role,
        permissions: loginRes.data.user?.permissions || []
      };
      console.log('  ✓ ' + user.username + ' 登录成功 (' + user.role + ', 权限数: ' + tokens[user.username].permissions.length + ')');
    } else {
      console.log('  ✗ ' + user.username + ' 登录失败: ' + JSON.stringify(loginRes.data));
    }
  }

  if (Object.keys(tokens).length === 0) {
    console.error('错误: 没有用户成功登录');
    return;
  }

  console.log('\n【步骤2】执行API权限测试...\n');

  // 2. 执行权限测试
  const results = {};
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures = [];

  for (const user of testUsers) {
    if (!tokens[user.username]) continue;

    results[user.username] = {
      role: user.role,
      tests: []
    };

    console.log('--- 测试用户: ' + user.username + ' (' + user.role + ') ---');

    for (const testCase of testCases) {
      const res = await apiRequest(testCase.method, testCase.path, tokens[user.username].token);
      totalTests++;

      const expectedStatus = testCase[user.expectAdmin ? 'admin' : 'user'] ? 200 : 403;
      const actualStatus = res.status;
      const passed = actualStatus === expectedStatus;

      if (passed) {
        passedTests++;
        console.log('  ✓ ' + testCase.name.padEnd(15) + ' → ' + actualStatus + ' (期望 ' + expectedStatus + ')');
      } else {
        failedTests++;
        console.log('  ✗ ' + testCase.name.padEnd(15) + ' → ' + actualStatus + ' (期望 ' + expectedStatus + ') ❌');
        failures.push({
          user: user.username,
          role: user.role,
          api: testCase.name,
          path: testCase.path,
          expected: expectedStatus,
          actual: actualStatus,
          response: res.data
        });
      }

      results[user.username].tests.push({
        api: testCase.name,
        path: testCase.path,
        requiredPerm: testCase.requiredPerm,
        expected: expectedStatus,
        actual: actualStatus,
        passed: passed
      });
    }
    console.log('');
  }

  // 3. 生成测试报告
  console.log('========================================');
  console.log('          测试报告');
  console.log('========================================\n');

  console.log('总计: ' + totalTests + ' 个测试');
  console.log('通过: ' + passedTests + ' (' + ((passedTests/totalTests)*100).toFixed(1) + '%)');
  console.log('失败: ' + failedTests + ' (' + ((failedTests/totalTests)*100).toFixed(1) + '%)\n');

  if (failures.length > 0) {
    console.log('❌ 失败详情:\n');
    failures.forEach((f, idx) => {
      console.log((idx + 1) + '. 用户: ' + f.user + ' (' + f.role + ')');
      console.log('   API: ' + f.api + ' (' + f.path + ')');
      console.log('   期望: ' + f.expected + ', 实际: ' + f.actual);
      console.log('   响应: ' + JSON.stringify(f.response).substring(0, 200) + '\n');
    });
  } else {
    console.log('✅ 所有测试通过！\n');
  }

  // 4. 权限矩阵视图
  console.log('========================================');
  console.log('       权限对照矩阵');
  console.log('========================================\n');

  const userCols = Object.keys(results);
  const colWidth = 12;

  console.log('API接口'.padEnd(15) + userCols.map(u => u.padEnd(colWidth)).join(''));
  console.log('-'.repeat(15 + userCols.length * colWidth));

  testCases.forEach(tc => {
    const row = tc.name.padEnd(15);
    const cells = userCols.map(u => {
      const test = results[u].tests.find(t => t.api === tc.name);
      if (!test) return 'N/A'.padEnd(colWidth);
      const status = test.actual === 200 ? '✓允许' : '✗拒绝';
      const expected = tc[results[u].role === '管理员' ? 'admin' : 'user'];
      const match = (test.actual === 200) === expected;
      return (match ? status : status + '!').padEnd(colWidth);
    });
    console.log(row + cells.join(''));
  });

  console.log('\n========================================');
  console.log('测试完成: ' + new Date().toLocaleString());
  console.log('========================================');
}

runTests()
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
