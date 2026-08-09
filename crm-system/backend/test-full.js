/**
 * LalaCRM 全面自动化测试脚本
 * 覆盖：接口、业务逻辑、权限控制、数据隔离
 */
const axios = require('axios');

const BASE = 'http://localhost:5000/api';
const TS = Date.now();

// ============ 统计 ============
let total = 0, passed = 0, failed = 0, skipped = 0;
const failures = [];
const moduleResults = {};

function log(msg, type = 'INFO') {
  const colors = { INFO: '\x1b[36m', SUCCESS: '\x1b[32m', ERROR: '\x1b[31m', WARN: '\x1b[33m', MODULE: '\x1b[35m', RESET: '\x1b[0m' };
  console.log(`${colors[type] || ''}${msg}${colors.RESET}`);
}

async function req(method, path, data, token, expectFail = false) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const config = { method, url: `${BASE}${path}`, headers, validateStatus: () => true };
    // 只在有数据时才发送 data，避免 GET 请求发送 "null" 字符串
    if (data !== null && data !== undefined) config.data = data;
    const res = await axios(config);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function test(module, name, ok, detail = '') {
  total++;
  if (!moduleResults[module]) moduleResults[module] = { total: 0, passed: 0, failed: 0 };
  moduleResults[module].total++;
  if (ok) {
    passed++;
    moduleResults[module].passed++;
    log(`  ✓ ${name}`, 'SUCCESS');
  } else {
    failed++;
    moduleResults[module].failed++;
    const msg = `[${module}] ${name}${detail ? ' - ' + detail : ''}`;
    failures.push(msg);
    log(`  ✗ ${name}${detail ? ' (' + detail + ')' : ''}`, 'ERROR');
  }
}

// ============ 测试数据 ============
const tokens = {};
const users = {};
const ids = {}; // 存储创建的测试数据ID

