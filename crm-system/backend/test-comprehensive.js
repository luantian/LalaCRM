const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// 测试账号
const TEST_ACCOUNTS = {
  admin: { username: 'admin', password: 'admin123', desc: '系统管理员(ADMIN角色)' },
  test_user1: { username: 'test_user1', password: 'test123', desc: '测试用户1(TEST_ENGINEER角色)' },
  viewer_test: { username: 'viewer_test', password: 'test123', desc: '查看者(USER角色)' },
};

const results = {
  timestamp: new Date().toISOString(),
  env: {},
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
};

// ==================== 工具函数 ====================

function log(test, account, action, status, detail) {
  const item = { test, account, action, status, detail };
  results.tests.push(item);
  results.summary.total++;
  if (status === 'PASS') results.summary.passed++;
  else if (status === 'FAIL') results.summary.failed++;
  else results.summary.skipped++;
  
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} [${account}] ${test} - ${action}: ${detail}`);
}

async function login(username, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { username, password });
  return { token: res.data.token, user: res.data.user, menus: res.data.menus };
}

async function request(token, method, url, data) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: { Authorization: `Bearer ${token}` },
      data
    };
    const res = await axios(config);
    return { success: true, status: res.status, data: res.data };
  } catch (err) {
    return { 
      success: false, 
      status: err.response?.status, 
      error: err.response?.data?.error || err.message 
    };
  }
}

// ==================== 环境检查 ====================

async function checkEnvironment() {
  console.log('\n=== 环境检查 ===');
  
  // 用户列表
  const users = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } } }
  });
  results.env.users = users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    userRoles: u.userRoles.map(ur => ur.role.roleKey)
  }));
  
  // 角色列表
  const roles = await prisma.roleModel.findMany({
    include: { _count: { select: { roleMenus: true, userRoles: true } } }
  });
  results.env.roles = roles.map(r => ({
    id: r.id,
    key: r.roleKey,
    name: r.name,
    dataScope: r.dataScope,
    menuCount: r._count.roleMenus,
    userCount: r._count.userRoles
  }));
  
  // 每个角色的权限
  results.env.rolePermissions = {};
  for (const r of roles) {
    const menus = await prisma.roleMenu.findMany({
      where: { roleId: r.id },
      include: { menu: { select: { perm: true } } }
    });
    const perms = menus.map(m => m.menu.perm).filter(p => p && p.trim());
    results.env.rolePermissions[r.roleKey] = perms;
  }
  
  console.log(`用户: ${users.length}, 角色: ${roles.length}`);
}

// ==================== 业务模块测试 ====================

async function testAuth() {
  console.log('\n=== 1. 认证模块 ===');
  const tokens = {};
  
  for (const [key, acc] of Object.entries(TEST_ACCOUNTS)) {
    try {
      const { token, user, menus } = await login(acc.username, acc.password);
      tokens[key] = { token, user, menus };
      log('认证', key, '登录', 'PASS', `成功，菜单数=${menus?.length || 0}`);
    } catch (err) {
      log('认证', key, '登录', 'FAIL', err.message);
    }
  }
  
  return tokens;
}

async function testUserManagement(tokens) {
  console.log('\n=== 2. 用户管理 ===');
  
  // 获取用户列表
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/users');
    const status = res.success ? 'PASS' : 'FAIL';
    log('用户管理', key, '获取列表', status, 
      res.success ? `返回${res.data.length}个用户` : res.error);
  }
  
  // 创建用户（只有admin应该成功）
  const newUser = {
    username: 'test_new_' + Date.now(),
    password: 'test123',
    name: '测试新用户',
    email: `test_${Date.now()}@example.com`,
    role: 'USER'
  };
  
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'POST', '/users', newUser);
    const expectSuccess = key === 'admin';
    const actualSuccess = res.success;
    const status = (expectSuccess === actualSuccess) ? 'PASS' : 'FAIL';
    log('用户管理', key, '创建用户', status,
      actualSuccess ? `成功创建id=${res.data.id}` : `被拒绝: ${res.error}`);
    
    // 清理创建的测试用户
    if (actualSuccess && res.data.id) {
      await request(token, 'DELETE', `/users/${res.data.id}`);
    }
  }
}

async function testCustomerManagement(tokens) {
  console.log('\n=== 3. 客户管理 ===');
  
  const testOrgs = {};
  
  // 创建客户
  const orgData = {
    name: '测试客户_' + Date.now(),
    type: 'COMPANY',
    industry: 'IT',
    region: '北京'
  };
  
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'POST', '/organizations', orgData);
    const actualSuccess = res.success;
    if (actualSuccess) testOrgs[key] = res.data.id;
    
    // TEST_ENGINEER和ADMIN应该能创建，USER可能被数据权限限制
    const expectSuccess = key !== 'viewer_test';
    const status = (expectSuccess === actualSuccess) ? 'PASS' : 'FAIL';
    log('客户管理', key, '创建客户', status,
      actualSuccess ? `id=${res.data.id}` : res.error);
  }
  
  // 获取客户列表
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/organizations');
    const status = res.success ? 'PASS' : 'FAIL';
    log('客户管理', key, '获取列表', status,
      res.success ? `${res.data.length}个客户` : res.error);
  }
  
  // 更新客户
  for (const [key, orgId] of Object.entries(testOrgs)) {
    const res = await request(tokens[key].token, 'PUT', `/organizations/${orgId}`, {
      name: '已更新_' + Date.now()
    });
    const status = res.success ? 'PASS' : 'FAIL';
    log('客户管理', key, '更新客户', status,
      res.success ? '成功' : res.error);
  }
  
  // 删除客户
  for (const [key, orgId] of Object.entries(testOrgs)) {
    const res = await request(tokens[key].token, 'DELETE', `/organizations/${orgId}`);
    const status = res.success ? 'PASS' : 'FAIL';
    log('客户管理', key, '删除客户', status,
      res.success ? '成功' : res.error);
  }
}

async function testProjectManagement(tokens) {
  console.log('\n=== 4. 项目管理 ===');
  
  // 先创建客户用于关联项目
  const orgRes = await request(tokens.admin.token, 'POST', '/organizations', {
    name: '项目测试客户_' + Date.now(),
    type: 'COMPANY'
  });
  
  if (!orgRes.success) {
    log('项目管理', 'admin', '创建前置客户', 'FAIL', orgRes.error);
    return;
  }
  
  const orgId = orgRes.data.id;
  const testProjects = {};
  
  // 创建项目
  const projData = {
    name: '测试项目_' + Date.now(),
    organizationId: orgId,
    status: 'IN_PROGRESS',
    budget: 100000
  };
  
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'POST', '/projects', projData);
    const actualSuccess = res.success;
    if (actualSuccess) testProjects[key] = res.data.id;
    
    const expectSuccess = key !== 'viewer_test';
    const status = (expectSuccess === actualSuccess) ? 'PASS' : 'FAIL';
    log('项目管理', key, '创建项目', status,
      actualSuccess ? `id=${res.data.id}` : res.error);
  }
  
  // 获取项目列表
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/projects');
    const status = res.success ? 'PASS' : 'FAIL';
    log('项目管理', key, '获取列表', status,
      res.success ? `${res.data.length}个项目` : res.error);
  }
  
  // 归档项目
  for (const [key, projId] of Object.entries(testProjects)) {
    const res = await request(tokens[key].token, 'PUT', `/projects/${projId}/archive`, {
      isArchived: true
    });
    const status = res.success ? 'PASS' : 'FAIL';
    log('项目管理', key, '归档项目', status,
      res.success ? '成功' : res.error);
    
    // 测试归档后能否删除（应该失败）
    const delRes = await request(tokens[key].token, 'DELETE', `/projects/${projId}`);
    const archiveProtected = !delRes.success && delRes.status === 403;
    const status2 = archiveProtected ? 'PASS' : 'FAIL';
    log('项目管理', key, '归档保护', status2,
      archiveProtected ? '正确拒绝删除' : '归档保护失效!');
    
    // 取消归档并删除
    await request(tokens[key].token, 'PUT', `/projects/${projId}/archive`, { isArchived: false });
    await request(tokens[key].token, 'DELETE', `/projects/${projId}`);
  }
  
  // 清理客户
  await request(tokens.admin.token, 'DELETE', `/organizations/${orgId}`);
}

async function testContractManagement(tokens) {
  console.log('\n=== 5. 合同管理 ===');
  
  // 创建前置数据
  const orgRes = await request(tokens.admin.token, 'POST', '/organizations', {
    name: '合同测试客户_' + Date.now(),
    type: 'COMPANY'
  });
  
  if (!orgRes.success) {
    log('合同管理', 'admin', '创建前置客户', 'FAIL', orgRes.error);
    return;
  }
  
  const orgId = orgRes.data.id;
  
  const projRes = await request(tokens.admin.token, 'POST', '/projects', {
    name: '合同测试项目_' + Date.now(),
    organizationId: orgId,
    status: 'IN_PROGRESS'
  });
  
  if (!projRes.success) {
    log('合同管理', 'admin', '创建前置项目', 'FAIL', projRes.error);
    await request(tokens.admin.token, 'DELETE', `/organizations/${orgId}`);
    return;
  }
  
  const projectId = projRes.data.id;
  const testContracts = {};
  
  // 创建合同
  const contractData = {
    name: '测试合同_' + Date.now(),
    organizationId: orgId,
    projectId: projectId,
    amount: 50000,
    signDate: '2026-01-15',
    status: 'DRAFT'
  };
  
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'POST', '/contracts', contractData);
    const actualSuccess = res.success;
    if (actualSuccess) testContracts[key] = res.data.id;
    
    const expectSuccess = key !== 'viewer_test';
    const status = (expectSuccess === actualSuccess) ? 'PASS' : 'FAIL';
    log('合同管理', key, '创建合同', status,
      actualSuccess ? `id=${res.data.id}` : res.error);
  }
  
  // 获取合同列表
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/contracts');
    const status = res.success ? 'PASS' : 'FAIL';
    log('合同管理', key, '获取列表', status,
      res.success ? `${res.data.length}个合同` : res.error);
  }
  
  // 清理
  for (const [key, contractId] of Object.entries(testContracts)) {
    await request(tokens[key].token, 'DELETE', `/contracts/${contractId}`);
  }
  await request(tokens.admin.token, 'DELETE', `/projects/${projectId}`);
  await request(tokens.admin.token, 'DELETE', `/organizations/${orgId}`);
}

async function testTaskManagement(tokens) {
  console.log('\n=== 6. 任务管理（无权限检查） ===');
  
  // 创建任务（任何人可以给任何人分配）
  const testTasks = {};
  
  for (const [key, { token, user }] of Object.entries(tokens)) {
    // 给admin分配任务
    const res = await request(token, 'POST', '/tasks', {
      title: `${user.name}分配的任务_${Date.now()}`,
      description: '测试任务',
      assigneeIds: [35], // admin的id
      priority: 'MEDIUM',
      taskType: 'DAILY_WORK'
    });
    
    const actualSuccess = res.success;
    if (actualSuccess) testTasks[key] = res.data.id;
    
    // 所有人都应该能创建任务（无权限检查）
    const status = actualSuccess ? 'PASS' : 'FAIL';
    log('任务管理', key, '创建任务', status,
      actualSuccess ? `id=${res.data.id}` : res.error);
  }
  
  // 获取任务列表（只能看到自己相关的）
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/tasks');
    const status = res.success ? 'PASS' : 'FAIL';
    log('任务管理', key, '获取列表', status,
      res.success ? `${res.data.length}个任务` : res.error);
  }
  
  // 删除任务（只有创建者能删除）
  for (const [key, taskId] of Object.entries(testTasks)) {
    const res = await request(tokens[key].token, 'DELETE', `/tasks/${taskId}`);
    const status = res.success ? 'PASS' : 'FAIL';
    log('任务管理', key, '删除任务', status,
      res.success ? '成功' : res.error);
  }
}

async function testDashboard(tokens) {
  console.log('\n=== 7. 仪表盘 ===');
  
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/dashboard/stats');
    const status = res.success ? 'PASS' : 'FAIL';
    log('仪表盘', key, '获取统计', status,
      res.success ? '成功' : res.error);
  }
}

async function testLogs(tokens) {
  console.log('\n=== 8. 日志管理 ===');
  
  // 操作日志（硬编码isAdmin检查）
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/operation-logs');
    const expectSuccess = key === 'admin';
    const actualSuccess = res.success;
    const status = (expectSuccess === actualSuccess) ? 'PASS' : 'FAIL';
    log('日志管理', key, '操作日志', status,
      actualSuccess ? `成功` : `被拒绝: ${res.error}`);
  }
  
  // 登录日志
  for (const [key, { token }] of Object.entries(tokens)) {
    const res = await request(token, 'GET', '/login-logs');
    const expectSuccess = key === 'admin';
    const actualSuccess = res.success;
    const status = (expectSuccess === actualSuccess) ? 'PASS' : 'FAIL';
    log('日志管理', key, '登录日志', status,
      actualSuccess ? `成功` : `被拒绝: ${res.error}`);
  }
}

// ==================== 生成报告 ====================

function generateReport() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>LalaCRM 全面测试报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #f5f7fa; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #1e293b; margin-bottom: 10px; font-size: 28px; }
    .timestamp { color: #64748b; font-size: 14px; margin-bottom: 30px; }
    
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; }
    .summary-card h3 { font-size: 14px; color: #64748b; margin-bottom: 8px; }
    .summary-card .value { font-size: 36px; font-weight: 700; }
    .total .value { color: #3b82f6; }
    .passed .value { color: #10b981; }
    .failed .value { color: #ef4444; }
    .skipped .value { color: #f59e0b; }
    
    .env-section { background: white; padding: 24px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .env-section h2 { font-size: 20px; color: #1e293b; margin-bottom: 16px; }
    .env-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .env-box { background: #f8fafc; padding: 16px; border-radius: 8px; }
    .env-box h4 { color: #475569; font-size: 14px; margin-bottom: 8px; }
    .env-box ul { list-style: none; font-size: 13px; color: #64748b; }
    .env-box li { padding: 4px 0; }
    .env-box code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; }
    
    .test-section { background: white; padding: 24px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .test-section h2 { font-size: 20px; color: #1e293b; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
    
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; color: #475569; font-size: 13px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
    tr:hover { background: #f8fafc; }
    
    .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge-pass { background: #d1fae5; color: #065f46; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    .badge-skip { background: #fef3c7; color: #92400e; }
    
    .fail-row { background: #fef2f2; }
    .fail-row:hover { background: #fee2e2; }
    
    .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); transition: width 0.3s; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧪 LalaCRM 全面测试报告</h1>
    <div class="timestamp">生成时间: ${new Date(results.timestamp).toLocaleString('zh-CN')}</div>
    
    <div class="summary-grid">
      <div class="summary-card total">
        <h3>总测试数</h3>
        <div class="value">${results.summary.total}</div>
      </div>
      <div class="summary-card passed">
        <h3>通过</h3>
        <div class="value">${results.summary.passed}</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${(results.summary.passed/results.summary.total*100).toFixed(1)}%"></div></div>
      </div>
      <div class="summary-card failed">
        <h3>失败</h3>
        <div class="value">${results.summary.failed}</div>
      </div>
      <div class="summary-card skipped">
        <h3>跳过</h3>
        <div class="value">${results.summary.skipped}</div>
      </div>
    </div>
    
    <div class="env-section">
      <h2>📊 测试环境</h2>
      <div class="env-grid">
        <div class="env-box">
          <h4>👥 测试用户 (${results.env.users?.length || 0})</h4>
          <ul>
            ${(results.env.users || []).map(u => `
              <li><code>${u.username}</code> - ${u.name} [${u.userRoles.join(', ')}]</li>
            `).join('')}
          </ul>
        </div>
        <div class="env-box">
          <h4>🔐 角色配置 (${results.env.roles?.length || 0})</h4>
          <ul>
            ${(results.env.roles || []).map(r => `
              <li><code>${r.key}</code> - ${r.name} (${r.menuCount}个菜单, ${r.userCount}个用户)</li>
            `).join('')}
          </ul>
        </div>
      </div>
    </div>
    
    <div class="test-section">
      <h2>📋 测试详情</h2>
      <table>
        <thead>
          <tr>
            <th>测试模块</th>
            <th>测试账号</th>
            <th>操作</th>
            <th>结果</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          ${results.tests.map(t => `
            <tr class="${t.status === 'FAIL' ? 'fail-row' : ''}">
              <td>${t.test}</td>
              <td><code>${t.account}</code></td>
              <td>${t.action}</td>
              <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
              <td>${t.detail}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
  
  const fs = require('fs');
  const path = require('path');
  const reportPath = path.join(__dirname, '../comprehensive-test-report.html');
  fs.writeFileSync(reportPath, html);
  console.log(`\n📄 报告已生成: ${reportPath}`);
  
  return reportPath;
}

// ==================== 主流程 ====================

async function main() {
  console.log('🚀 开始全面测试...\n');
  
  await checkEnvironment();
  
  const tokens = await testAuth();
  
  if (Object.keys(tokens).length === 0) {
    console.error('❌ 没有任何账号能登录，终止测试');
    process.exit(1);
  }
  
  await testUserManagement(tokens);
  await testCustomerManagement(tokens);
  await testProjectManagement(tokens);
  await testContractManagement(tokens);
  await testTaskManagement(tokens);
  await testDashboard(tokens);
  await testLogs(tokens);
  
  const reportPath = generateReport();
  
  console.log('\n=== 测试完成 ===');
  console.log(`总计: ${results.summary.total}`);
  console.log(`通过: ${results.summary.passed} (${(results.summary.passed/results.summary.total*100).toFixed(1)}%)`);
  console.log(`失败: ${results.summary.failed}`);
  console.log(`跳过: ${results.summary.skipped}`);
}

main().catch(err => {
  console.error('测试脚本错误:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
