const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001/api';
const results = [];

// 测试用户配置
const testUsers = {
  admin: { username: 'admin', password: 'admin123' },
  sales: { username: 'sales_test', password: 'sales123' },
  viewer: { username: 'viewer_test', password: 'viewer123' }
};

const tokens = {};
let testOrgId = null;
let testProjectId = null;
let testOpportunityId = null;

// 测试结果记录
function logResult(module, api, method, user, expected, actual, passed) {
  results.push({ module, api, method, user, expected, actual, passed });
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${module} | ${method} ${api} | ${user} | 期望:${expected} 实际:${actual}`);
}

// 登录获取token
async function login() {
  console.log('\n=== 登录测试用户 ===\n');
  for (const [key, user] of Object.entries(testUsers)) {
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, user);
      if (res.data.token) {
        tokens[key] = res.data.token;
        console.log(`✓ ${key} 登录成功`);
      }
    } catch (err) {
      console.log(`✗ ${key} 登录失败:`, err.response?.data?.error || err.message);
    }
  }
}

// 测试模块
async function testAuthModule() {
  console.log('\n=== 认证模块测试 ===\n');
  const module = '认证模块';
  
  // 无token访问
  try {
    await axios.get(`${BASE_URL}/users`);
    logResult(module, '/users', 'GET', '未登录', 401, 200, false);
  } catch (err) {
    logResult(module, '/users', 'GET', '未登录', 401, err.response?.status || 0, err.response?.status === 401);
  }
  
  // 管理员访问
  try {
    const res = await axios.get(`${BASE_URL}/users`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/users', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/users', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
}

async function testUserModule() {
  console.log('\n=== 用户管理模块测试 ===\n');
  const module = '用户管理';
  
  // 管理员获取列表
  try {
    const res = await axios.get(`${BASE_URL}/users`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/users', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/users', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 销售获取列表（应该被拒绝）
  try {
    const res = await axios.get(`${BASE_URL}/users`, { headers: { Authorization: `Bearer ${tokens.sales}` } });
    logResult(module, '/users', 'GET', '销售', 403, res.status, res.status === 403);
  } catch (err) {
    logResult(module, '/users', 'GET', '销售', 403, err.response?.status || 0, err.response?.status === 403);
  }
  
  // 创建用户
  try {
    const res = await axios.post(`${BASE_URL}/users`, {
      username: `test_${Date.now()}`,
      password: 'test123',
      name: '测试用户',
      email: `test_${Date.now()}@example.com`,
      role: 'USER'
    }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/users', 'POST', '管理员', 201, res.status, res.status === 201);
  } catch (err) {
    logResult(module, '/users', 'POST', '管理员', 201, err.response?.status || 0, false);
  }
}

async function testRoleModule() {
  console.log('\n=== 角色管理模块测试 ===\n');
  const module = '角色管理';
  
  // 获取角色列表
  try {
    const res = await axios.get(`${BASE_URL}/roles`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/roles', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/roles', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建角色
  try {
    const res = await axios.post(`${BASE_URL}/roles`, {
      name: `TEST_ROLE_${Date.now()}`,
      displayName: '测试角色',
      description: '测试用途',
      permissions: ['system:user:list']
    }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/roles', 'POST', '管理员', 201, res.status, res.status === 201);
  } catch (err) {
    logResult(module, '/roles', 'POST', '管理员', 201, err.response?.status || 0, false);
  }
}

async function testOrganizationModule() {
  console.log('\n=== 客户管理模块测试 ===\n');
  const module = '客户管理';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/organizations`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/organizations', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/organizations', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建组织
  try {
    const res = await axios.post(`${BASE_URL}/organizations`, {
      name: `测试组织_${Date.now()}`,
      type: 'COMPANY'
    }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/organizations', 'POST', '管理员', 201, res.status, res.status === 201);
    if (res.data.id) testOrgId = res.data.id;
  } catch (err) {
    logResult(module, '/organizations', 'POST', '管理员', 201, err.response?.status || 0, false);
  }
  
  // 添加联系人
  if (testOrgId) {
    try {
      const res = await axios.post(`${BASE_URL}/organizations/${testOrgId}/contacts`, {
        name: '测试联系人',
        title: '经理',
        phone: '13800138000'
      }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
      logResult(module, `/organizations/${testOrgId}/contacts`, 'POST', '管理员', 201, res.status, res.status === 201);
    } catch (err) {
      logResult(module, `/organizations/${testOrgId}/contacts`, 'POST', '管理员', 201, err.response?.status || 0, false);
    }
  }
}

async function testProjectModule() {
  console.log('\n=== 项目管理模块测试 ===\n');
  const module = '项目管理';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/projects`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/projects', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/projects', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建项目（需要organizationId）
  if (testOrgId) {
    try {
      const res = await axios.post(`${BASE_URL}/projects`, {
        name: `测试项目_${Date.now()}`,
        organizationId: testOrgId,
        status: 'IN_PROGRESS'
      }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
      logResult(module, '/projects', 'POST', '管理员', 201, res.status, res.status === 201);
      if (res.data.id) testProjectId = res.data.id;
    } catch (err) {
      logResult(module, '/projects', 'POST', '管理员', 201, err.response?.status || 0, false);
    }
  }
  
  // 搜索权限过滤测试
  try {
    const res = await axios.get(`${BASE_URL}/projects?search=测试`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/projects?search', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/projects?search', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
}

async function testOpportunityModule() {
  console.log('\n=== 商机管理模块测试 ===\n');
  const module = '商机管理';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/opportunities`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/opportunities', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/opportunities', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建商机（需要organizationId）
  if (testOrgId) {
    try {
      const res = await axios.post(`${BASE_URL}/opportunities`, {
        name: `测试商机_${Date.now()}`,
        organizationId: testOrgId,
        status: 'OPEN'
      }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
      logResult(module, '/opportunities', 'POST', '管理员', 201, res.status, res.status === 201);
      if (res.data.id) testOpportunityId = res.data.id;
    } catch (err) {
      logResult(module, '/opportunities', 'POST', '管理员', 201, err.response?.status || 0, false);
    }
  }
  
  // 搜索权限过滤测试
  try {
    const res = await axios.get(`${BASE_URL}/opportunities?search=测试`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/opportunities?search', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/opportunities?search', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
}

async function testContractModule() {
  console.log('\n=== 合同管理模块测试 ===\n');
  const module = '合同管理';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/contracts`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/contracts', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/contracts', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建合同（需要organizationId）
  if (testOrgId) {
    try {
      const res = await axios.post(`${BASE_URL}/contracts`, {
        name: `测试合同_${Date.now()}`,
        organizationId: testOrgId,
        amount: 100000,
        status: 'DRAFT'
      }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
      logResult(module, '/contracts', 'POST', '管理员', 201, res.status, res.status === 201);
    } catch (err) {
      logResult(module, '/contracts', 'POST', '管理员', 201, err.response?.status || 0, false);
    }
  }
}

async function testDailyReportModule() {
  console.log('\n=== 日报管理模块测试 ===\n');
  const module = '日报管理';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/daily-reports`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/daily-reports', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/daily-reports', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建日报
  let reportId = null;
  try {
    const res = await axios.post(`${BASE_URL}/daily-reports`, {
      title: `测试日报_${Date.now()}`,
      content: '今日工作内容\n明日计划',
      projectId: testProjectId,
      reportDate: new Date().toISOString().split('T')[0]
    }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/daily-reports', 'POST', '管理员', 201, res.status, res.status === 201);
    if (res.data.id) reportId = res.data.id;
  } catch (err) {
    logResult(module, '/daily-reports', 'POST', '管理员', 201, err.response?.status || 0, false);
  }
  
  // 提交日报
  if (reportId) {
    try {
      const res = await axios.post(`${BASE_URL}/daily-reports/${reportId}/submit`, {}, { headers: { Authorization: `Bearer ${tokens.admin}` } });
      logResult(module, `/daily-reports/${reportId}/submit`, 'POST', '管理员', 200, res.status, res.status === 200);
    } catch (err) {
      logResult(module, `/daily-reports/${reportId}/submit`, 'POST', '管理员', 200, err.response?.status || 0, false);
    }
    
    // 审批日报
    try {
      const res = await axios.post(`${BASE_URL}/daily-reports/${reportId}/approve`, { approved: true }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
      logResult(module, `/daily-reports/${reportId}/approve`, 'POST', '管理员', 200, res.status, res.status === 200);
    } catch (err) {
      logResult(module, `/daily-reports/${reportId}/approve`, 'POST', '管理员', 200, err.response?.status || 0, false);
    }
  }
  
  // 导出日报（CSV）
  try {
    const res = await axios.get(`${BASE_URL}/daily-reports/export/csv?startDate=2024-01-01&endDate=2024-12-31`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/daily-reports/export/csv', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/daily-reports/export/csv', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
}

async function testExpenseModule() {
  console.log('\n=== 费用报销模块测试 ===\n');
  const module = '费用报销';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/expenses`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/expenses', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/expenses', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建报销
  try {
    const res = await axios.post(`${BASE_URL}/expenses`, {
      title: `测试报销_${Date.now()}`,
      items: [{
        category: '交通',
        amount: 1000,
        expenseDate: new Date().toISOString().split('T')[0],
        description: '测试费用'
      }],
      projectId: testProjectId
    }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/expenses', 'POST', '管理员', 201, res.status, res.status === 201);
  } catch (err) {
    logResult(module, '/expenses', 'POST', '管理员', 201, err.response?.status || 0, false);
  }
}

async function testProcurementModule() {
  console.log('\n=== 采购管理模块测试 ===\n');
  const module = '采购管理';
  
  // 获取列表
  try {
    const res = await axios.get(`${BASE_URL}/procurements`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/procurements', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/procurements', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
  
  // 创建采购
  try {
    const res = await axios.post(`${BASE_URL}/procurements`, {
      title: `测试采购_${Date.now()}`,
      vendor: '测试供应商',
      totalAmount: 50000,
      status: 'PLANNED',
      projectId: testProjectId
    }, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/procurements', 'POST', '管理员', 201, res.status, res.status === 201);
  } catch (err) {
    logResult(module, '/procurements', 'POST', '管理员', 201, err.response?.status || 0, false);
  }
}

async function testPermissionControl() {
  console.log('\n=== 权限控制专项测试 ===\n');
  const module = '权限控制';
  
  // 操作日志访问（销售应该被拒绝）
  try {
    const res = await axios.get(`${BASE_URL}/operation-logs`, { headers: { Authorization: `Bearer ${tokens.sales}` } });
    logResult(module, '/operation-logs', 'GET', '销售', 403, res.status, res.status === 403);
  } catch (err) {
    logResult(module, '/operation-logs', 'GET', '销售', 403, err.response?.status || 0, err.response?.status === 403);
  }
  
  // 管理员可以访问操作日志
  try {
    const res = await axios.get(`${BASE_URL}/operation-logs`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    logResult(module, '/operation-logs', 'GET', '管理员', 200, res.status, res.status === 200);
  } catch (err) {
    logResult(module, '/operation-logs', 'GET', '管理员', 200, err.response?.status || 0, false);
  }
}

// 生成报告
function generateReport() {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = ((passed / total) * 100).toFixed(2);
  
  console.log('\n' + '='.repeat(80));
  console.log('测试报告');
  console.log('='.repeat(80));
  console.log(`总测试数: ${total}`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`通过率: ${passRate}%`);
  console.log('='.repeat(80));
  
  if (failed > 0) {
    console.log('\n失败的测试:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.module} | ${r.method} ${r.api} | ${r.user} | 期望:${r.expected} 实际:${r.actual}`);
    });
  }
  
  const report = {
    summary: { total, passed, failed, passRate: `${passRate}%`, timestamp: new Date().toISOString() },
    results
  };
  
  fs.writeFileSync('api-test-report-v2.json', JSON.stringify(report, null, 2));
  console.log('\n详细报告已保存到: api-test-report-v2.json');
}

// 主函数
async function main() {
  console.log('='.repeat(80));
  console.log('CRM系统全面接口测试 V2');
  console.log('='.repeat(80));
  
  await login();
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
  await testPermissionControl();
  generateReport();
}

main().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
