const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
let adminToken = '';
let testUser1Token = '';
let viewerToken = '';

// 测试记录
const testResults = [];

// 辅助函数
function logSuccess(name, data) {
  console.log(`✓ ${name}`);
  testResults.push({ name, status: 'PASS', data });
}

function logFailure(name, error) {
  console.log(`✗ ${name}: ${error.message || error}`);
  testResults.push({ name, status: 'FAIL', error: error.message || error });
}

async function login(username, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { username, password });
  return res.data.token;
}

// ==================== 1. 认证模块测试 ====================
async function testAuth() {
  console.log('\n=== 1. 认证模块测试 ===');

  // 1.1 登录测试
  try {
    adminToken = await login('admin', 'admin123');
    logSuccess('admin登录成功', { token: adminToken.substring(0, 20) + '...' });
  } catch (error) {
    logFailure('admin登录', error.response?.data?.error || error.message);
    return false;
  }

  try {
    testUser1Token = await login('test_user1', 'test123');
    logSuccess('test_user1登录成功');
  } catch (error) {
    logFailure('test_user1登录', error.response?.data?.error || error.message);
  }

  try {
    viewerToken = await login('viewer_test', 'test123');
    logSuccess('viewer_test登录成功');
  } catch (error) {
    logFailure('viewer_test登录', error.response?.data?.error || error.message);
  }

  // 1.2 错误登录测试
  try {
    await login('admin', 'wrongpassword');
    logFailure('错误密码登录应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 401) {
      logSuccess('错误密码登录正确返回401');
    } else {
      logFailure('错误密码登录', error.message);
    }
  }

  // 1.3 获取当前用户信息
  try {
    const res = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logSuccess('获取当前用户信息', res.data);
  } catch (error) {
    logFailure('获取当前用户信息', error.response?.data?.error || error.message);
  }

  return true;
}

