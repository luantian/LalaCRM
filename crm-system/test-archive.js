const BASE = 'http://localhost:5000/api';
let token = '';

async function login() {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const data = await res.json();
  token = data.token;
  console.log('[OK] 登录成功');
  return token;
}

function h() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function getOrganizations() {
  const res = await fetch(BASE + '/organizations', { headers: h() });
  const data = await res.json();
  return data;
}

async function getProjects() {
  const res = await fetch(BASE + '/projects', { headers: h() });
  const data = await res.json();
  console.log('项目列表响应:', JSON.stringify(data).substring(0, 200));
  return data;
}

async function createProject(name, organizationId) {
  const res = await fetch(BASE + '/projects', {
    method: 'POST', headers: h(),
    body: JSON.stringify({
      name: name,
      status: 'IN_PROGRESS',
      organizationId: organizationId
    })
  });
  return { status: res.status, data: await res.json() };
}

async function archiveProject(id, isArchived) {
  const res = await fetch(BASE + '/projects/' + id + '/archive', {
    method: 'PUT', headers: h(),
    body: JSON.stringify({ isArchived: isArchived })
  });
  return { status: res.status, data: await res.json() };
}

async function updateProject(id, data) {
  const res = await fetch(BASE + '/projects/' + id, {
    method: 'PUT', headers: h(),
    body: JSON.stringify(data)
  });
  return { status: res.status, data: await res.json() };
}

async function createContract(projectId, organizationId) {
  const res = await fetch(BASE + '/contracts', {
    method: 'POST', headers: h(),
    body: JSON.stringify({
      name: '归档测试合同',
      projectId: projectId,
      organizationId: organizationId,
      amount: 10000,
      status: 'DRAFT'
    })
  });
  return { status: res.status, data: await res.json() };
}

async function createOrderItem(contractId) {
  const res = await fetch(BASE + '/contract-order-items', {
    method: 'POST', headers: h(),
    body: JSON.stringify({ contractId, productName: '测试产品', quantity: 10, unitPrice: 100 })
  });
  return { status: res.status, data: await res.json() };
}

async function createPayment(contractId) {
  const res = await fetch(BASE + '/contract-payments', {
    method: 'POST', headers: h(),
    body: JSON.stringify({ contractId, amount: 5000, paymentDate: '2026-08-07', paymentType: 'PROGRESS', status: 'PENDING' })
  });
  return { status: res.status, data: await res.json() };
}

async function createShipment(contractId) {
  const res = await fetch(BASE + '/contract-shipments', {
    method: 'POST', headers: h(),
    body: JSON.stringify({ contractId, shipDate: '2026-08-07', logisticsNo: 'TEST001' })
  });
  return { status: res.status, data: await res.json() };
}

async function test() {
  console.log('\n=== 归档功能完整测试 ===\n');

  await login();

  // 获取组织
  const orgs = await getOrganizations();
  const orgId = orgs && orgs.length > 0 ? orgs[0].id : 1;
  console.log('使用组织ID: ' + orgId);

  // 创建测试项目
  console.log('\n[步骤1] 创建测试项目...');
  const p = await createProject('归档测试_' + Date.now(), orgId);
  if (p.status !== 201) {
    console.log('FAIL: 创建项目失败 -', p.data.error || JSON.stringify(p.data));
    return;
  }
  console.log('  OK: 项目创建成功 (ID=' + p.data.id + ', 状态=' + p.data.status + ', 已归档=' + p.data.isArchived + ')');

  const projectId = p.data.id;

  // 创建合同
  console.log('\n[步骤2] 创建合同...');
  const c = await createContract(projectId, orgId);
  if (c.status !== 201) {
    console.log('FAIL: 创建合同失败 -', c.data.error || JSON.stringify(c.data));
    return;
  }
  console.log('  OK: 合同创建成功 (ID=' + c.data.id + ')');

  const contractId = c.data.id;

  // 归档前测试
  console.log('\n[步骤3] 归档前创建订货明细...');
  const o1 = await createOrderItem(contractId);
  console.log('  ' + (o1.status === 201 ? 'OK 创建成功' : 'FAIL status=' + o1.status + ' - ' + (o1.data.error || '')));

  // 归档项目
  console.log('\n[步骤4] 归档项目...');
  const ar = await archiveProject(projectId, true);
  console.log('  ' + (ar.data.isArchived ? 'OK 已归档' : 'FAIL 归档失败') + ' - ' + JSON.stringify(ar.data).substring(0, 100));

  // 归档后测试
  console.log('\n[步骤5] 归档后创建订货明细...');
  const o2 = await createOrderItem(contractId);
  console.log('  ' + (o2.status === 403 ? 'PASS 正确拒绝 (403)' : 'FAIL 应该403但返回' + o2.status) + ': ' + (o2.data.error || ''));

  console.log('\n[步骤6] 归档后创建付款记录...');
  const pay = await createPayment(contractId);
  console.log('  ' + (pay.status === 403 ? 'PASS 正确拒绝 (403)' : 'FAIL 应该403但返回' + pay.status) + ': ' + (pay.data.error || ''));

  console.log('\n[步骤7] 归档后创建发货记录...');
  const s = await createShipment(contractId);
  console.log('  ' + (s.status === 403 ? 'PASS 正确拒绝 (403)' : 'FAIL 应该403但返回' + s.status) + ': ' + (s.data.error || ''));

  console.log('\n[步骤8] 归档后创建合同...');
  const c2 = await createContract(projectId, orgId);
  console.log('  ' + (c2.status === 403 ? 'PASS 正确拒绝 (403)' : 'FAIL 应该403但返回' + c2.status) + ': ' + (c2.data.error || ''));

  // 编辑已归档项目 - 测试isArchived是否被重置
  console.log('\n[步骤9] 编辑已归档项目（只修改名称）...');
  const u = await updateProject(projectId, { name: '已编辑的归档项目' });
  console.log('  编辑后状态: isArchived=' + u.data.isArchived);
  console.log('  ' + (u.data.isArchived === true ? 'PASS 归档状态保留' : 'FAIL 归档状态被重置为' + u.data.isArchived));

  // 取消归档
  console.log('\n[步骤10] 取消归档...');
  const unar = await archiveProject(projectId, false);
  console.log('  ' + (!unar.data.isArchived ? 'OK 已取消归档' : 'FAIL') + ' - isArchived=' + unar.data.isArchived);

  // 取消归档后创建订货明细
  console.log('\n[步骤11] 取消归档后创建订货明细...');
  const o3 = await createOrderItem(contractId);
  console.log('  ' + (o3.status === 201 ? 'PASS 创建成功' : 'FAIL status=' + o3.status + ' - ' + (o3.data.error || '')));

  console.log('\n=== 测试完成 ===\n');
}

test().catch(function(e) { console.error('Error:', e.message); });
