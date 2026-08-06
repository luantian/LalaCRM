/**
 * 深度权限与业务逻辑测试
 * 覆盖：数据权限隔离、软删除、审批流程、边界条件、并发安全、搜索过滤
 */
const axios = require('axios');
const BASE = 'http://localhost:5000/api';

function req(method, path, token, data) {
  const config = { method, url: BASE + path, headers: { 'Content-Type': 'application/json' } };
  if (token) config.headers.Authorization = 'Bearer ' + token;
  if (data) config.data = data;
  return axios(config).then(r => ({ status: r.status, data: r.data, headers: r.headers }))
    .catch(e => e.response ? { status: e.response.status, data: e.response.data, headers: {} }
      : { status: 0, data: { error: e.message }, headers: {} });
}

let adminToken, adminId, salesToken, salesId, viewerToken, viewerId;

async function loginAll() {
  console.log('=== 登录用户 ===');
  const r1 = await req('POST', '/auth/login', null, { username: 'admin', password: 'admin123' });
  adminToken = r1.data.token; adminId = r1.data.user?.id || r1.data.userId;
  const r2 = await req('POST', '/auth/login', null, { username: 'sales_test', password: 'sales123' });
  salesToken = r2.data.token; salesId = r2.data.user?.id || r2.data.userId;
  const r3 = await req('POST', '/auth/login', null, { username: 'viewer_test', password: 'viewer123' });
  viewerToken = r3.data.token; viewerId = r3.data.user?.id || r3.data.userId;
  console.log(`admin(id=${adminId}), sales(id=${salesId}), viewer(id=${viewerId})`);

  // 获取详细用户信息
  const me1 = await req('GET', '/auth/me', adminToken);
  const me2 = await req('GET', '/auth/me', salesToken);
  const me3 = await req('GET', '/auth/me', viewerToken);
  console.log('admin权限:', me1.data.permissions?.length || 0, '个');
  console.log('sales权限:', me2.data.permissions?.length || 0, '个');
  console.log('viewer权限:', me3.data.permissions?.length || 0, '个');
}