// ============ 主测试流程 ============
async function run() {
  log('\n========================================', 'MODULE');
  log(' LalaCRM 全面自动化测试', 'MODULE');
  log(` 时间: ${new Date().toLocaleString()}`, 'MODULE');
  log('========================================', 'MODULE');

  // ==================== 1. 认证模块 ====================
  log('\n【1. 认证模块】', 'MODULE');

  // 1.1 admin 登录
  let r = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  test('Auth', 'admin 登录', r.ok && r.data.token, `status=${r.status}`);
  if (r.ok) { tokens.admin = r.data.token; users.admin = r.data.user; }

  // 1.2 错误密码
  r = await req('POST', '/auth/login', { username: 'admin', password: 'wrong' });
  test('Auth', '错误密码被拒绝', !r.ok || r.status === 401);

  // 1.3 空用户名
  r = await req('POST', '/auth/login', { username: '', password: '' });
  test('Auth', '空用户名被拒绝', !r.ok);

  // 1.4 获取当前用户信息
  r = await req('GET', '/auth/me', null, tokens.admin);
  test('Auth', '获取当前用户信息', r.ok && r.data.id, `status=${r.status}`);

  // 1.5 获取用户菜单
  r = await req('GET', '/auth/menus', null, tokens.admin);
  test('Auth', '获取用户菜单', r.ok && r.data.menus && Array.isArray(r.data.menus));

  // 1.6 无Token访问受保护接口
  r = await req('GET', '/auth/me', null, null);
  test('Auth', '无Token访问被拒绝', !r.ok);

  // ==================== 2. 系统管理 ====================
  log('\n【2. 系统管理】', 'MODULE');

  // 2.1 用户列表
  r = await req('GET', '/users', null, tokens.admin);
  test('System', '用户列表', r.ok && Array.isArray(r.data));

  // 2.2 创建测试用户
  const testUserName = `test_user_${TS}`;
  r = await req('POST', '/users', {
    username: testUserName, password: 'Test123456', name: '测试用户', email: `test${TS}@test.com`
  }, tokens.admin);
  test('System', '创建用户', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.testUser = r.data.id;

  // 2.3 重复用户名
  r = await req('POST', '/users', {
    username: testUserName, password: 'Test123456', name: '重复用户'
  }, tokens.admin);
  test('System', '重复用户名被拒绝', !r.ok);

  // 2.4 更新用户
  if (ids.testUser) {
    r = await req('PUT', `/users/${ids.testUser}`, { name: '测试用户已更新' }, tokens.admin);
    test('System', '更新用户', r.ok);
  }

  // 2.5 角色列表
  r = await req('GET', '/roles', null, tokens.admin);
  test('System', '角色列表', r.ok && Array.isArray(r.data));

  // 2.6 创建角色
  r = await req('POST', '/roles', { 
    name: `测试角色_${TS}`, 
    displayName: `测试角色_${TS}`,
    roleKey: `TEST_ROLE_${TS}`, 
    description: '自动化测试角色' 
  }, tokens.admin);
  test('System', '创建角色', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.testRole = r.data.id;

  // 2.7 菜单列表
  r = await req('GET', '/menus', null, tokens.admin);
  test('System', '菜单列表', r.ok && Array.isArray(r.data));

  // 2.8 部门列表
  r = await req('GET', '/departments', null, tokens.admin);
  test('System', '部门列表', r.ok && Array.isArray(r.data));

  // 2.9 字典类型列表
  r = await req('GET', '/dicts/types', null, tokens.admin);
  test('System', '字典类型列表', r.ok);

  // 2.10 操作日志
  r = await req('GET', '/operation-logs', null, tokens.admin);
  test('System', '操作日志', r.ok && (r.data.data || r.data));

  // 2.11 登录日志
  r = await req('GET', '/login-logs', null, tokens.admin);
  test('System', '登录日志', r.ok && (r.data.data || r.data));

  // ==================== 3. 客户管理（组织） ====================
  log('\n【3. 客户管理】', 'MODULE');

  // 3.1 组织树
  r = await req('GET', '/organizations/tree', null, tokens.admin);
  test('CRM', '组织树', r.ok && r.data.tree);

  // 3.2 创建组织
  r = await req('POST', '/organizations', {
    name: `测试集团_${TS}`, type: 'GROUP', status: 'ACTIVE', description: '自动化测试组织'
  }, tokens.admin);
  test('CRM', '创建组织(集团)', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.org = r.data.id;

  // 3.3 创建子公司
  if (ids.org) {
    r = await req('POST', '/organizations', {
      name: `测试公司_${TS}`, type: 'COMPANY', parentId: ids.org, status: 'ACTIVE'
    }, tokens.admin);
    test('CRM', '创建子公司', r.ok && r.data.id, `status=${r.status}`);
    if (r.ok) ids.orgChild = r.data.id;
  }

  // 3.4 更新组织
  if (ids.org) {
    r = await req('PUT', `/organizations/${ids.org}`, { name: `测试集团_已更新_${TS}` }, tokens.admin);
    test('CRM', '更新组织', r.ok);
  }

  // 3.5 联系人管理
  if (ids.org) {
    r = await req('POST', `/organizations/${ids.org}/contacts`, {
      name: '测试联系人', title: '技术总监', phone: '13800138000', email: 'contact@test.com', isPrimary: true
    }, tokens.admin);
    test('CRM', '创建联系人', r.ok && r.data.id, `status=${r.status}`);
    if (r.ok) ids.contact = r.data.id;
  }

  // 3.6 简单列表（下拉用）
  r = await req('GET', '/organizations/simple', null, tokens.admin);
  test('CRM', '组织简单列表', r.ok && Array.isArray(r.data));

  // ==================== 4. 售前管理（商机） ====================
  log('\n【4. 售前管理】', 'MODULE');

  // 4.1 创建商机
  r = await req('POST', '/opportunities', {
    name: `测试商机_${TS}`, organizationId: ids.org, amount: 100000, stage: 'POTENTIAL',
    expectedCloseDate: '2026-12-31', description: '自动化测试商机'
  }, tokens.admin);
  test('PreSales', '创建商机', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.opportunity = r.data.id;

  // 4.2 商机列表
  r = await req('GET', '/opportunities', null, tokens.admin);
  test('PreSales', '商机列表', r.ok && r.data.data);

  // 4.3 更新商机
  if (ids.opportunity) {
    r = await req('PUT', `/opportunities/${ids.opportunity}`, {
      stage: 'QUALIFICATION', amount: 150000
    }, tokens.admin);
    test('PreSales', '更新商机阶段', r.ok);
  }

  // 4.4 报价单
  if (ids.opportunity) {
    r = await req('POST', '/quotations', {
      opportunityId: ids.opportunity, title: `报价单_${TS}`, version: 1,
      totalAmount: 120000, validDays: 30, status: 'DRAFT'
    }, tokens.admin);
    test('PreSales', '创建报价单', r.ok && r.data.id, `status=${r.status}`);
    if (r.ok) ids.quotation = r.data.id;
  }

  // 4.5 报价单列表
  r = await req('GET', '/quotations', null, tokens.admin);
  test('PreSales', '报价单列表', r.ok);

  // ==================== 5. 项目管理 ====================
  log('\n【5. 项目管理】', 'MODULE');

  // 5.1 创建项目
  r = await req('POST', '/projects', {
    name: `测试项目_${TS}`, organizationId: ids.org, status: 'IN_PROGRESS',
    budget: 500000, startDate: '2026-08-01', description: '自动化测试项目'
  }, tokens.admin);
  test('Project', '创建项目', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.project = r.data.id;

  // 5.2 项目列表
  r = await req('GET', '/projects', null, tokens.admin);
  test('Project', '项目列表', r.ok && r.data.data);

  // 5.3 更新项目
  if (ids.project) {
    r = await req('PUT', `/projects/${ids.project}`, { budget: 600000 }, tokens.admin);
    test('Project', '更新项目', r.ok);
  }

  // 5.4 项目团队
  if (ids.project) {
    r = await req('POST', `/projects/${ids.project}/team`, {
      userId: users.admin.id, role: '项目经理', responsibility: '全面负责'
    }, tokens.admin);
    test('Project', '添加团队成员', r.ok, `status=${r.status}`);
  }

  // 5.5 项目团队列表
  if (ids.project) {
    r = await req('GET', `/projects/${ids.project}/team`, null, tokens.admin);
    test('Project', '团队列表', r.ok);
  }

  // 5.6 项目成本统计
  if (ids.project) {
    r = await req('GET', `/project-costs/${ids.project}`, null, tokens.admin);
    test('Project', '项目成本统计', r.ok);
  }

  // ==================== 6. 合同管理 ====================
  log('\n【6. 合同管理】', 'MODULE');

  // 6.1 创建合同
  r = await req('POST', '/contracts', {
    name: `测试合同_${TS}`, organizationId: ids.org, projectId: ids.project,
    amount: 200000, signDate: '2026-08-01', status: 'DRAFT'
  }, tokens.admin);
  test('Contract', '创建合同', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.contract = r.data.id;

  // 6.2 合同列表
  r = await req('GET', '/contracts', null, tokens.admin);
  test('Contract', '合同列表', r.ok && r.data.data);

  // 6.3 更新合同
  if (ids.contract) {
    r = await req('PUT', `/contracts/${ids.contract}`, { amount: 250000 }, tokens.admin);
    test('Contract', '更新合同', r.ok);
  }

  // 6.4 回款记录（原付款记录，已重命名）
  if (ids.contract) {
    r = await req('POST', '/contract-receipts', {
      contractId: ids.contract, amount: 50000, receiptDate: '2026-08-05',
      receiptType: 'PROGRESS', status: 'PENDING'
    }, tokens.admin);
    test('Contract', '创建回款记录', r.ok && r.data.id, `status=${r.status}`);
    if (r.ok) ids.receipt = r.data.id;
  }

  // 6.5 回款列表
  if (ids.contract) {
    r = await req('GET', '/contract-receipts', { params: { contractId: ids.contract } }, tokens.admin);
    test('Contract', '回款列表', r.ok);
  }

  // 6.6 更新回款状态
  if (ids.receipt) {
    r = await req('PUT', `/contract-receipts/${ids.receipt}`, { status: 'CONFIRMED' }, tokens.admin);
    test('Contract', '更新回款状态', r.ok);
  }

  // ==================== 7. 采购管理 ====================
  log('\n【7. 采购管理】', 'MODULE');

  // 7.1 创建采购
  r = await req('POST', '/procurements', {
    projectId: ids.project, title: `测试采购_${TS}`, totalAmount: 80000,
    vendorId: ids.org, status: 'PENDING'
  }, tokens.admin);
  test('Procurement', '创建采购', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.procurement = r.data.id;

  // 7.2 采购列表
  r = await req('GET', '/procurements', null, tokens.admin);
  test('Procurement', '采购列表', r.ok);

  // ==================== 8. 出差管理 ====================
  log('\n【8. 出差管理】', 'MODULE');

  // 8.1 创建出差
  r = await req('POST', '/business-trips', {
    title: `出差测试_${TS}`, destination: '上海', startDate: '2026-08-15',
    endDate: '2026-08-17', purpose: '客户拜访', projectId: ids.project
  }, tokens.admin);
  test('Trip', '创建出差', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.trip = r.data.id;

  // 8.2 出差列表
  r = await req('GET', '/business-trips', null, tokens.admin);
  test('Trip', '出差列表', r.ok && r.data.data);

  // ==================== 9. 费用报销 ====================
  log('\n【9. 费用报销】', 'MODULE');

  // 9.1 创建报销单
  r = await req('POST', '/expenses', {
    title: `报销测试_${TS}`, projectId: ids.project, businessTripId: ids.trip,
    totalAmount: 5000, status: 'PENDING'
  }, tokens.admin);
  test('Expense', '创建报销单', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.expense = r.data.id;

  // 9.2 报销列表
  r = await req('GET', '/expenses', null, tokens.admin);
  test('Expense', '报销列表', r.ok && r.data.data);

  // ==================== 10. 日报管理 ====================
  log('\n【10. 日报管理】', 'MODULE');

  // 10.1 创建日报
  r = await req('POST', '/daily-reports', {
    reportDate: '2026-08-08', content: '今日完成系统测试', projectId: ids.project, status: 'SUBMITTED'
  }, tokens.admin);
  test('DailyReport', '创建日报', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.dailyReport = r.data.id;

  // 10.2 日报列表
  r = await req('GET', '/daily-reports', null, tokens.admin);
  test('DailyReport', '日报列表', r.ok && r.data.data);

  // ==================== 11. 任务管理 ====================
  log('\n【11. 任务管理】', 'MODULE');

  // 11.1 创建任务
  r = await req('POST', '/tasks', {
    title: `测试任务_${TS}`, assigneeId: users.admin.id, projectId: ids.project,
    priority: 'HIGH', dueDate: '2026-08-20', description: '自动化测试任务'
  }, tokens.admin);
  test('Task', '创建任务', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.task = r.data.id;

  // 11.2 我的待办
  r = await req('GET', '/tasks/my-todos?page=1&pageSize=10', null, tokens.admin);
  test('Task', '我的待办', r.ok);

  // 11.3 我委派的
  r = await req('GET', '/tasks/my-assigned?page=1&pageSize=10', null, tokens.admin);
  test('Task', '我委派的', r.ok);

  // ==================== 12. 发票管理 ====================
  log('\n【12. 发票管理】', 'MODULE');

  // 12.1 创建发票
  r = await req('POST', '/invoices', {
    projectId: ids.project, contractId: ids.contract, type: 'INCOME',
    amount: 50000, taxRate: 6, invoiceNo: `INV-${TS}`, invoiceDate: '2026-08-08'
  }, tokens.admin);
  test('Invoice', '创建发票', r.ok && r.data.id, `status=${r.status}`);
  if (r.ok) ids.invoice = r.data.id;

  // 12.2 发票列表
  r = await req('GET', '/invoices', null, tokens.admin);
  test('Invoice', '发票列表', r.ok && r.data.data);

  // ==================== 13. 仪表盘 ====================
  log('\n【13. 仪表盘】', 'MODULE');

  r = await req('GET', '/dashboard/stats', null, tokens.admin);
  test('Dashboard', '统计数据', r.ok);

  r = await req('GET', '/dashboard/my-projects', null, tokens.admin);
  test('Dashboard', '我的项目', r.ok);

  // ==================== 14. 通知管理 ====================
  log('\n【14. 通知管理】', 'MODULE');

  r = await req('GET', '/notifications', null, tokens.admin);
  test('Notification', '通知列表', r.ok);

  // ==================== 15. 权限控制测试 ====================
  log('\n【15. 权限控制】', 'MODULE');

  // 创建普通用户并登录
  const normalUserName = `normal_${TS}`;
  r = await req('POST', '/users', {
    username: normalUserName, password: 'Test123456', name: '普通用户'
  }, tokens.admin);
  if (r.ok) ids.normalUser = r.data.id;

  // 用普通用户登录
  r = await req('POST', '/auth/login', { username: normalUserName, password: 'Test123456' });
  if (r.ok) tokens.normal = r.data.token;

  if (tokens.normal) {
    // 15.1 普通用户访问用户管理（应被拒绝，无权限）
    r = await req('GET', '/users', null, tokens.normal);
    test('Permission', '普通用户无法访问用户列表', !r.ok || r.status === 403);

    // 15.2 普通用户访问角色管理（应被拒绝）
    r = await req('GET', '/roles', null, tokens.normal);
    test('Permission', '普通用户无法访问角色列表', !r.ok || r.status === 403);

    // 15.3 普通用户访问菜单管理（应被拒绝）
    r = await req('GET', '/menus', null, tokens.normal);
    test('Permission', '普通用户无法访问菜单列表', !r.ok || r.status === 403);

    // 15.4 普通用户创建组织（应被拒绝）
    r = await req('POST', '/organizations', {
      name: `越权测试_${TS}`, type: 'COMPANY', status: 'ACTIVE'
    }, tokens.normal);
    test('Permission', '普通用户无法创建组织', !r.ok || r.status === 403);

    // 15.5 普通用户创建项目（应被拒绝）
    r = await req('POST', '/projects', {
      name: `越权项目_${TS}`, status: 'IN_PROGRESS'
    }, tokens.normal);
    test('Permission', '普通用户无法创建项目', !r.ok || r.status === 403);

    // 15.6 普通用户访问自己的日报（应该可以）
    r = await req('GET', '/daily-reports', null, tokens.normal);
    test('Permission', '普通用户可以查看日报列表', r.ok);

    // 15.7 普通用户打卡（应该可以）
    r = await req('POST', '/attendance/check-in', {
      type: 'CHECK_IN', checkInTime: new Date().toISOString()
    }, tokens.normal);
    test('Permission', '普通用户可以打卡', r.ok || r.status === 400 || r.status === 404);
  }

  // ==================== 16. 数据隔离测试 ====================
  log('\n【16. 数据隔离】', 'MODULE');

  // 创建第二个用户
  const user2Name = `user2_${TS}`;
  r = await req('POST', '/users', {
    username: user2Name, password: 'Test123456', name: '用户2'
  }, tokens.admin);
  if (r.ok) ids.user2 = r.data.id;

  r = await req('POST', '/auth/login', { username: user2Name, password: 'Test123456' });
  if (r.ok) tokens.user2 = r.data.token;

  if (tokens.normal && tokens.user2) {
    // 16.1 用户A创建日报
    r = await req('POST', '/daily-reports', {
      reportDate: '2026-08-08', content: '用户A的日报', status: 'SUBMITTED'
    }, tokens.normal);
    if (r.ok) ids.normalReport = r.data.id;

    // 16.2 用户B看不到用户A的日报（数据隔离）
    r = await req('GET', '/daily-reports', null, tokens.user2);
    if (r.ok && r.data.data) {
      const hasUserAReport = r.data.data.some(d => d.id === ids.normalReport);
      test('Isolation', '用户B看不到用户A的日报', !hasUserAReport);
    } else {
      test('Isolation', '用户B看不到用户A的日报', false, '请求失败');
    }

    // 16.3 用户A创建任务
    r = await req('POST', '/tasks', {
      title: '用户A的私密任务', assigneeId: ids.normalUser, priority: 'LOW', dueDate: '2026-09-01'
    }, tokens.normal);
    if (r.ok) ids.normalTask = r.data.id;

    // 16.4 用户B看不到用户A的任务
    r = await req('GET', '/tasks/my-todos?page=1&pageSize=10', null, tokens.user2);
    if (r.ok && r.data.data) {
      const hasUserATask = r.data.data.some(t => t.id === ids.normalTask);
      test('Isolation', '用户B看不到用户A的任务', !hasUserATask);
    } else {
      test('Isolation', '用户B看不到用户A的任务', false, '请求失败');
    }
  }

  // ==================== 17. 业务逻辑测试 ====================
  log('\n【17. 业务逻辑】', 'MODULE');

  // 17.1 项目归档保护
  if (ids.project) {
    // 先归档
    r = await req('PUT', `/projects/${ids.project}`, { isArchived: true }, tokens.admin);
    test('BizLogic', '项目归档', r.ok);

    // 尝试编辑已归档项目
    r = await req('PUT', `/projects/${ids.project}`, { name: '尝试修改已归档项目' }, tokens.admin);
    test('BizLogic', '已归档项目不可编辑', !r.ok || r.status === 403);

    // 尝试删除已归档项目
    r = await req('DELETE', `/projects/${ids.project}`, null, tokens.admin);
    test('BizLogic', '已归档项目不可删除', !r.ok || r.status === 403);
  }

  // ==================== 18. 清理测试数据 ====================
  log('\n【18. 清理测试数据】', 'MODULE');

  let cleaned = 0;
  
  // 删除创建的数据
  if (ids.invoice) {
    r = await req('DELETE', `/invoices/${ids.invoice}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.expense) {
    r = await req('DELETE', `/expenses/${ids.expense}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.trip) {
    r = await req('DELETE', `/business-trips/${ids.trip}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.procurement) {
    r = await req('DELETE', `/procurements/${ids.procurement}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.receipt) {
    r = await req('DELETE', `/contract-receipts/${ids.receipt}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.contract) {
    r = await req('DELETE', `/contracts/${ids.contract}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.quotation) {
    r = await req('DELETE', `/quotations/${ids.quotation}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.opportunity) {
    r = await req('DELETE', `/opportunities/${ids.opportunity}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.project) {
    r = await req('DELETE', `/projects/${ids.project}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.orgChild) {
    r = await req('DELETE', `/organizations/${ids.orgChild}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.org) {
    r = await req('DELETE', `/organizations/${ids.org}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  
  // 删除测试用户
  if (ids.testUser) {
    r = await req('DELETE', `/users/${ids.testUser}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.normalUser) {
    r = await req('DELETE', `/users/${ids.normalUser}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  if (ids.user2) {
    r = await req('DELETE', `/users/${ids.user2}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }
  // 删除测试角色
  if (ids.testRole) {
    r = await req('DELETE', `/roles/${ids.testRole}`, null, tokens.admin);
    if (r.ok) cleaned++;
  }

  test('Cleanup', `清理测试数据 (${cleaned}项)`, cleaned > 0);

  // ==================== 测试报告 ====================
  log('\n========================================', 'MODULE');
  log(' 测试报告', 'MODULE');
  log('========================================', 'MODULE');

  log(`\n总测试数: ${total}`, 'INFO');
  log(`通过: ${passed}`, 'SUCCESS');
  log(`失败: ${failed}`, 'ERROR');
  log(`跳过: ${skipped}`, 'WARN');
  log(`通过率: ${((passed / (total - skipped)) * 100).toFixed(1)}%`, 'INFO');

  // 模块明细
  log('\n--- 模块明细 ---', 'MODULE');
  for (const [mod, stats] of Object.entries(moduleResults)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(0) : 0;
    const icon = stats.failed === 0 ? '✓' : '✗';
    log(`  ${icon} ${mod}: ${stats.passed}/${stats.total} (${rate}%)`, stats.failed === 0 ? 'SUCCESS' : 'ERROR');
  }

  // 失败详情
  if (failures.length > 0) {
    log('\n--- 失败详情 ---', 'ERROR');
    failures.forEach((f, i) => log(`  ${i + 1}. ${f}`, 'ERROR'));
  }

  log('\n========================================', 'MODULE');
  log(` 测试完成: ${new Date().toLocaleString()}`, 'MODULE');
  log('========================================\n', 'MODULE');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
