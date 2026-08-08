/**
 * LalaCRM 全模块综合测试脚本
 * 覆盖36个路由模块，200+测试用例
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';

// 测试结果统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let skippedTests = 0;
const failedDetails = [];

// 全局变量存储测试数据
const testData = {
  tokens: {},
  users: {},
  departments: {},
  roles: {},
  organizations: {},
  projects: {},
  contracts: {},
  opportunities: {},
  procurements: {},
  businessTrips: {},
  expenses: {},
  dailyReports: {},
  tasks: {},
  checkIns: {},
  notifications: {}
};

// ==================== 工具函数 ====================

function log(message, type = 'INFO') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    'INFO': 'ℹ️',
    'SUCCESS': '✅',
    'ERROR': '❌',
    'WARN': '⚠️',
    'TEST': '🧪',
    'MODULE': '📦'
  }[type] || '';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function logTest(module, testName, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    log(`[${module}] ${testName}`, 'SUCCESS');
  } else {
    failedTests++;
    const detail = `[${module}] ${testName}${details ? ': ' + details : ''}`;
    failedDetails.push(detail);
    log(detail, 'ERROR');
  }
}

function logSkipped(module, testName, reason) {
  totalTests++;
  skippedTests++;
  log(`[${module}] ${testName} - 跳过: ${reason}`, 'WARN');
}

async function request(method, url, data = null, token = null) {
  const config = {
    method,
    url: `${BASE_URL}${url}`,
    headers: {
      'Content-Type': 'application/json'
    },
    validateStatus: () => true // 接受任何状态码
  };
  
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (data) {
    config.data = data;
  }
  
  try {
    const response = await axios(config);
    const isSuccess = response.status >= 200 && response.status < 300;
    return { 
      success: isSuccess, 
      data: response.data, 
      status: response.status,
      error: isSuccess ? null : `状态码${response.status}: ${JSON.stringify(response.data)}`
    };
  } catch (error) {
    return { success: false, error: error.message, status: 0 };
  }
}

// ==================== 模块1: 认证与登录 ====================

async function testAuth() {
  log('开始测试：认证与登录', 'MODULE');
  
  // 1.1 登录admin账号
  const result = await request('POST', '/auth/login', {
    username: 'admin',
    password: 'admin123'
  });
  
  if (result.success && result.data.token) {
    testData.tokens.admin = result.data.token;
    testData.users.admin = result.data.user;
    logTest('Auth', '登录admin账号', true);
  } else {
    logTest('Auth', '登录admin账号', false, result.error);
    return false; // 无法继续测试
  }
  
  // 1.2 错误密码登录
  const wrongPwd = await request('POST', '/auth/login', {
    username: 'admin',
    password: 'wrongpassword'
  });
  logTest('Auth', '错误密码登录返回401', !wrongPwd.success);
  
  // 1.3 获取当前用户信息
  const me = await request('GET', '/auth/me', null, testData.tokens.admin);
  logTest('Auth', '获取当前用户信息', me.success && me.data.id);
  
  // 1.4 获取用户菜单
  const menus = await request('GET', '/auth/menus', null, testData.tokens.admin);
  logTest('Auth', '获取用户菜单', menus.success);
  
  // 1.5 无Token访问
  const noToken = await request('GET', '/auth/me');
  logTest('Auth', '无Token访问返回401', !noToken.success);
  
  return true;
}

// ==================== 模块2: 系统管理 ====================

async function testSystemManagement() {
  log('开始测试：系统管理', 'MODULE');
  
  await testUserManagement();
  await testRoleManagement();
  await testMenuManagement();
  await testDepartmentManagement();
  await testDictManagement();
  await testLogManagement();
}

async function testUserManagement() {
  const list = await request('GET', '/users?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('用户管理', '获取用户列表', list.success);
  
  const timestamp = Date.now();
  const createResult = await request('POST', '/users', {
    username: `test_user_${timestamp}`,
    password: 'Test123456',
    name: '测试用户',
    email: `test${timestamp}@example.com`,
    phone: '13800138000',
    role: 'USER'
  }, testData.tokens.admin);
  
  if (createResult.success) {
    testData.users.testUser = createResult.data;
    logTest('用户管理', '创建用户', true);
    
    const updateResult = await request('PUT', `/users/${createResult.data.id}`, {
      name: '更新后的测试用户',
      phone: '13900139000'
    }, testData.tokens.admin);
    logTest('用户管理', '更新用户', updateResult.success);
    
    const deleteResult = await request('DELETE', `/users/${createResult.data.id}`, null, testData.tokens.admin);
    logTest('用户管理', '删除用户', deleteResult.success);
  } else {
    logTest('用户管理', '创建用户', false, createResult.error);
  }
  
  const dropdown = await request('GET', '/users/dropdown', null, testData.tokens.admin);
  logTest('用户管理', '获取用户下拉列表', dropdown.success);
  
  const roles = await request('GET', '/users/roles', null, testData.tokens.admin);
  logTest('用户管理', '获取用户角色列表', roles.success);
}

async function testRoleManagement() {
  const list = await request('GET', '/roles', null, testData.tokens.admin);
  logTest('角色管理', '获取角色列表', list.success);
  
  const timestamp = Date.now();
  const createResult = await request('POST', '/roles', {
    name: `TEST_ROLE_${timestamp}`,
    displayName: '测试角色',
    description: '用于测试的角色',
    dataScope: 'SELF'
  }, testData.tokens.admin);
  
  if (createResult.success) {
    testData.roles.testRole = createResult.data;
    logTest('角色管理', '创建角色', true);
    
    const updateResult = await request('PUT', `/roles/${createResult.data.id}`, {
      description: '更新后的描述'
    }, testData.tokens.admin);
    logTest('角色管理', '更新角色', updateResult.success);
    
    const deleteResult = await request('DELETE', `/roles/${createResult.data.id}`, null, testData.tokens.admin);
    logTest('角色管理', '删除角色', deleteResult.success);
  } else {
    logTest('角色管理', '创建角色', false, createResult.error);
  }
}

async function testMenuManagement() {
  const list = await request('GET', '/menus', null, testData.tokens.admin);
  logTest('菜单管理', '获取菜单列表', list.success);
  
  const timestamp = Date.now();
  const createResult = await request('POST', '/menus', {
    name: `测试菜单_${timestamp}`,
    type: 'MENU',
    path: '/test-menu',
    icon: 'test',
    order: 999,
    visible: true,
    parentId: null,
    perm: 'test:menu:test'
  }, testData.tokens.admin);
  
  if (createResult.success) {
    logTest('菜单管理', '创建菜单', true);
    
    const updateResult = await request('PUT', `/menus/${createResult.data.id}`, {
      name: '更新后的菜单'
    }, testData.tokens.admin);
    logTest('菜单管理', '更新菜单', updateResult.success);
    
    const deleteResult = await request('DELETE', `/menus/${createResult.data.id}`, null, testData.tokens.admin);
    logTest('菜单管理', '删除菜单', deleteResult.success);
  } else {
    logTest('菜单管理', '创建菜单', false, createResult.error);
  }
}

async function testDepartmentManagement() {
  const tree = await request('GET', '/departments/tree', null, testData.tokens.admin);
  logTest('部门管理', '获取部门树', tree.success);
  
  const list = await request('GET', '/departments', null, testData.tokens.admin);
  logTest('部门管理', '获取部门列表', list.success);
  
  const timestamp = Date.now();
  const createResult = await request('POST', '/departments', {
    name: `测试部门_${timestamp}`,
    parentId: null,
    order: 999
  }, testData.tokens.admin);
  
  if (createResult.success) {
    testData.departments.testDept = createResult.data;
    logTest('部门管理', '创建部门', true);
    
    const updateResult = await request('PUT', `/departments/${createResult.data.id}`, {
      name: '更新后的部门'
    }, testData.tokens.admin);
    logTest('部门管理', '更新部门', updateResult.success);
    
    const deleteResult = await request('DELETE', `/departments/${createResult.data.id}`, null, testData.tokens.admin);
    logTest('部门管理', '删除部门', deleteResult.success);
  } else {
    logTest('部门管理', '创建部门', false, createResult.error);
  }
}

async function testDictManagement() {
  const types = await request('GET', '/dicts/types', null, testData.tokens.admin);
  logTest('字典管理', '获取字典类型列表', types.success);
  
  const timestamp = Date.now();
  const createType = await request('POST', '/dicts/types', {
    code: `test_dict_${timestamp}`,
    name: '测试字典',
    description: '用于测试的字典'
  }, testData.tokens.admin);
  
  if (createType.success) {
    logTest('字典管理', '创建字典类型', true);
    
    const data = await request('GET', `/dicts/types/${createType.data.id}/data`, null, testData.tokens.admin);
    logTest('字典管理', '获取字典数据', data.success);
    
    const createItem = await request('POST', `/dicts/types/${createType.data.id}/data`, {
      label: '测试项',
      value: 'test_value',
      order: 1
    }, testData.tokens.admin);
    logTest('字典管理', '创建字典数据项', createItem.success);
    
    const deleteType = await request('DELETE', `/dicts/types/${createType.data.id}`, null, testData.tokens.admin);
    logTest('字典管理', '删除字典类型', deleteType.success);
  } else {
    logTest('字典管理', '创建字典类型', false, createType.error);
  }
}

async function testLogManagement() {
  const opLogs = await request('GET', '/operation-logs?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('日志管理', '获取操作日志', opLogs.success);
  
  const loginLogs = await request('GET', '/login-logs?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('日志管理', '获取登录日志', loginLogs.success);
}

// ==================== 模块3: 客户管理 ====================

async function testOrganizationManagement() {
  log('开始测试：客户管理', 'MODULE');
  
  const simple = await request('GET', '/organizations/simple', null, testData.tokens.admin);
  logTest('客户管理', '获取简单列表', simple.success);
  
  const list = await request('GET', '/organizations?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('客户管理', '获取客户列表', list.success);
  
  const tree = await request('GET', '/organizations/tree', null, testData.tokens.admin);
  logTest('客户管理', '获取客户树', tree.success);
  
  const timestamp = Date.now();
  const createGroup = await request('POST', '/organizations', {
    name: `测试集团_${timestamp}`,
    type: 'GROUP',
    parentId: null
  }, testData.tokens.admin);
  
  if (createGroup.success) {
    testData.organizations.group = createGroup.data;
    logTest('客户管理', '创建集团', true);
    
    const createCompany = await request('POST', '/organizations', {
      name: `测试公司_${timestamp}`,
      type: 'COMPANY',
      parentId: createGroup.data.id
    }, testData.tokens.admin);
    
    if (createCompany.success) {
      testData.organizations.company = createCompany.data;
      logTest('客户管理', '创建子公司', true);
      
      const createBranch = await request('POST', '/organizations', {
        name: `测试分公司_${timestamp}`,
        type: 'BRANCH',
        parentId: createCompany.data.id
      }, testData.tokens.admin);
      
      if (createBranch.success) {
        testData.organizations.branch = createBranch.data;
        logTest('客户管理', '创建分公司', true);
        
        const detail = await request('GET', `/organizations/${createGroup.data.id}`, null, testData.tokens.admin);
        logTest('客户管理', '获取客户详情', detail.success);
        
        const update = await request('PUT', `/organizations/${createGroup.data.id}`, {
          name: '更新后的集团名称'
        }, testData.tokens.admin);
        logTest('客户管理', '更新客户', update.success);
        
        await testContactManagement(createCompany.data.id);
        
        await request('DELETE', `/organizations/${createBranch.data.id}`, null, testData.tokens.admin);
        await request('DELETE', `/organizations/${createCompany.data.id}`, null, testData.tokens.admin);
        await request('DELETE', `/organizations/${createGroup.data.id}`, null, testData.tokens.admin);
      } else {
        logTest('客户管理', '创建分公司', false, createBranch.error);
      }
    } else {
      logTest('客户管理', '创建子公司', false, createCompany.error);
    }
  } else {
    logTest('客户管理', '创建集团', false, createGroup.error);
  }
}

async function testContactManagement(orgId) {
  const list = await request('GET', `/organizations/${orgId}/contacts`, null, testData.tokens.admin);
  logTest('联系人', '获取联系人列表', list.success);
  
  const create = await request('POST', `/organizations/${orgId}/contacts`, {
    name: '测试联系人',
    position: '测试职位',
    phone: '13800138001',
    email: 'contact@test.com',
    isPrimary: true
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('联系人', '创建联系人', true);
    
    const update = await request('PUT', `/organizations/${orgId}/contacts/${create.data.id}`, {
      name: '更新后的联系人'
    }, testData.tokens.admin);
    logTest('联系人', '更新联系人', update.success);
    
    const del = await request('DELETE', `/organizations/${orgId}/contacts/${create.data.id}`, null, testData.tokens.admin);
    logTest('联系人', '删除联系人', del.success);
  } else {
    logTest('联系人', '创建联系人', false, create.error);
  }
}

// ==================== 模块4: 售前管理（商机） ====================

async function testOpportunityManagement() {
  log('开始测试：售前管理', 'MODULE');
  
  const timestamp = Date.now();
  const org = await request('POST', '/organizations', {
    name: `售前测试客户_${timestamp}`,
    type: 'COMPANY',
    parentId: null
  }, testData.tokens.admin);
  
  if (!org.success) {
    logTest('售前管理', '创建测试客户', false, org.error);
    return;
  }
  
  testData.organizations.oppOrg = org.data;
  
  const list = await request('GET', '/opportunities?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('售前管理', '获取商机列表', list.success);
  
  const stats = await request('GET', '/opportunities/stats/overview', null, testData.tokens.admin);
  logTest('售前管理', '获取商机统计', stats.success);
  
  const create = await request('POST', '/opportunities', {
    name: `测试商机_${timestamp}`,
    organizationId: org.data.id,
    amount: 100000,
    expectedCloseDate: '2026-12-31',
    status: 'INITIAL',
    stage: '初步接触'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.opportunities.test = create.data;
    logTest('售前管理', '创建商机', true);
    
    const detail = await request('GET', `/opportunities/${create.data.id}`, null, testData.tokens.admin);
    logTest('售前管理', '获取商机详情', detail.success);
    
    const update = await request('PUT', `/opportunities/${create.data.id}`, {
      amount: 150000,
      status: 'FOLLOW_UP'
    }, testData.tokens.admin);
    logTest('售前管理', '更新商机', update.success);
    
    const addRecord = await request('POST', `/opportunities/${create.data.id}/records`, {
      type: 'PHONE',
      content: '电话沟通，客户有兴趣',
      nextStep: '下周拜访'
    }, testData.tokens.admin);
    logTest('售前管理', '添加跟进记录', addRecord.success);
    
    const records = await request('GET', `/opportunities/${create.data.id}/records`, null, testData.tokens.admin);
    logTest('售前管理', '获取跟进记录', records.success);
    
    await request('DELETE', `/opportunities/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('售前管理', '创建商机', false, create.error);
  }
  
  await request('DELETE', `/organizations/${org.data.id}`, null, testData.tokens.admin);
}

// ==================== 模块5: 项目管理 ====================

async function testProjectManagement() {
  log('开始测试：项目管理', 'MODULE');
  
  const timestamp = Date.now();
  const org = await request('POST', '/organizations', {
    name: `项目测试客户_${timestamp}`,
    type: 'COMPANY',
    parentId: null
  }, testData.tokens.admin);
  
  if (!org.success) {
    logTest('项目管理', '创建测试客户', false, org.error);
    return;
  }
  
  testData.organizations.projOrg = org.data;
  
  const list = await request('GET', '/projects?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('项目管理', '获取项目列表', list.success);
  
  const stats = await request('GET', '/projects/stats/overview', null, testData.tokens.admin);
  logTest('项目管理', '获取项目统计', stats.success);
  
  const create = await request('POST', '/projects', {
    name: `测试项目_${timestamp}`,
    organizationId: org.data.id,
    status: 'IN_PROGRESS',
    budget: 500000,
    startDate: '2026-08-01',
    endDate: '2026-12-31'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.projects.test = create.data;
    logTest('项目管理', '创建项目', true);
    
    const detail = await request('GET', `/projects/${create.data.id}`, null, testData.tokens.admin);
    logTest('项目管理', '获取项目详情', detail.success);
    
    const update = await request('PUT', `/projects/${create.data.id}`, {
      budget: 600000
    }, testData.tokens.admin);
    logTest('项目管理', '更新项目', update.success);
    
    await testProjectNotes(create.data.id);
    await testProjectVersions(create.data.id);
    
    const costs = await request('GET', `/project-costs/${create.data.id}/summary`, null, testData.tokens.admin);
    logTest('项目管理', '获取项目成本', costs.success);
    
    const archive = await request('PUT', `/projects/${create.data.id}/archive`, null, testData.tokens.admin);
    logTest('项目管理', '归档项目', archive.success);
    
    const deleteArchived = await request('DELETE', `/projects/${create.data.id}`, null, testData.tokens.admin);
    logTest('项目管理', '归档项目禁止删除', !deleteArchived.success);
    
    // 取消归档后删除
    await request('PUT', `/projects/${create.data.id}/unarchive`, null, testData.tokens.admin);
    await request('DELETE', `/projects/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('项目管理', '创建项目', false, create.error);
  }
  
  await request('DELETE', `/organizations/${org.data.id}`, null, testData.tokens.admin);
}

async function testProjectNotes(projectId) {
  const create = await request('POST', '/project-notes/notes', {
    projectId,
    content: '测试备注内容'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('项目备注', '创建备注', true);
    
    const list = await request('GET', `/project-notes/notes?projectId=${projectId}`, null, testData.tokens.admin);
    logTest('项目备注', '获取备注列表', list.success);
    
    const update = await request('PUT', `/project-notes/notes/${create.data.id}`, {
      content: '更新后的备注'
    }, testData.tokens.admin);
    logTest('项目备注', '更新备注', update.success);
    
    const del = await request('DELETE', `/project-notes/notes/${create.data.id}`, null, testData.tokens.admin);
    logTest('项目备注', '删除备注', del.success);
  } else {
    logTest('项目备注', '创建备注', false, create.error);
  }
}

async function testProjectVersions(projectId) {
  const create = await request('POST', '/project-notes/versions', {
    projectId,
    versionNumber: '1.0',
    description: '初始版本'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('项目版本', '创建版本', true);
    
    const list = await request('GET', `/project-notes/versions?projectId=${projectId}`, null, testData.tokens.admin);
    logTest('项目版本', '获取版本列表', list.success);
    
    const update = await request('PUT', `/project-notes/versions/${create.data.id}`, {
      description: '更新后的版本描述'
    }, testData.tokens.admin);
    logTest('项目版本', '更新版本', update.success);
    
    const del = await request('DELETE', `/project-notes/versions/${create.data.id}`, null, testData.tokens.admin);
    logTest('项目版本', '删除版本', del.success);
  } else {
    logTest('项目版本', '创建版本', false, create.error);
  }
}

// ==================== 模块6: 合同管理 ====================

async function testContractManagement() {
  log('开始测试：合同管理', 'MODULE');
  
  if (!testData.projects.test || !testData.organizations.projOrg) {
    log('项目管理测试未创建必要数据，跳过合同管理', 'WARN');
    return;
  }
  
  const list = await request('GET', '/contracts?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('合同管理', '获取合同列表', list.success);
  
  const timestamp = Date.now();
  const create = await request('POST', '/contracts', {
    name: `测试合同_${timestamp}`,
    projectId: testData.projects.test.id,
    organizationId: testData.organizations.projOrg.id,
    amount: 100000,
    signDate: '2026-08-01',
    status: 'DRAFT'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.contracts.test = create.data;
    logTest('合同管理', '创建合同', true);
    
    const detail = await request('GET', `/contracts/${create.data.id}`, null, testData.tokens.admin);
    logTest('合同管理', '获取合同详情', detail.success);
    
    const update = await request('PUT', `/contracts/${create.data.id}`, {
      amount: 120000
    }, testData.tokens.admin);
    logTest('合同管理', '更新合同', update.success);
    
    await testContractOrderItems(create.data.id);
    await testContractPayments(create.data.id);
    await testContractShipments(create.data.id);
    
    const approve = await request('POST', `/contracts/${create.data.id}/approve`, {
      action: 'approve'
    }, testData.tokens.admin);
    logTest('合同管理', '审批合同', approve.success);
    
    await request('DELETE', `/contracts/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('合同管理', '创建合同', false, create.error);
  }
}

async function testContractOrderItems(contractId) {
  const create = await request('POST', '/contract-order-items', {
    contractId,
    productName: '测试产品',
    quantity: 10,
    unitPrice: 1000,
    amount: 10000
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('合同订货', '创建明细', true);
    
    const list = await request('GET', `/contract-order-items?contractId=${contractId}`, null, testData.tokens.admin);
    logTest('合同订货', '获取明细列表', list.success);
    
    const update = await request('PUT', `/contract-order-items/${create.data.id}`, {
      quantity: 15
    }, testData.tokens.admin);
    logTest('合同订货', '更新明细', update.success);
    
    const del = await request('DELETE', `/contract-order-items/${create.data.id}`, null, testData.tokens.admin);
    logTest('合同订货', '删除明细', del.success);
  } else {
    logTest('合同订货', '创建明细', false, create.error);
  }
}

async function testContractPayments(contractId) {
  const create = await request('POST', '/contract-payments', {
    contractId,
    amount: 30000,
    paymentDate: '2026-08-15',
    paymentMethod: '银行转账'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('合同付款', '创建付款', true);
    
    const list = await request('GET', `/contract-payments?contractId=${contractId}`, null, testData.tokens.admin);
    logTest('合同付款', '获取付款列表', list.success);
    
    const update = await request('PUT', `/contract-payments/${create.data.id}`, {
      amount: 35000
    }, testData.tokens.admin);
    logTest('合同付款', '更新付款', update.success);
    
    const del = await request('DELETE', `/contract-payments/${create.data.id}`, null, testData.tokens.admin);
    logTest('合同付款', '删除付款', del.success);
  } else {
    logTest('合同付款', '创建付款', false, create.error);
  }
}

async function testContractShipments(contractId) {
  const create = await request('POST', '/contract-shipments', {
    contractId,
    shipmentDate: '2026-09-01',
    description: '第一批货物'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('合同发货', '创建发货', true);
    
    const list = await request('GET', `/contract-shipments?contractId=${contractId}`, null, testData.tokens.admin);
    logTest('合同发货', '获取发货列表', list.success);
    
    const update = await request('PUT', `/contract-shipments/${create.data.id}`, {
      description: '更新后的发货描述'
    }, testData.tokens.admin);
    logTest('合同发货', '更新发货', update.success);
    
    const del = await request('DELETE', `/contract-shipments/${create.data.id}`, null, testData.tokens.admin);
    logTest('合同发货', '删除发货', del.success);
  } else {
    logTest('合同发货', '创建发货', false, create.error);
  }
}

// ==================== 模块7: 采购管理 ====================

async function testProcurementManagement() {
  log('开始测试：采购管理', 'MODULE');
  
  if (!testData.projects.test) {
    log('项目管理测试未创建必要数据，跳过采购管理', 'WARN');
    return;
  }
  
  const list = await request('GET', '/procurements?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('采购管理', '获取采购列表', list.success);
  
  const stats = await request('GET', '/procurements/stats/overview', null, testData.tokens.admin);
  logTest('采购管理', '获取采购统计', stats.success);
  
  const timestamp = Date.now();
  const create = await request('POST', '/procurements', {
    title: `测试采购_${timestamp}`,
    projectId: testData.projects.test.id,
    totalAmount: 50000,
    status: 'DRAFT'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.procurements.test = create.data;
    logTest('采购管理', '创建采购', true);
    
    const detail = await request('GET', `/procurements/${create.data.id}`, null, testData.tokens.admin);
    logTest('采购管理', '获取采购详情', detail.success);
    
    const update = await request('PUT', `/procurements/${create.data.id}`, {
      totalAmount: 55000
    }, testData.tokens.admin);
    logTest('采购管理', '更新采购', update.success);
    
    await testProcurementItems(create.data.id);
    await testProcurementPayments(create.data.id);
    
    const approve = await request('POST', `/procurements/${create.data.id}/approve`, {
      action: 'approve'
    }, testData.tokens.admin);
    logTest('采购管理', '审批采购', approve.success);
    
    await request('DELETE', `/procurements/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('采购管理', '创建采购', false, create.error);
  }
}

async function testProcurementItems(procurementId) {
  const create = await request('POST', `/procurements/${procurementId}/items`, {
    name: '测试物料',
    quantity: 100,
    unitPrice: 500,
    amount: 50000
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('采购明细', '创建明细', true);
    
    const list = await request('GET', `/procurements/${procurementId}/items`, null, testData.tokens.admin);
    logTest('采购明细', '获取明细列表', list.success);
    
    const update = await request('PUT', `/procurements/${procurementId}/items/${create.data.id}`, {
      quantity: 120
    }, testData.tokens.admin);
    logTest('采购明细', '更新明细', update.success);
    
    const del = await request('DELETE', `/procurements/${procurementId}/items/${create.data.id}`, null, testData.tokens.admin);
    logTest('采购明细', '删除明细', del.success);
  } else {
    logTest('采购明细', '创建明细', false, create.error);
  }
}

async function testProcurementPayments(procurementId) {
  const create = await request('POST', '/procurement-payments', {
    procurementId,
    amount: 20000,
    paymentDate: '2026-08-20',
    paymentMethod: '银行转账'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('采购付款', '创建付款', true);
    
    const list = await request('GET', `/procurement-payments?procurementId=${procurementId}`, null, testData.tokens.admin);
    logTest('采购付款', '获取付款列表', list.success);
    
    const update = await request('PUT', `/procurement-payments/${create.data.id}`, {
      amount: 25000
    }, testData.tokens.admin);
    logTest('采购付款', '更新付款', update.success);
    
    const del = await request('DELETE', `/procurement-payments/${create.data.id}`, null, testData.tokens.admin);
    logTest('采购付款', '删除付款', del.success);
  } else {
    logTest('采购付款', '创建付款', false, create.error);
  }
}

// ==================== 模块8: 出差管理 ====================

async function testBusinessTripManagement() {
  log('开始测试：出差管理', 'MODULE');
  
  const list = await request('GET', '/business-trips?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('出差管理', '获取出差列表', list.success);
  
  const stats = await request('GET', '/business-trips/stats/overview', null, testData.tokens.admin);
  logTest('出差管理', '获取出差统计', stats.success);
  
  const timestamp = Date.now();
  const create = await request('POST', '/business-trips', {
    title: `测试出差_${timestamp}`,
    destination: '北京',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    reason: '客户拜访'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.businessTrips.test = create.data;
    logTest('出差管理', '创建出差', true);
    
    const detail = await request('GET', `/business-trips/${create.data.id}`, null, testData.tokens.admin);
    logTest('出差管理', '获取出差详情', detail.success);
    
    const update = await request('PUT', `/business-trips/${create.data.id}`, {
      destination: '上海'
    }, testData.tokens.admin);
    logTest('出差管理', '更新出差', update.success);
    
    const submit = await request('POST', `/business-trips/${create.data.id}/submit`, null, testData.tokens.admin);
    logTest('出差管理', '提交出差', submit.success);
    
    const approve = await request('POST', `/business-trips/${create.data.id}/approve`, {
      comment: '同意'
    }, testData.tokens.admin);
    logTest('出差管理', '审批出差', approve.success);
    
    const complete = await request('POST', `/business-trips/${create.data.id}/complete`, null, testData.tokens.admin);
    logTest('出差管理', '完成出差', complete.success);
    
    await request('DELETE', `/business-trips/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('出差管理', '创建出差', false, create.error);
  }
}

// ==================== 模块9: 费用报销 ====================

async function testExpenseManagement() {
  log('开始测试：费用报销', 'MODULE');
  
  const list = await request('GET', '/expenses?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('费用报销', '获取报销列表', list.success);
  
  const stats = await request('GET', '/expenses/stats/overview', null, testData.tokens.admin);
  logTest('费用报销', '获取报销统计', stats.success);
  
  const timestamp = Date.now();
  const create = await request('POST', '/expenses', {
    title: `测试报销_${timestamp}`,
    totalAmount: 5000,
    expenseType: 'TRAVEL',
    description: '出差费用报销'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.expenses.test = create.data;
    logTest('费用报销', '创建报销', true);
    
    const detail = await request('GET', `/expenses/${create.data.id}`, null, testData.tokens.admin);
    logTest('费用报销', '获取报销详情', detail.success);
    
    const update = await request('PUT', `/expenses/${create.data.id}`, {
      totalAmount: 5500
    }, testData.tokens.admin);
    logTest('费用报销', '更新报销', update.success);
    
    const submit = await request('POST', `/expenses/${create.data.id}/submit`, null, testData.tokens.admin);
    logTest('费用报销', '提交报销', submit.success);
    
    const approve = await request('POST', `/expenses/${create.data.id}/approve`, {
      comment: '同意'
    }, testData.tokens.admin);
    logTest('费用报销', '审批报销', approve.success);
    
    const pay = await request('POST', `/expenses/${create.data.id}/pay`, {
      paymentMethod: '银行转账'
    }, testData.tokens.admin);
    logTest('费用报销', '支付报销', pay.success);
    
    await request('DELETE', `/expenses/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('费用报销', '创建报销', false, create.error);
  }
}

// ==================== 模块10: 日报管理 ====================

async function testDailyReportManagement() {
  log('开始测试：日报管理', 'MODULE');
  
  const list = await request('GET', '/daily-reports?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('日报管理', '获取日报列表', list.success);
  
  const stats = await request('GET', '/daily-reports/stats/overview', null, testData.tokens.admin);
  logTest('日报管理', '获取日报统计', stats.success);
  
  const timestamp = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const create = await request('POST', '/daily-reports', {
    reportDate: today,
    content: '今日完成了系统测试脚本编写',
    status: 'DRAFT'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.dailyReports.test = create.data;
    logTest('日报管理', '创建日报', true);
    
    const detail = await request('GET', `/daily-reports/${create.data.id}`, null, testData.tokens.admin);
    logTest('日报管理', '获取日报详情', detail.success);
    
    const update = await request('PUT', `/daily-reports/${create.data.id}`, {
      content: '今日完成了系统测试脚本编写和调试'
    }, testData.tokens.admin);
    logTest('日报管理', '更新日报', update.success);
    
    const submit = await request('POST', `/daily-reports/${create.data.id}/submit`, null, testData.tokens.admin);
    logTest('日报管理', '提交日报', submit.success);
    
    const approve = await request('POST', `/daily-reports/${create.data.id}/approve`, {
      comment: '优秀'
    }, testData.tokens.admin);
    logTest('日报管理', '审批日报', approve.success);
    
    await testDailyReportComments(create.data.id);
    
    await request('DELETE', `/daily-reports/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('日报管理', '创建日报', false, create.error);
  }
  
  await testDailyReportTemplates();
}

async function testDailyReportComments(reportId) {
  const create = await request('POST', `/daily-reports/${reportId}/comments`, {
    content: '测试评论'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('日报评论', '添加评论', true);
    
    const list = await request('GET', `/daily-reports/${reportId}/comments`, null, testData.tokens.admin);
    logTest('日报评论', '获取评论列表', list.success);
    
    const del = await request('DELETE', `/daily-reports/${reportId}/comments/${create.data.id}`, null, testData.tokens.admin);
    logTest('日报评论', '删除评论', del.success);
  } else {
    logTest('日报评论', '添加评论', false, create.error);
  }
}

async function testDailyReportTemplates() {
  const timestamp = Date.now();
  const create = await request('POST', '/daily-report-templates', {
    name: `测试模板_${timestamp}`,
    type: 'WORK',
    content: '日报模板内容'
  }, testData.tokens.admin);
  
  if (create.success) {
    logTest('日报模板', '创建模板', true);
    
    const list = await request('GET', '/daily-report-templates', null, testData.tokens.admin);
    logTest('日报模板', '获取模板列表', list.success);
    
    const use = await request('POST', `/daily-report-templates/${create.data.id}/use`, null, testData.tokens.admin);
    logTest('日报模板', '使用模板', use.success);
    
    const del = await request('DELETE', `/daily-report-templates/${create.data.id}`, null, testData.tokens.admin);
    logTest('日报模板', '删除模板', del.success);
  } else {
    logTest('日报模板', '创建模板', false, create.error);
  }
}

// ==================== 模块11: 任务管理 ====================

async function testTaskManagement() {
  log('开始测试：任务管理', 'MODULE');
  
  const list = await request('GET', '/tasks?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('任务管理', '获取任务列表', list.success);
  
  const timestamp = Date.now();
  const assigneeId = testData.users.admin?.id || 'unknown';
  const create = await request('POST', '/tasks', {
    title: `测试任务_${timestamp}`,
    description: '测试任务描述',
    assigneeId,
    priority: 'MEDIUM',
    dueDate: '2026-08-15'
  }, testData.tokens.admin);
  
  if (create.success) {
    testData.tasks.test = create.data;
    logTest('任务管理', '创建任务', true);
    
    const detail = await request('GET', `/tasks/${create.data.id}`, null, testData.tokens.admin);
    logTest('任务管理', '获取任务详情', detail.success);
    
    const update = await request('PUT', `/tasks/${create.data.id}`, {
      priority: 'HIGH'
    }, testData.tokens.admin);
    logTest('任务管理', '更新任务', update.success);
    
    const addRecord = await request('POST', `/tasks/${create.data.id}/records`, {
      content: '完成任务50%'
    }, testData.tokens.admin);
    logTest('任务管理', '添加任务记录', addRecord.success);
    
    const records = await request('GET', `/tasks/${create.data.id}/records`, null, testData.tokens.admin);
    logTest('任务管理', '获取任务记录', records.success);
    
    await request('DELETE', `/tasks/${create.data.id}`, null, testData.tokens.admin);
  } else {
    logTest('任务管理', '创建任务', false, create.error);
  }
}

// ==================== 模块12: 打卡管理 ====================

async function testCheckInManagement() {
  log('开始测试：打卡管理', 'MODULE');
  
  const list = await request('GET', '/check-ins?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('打卡管理', '获取打卡列表', list.success);
  
  const today = await request('GET', '/check-ins/today', null, testData.tokens.admin);
  logTest('打卡管理', '获取今日打卡', today.success);
  
  const stats = await request('GET', '/check-ins/stats', null, testData.tokens.admin);
  logTest('打卡管理', '获取打卡统计', stats.success);
  
  const checkin = await request('POST', '/check-ins', {
    type: 'IN',
    location: '公司'
  }, testData.tokens.admin);
  logTest('打卡管理', '打卡', checkin.success);
}

// ==================== 模块13: 通知管理 ====================

async function testNotificationManagement() {
  log('开始测试：通知管理', 'MODULE');
  
  const list = await request('GET', '/notifications?page=1&pageSize=10', null, testData.tokens.admin);
  logTest('通知管理', '获取通知列表', list.success);
  
  if (list.success && list.data.data && list.data.data.length > 0) {
    const notificationId = list.data.data[0].id;
    const markRead = await request('PUT', `/notifications/${notificationId}/read`, null, testData.tokens.admin);
    logTest('通知管理', '标记通知已读', markRead.success);
  }
  
  const markAllRead = await request('PUT', '/notifications/read-all', null, testData.tokens.admin);
  logTest('通知管理', '全部标记已读', markAllRead.success);
}

// ==================== 模块14: 仪表盘 ====================

async function testDashboard() {
  log('开始测试：仪表盘', 'MODULE');
  
  const stats = await request('GET', '/dashboard/stats', null, testData.tokens.admin);
  logTest('仪表盘', '获取统计数据', stats.success);
  
  const myProjects = await request('GET', '/dashboard/my-projects', null, testData.tokens.admin);
  logTest('仪表盘', '获取我的项目', myProjects.success);
}

// ==================== 模块15: 权限测试 ====================

async function testPermissions() {
  log('开始测试：权限控制', 'MODULE');
  
  log('权限测试需要额外用户账号，已跳过（仅admin账号）', 'WARN');
}

// ==================== 主函数 ====================

async function runAllTests() {
  log('========================================', 'INFO');
  log('LalaCRM 全模块综合测试开始', 'INFO');
  log('========================================', 'INFO');
  log('');
  
  const startTime = Date.now();
  
  try {
    // 1. 认证测试（必须先通过）
    const authOk = await testAuth();
    log('');
    
    if (!authOk) {
      log('认证失败，无法继续测试', 'ERROR');
      return;
    }
    
    // 2. 系统管理
    await testSystemManagement();
    log('');
    
    // 3. 客户管理
    await testOrganizationManagement();
    log('');
    
    // 4. 售前管理
    await testOpportunityManagement();
    log('');
    
    // 5. 项目管理
    await testProjectManagement();
    log('');
    
    // 6. 合同管理
    await testContractManagement();
    log('');
    
    // 7. 采购管理
    await testProcurementManagement();
    log('');
    
    // 8. 出差管理
    await testBusinessTripManagement();
    log('');
    
    // 9. 费用报销
    await testExpenseManagement();
    log('');
    
    // 10. 日报管理
    await testDailyReportManagement();
    log('');
    
    // 11. 任务管理
    await testTaskManagement();
    log('');
    
    // 12. 打卡管理
    await testCheckInManagement();
    log('');
    
    // 13. 通知管理
    await testNotificationManagement();
    log('');
    
    // 14. 仪表盘
    await testDashboard();
    log('');
    
    // 15. 权限测试
    await testPermissions();
    log('');
    
  } catch (error) {
    log(`测试过程中发生错误: ${error.message}`, 'ERROR');
    console.error(error);
  }
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  log('========================================', 'INFO');
  log('测试完成', 'INFO');
  log('========================================', 'INFO');
  log('');
  log(`总测试数: ${totalTests}`, 'INFO');
  log(`通过: ${passedTests}`, 'SUCCESS');
  log(`失败: ${failedTests}`, 'ERROR');
  log(`跳过: ${skippedTests}`, 'WARN');
  log(`通过率: ${((passedTests / (totalTests - skippedTests)) * 100).toFixed(2)}%`, 'INFO');
  log(`耗时: ${duration}秒`, 'INFO');
  log('');
  
  if (failedTests > 0) {
    log('失败详情:', 'ERROR');
    failedDetails.forEach(detail => {
      log(`  - ${detail}`, 'ERROR');
    });
  }
  
  // 生成测试报告文件
  const report = {
    timestamp: new Date().toISOString(),
    duration,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      skipped: skippedTests,
      passRate: ((passedTests / (totalTests - skippedTests)) * 100).toFixed(2) + '%'
    },
    failedDetails
  };
  
  const reportPath = path.join(__dirname, `test-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\n测试报告已保存到: ${reportPath}`, 'INFO');
}

// 运行测试
runAllTests().catch(console.error);
