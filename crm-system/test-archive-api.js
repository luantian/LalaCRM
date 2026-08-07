const axios = require('axios');

const API = 'http://localhost:5000/api';
let token = '';
let testProjectId = null;
let testContractId = null;

async function login() {
  try {
    const res = await axios.post(`${API}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    token = res.data.token;
    console.log('✓ 登录成功');
    return true;
  } catch (error) {
    console.error('✗ 登录失败:', error.response?.data || error.message);
    return false;
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function getProjects() {
  try {
    const res = await axios.get(`${API}/projects`, { 
      headers: authHeaders(),
      params: { isArchived: 'false' }
    });
    return res.data.data;
  } catch (error) {
    console.error('获取项目列表失败:', error.response?.data || error.message);
    return [];
  }
}

async function getOrganizations() {
  try {
    const res = await axios.get(`${API}/organizations`, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    console.error('获取组织列表失败:', error.response?.data || error.message);
    return [];
  }
}

async function createProject(name, organizationId) {
  try {
    const res = await axios.post(`${API}/projects`, {
      name: name,
      status: 'IN_PROGRESS',
      organizationId: organizationId
    }, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    console.error('创建项目失败:', error.response?.data || error.message);
    return null;
  }
}

async function updateProject(id, data) {
  try {
    const res = await axios.put(`${API}/projects/${id}`, data, { 
      headers: authHeaders() 
    });
    return res.data;
  } catch (error) {
    console.error('更新项目失败:', error.response?.data || error.message);
    return null;
  }
}

async function createContract(projectId) {
  try {
    const res = await axios.post(`${API}/contracts`, {
      name: '测试合同',
      projectId: projectId,
      amount: 10000,
      status: 'DRAFT'
    }, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    console.error('创建合同失败:', error.response?.data || error.message);
    return null;
  }
}

async function createOrderItem(contractId) {
  try {
    const res = await axios.post(`${API}/contract-order-items`, {
      contractId: contractId,
      productName: '测试产品',
      quantity: 10,
      unitPrice: 100
    }, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
}

async function createPayment(contractId) {
  try {
    const res = await axios.post(`${API}/contract-payments`, {
      contractId: contractId,
      amount: 5000,
      paymentDate: '2026-08-07',
      paymentType: 'PROGRESS',
      status: 'PENDING'
    }, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
}

async function createShipment(contractId) {
  try {
    const res = await axios.post(`${API}/contract-shipments`, {
      contractId: contractId,
      shipDate: '2026-08-07',
      logisticsNo: 'TEST001'
    }, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
}

async function testArchiveFunctionality() {
  console.log('\n====================================');
  console.log('  归档功能完整测试');
  console.log('====================================\n');

  // 1. 登录
  if (!await login()) {
    console.log('\n测试中止：无法登录');
    return;
  }

  // 2. 创建测试项目
  console.log('[步骤 1] 创建测试项目...');
  const project = await createProject('归档测试项目 ' + Date.now());
  if (!project) {
    console.log('✗ 无法创建测试项目');
    return;
  }
  testProjectId = project.id;
  console.log(`✓ 项目创建成功 (ID: ${testProjectId}, 状态: ${project.status}, 已归档: ${project.isArchived})\n`);

  // 3. 创建合同
  console.log('[步骤 2] 创建合同...');
  const contract = await createContract(testProjectId);
  if (!contract) {
    console.log('✗ 无法创建合同');
    return;
  }
  testContractId = contract.id;
  console.log(`✓ 合同创建成功 (ID: ${testContractId})\n`);

  // 4. 归档前测试 - 应该可以创建
  console.log('[步骤 3] 归档前测试 - 创建订货明细...');
  const orderBefore = await createOrderItem(testContractId);
  if (orderBefore.error) {
    console.log(`✗ 失败: ${orderBefore.error}`);
  } else {
    console.log(`✓ 成功创建订货明细 (ID: ${orderBefore.id})\n`);
  }

  // 5. 归档项目
  console.log('[步骤 4] 归档项目...');
  const archivedProject = await updateProject(testProjectId, { 
    status: 'COMPLETED' 
  });
  if (!archivedProject) {
    console.log('✗ 归档失败');
    return;
  }
  console.log(`✓ 项目已归档 (状态: ${archivedProject.status}, 已归档: ${archivedProject.isArchived})\n`);

  // 6. 归档后测试 - 应该被拒绝
  console.log('[步骤 5] 归档后测试 - 尝试创建订货明细...');
  const orderAfter = await createOrderItem(testContractId);
  if (orderAfter.error) {
    console.log(`✓ 正确拒绝: ${orderAfter.error}\n`);
  } else {
    console.log(`✗ 错误：应该被拒绝但成功了 (ID: ${orderAfter.id})\n`);
  }

  console.log('[步骤 6] 归档后测试 - 尝试创建付款记录...');
  const paymentAfter = await createPayment(testContractId);
  if (paymentAfter.error) {
    console.log(`✓ 正确拒绝: ${paymentAfter.error}\n`);
  } else {
    console.log(`✗ 错误：应该被拒绝但成功了 (ID: ${paymentAfter.id})\n`);
  }

  console.log('[步骤 7] 归档后测试 - 尝试创建发货记录...');
  const shipmentAfter = await createShipment(testContractId);
  if (shipmentAfter.error) {
    console.log(`✓ 正确拒绝: ${shipmentAfter.error}\n`);
  } else {
    console.log(`✗ 错误：应该被拒绝但成功了 (ID: ${shipmentAfter.id})\n`);
  }

  // 7. 编辑项目测试 - 应该保持归档状态
  console.log('[步骤 8] 编辑已归档项目 - 只修改名称...');
  const updatedProject = await updateProject(testProjectId, {
    name: '归档测试项目（已修改）'
  });
  if (!updatedProject) {
    console.log('✗ 编辑失败');
  } else {
    console.log(`✓ 编辑成功`);
    console.log(`  名称: ${updatedProject.name}`);
    console.log(`  状态: ${updatedProject.status}`);
    console.log(`  已归档: ${updatedProject.isArchived}`);
    if (updatedProject.isArchived) {
      console.log('✓ 归档状态正确保留\n');
    } else {
      console.log('✗ 错误：归档状态被重置了\n');
    }
  }

  // 8. 清理测试数据
  console.log('[步骤 9] 清理测试数据...');
  await updateProject(testProjectId, { status: 'CANCELLED' });
  console.log('✓ 测试项目已取消\n');

  console.log('====================================');
  console.log('  测试完成');
  console.log('====================================\n');
}

testArchiveFunctionality().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