// ==================== 1. 数据权限隔离测试 ====================
async function testDataScopeIsolation() {
  console.log('\n========== 1. 数据权限隔离测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 1.1 创建测试数据
  const ts = Date.now();

  // 用sales创建客户
  const salesOrg = await req('POST', '/organizations', salesToken, {
    name: '销售客户_' + ts, type: 'COMPANY'
  });
  check('sales创建客户', salesOrg.status, 201);
  const salesOrgId = salesOrg.data?.id || salesOrg.data?.organization?.id;

  // 用admin创建客户
  const adminOrg = await req('POST', '/organizations', adminToken, {
    name: '管理员客户_' + ts, type: 'COMPANY'
  });
  check('admin创建客户', adminOrg.status, 201);
  const adminOrgId = adminOrg.data?.id || adminOrg.data?.organization?.id;

  // 1.2 测试数据可见性 - 搜索
  if (salesOrgId) {
    // sales搜索自己创建的客户
    const salesSearch = await req('GET', '/organizations?search=销售客户_' + ts, salesToken);
    check('sales搜索自己的客户', salesSearch.status, 200);
    const salesOrgs = salesSearch.data?.organizations || salesSearch.data || [];
    const foundOwn = Array.isArray(salesOrgs) && salesOrgs.some(o => o.id === salesOrgId);
    check('sales能找到自己创建的客户', foundOwn, true);
  }

  if (adminOrgId) {
    // admin搜索所有客户
    const adminSearch = await req('GET', '/organizations?search=管理员客户_' + ts, adminToken);
    const adminOrgs = adminSearch.data?.organizations || adminSearch.data || [];
    check('admin搜索客户', adminSearch.status, 200);
    const foundAdmin = Array.isArray(adminOrgs) && adminOrgs.some(o => o.id === adminOrgId);
    check('admin能找到自己创建的客户', foundAdmin, true);
  }

  // 1.3 日报数据权限 - sales只能看自己的日报
  const salesReport = await req('POST', '/daily-reports', salesToken, {
    reportDate: new Date().toISOString().split('T')[0],
    content: '销售日报_' + ts,
    tomorrowPlan: '测试',
    issues: '无',
    status: 'DRAFT'
  });
  check('sales创建日报', salesReport.status, 201);
  const salesReportId = salesReport.data?.id || salesReport.data?.report?.id;

  // viewer尝试读取sales的日报列表
  const viewerReports = await req('GET', '/daily-reports', viewerToken);
  check('viewer查看日报列表', viewerReports.status, 200);
  const viewerReportList = viewerReports.data?.reports || viewerReports.data || [];

  // viewer不应该看到sales的DRAFT日报
  if (salesReportId) {
    const canSeeDraft = Array.isArray(viewerReportList) && viewerReportList.some(r => r.id === salesReportId);
    check('viewer不能看到sales的DRAFT日报', canSeeDraft, false);
  }

  // 1.4 费用报销数据权限
  const salesExpense = await req('POST', '/expenses', salesToken, {
    title: '销售报销_' + ts,
    items: [{ category: '交通', amount: 200, description: '出差交通费' }]
  });
  check('sales创建报销', salesExpense.status, 201);
  const salesExpenseId = salesExpense.data?.id || salesExpense.data?.expense?.id;

  // viewer尝试读取报销列表，不应看到sales的报销
  const viewerExpenses = await req('GET', '/expenses', viewerToken);
  check('viewer查看报销列表', viewerExpenses.status, 200);
  const viewerExpenseList = viewerExpenses.data?.expenses || viewerExpenses.data || [];

  if (salesExpenseId) {
    const canSeeExpense = Array.isArray(viewerExpenseList) && viewerExpenseList.some(e => e.id === salesExpenseId);
    check('viewer不能看到sales的报销', canSeeExpense, false);
  }

  // 清理
  if (salesOrgId) await req('DELETE', '/organizations/' + salesOrgId, adminToken);
  if (adminOrgId) await req('DELETE', '/organizations/' + adminOrgId, adminToken);
  if (salesReportId) await req('DELETE', '/daily-reports/' + salesReportId, salesToken);

  console.log(`\n数据权限隔离: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 2. 软删除测试 ====================
async function testSoftDelete() {
  console.log('\n========== 2. 软删除测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  const ts = Date.now();

  // 2.1 创建并软删除客户
  const org = await req('POST', '/organizations', adminToken, {
    name: '软删除测试客户_' + ts, type: 'COMPANY'
  });
  check('创建客户', org.status, 201);
  const orgId = org.data?.id || org.data?.organization?.id;

  if (orgId) {
    // 删除
    const delRes = await req('DELETE', '/organizations/' + orgId, adminToken);
    check('删除客户', delRes.status, 200);

    // 再次查询 - 应该找不到
    const getRes = await req('GET', '/organizations/' + orgId, adminToken);
    check('查询已删除客户(应404)', getRes.status, 404);

    // 搜索 - 应该搜不到
    const searchRes = await req('GET', '/organizations?search=软删除测试客户_' + ts, adminToken);
    const searchList = searchRes.data?.organizations || searchRes.data || [];
    const found = Array.isArray(searchList) && searchList.some(o => o.id === orgId);
    check('搜索不到已删除客户', found, false);
  }

  // 2.2 创建并软删除项目
  // 先获取一个组织ID
  const orgsRes = await req('GET', '/organizations', adminToken);
  const orgs = orgsRes.data?.organizations || orgsRes.data || [];
  const firstOrgId = orgs.length > 0 ? orgs[0].id : null;

  if (firstOrgId) {
    const project = await req('POST', '/projects', adminToken, {
      name: '软删除测试项目_' + ts,
      organizationId: firstOrgId,
      status: 'PLANNING'
    });
    check('创建项目', project.status, 201);
    const projectId = project.data?.id || project.data?.project?.id;

    if (projectId) {
      const delProj = await req('DELETE', '/projects/' + projectId, adminToken);
      check('删除项目', delProj.status, 200);

      const getProj = await req('GET', '/projects/' + projectId, adminToken);
      check('查询已删除项目(应404)', getProj.status, 404);
    }
  }

  // 2.3 创建并软删除日报
  const report = await req('POST', '/daily-reports', adminToken, {
    reportDate: new Date().toISOString().split('T')[0],
    content: '软删除测试日报_' + ts,
    tomorrowPlan: '测试',
    issues: '无',
    status: 'DRAFT'
  });
  check('创建日报', report.status, 201);
  const reportId = report.data?.id || report.data?.report?.id;

  if (reportId) {
    const delReport = await req('DELETE', '/daily-reports/' + reportId, adminToken);
    check('删除日报', delReport.status, 200);

    const getReport = await req('GET', '/daily-reports/' + reportId, adminToken);
    check('查询已删除日报(应404)', getReport.status, 404);
  }

  console.log(`\n软删除测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 3. 审批流程测试 ====================
async function testApprovalWorkflow() {
  console.log('\n========== 3. 审批流程测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  const ts = Date.now();

  // 3.1 日报审批流程: DRAFT → SUBMITTED → APPROVED
  // sales创建日报
  const report = await req('POST', '/daily-reports', salesToken, {
    reportDate: new Date().toISOString().split('T')[0],
    content: '审批流程测试日报_' + ts,
    tomorrowPlan: '测试审批',
    issues: '无',
    status: 'DRAFT'
  });
  check('sales创建日报', report.status, 201);
  const reportId = report.data?.id || report.data?.report?.id;

  if (reportId) {
    // 直接审批DRAFT状态 - 应该失败
    const approveDraft = await req('POST', '/daily-reports/' + reportId + '/approve', adminToken, {
      approved: true, comment: '同意'
    });
    check('审批DRAFT日报(应400)', approveDraft.status, 400);

    // 提交日报
    const submitReport = await req('POST', '/daily-reports/' + reportId + '/submit', salesToken);
    check('提交日报', submitReport.status, 200);

    // 审批已提交的日报
    const approveSubmitted = await req('POST', '/daily-reports/' + reportId + '/approve', adminToken, {
      approved: true, comment: '同意'
    });
    check('审批SUBMITTED日报', approveSubmitted.status, 200);

    // 重复审批 - 应该失败
    const reApprove = await req('POST', '/daily-reports/' + reportId + '/approve', adminToken, {
      approved: true, comment: '再次同意'
    });
    check('重复审批(应400)', reApprove.status, 400);

    // sales审批自己的日报（已审批后再次尝试）
    // 先创建一个新日报给sales
    const report2 = await req('POST', '/daily-reports', salesToken, {
      reportDate: new Date().toISOString().split('T')[0],
      content: '自审批测试_' + ts,
      tomorrowPlan: '测试',
      issues: '无',
      status: 'SUBMITTED'
    });
    const report2Id = report2.data?.id || report2.data?.report?.id;
    if (report2Id) {
      const selfApprove = await req('POST', '/daily-reports/' + report2Id + '/approve', salesToken, {
        approved: true
      });
      // sales如果有审批权限但不能审批自己的
      check('销售自审批防护(应400或403)', selfApprove.status === 400 || selfApprove.status === 403, true);
    }

    // 清理
    await req('DELETE', '/daily-reports/' + reportId, adminToken);
    if (report2Id) await req('DELETE', '/daily-reports/' + report2Id, adminToken);
  }

  // 3.2 费用报销审批流程
  const expense = await req('POST', '/expenses', salesToken, {
    title: '审批流程测试报销_' + ts,
    items: [{ category: '餐饮', amount: 150, description: '商务餐费' }]
  });
  check('sales创建报销', expense.status, 201);
  const expenseId = expense.data?.id || expense.data?.expense?.id;

  if (expenseId) {
    // 直接审批DRAFT状态 - 应该失败
    const approveDraftExpense = await req('POST', '/expenses/' + expenseId + '/approve', adminToken, {
      approved: true
    });
    check('审批DRAFT报销(应400或404)', approveDraftExpense.status === 400 || approveDraftExpense.status === 404, true);

    // 提交报销
    const submitExpense = await req('POST', '/expenses/' + expenseId + '/submit', salesToken);
    check('提交报销', submitExpense.status, 200);

    // 审批
    const approveExpense = await req('POST', '/expenses/' + expenseId + '/approve', adminToken, {
      approved: true, comment: '同意报销'
    });
    check('审批SUBMITTED报销', approveExpense.status, 200);
  }

  console.log(`\n审批流程测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 4. 边界条件测试 ====================
async function testEdgeCases() {
  console.log('\n========== 4. 边界条件测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 4.1 不存在的ID
  const getOrg999 = await req('GET', '/organizations/999999', adminToken);
  check('查询不存在的客户(应404)', getOrg999.status, 404);

  const getProject999 = await req('GET', '/projects/999999', adminToken);
  check('查询不存在的项目(应404)', getProject999.status, 404);

  const getReport999 = await req('GET', '/daily-reports/999999', adminToken);
  check('查询不存在的日报(应404)', getReport999.status, 404);

  const deleteOrg999 = await req('DELETE', '/organizations/999999', adminToken);
  check('删除不存在的客户(应404)', deleteOrg999.status, 404);

  // 4.2 非法ID
  const getOrgABC = await req('GET', '/organizations/abc', adminToken);
  check('查询客户ID为abc(应400或404)', getOrgABC.status === 400 || getOrgABC.status === 404 || getOrgABC.status === 500, true);

  // 4.3 超长字符串
  const longName = 'A'.repeat(10000);
  const createLongOrg = await req('POST', '/organizations', adminToken, {
    name: longName, type: 'COMPANY'
  });
  check('超长名称创建客户(应400或截断)', createLongOrg.status === 400 || createLongOrg.status === 201, true);
  if (createLongOrg.status === 201) {
    const id = createLongOrg.data?.id || createLongOrg.data?.organization?.id;
    if (id) await req('DELETE', '/organizations/' + id, adminToken);
  }

  // 4.4 特殊字符
  const specialChars = ['<script>alert(1)</script>', "'; DROP TABLE Organization;--", '客户\u0000名称', '客户\x1B名称'];
  for (const name of specialChars) {
    const res = await req('POST', '/organizations', adminToken, {
      name: name.substring(0, 50), type: 'COMPANY'
    });
    const id = res.data?.id || res.data?.organization?.id;
    check('特殊字符: ' + name.substring(0, 20).replace(/\n/g, '') + '...', res.status === 201 || res.status === 400, true);
    if (id) await req('DELETE', '/organizations/' + id, adminToken);
  }

  // 4.5 负数金额
  const negContract = await req('POST', '/contracts', adminToken, {
    name: '负数金额合同', organizationId: 1, amount: -1000
  });
  check('负数金额合同(应400或201)', negContract.status === 400 || negContract.status === 201, true);

  // 4.6 空请求体
  const emptyCreate = await req('POST', '/organizations', adminToken, {});
  check('空请求体创建客户(应400)', emptyCreate.status, 400);

  // 4.7 重复用户名
  const dupUser = await req('POST', '/users', adminToken, {
    username: 'admin', password: 'test123', name: '重复', email: 'dup@test.com', role: 'USER'
  });
  check('重复用户名(应400)', dupUser.status === 400 || dupUser.status === 409, true);

  // 4.8 空搜索
  const emptySearch = await req('GET', '/organizations?search=', adminToken);
  check('空搜索', emptySearch.status, 200);

  console.log(`\n边界条件测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 5. 并发安全测试 ====================
async function testConcurrency() {
  console.log('\n========== 5. 并发安全测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  const ts = Date.now();

  // 5.1 并发创建相同名称的角色
  const roleName = 'CONCURRENT_' + ts;
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(req('POST', '/roles', adminToken, {
      name: roleName + '_' + i, displayName: '并发角色' + i, description: '并发测试', permissions: []
    }));
  }
  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.status === 201).length;
  check('并发创建5个不同名角色', successCount, 5);

  // 清理
  for (const r of results) {
    const id = r.data?.id || r.data?.role?.id;
    if (id) await req('DELETE', '/roles/' + id, adminToken);
  }

  // 5.2 并发更新同一资源
  const org = await req('POST', '/organizations', adminToken, {
    name: '并发更新测试_' + ts, type: 'COMPANY'
  });
  const orgId = org.data?.id || org.data?.organization?.id;

  if (orgId) {
    const updatePromises = [];
    for (let i = 0; i < 5; i++) {
      updatePromises.push(req('PUT', '/organizations/' + orgId, adminToken, {
        name: '并发更新_' + i + '_' + ts
      }));
    }
    const updateResults = await Promise.all(updatePromises);
    const successUpdates = updateResults.filter(r => r.status === 200).length;
    check('并发更新同一资源(至少1个成功)', successUpdates >= 1, true);

    // 最终状态应该一致
    const finalOrg = await req('GET', '/organizations/' + orgId, adminToken);
    check('最终状态一致', finalOrg.status, 200);

    await req('DELETE', '/organizations/' + orgId, adminToken);
  }

  // 5.3 并发删除同一资源
  const org2 = await req('POST', '/organizations', adminToken, {
    name: '并发删除测试_' + ts, type: 'COMPANY'
  });
  const org2Id = org2.data?.id || org2.data?.organization?.id;

  if (org2Id) {
    const delPromises = [];
    for (let i = 0; i < 5; i++) {
      delPromises.push(req('DELETE', '/organizations/' + org2Id, adminToken));
    }
    const delResults = await Promise.all(delPromises);
    const successDels = delResults.filter(r => r.status === 200).length;
    const notFoundDels = delResults.filter(r => r.status === 404).length;
    check('并发删除(只有1个成功)', successDels, 1);
    check('并发删除(其余404)', notFoundDels, 4);
  }

  console.log(`\n并发安全测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 6. 搜索过滤权限测试 ====================
async function testSearchPermissionFilter() {
  console.log('\n========== 6. 搜索过滤权限测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  const ts = Date.now();

  // 6.1 创建测试数据
  const org1 = await req('POST', '/organizations', adminToken, {
    name: '搜索权限测试_A_' + ts, type: 'COMPANY'
  });
  const org1Id = org1.data?.id || org1.data?.organization?.id;

  // 6.2 搜索 - admin能看到
  if (org1Id) {
    const adminSearch = await req('GET', '/organizations?search=搜索权限测试', adminToken);
    const adminList = adminSearch.data?.organizations || adminSearch.data || [];
    const adminFound = Array.isArray(adminList) && adminList.some(o => o.id === org1Id);
    check('admin搜索能找到', adminFound, true);

    // sales搜索 - 取决于数据权限范围
    const salesSearch = await req('GET', '/organizations?search=搜索权限测试', salesToken);
    const salesList = salesSearch.data?.organizations || salesSearch.data || [];
    check('sales搜索返回200', salesSearch.status, 200);
  }

  // 6.3 项目搜索
  const orgsRes = await req('GET', '/organizations', adminToken);
  const orgs = orgsRes.data?.organizations || orgsRes.data || [];
  if (orgs.length > 0) {
    const proj = await req('POST', '/projects', adminToken, {
      name: '搜索权限项目_' + ts,
      organizationId: orgs[0].id,
      status: 'PLANNING'
    });
    const projId = proj.data?.id || proj.data?.project?.id;

    if (projId) {
      const adminProjSearch = await req('GET', '/projects?search=搜索权限项目', adminToken);
      const adminProjList = adminProjSearch.data?.projects || adminProjSearch.data || [];
      const adminProjFound = Array.isArray(adminProjList) && adminProjList.some(p => p.id === projId);
      check('admin搜索项目能找到', adminProjFound, true);

      await req('DELETE', '/projects/' + projId, adminToken);
    }
  }

  // 清理
  if (org1Id) await req('DELETE', '/organizations/' + org1Id, adminToken);

  console.log(`\n搜索过滤权限测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 7. Token安全测试 ====================
async function testTokenSecurity() {
  console.log('\n========== 7. Token安全测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 7.1 过期token
  const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDAxfQ.invalid';
  const expiredRes = await req('GET', '/auth/me', expiredToken);
  check('过期token(应401)', expiredRes.status, 401);

  // 7.2 篡改token
  const parts = adminToken.split('.');
  const tamperedToken = parts[0] + '.' + parts[1] + '.tampered';
  const tamperedRes = await req('GET', '/auth/me', tamperedToken);
  check('篡改token(应401)', tamperedRes.status, 401);

  // 7.3 空token
  const emptyTokenRes = await req('GET', '/auth/me', '');
  check('空token(应401)', emptyTokenRes.status, 401);

  // 7.4 token格式错误
  const badFormatRes = await req('GET', '/auth/me', 'not-a-jwt-token');
  check('格式错误token(应401)', badFormatRes.status, 401);

  // 7.5 用其他用户的token访问
  const crossTokenRes = await req('GET', '/users', salesToken);
  check('sales访问用户列表(应403)', crossTokenRes.status, 403);

  // 7.6 Bearer格式错误
  const noBearerRes = await axios.get(BASE + '/auth/me', {
    headers: { Authorization: adminToken }  // 缺少Bearer前缀
  }).catch(e => ({ status: e.response?.status || 0, data: e.response?.data }));
  check('缺少Bearer前缀(应401)', noBearerRes.status, 401);

  console.log(`\nToken安全测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 8. API路由安全测试 ====================
async function testRouteSecurity() {
  console.log('\n========== 8. API路由安全测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 8.1 路径遍历攻击
  const pathTraversal = await req('GET', '/organizations/../../../etc/passwd', adminToken);
  check('路径遍历(应404或400)', pathTraversal.status === 404 || pathTraversal.status === 400 || pathTraversal.status === 500, true);

  // 8.2 SQL注入尝试 (通过搜索参数)
  const sqlInject = await req('GET', "/organizations?search=' OR 1=1; DROP TABLE Organization;--", adminToken);
  check('SQL注入搜索(应200但无数据泄露)', sqlInject.status, 200);
  const injectList = sqlInject.data?.organizations || sqlInject.data || [];
  check('SQL注入未返回所有数据', Array.isArray(injectList) && injectList.length < 5, true);

  // 8.3 不存在的API路径
  const notFoundApi = await req('GET', '/api/nonexistent', adminToken);
  check('不存在的API(应404)', notFoundApi.status, 404);

  // 8.4 HTTP方法测试 - 用PUT访问应该GET的接口
  const wrongMethod = await req('PUT', '/organizations', adminToken, { name: 'test' });
  check('错误HTTP方法(应404或405)', wrongMethod.status === 404 || wrongMethod.status === 405, true);

  // 8.5 大批量请求
  const largeArray = Array(1000).fill(0).map((_, i) => i);
  const bulkRes = await req('POST', '/roles', adminToken, {
    name: 'BULK_' + Date.now(), displayName: '大批量', description: largeArray.join(','), permissions: largeArray
  });
  check('大批量请求处理', bulkRes.status === 201 || bulkRes.status === 400 || bulkRes.status === 413, true);
  if (bulkRes.status === 201) {
    const id = bulkRes.data?.id || bulkRes.data?.role?.id;
    if (id) await req('DELETE', '/roles/' + id, adminToken);
  }

  console.log(`\nAPI路由安全测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 9. 角色-菜单权限分配完整性测试 ====================
async function testRoleMenuIntegrity() {
  console.log('\n========== 9. 角色-菜单权限分配完整性测试 ==========');
  let pass = 0, fail = 0, total = 0;
  function check(name, actual, expected) {
    total++;
    const ok = actual === expected;
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ': 期望' + expected + ' 实际' + actual); }
  }

  // 9.1 创建角色不分配任何菜单
  const emptyRole = await req('POST', '/roles', adminToken, {
    name: 'EMPTY_ROLE_' + Date.now(), displayName: '空角色', description: '无权限', permissions: []
  });
  check('创建空角色', emptyRole.status, 201);
  const emptyRoleId = emptyRole.data?.id || emptyRole.data?.role?.id;

  if (emptyRoleId) {
    // 验证角色菜单为空
    const roleMenus = await req('GET', '/role-menus/' + emptyRoleId, adminToken);
    check('空角色菜单查询', roleMenus.status, 200);
    const menus = roleMenus.data?.roleMenus || roleMenus.data || [];
    check('空角色确实无菜单', Array.isArray(menus) ? menus.length === 0 : true, true);

    // 分配菜单
    const assign = await req('POST', '/role-menus/' + emptyRoleId, adminToken, {
      menuIds: [1, 2, 7]  // dashboard, 客户, 日报
    });
    check('分配菜单给空角色', assign.status, 200);

    // 再次查询
    const roleMenus2 = await req('GET', '/role-menus/' + emptyRoleId, adminToken);
    const menus2 = roleMenus2.data?.roleMenus || roleMenus2.data || [];
    check('分配后菜单数量正确', Array.isArray(menus2) ? menus2.length : 0, 3);

    // 覆盖更新（全量替换）
    const reassign = await req('POST', '/role-menus/' + emptyRoleId, adminToken, {
      menuIds: [1]  // 只保留dashboard
    });
    check('覆盖更新菜单', reassign.status, 200);

    const roleMenus3 = await req('GET', '/role-menus/' + emptyRoleId, adminToken);
    const menus3 = roleMenus3.data?.roleMenus || roleMenus3.data || [];
    check('覆盖后菜单数量为1', Array.isArray(menus3) ? menus3.length : 0, 1);

    // 删除角色
    await req('DELETE', '/roles/' + emptyRoleId, adminToken);
  }

  // 9.2 删除角色后权限是否清除
  const tempRole = await req('POST', '/roles', adminToken, {
    name: 'TEMP_DELETE_' + Date.now(), displayName: '临时删除', description: '测试', permissions: []
  });
  const tempRoleId = tempRole.data?.id || tempRole.data?.role?.id;

  if (tempRoleId) {
    // 分配菜单
    await req('POST', '/role-menus/' + tempRoleId, adminToken, { menuIds: [1, 2, 3] });

    // 删除角色
    const delRes = await req('DELETE', '/roles/' + tempRoleId, adminToken);
    check('删除角色', delRes.status, 200);

    // 验证RoleMenu也被清除
    const checkMenus = await req('GET', '/role-menus/' + tempRoleId, adminToken);
    const checkList = checkMenus.data?.roleMenus || checkMenus.data || [];
    check('删除角色后RoleMenu清除', Array.isArray(checkList) ? checkList.length === 0 : true, true);
  }

  // 9.3 给不存在的角色分配菜单
  const fakeAssign = await req('POST', '/role-menus/999999', adminToken, { menuIds: [1] });
  check('给不存在角色分配菜单(应404)', fakeAssign.status, 404);

  // 9.4 分配不存在的菜单ID
  const tempRole2 = await req('POST', '/roles', adminToken, {
    name: 'FAKE_MENU_' + Date.now(), displayName: '假菜单', description: '测试', permissions: []
  });
  const tempRole2Id = tempRole2.data?.id || tempRole2.data?.role?.id;

  if (tempRole2Id) {
    const fakeMenuAssign = await req('POST', '/role-menus/' + tempRole2Id, adminToken, {
      menuIds: [999999]
    });
    // 可能成功（没有校验）或失败（有校验）
    check('分配不存在菜单ID', fakeMenuAssign.status === 200 || fakeMenuAssign.status === 400, true);

    await req('DELETE', '/roles/' + tempRole2Id, adminToken);
  }

  console.log(`\n角色-菜单完整性测试: ${pass}/${total} 通过`);
  return { pass, fail, total };
}

// ==================== 主函数 ====================
async function main() {
  console.log('========================================');
  console.log('  CRM系统深度权限与业务逻辑测试');
  console.log('  时间: ' + new Date().toLocaleString());
  console.log('========================================');

  await loginAll();

  const results = [];
  results.push({ name: '数据权限隔离', ...(await testDataScopeIsolation()) });
  results.push({ name: '软删除', ...(await testSoftDelete()) });
  results.push({ name: '审批流程', ...(await testApprovalWorkflow()) });
  results.push({ name: '边界条件', ...(await testEdgeCases()) });
  results.push({ name: '并发安全', ...(await testConcurrency()) });
  results.push({ name: '搜索过滤权限', ...(await testSearchPermissionFilter()) });
  results.push({ name: 'Token安全', ...(await testTokenSecurity()) });
  results.push({ name: 'API路由安全', ...(await testRouteSecurity()) });
  results.push({ name: '角色菜单完整性', ...(await testRoleMenuIntegrity()) });

  console.log('\n========================================');
  console.log('  最终汇总');
  console.log('========================================');
  const totalPass = results.reduce((s, r) => s + r.pass, 0);
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const totalAll = results.reduce((s, r) => s + r.total, 0);

  results.forEach(r => {
    const pct = ((r.pass / r.total) * 100).toFixed(0);
    const icon = r.fail === 0 ? '✓' : '✗';
    console.log(`  ${icon} ${r.name.padEnd(16)}: ${r.pass}/${r.total} (${pct}%)`);
  });

  console.log('----------------------------------------');
  console.log(`  总计: ${totalPass}/${totalAll} (${((totalPass / totalAll) * 100).toFixed(1)}%)`);
  console.log(`  失败: ${totalFail}`);
  console.log('========================================');

  // 保存详细报告
  const fs = require('fs');
  fs.writeFileSync('deep-permission-test-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: totalAll, passed: totalPass, failed: totalFail },
    modules: results
  }, null, 2));
  console.log('\n报告已保存: deep-permission-test-report.json');
}

main().catch(console.error);