// ==================== 2. 用户管理测试 ====================
async function testUserManagement() {
  console.log('\n=== 2. 用户管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testUserId = null;

  // 2.1 获取用户列表
  try {
    const res = await axios.get(`${BASE_URL}/users`, { headers });
    logSuccess('获取用户列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取用户列表', error.response?.data?.error || error.message);
  }

  // 2.2 创建用户
  try {
    const res = await axios.post(`${BASE_URL}/users`, {
      username: 'test_crud_user',
      password: 'test123',
      name: '测试CRUD用户',
      email: 'test_crud@example.com',
      role: 'USER'
    }, { headers });
    testUserId = res.data.id;
    logSuccess('创建用户', { id: testUserId, username: res.data.username });
  } catch (error) {
    logFailure('创建用户', error.response?.data?.error || error.message);
  }

  // 2.3 获取用户下拉列表（替代不存在的详情接口）
  try {
    const res = await axios.get(`${BASE_URL}/users/dropdown`, { headers });
    logSuccess('获取用户下拉列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取用户下拉列表', error.response?.data?.error || error.message);
  }

  // 2.4 更新用户
  if (testUserId) {
    try {
      const res = await axios.put(`${BASE_URL}/users/${testUserId}`, {
        name: '测试CRUD用户-已更新',
        email: 'test_crud_updated@example.com'
      }, { headers });
      logSuccess('更新用户', { name: res.data.name });
    } catch (error) {
      logFailure('更新用户', error.response?.data?.error || error.message);
    }
  }

  // 2.5 删除用户
  if (testUserId) {
    try {
      await axios.delete(`${BASE_URL}/users/${testUserId}`, { headers });
      logSuccess('删除用户');
    } catch (error) {
      logFailure('删除用户', error.response?.data?.error || error.message);
    }
  }
}

// ==================== 3. 部门管理测试 ====================
async function testDepartmentManagement() {
  console.log('\n=== 3. 部门管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testDeptId = null;

  // 3.1 获取部门树
  try {
    const res = await axios.get(`${BASE_URL}/departments/tree`, { headers });
    logSuccess('获取部门树', { count: res.data.length });
  } catch (error) {
    logFailure('获取部门树', error.response?.data?.error || error.message);
  }

  // 3.2 创建部门
  try {
    const res = await axios.post(`${BASE_URL}/departments`, {
      name: '测试部门',
      parentId: null,
      order: 999
    }, { headers });
    testDeptId = res.data.id;
    logSuccess('创建部门', { id: testDeptId, name: res.data.name });
  } catch (error) {
    logFailure('创建部门', error.response?.data?.error || error.message);
  }

  // 3.3 更新部门
  if (testDeptId) {
    try {
      const res = await axios.put(`${BASE_URL}/departments/${testDeptId}`, {
        name: '测试部门-已更新'
      }, { headers });
      logSuccess('更新部门', { name: res.data.name });
    } catch (error) {
      logFailure('更新部门', error.response?.data?.error || error.message);
    }
  }

  // 3.4 删除部门
  if (testDeptId) {
    try {
      await axios.delete(`${BASE_URL}/departments/${testDeptId}`, { headers });
      logSuccess('删除部门');
    } catch (error) {
      logFailure('删除部门', error.response?.data?.error || error.message);
    }
  }
}

// ==================== 4. 客户管理测试 ====================
async function testOrganizationManagement() {
  console.log('\n=== 4. 客户管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testOrgId = null;

  // 4.1 获取客户列表
  try {
    const res = await axios.get(`${BASE_URL}/organizations`, { headers });
    logSuccess('获取客户列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取客户列表', error.response?.data?.error || error.message);
  }

  // 4.2 创建客户
  try {
    const res = await axios.post(`${BASE_URL}/organizations`, {
      name: '测试客户公司',
      type: 'COMPANY',
      address: '北京市海淀区测试路1号'
    }, { headers });
    testOrgId = res.data.id;
    logSuccess('创建客户', { id: testOrgId, name: res.data.name });
  } catch (error) {
    logFailure('创建客户', error.response?.data?.error || error.message);
  }

  // 4.3 获取客户详情
  if (testOrgId) {
    try {
      const res = await axios.get(`${BASE_URL}/organizations/${testOrgId}`, { headers });
      logSuccess('获取客户详情', { name: res.data.name });
    } catch (error) {
      logFailure('获取客户详情', error.response?.data?.error || error.message);
    }
  }

  // 4.4 更新客户
  if (testOrgId) {
    try {
      const res = await axios.put(`${BASE_URL}/organizations/${testOrgId}`, {
        name: '测试客户公司-已更新',
        description: '金融行业客户'
      }, { headers });
      logSuccess('更新客户', { name: res.data.name });
    } catch (error) {
      logFailure('更新客户', error.response?.data?.error || error.message);
    }
  }

  // 4.5 删除客户
  if (testOrgId) {
    try {
      await axios.delete(`${BASE_URL}/organizations/${testOrgId}`, { headers });
      logSuccess('删除客户');
    } catch (error) {
      logFailure('删除客户', error.response?.data?.error || error.message);
    }
  }

  return testOrgId;
}

// ==================== 5. 项目管理测试 ====================
async function testProjectManagement() {
  console.log('\n=== 5. 项目管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testProjectId = null;
  let testOrgId = null;
  let testContractId = null;

  // 先创建一个客户
  try {
    const orgRes = await axios.post(`${BASE_URL}/organizations`, {
      name: '项目测试客户',
      type: 'COMPANY'
    }, { headers });
    testOrgId = orgRes.data.id;
  } catch (error) {
    logFailure('创建项目测试客户', error.response?.data?.error || error.message);
    return { projectId: null, orgId: testOrgId, contractId: null };
  }

  // 5.1 获取项目列表
  try {
    const res = await axios.get(`${BASE_URL}/projects`, { headers });
    logSuccess('获取项目列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取项目列表', error.response?.data?.error || error.message);
  }

  // 5.2 创建项目
  try {
    const res = await axios.post(`${BASE_URL}/projects`, {
      name: '测试项目',
      organizationId: testOrgId,
      status: 'IN_PROGRESS',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      budget: 100000
    }, { headers });
    testProjectId = res.data.id;
    logSuccess('创建项目', { id: testProjectId, name: res.data.name });
  } catch (error) {
    logFailure('创建项目', error.response?.data?.error || error.message);
  }

  // 5.3 获取项目详情
  if (testProjectId) {
    try {
      const res = await axios.get(`${BASE_URL}/projects/${testProjectId}`, { headers });
      logSuccess('获取项目详情', { name: res.data.name });
    } catch (error) {
      logFailure('获取项目详情', error.response?.data?.error || error.message);
    }
  }

  // 5.4 更新项目
  if (testProjectId) {
    try {
      const res = await axios.put(`${BASE_URL}/projects/${testProjectId}`, {
        name: '测试项目-已更新',
        budget: 150000
      }, { headers });
      logSuccess('更新项目', { name: res.data.name, budget: res.data.budget });
    } catch (error) {
      logFailure('更新项目', error.response?.data?.error || error.message);
    }
  }

  // 5.5 创建合同（在归档前，用于后续测试）
  if (testProjectId && testOrgId) {
    try {
      const res = await axios.post(`${BASE_URL}/contracts`, {
        name: '测试合同',
        organizationId: testOrgId,
        projectId: testProjectId,
        amount: 50000,
        signDate: '2026-01-15',
        status: 'DRAFT'
      }, { headers });
      testContractId = res.data.id;
      logSuccess('创建合同', { id: testContractId, name: res.data.name });
    } catch (error) {
      logFailure('创建合同', error.response?.data?.error || error.message);
    }
  }

  return { projectId: testProjectId, orgId: testOrgId, contractId: testContractId };
}

// ==================== 6. 合同管理测试 ====================
async function testContractManagement(projectId, orgId, existingContractId = null) {
  console.log('\n=== 6. 合同管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testContractId = existingContractId;

  if (!projectId || !orgId) {
    logFailure('合同管理测试', '缺少projectId或orgId');
    return null;
  }

  // 6.1 获取合同列表
  try {
    const res = await axios.get(`${BASE_URL}/contracts?projectId=${projectId}`, { headers });
    logSuccess('获取合同列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取合同列表', error.response?.data?.error || error.message);
  }

  // 6.2 创建合同（仅在未传入现有合同时）
  if (!testContractId) {
    try {
      const res = await axios.post(`${BASE_URL}/contracts`, {
        name: '测试合同',
        organizationId: orgId,
        projectId: projectId,
        amount: 50000,
        signDate: '2026-01-15',
        status: '草稿'
      }, { headers });
      testContractId = res.data.id;
      logSuccess('创建合同', { id: testContractId, name: res.data.name });
    } catch (error) {
      logFailure('创建合同', error.response?.data?.error || error.message);
    }
  } else {
    logSuccess('使用已有合同', { id: testContractId });
  }

  // 6.3 获取合同详情
  if (testContractId) {
    try {
      const res = await axios.get(`${BASE_URL}/contracts/${testContractId}`, { headers });
      logSuccess('获取合同详情', { name: res.data.name });
    } catch (error) {
      logFailure('获取合同详情', error.response?.data?.error || error.message);
    }
  }

  // 6.4 更新合同
  if (testContractId) {
    try {
      const res = await axios.put(`${BASE_URL}/contracts/${testContractId}`, {
        name: '测试合同-已更新',
        amount: 60000
      }, { headers });
      logSuccess('更新合同', { name: res.data.name, amount: res.data.amount });
    } catch (error) {
      logFailure('更新合同', error.response?.data?.error || error.message);
    }
  }

  return testContractId;
}

// ==================== 7. 订货明细测试 ====================
async function testOrderItems(contractId) {
  console.log('\n=== 7. 订货明细测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testItemId = null;

  if (!contractId) {
    logFailure('订货明细测试', '缺少contractId');
    return null;
  }

  // 7.1 获取订货明细列表
  try {
    const res = await axios.get(`${BASE_URL}/contract-order-items?contractId=${contractId}`, { headers });
    logSuccess('获取订货明细列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取订货明细列表', error.response?.data?.error || error.message);
  }

  // 7.2 创建订货明细
  try {
    const res = await axios.post(`${BASE_URL}/contract-order-items`, {
      contractId: contractId,
      productName: '测试产品',
      spec: '标准版',
      quantity: 10,
      unit: '套',
      unitPrice: 5000,
      totalPrice: 50000
    }, { headers });
    testItemId = res.data.id;
    logSuccess('创建订货明细', { id: testItemId, productName: res.data.productName });
  } catch (error) {
    logFailure('创建订货明细', error.response?.data?.error || error.message);
  }

  // 7.3 更新订货明细
  if (testItemId) {
    try {
      const res = await axios.put(`${BASE_URL}/contract-order-items/${testItemId}`, {
        quantity: 15,
        totalPrice: 75000
      }, { headers });
      logSuccess('更新订货明细', { quantity: res.data.quantity, totalPrice: res.data.totalPrice });
    } catch (error) {
      logFailure('更新订货明细', error.response?.data?.error || error.message);
    }
  }

  // 7.4 删除订货明细
  if (testItemId) {
    try {
      await axios.delete(`${BASE_URL}/contract-order-items/${testItemId}`, { headers });
      logSuccess('删除订货明细');
    } catch (error) {
      logFailure('删除订货明细', error.response?.data?.error || error.message);
    }
  }

  return testItemId;
}

// ==================== 8. 合同付款测试 ====================
async function testContractPayments(contractId) {
  console.log('\n=== 8. 合同付款测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testPaymentId = null;

  if (!contractId) {
    logFailure('合同付款测试', '缺少contractId');
    return null;
  }

  // 8.1 获取付款列表
  try {
    const res = await axios.get(`${BASE_URL}/contract-payments?contractId=${contractId}`, { headers });
    logSuccess('获取付款列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取付款列表', error.response?.data?.error || error.message);
  }

  // 8.2 创建付款
  try {
    const res = await axios.post(`${BASE_URL}/contract-payments`, {
      contractId: contractId,
      paymentDate: '2026-02-01',
      amount: 20000,
      paymentMethod: '银行转账',
      status: '已付款',
      remarks: '首付款'
    }, { headers });
    testPaymentId = res.data.id;
    logSuccess('创建付款', { id: testPaymentId, amount: res.data.amount });
  } catch (error) {
    logFailure('创建付款', error.response?.data?.error || error.message);
  }

  // 8.3 更新付款
  if (testPaymentId) {
    try {
      const res = await axios.put(`${BASE_URL}/contract-payments/${testPaymentId}`, {
        amount: 25000,
        remarks: '首付款-已更新'
      }, { headers });
      logSuccess('更新付款', { amount: res.data.amount });
    } catch (error) {
      logFailure('更新付款', error.response?.data?.error || error.message);
    }
  }

  // 8.4 删除付款
  if (testPaymentId) {
    try {
      await axios.delete(`${BASE_URL}/contract-payments/${testPaymentId}`, { headers });
      logSuccess('删除付款');
    } catch (error) {
      logFailure('删除付款', error.response?.data?.error || error.message);
    }
  }

  return testPaymentId;
}

// ==================== 9. 合同发货测试 ====================
async function testContractShipments(contractId) {
  console.log('\n=== 9. 合同发货测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testShipmentId = null;

  if (!contractId) {
    logFailure('合同发货测试', '缺少contractId');
    return null;
  }

  // 9.1 获取发货列表
  try {
    const res = await axios.get(`${BASE_URL}/contract-shipments?contractId=${contractId}`, { headers });
    logSuccess('获取发货列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取发货列表', error.response?.data?.error || error.message);
  }

  // 9.2 创建发货
  try {
    const res = await axios.post(`${BASE_URL}/contract-shipments`, {
      contractId: contractId,
      shipDate: '2026-03-01',
      logisticsNo: 'SF1234567890',
      logisticsCompany: '顺丰',
      content: '第一批货物',
      quantity: 10,
      status: '已发货',
      remarks: '已发出'
    }, { headers });
    testShipmentId = res.data.id;
    logSuccess('创建发货', { id: testShipmentId, logisticsNo: res.data.logisticsNo });
  } catch (error) {
    logFailure('创建发货', error.response?.data?.error || error.message);
  }

  // 9.3 更新发货
  if (testShipmentId) {
    try {
      const res = await axios.put(`${BASE_URL}/contract-shipments/${testShipmentId}`, {
        quantity: 15,
        remarks: '第一批货物-已更新'
      }, { headers });
      logSuccess('更新发货', { quantity: res.data.quantity });
    } catch (error) {
      logFailure('更新发货', error.response?.data?.error || error.message);
    }
  }

  // 9.4 删除发货
  if (testShipmentId) {
    try {
      await axios.delete(`${BASE_URL}/contract-shipments/${testShipmentId}`, { headers });
      logSuccess('删除发货');
    } catch (error) {
      logFailure('删除发货', error.response?.data?.error || error.message);
    }
  }

  return testShipmentId;
}

// ==================== 10. 售前/商机管理测试 ====================
async function testOpportunityManagement(orgId) {
  console.log('\n=== 10. 售前/商机管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testOpportunityId = null;

  if (!orgId) {
    logFailure('售前管理测试', '缺少orgId');
    return null;
  }

  // 10.1 获取售前列表
  try {
    const res = await axios.get(`${BASE_URL}/opportunities`, { headers });
    logSuccess('获取售前列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取售前列表', error.response?.data?.error || error.message);
  }

  // 10.2 创建售前
  try {
    const res = await axios.post(`${BASE_URL}/opportunities`, {
      name: '测试售前项目',
      organizationId: orgId,
      application: '软件销售',
      status: 'OPEN',
      budget: 200000,
      winRate: 50,
      expectedEnd: '2026-06-30'
    }, { headers });
    testOpportunityId = res.data.id;
    logSuccess('创建售前', { id: testOpportunityId, name: res.data.name });
  } catch (error) {
    logFailure('创建售前', error.response?.data?.error || error.message);
  }

  // 10.3 获取售前详情
  if (testOpportunityId) {
    try {
      const res = await axios.get(`${BASE_URL}/opportunities/${testOpportunityId}`, { headers });
      logSuccess('获取售前详情', { name: res.data.name });
    } catch (error) {
      logFailure('获取售前详情', error.response?.data?.error || error.message);
    }
  }

  // 10.4 更新售前
  if (testOpportunityId) {
    try {
      const res = await axios.put(`${BASE_URL}/opportunities/${testOpportunityId}`, {
        name: '测试售前项目-已更新',
        budget: 250000,
        winRate: 70
      }, { headers });
      logSuccess('更新售前', { name: res.data.name, budget: res.data.budget });
    } catch (error) {
      logFailure('更新售前', error.response?.data?.error || error.message);
    }
  }

  // 10.5 删除售前
  if (testOpportunityId) {
    try {
      await axios.delete(`${BASE_URL}/opportunities/${testOpportunityId}`, { headers });
      logSuccess('删除售前');
    } catch (error) {
      logFailure('删除售前', error.response?.data?.error || error.message);
    }
  }

  return testOpportunityId;
}

// ==================== 11. 采购管理测试 ====================
async function testProcurementManagement(projectId) {
  console.log('\n=== 11. 采购管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testProcurementId = null;

  if (!projectId) {
    logFailure('采购管理测试', '缺少projectId');
    return null;
  }

  // 11.1 获取采购列表
  try {
    const res = await axios.get(`${BASE_URL}/procurements?projectId=${projectId}`, { headers });
    logSuccess('获取采购列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取采购列表', error.response?.data?.error || error.message);
  }

  // 11.2 创建采购
  try {
    const res = await axios.post(`${BASE_URL}/procurements`, {
      projectId: projectId,
      title: '测试采购',
      vendor: '测试供应商',
      totalAmount: 30000,
      expectedDate: '2026-02-15',
      status: 'PLANNED',
      remarks: '项目所需设备'
    }, { headers });
    testProcurementId = res.data.id;
    logSuccess('创建采购', { id: testProcurementId, title: res.data.title });
  } catch (error) {
    logFailure('创建采购', error.response?.data?.error || error.message);
  }

  // 11.3 审批采购（状态流转：PLANNED -> ORDERED）
  if (testProcurementId) {
    try {
      const res = await axios.post(`${BASE_URL}/procurements/${testProcurementId}/approve`, {
        status: 'ORDERED',
        remark: '审批通过，已下单'
      }, { headers });
      logSuccess('审批采购', { status: res.data.status });
    } catch (error) {
      logFailure('审批采购', error.response?.data?.error || error.message);
    }
  }

  // 11.4 更新采购（只更新非status字段）
  if (testProcurementId) {
    try {
      const res = await axios.put(`${BASE_URL}/procurements/${testProcurementId}`, {
        totalAmount: 35000,
        remarks: '测试采购-已更新'
      }, { headers });
      logSuccess('更新采购', { totalAmount: res.data.totalAmount });
    } catch (error) {
      logFailure('更新采购', error.response?.data?.error || error.message);
    }
  }

  // 11.5 删除采购
  if (testProcurementId) {
    try {
      await axios.delete(`${BASE_URL}/procurements/${testProcurementId}`, { headers });
      logSuccess('删除采购');
    } catch (error) {
      logFailure('删除采购', error.response?.data?.error || error.message);
    }
  }

  return testProcurementId;
}

// ==================== 12. 发票管理测试 ====================
async function testInvoiceManagement(projectId) {
  console.log('\n=== 12. 发票管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testInvoiceId = null;

  if (!projectId) {
    logFailure('发票管理测试', '缺少projectId');
    return null;
  }

  // 12.1 获取发票列表
  try {
    const res = await axios.get(`${BASE_URL}/invoices?projectId=${projectId}`, { headers });
    logSuccess('获取发票列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取发票列表', error.response?.data?.error || error.message);
  }

  // 12.2 创建发票
  try {
    const res = await axios.post(`${BASE_URL}/invoices`, {
      projectId: projectId,
      invoiceNo: 'TEST-2026-001',
      invoiceType: 'INCOME',
      category: 'VAT_SPECIAL',
      amount: 10000,
      taxRate: 6,
      invoiceDate: '2026-02-20',
      status: 'PENDING'
    }, { headers });
    testInvoiceId = res.data.id;
    logSuccess('创建发票', { id: testInvoiceId, invoiceNo: res.data.invoiceNo });
  } catch (error) {
    logFailure('创建发票', error.response?.data?.error || error.message);
  }

  // 12.3 更新发票
  if (testInvoiceId) {
    try {
      const res = await axios.put(`${BASE_URL}/invoices/${testInvoiceId}`, {
        amount: 12000
      }, { headers });
      logSuccess('更新发票', { amount: res.data.amount });
    } catch (error) {
      logFailure('更新发票', error.response?.data?.error || error.message);
    }
  }

  // 12.4 删除发票
  if (testInvoiceId) {
    try {
      await axios.delete(`${BASE_URL}/invoices/${testInvoiceId}`, { headers });
      logSuccess('删除发票');
    } catch (error) {
      logFailure('删除发票', error.response?.data?.error || error.message);
    }
  }

  return testInvoiceId;
}

// ==================== 13. 日报管理测试 ====================
async function testDailyReportManagement() {
  console.log('\n=== 13. 日报管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testReportId = null;

  // 13.1 获取日报列表
  try {
    const res = await axios.get(`${BASE_URL}/daily-reports`, { headers });
    logSuccess('获取日报列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取日报列表', error.response?.data?.error || error.message);
  }

  // 13.2 创建日报
  try {
    const res = await axios.post(`${BASE_URL}/daily-reports`, {
      reportDate: '2026-08-07',
      type: 'WORK',
      content: '今日完成API测试脚本开发',
      plan: '继续完善测试用例',
      issues: '无',
      hours: 8
    }, { headers });
    testReportId = res.data.id;
    logSuccess('创建日报', { id: testReportId, reportDate: res.data.reportDate });
  } catch (error) {
    logFailure('创建日报', error.response?.data?.error || error.message);
  }

  // 13.3 更新日报
  if (testReportId) {
    try {
      const res = await axios.put(`${BASE_URL}/daily-reports/${testReportId}`, {
        content: '今日完成API测试脚本开发和执行',
        hours: 10
      }, { headers });
      logSuccess('更新日报', { content: res.data.content, hours: res.data.hours });
    } catch (error) {
      logFailure('更新日报', error.response?.data?.error || error.message);
    }
  }

  // 13.4 删除日报
  if (testReportId) {
    try {
      await axios.delete(`${BASE_URL}/daily-reports/${testReportId}`, { headers });
      logSuccess('删除日报');
    } catch (error) {
      logFailure('删除日报', error.response?.data?.error || error.message);
    }
  }

  return testReportId;
}

// ==================== 14. 任务管理测试 ====================
async function testTaskManagement() {
  console.log('\n=== 14. 任务管理测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };
  let testTaskId = null;
  let adminUserId = null;

  // 先获取admin用户ID
  try {
    const usersRes = await axios.get(`${BASE_URL}/users/dropdown`, { headers });
    const adminUser = usersRes.data.find(u => u.username === 'admin');
    if (adminUser) {
      adminUserId = adminUser.id;
    }
  } catch (error) {
    logFailure('获取admin用户ID', error.response?.data?.error || error.message);
  }

  // 14.1 获取任务列表
  try {
    const res = await axios.get(`${BASE_URL}/tasks`, { headers });
    logSuccess('获取任务列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取任务列表', error.response?.data?.error || error.message);
  }

  // 14.2 创建任务（DAILY_WORK类型不需要projectId）
  try {
    const res = await axios.post(`${BASE_URL}/tasks`, {
      title: '测试任务',
      description: '完成API全面测试',
      assigneeIds: [adminUserId],
      priority: 'HIGH',
      dueDate: '2026-08-15',
      taskType: 'DAILY_WORK'
    }, { headers });
    testTaskId = res.data.id;
    logSuccess('创建任务', { id: testTaskId, title: res.data.title });
  } catch (error) {
    logFailure('创建任务', error.response?.data?.error || error.message);
  }

  // 14.3 更新任务
  if (testTaskId) {
    try {
      const res = await axios.put(`${BASE_URL}/tasks/${testTaskId}`, {
        title: '测试任务-已更新',
        status: 'COMPLETED'
      }, { headers });
      logSuccess('更新任务', { title: res.data.title, status: res.data.status });
    } catch (error) {
      logFailure('更新任务', error.response?.data?.error || error.message);
    }
  }

  // 14.4 删除任务
  if (testTaskId) {
    try {
      await axios.delete(`${BASE_URL}/tasks/${testTaskId}`, { headers });
      logSuccess('删除任务');
    } catch (error) {
      logFailure('删除任务', error.response?.data?.error || error.message);
    }
  }

  return testTaskId;
}

// ==================== 15. 仪表盘测试 ====================
async function testDashboard() {
  console.log('\n=== 15. 仪表盘测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };

  try {
    const res = await axios.get(`${BASE_URL}/dashboard/stats`, { headers });
    logSuccess('获取仪表盘统计数据', res.data);
  } catch (error) {
    logFailure('获取仪表盘统计数据', error.response?.data?.error || error.message);
  }
}

// ==================== 16. 操作日志测试 ====================
async function testOperationLogs() {
  console.log('\n=== 16. 操作日志测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };

  try {
    const res = await axios.get(`${BASE_URL}/operation-logs`, { headers });
    logSuccess('获取操作日志列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取操作日志列表', error.response?.data?.error || error.message);
  }
}

// ==================== 17. 登录日志测试 ====================
async function testLoginLogs() {
  console.log('\n=== 17. 登录日志测试 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };

  try {
    const res = await axios.get(`${BASE_URL}/login-logs`, { headers });
    logSuccess('获取登录日志列表', { count: res.data.length });
  } catch (error) {
    logFailure('获取登录日志列表', error.response?.data?.error || error.message);
  }
}

// ==================== 18. 权限控制测试 ====================
async function testPermissionControl(projectId, contractId) {
  console.log('\n=== 18. 权限控制测试 ===');

  if (!projectId || !contractId) {
    logFailure('权限控制测试', '缺少projectId或contractId');
    return;
  }

  // 18.1 测试归档项目禁止新增合同
  try {
    await axios.post(`${BASE_URL}/contracts`, {
      name: '应该失败的合同',
      organizationId: 1,
      projectId: projectId,
      amount: 1000
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增合同应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增合同 (403)');
    } else {
      logFailure('归档项目新增合同', error.message);
    }
  }

  // 18.2 测试归档项目禁止新增订货明细
  try {
    await axios.post(`${BASE_URL}/contract-order-items`, {
      contractId: contractId,
      productName: '应该失败的产品',
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增订货明细应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增订货明细 (403)');
    } else {
      logFailure('归档项目新增订货明细', error.message);
    }
  }

  // 18.3 测试归档项目禁止新增付款
  try {
    await axios.post(`${BASE_URL}/contract-payments`, {
      contractId: contractId,
      paymentDate: '2026-04-01',
      amount: 5000
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增付款应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增付款 (403)');
    } else {
      logFailure('归档项目新增付款', error.message);
    }
  }

  // 18.4 测试归档项目禁止新增发货
  try {
    await axios.post(`${BASE_URL}/contract-shipments`, {
      contractId: contractId,
      shipDate: '2026-04-01'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增发货应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增发货 (403)');
    } else {
      logFailure('归档项目新增发货', error.message);
    }
  }
}

// ==================== 18. 归档项目并测试权限限制 ====================
async function testArchiveAndPermissions(projectId, contractId) {
  console.log('\n=== 18. 归档项目并测试权限限制 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };

  if (!projectId) {
    logFailure('归档权限测试', '缺少projectId');
    return;
  }

  // 18.1 归档项目
  try {
    const res = await axios.put(`${BASE_URL}/projects/${projectId}/archive`, {
      isArchived: true
    }, { headers });
    logSuccess('归档项目', { isArchived: res.data.isArchived });
  } catch (error) {
    logFailure('归档项目', error.response?.data?.error || error.message);
    return; // 归档失败则无法继续测试
  }

  // 18.2 测试归档项目禁止新增合同
  try {
    await axios.post(`${BASE_URL}/contracts`, {
      name: '应该失败的合同',
      organizationId: 1,
      projectId: projectId,
      amount: 1000,
      signDate: '2026-04-01'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增合同应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增合同 (403)');
    } else {
      logFailure('归档项目新增合同', error.message);
    }
  }

  if (!contractId) {
    logFailure('归档权限测试', '缺少contractId，跳过后续测试');
    return;
  }

  // 18.3 测试归档项目禁止新增订货明细
  try {
    await axios.post(`${BASE_URL}/contract-order-items`, {
      contractId: contractId,
      productName: '应该失败的产品',
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增订货明细应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增订货明细 (403)');
    } else {
      logFailure('归档项目新增订货明细', error.message);
    }
  }

  // 18.4 测试归档项目禁止新增付款
  try {
    await axios.post(`${BASE_URL}/contract-payments`, {
      contractId: contractId,
      paymentDate: '2026-04-01',
      amount: 5000
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增付款应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增付款 (403)');
    } else {
      logFailure('归档项目新增付款', error.message);
    }
  }

  // 18.5 测试归档项目禁止新增发货
  try {
    await axios.post(`${BASE_URL}/contract-shipments`, {
      contractId: contractId,
      shipDate: '2026-04-01'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    logFailure('归档项目新增发货应该失败', '不应该成功');
  } catch (error) {
    if (error.response?.status === 403) {
      logSuccess('归档项目禁止新增发货 (403)');
    } else {
      logFailure('归档项目新增发货', error.message);
    }
  }
}

// ==================== 19. 清理测试数据 ====================
async function cleanupTestData(projectId, orgId, contractId) {
  console.log('\n=== 19. 清理测试数据 ===');
  const headers = { Authorization: `Bearer ${adminToken}` };

  // 删除合同
  if (contractId) {
    try {
      await axios.delete(`${BASE_URL}/contracts/${contractId}`, { headers });
      logSuccess('清理测试合同');
    } catch (error) {
      logFailure('清理测试合同', error.response?.data?.error || error.message);
    }
  }

  // 删除项目
  if (projectId) {
    try {
      // 先取消归档
      await axios.put(`${BASE_URL}/projects/${projectId}/archive`, {
        isArchived: false
      }, { headers });
      // 再删除
      await axios.delete(`${BASE_URL}/projects/${projectId}`, { headers });
      logSuccess('清理测试项目');
    } catch (error) {
      logFailure('清理测试项目', error.response?.data?.error || error.message);
    }
  }

  // 删除客户
  if (orgId) {
    try {
      await axios.delete(`${BASE_URL}/organizations/${orgId}`, { headers });
      logSuccess('清理测试客户');
    } catch (error) {
      logFailure('清理测试客户', error.response?.data?.error || error.message);
    }
  }
}

// ==================== 主测试流程 ====================
async function runAllTests() {
  console.log('🧪 开始全面API测试...\n');
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`API地址: ${BASE_URL}\n`);

  const startTime = Date.now();

  // 1. 认证测试
  const authSuccess = await testAuth();
  if (!authSuccess) {
    console.log('\n❌ 认证失败，终止测试');
    return;
  }

  // 2. 用户管理测试
  await testUserManagement();

  // 3. 部门管理测试
  await testDepartmentManagement();

  // 4. 客户管理测试
  const testOrgId = await testOrganizationManagement();

  // 5. 项目管理测试
  const { projectId, orgId, contractId } = await testProjectManagement();

  // 6. 合同管理测试（使用项目管理中已创建的合同）
  await testContractManagement(projectId, orgId, contractId);

  // 7. 订货明细测试
  await testOrderItems(contractId);

  // 8. 合同付款测试
  await testContractPayments(contractId);

  // 9. 合同发货测试
  await testContractShipments(contractId);

  // 10. 售前/商机管理测试
  await testOpportunityManagement(orgId);

  // 11. 采购管理测试
  await testProcurementManagement(projectId);

  // 12. 发票管理测试
  await testInvoiceManagement(projectId);

  // 13. 日报管理测试
  await testDailyReportManagement();

  // 14. 任务管理测试
  await testTaskManagement();

  // 15. 仪表盘测试
  await testDashboard();

  // 16. 操作日志测试
  await testOperationLogs();

  // 17. 登录日志测试
  await testLoginLogs();

  // 18. 归档项目并测试权限控制
  await testArchiveAndPermissions(projectId, contractId);

  // 19. 清理测试数据
  await cleanupTestData(projectId, orgId, contractId);

  // 生成测试报告
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const total = testResults.length;
  const passRate = ((passed / total) * 100).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('📊 测试报告');
  console.log('='.repeat(60));
  console.log(`总测试数: ${total}`);
  console.log(`✓ 通过: ${passed}`);
  console.log(`✗ 失败: ${failed}`);
  console.log(`通过率: ${passRate}%`);
  console.log(`耗时: ${duration}秒`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    testResults
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log('\n✅ 测试完成！\n');
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
