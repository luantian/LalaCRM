const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

const testUsers = [
  { username: 'admin', password: 'admin123', expectedRole: '系统管理员', expectedPerms: 100 },
  { username: 'director', password: '123456', expectedRole: '项目总监', expectedPerms: 50 },
  { username: 'manager1', password: '123456', expectedRole: '项目经理', expectedPerms: 30 },
  { username: 'user1', password: '123456', expectedRole: '普通用户', expectedPerms: 10 }
];

const apiTests = [
  { method: 'get', url: '/users', name: '获取用户列表', requiredPerm: 'system:user:list' },
  { method: 'get', url: '/roles', name: '获取角色列表', requiredPerm: 'system:role:list' },
  { method: 'get', url: '/menus', name: '获取菜单列表', requiredPerm: 'system:menu:list' },
  { method: 'get', url: '/departments', name: '获取部门列表', requiredPerm: 'system:dept:list' },
  { method: 'get', url: '/organizations', name: '获取组织列表', requiredPerm: 'crm:organization:list' },
  { method: 'get', url: '/opportunities', name: '获取商机列表', requiredPerm: 'crm:opportunity:list' },
  { method: 'get', url: '/projects', name: '获取项目列表', requiredPerm: 'project:project:list' },
  { method: 'get', url: '/daily-reports', name: '获取日报列表', requiredPerm: 'office:dailyreport:list' },
  { method: 'get', url: '/business-trips', name: '获取出差列表', requiredPerm: 'office:trip:list' },
  { method: 'get', url: '/expenses', name: '获取费用列表', requiredPerm: 'finance:expense:list' },
  { method: 'get', url: '/check-ins', name: '获取打卡列表', requiredPerm: 'office:checkin:list' },
];

async function login(username, password) {
  const response = await axios.post(`${BASE_URL}/auth/login`, { username, password });
  return response.data;
}

async function testApi(token, method, url) {
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${url}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    return { success: true, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      status: error.response?.status,
      error: error.response?.data?.error || error.message 
    };
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('开始权限系统多轮测试');
  console.log('========================================\n');

  for (let round = 1; round <= 3; round++) {
    console.log(`\n========== 第 ${round} 轮测试 ==========\n`);

    for (const user of testUsers) {
      console.log(`\n--- 测试用户: ${user.username} (${user.expectedRole}) ---`);
      
      try {
        // 登录
        const loginData = await login(user.username, user.password);
        console.log(`✓ 登录成功`);
        console.log(`  权限数量: ${loginData.user.permissions.length}`);
        console.log(`  前5个权限: ${loginData.user.permissions.slice(0, 5).join(', ')}`);
        
        const token = loginData.token;
        
        // 验证 /me 接口
        const meResponse = await axios.get(`${BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`✓ /me 接口验证成功，权限数量: ${meResponse.data.permissions.length}`);
        
        // 测试各个 API 端点
        let successCount = 0;
        let failCount = 0;
        
        for (const api of apiTests) {
          const result = await testApi(token, api.method, api.url);
          if (result.success) {
            successCount++;
            console.log(`  ✓ ${api.name} - 状态: ${result.status}`);
          } else {
            failCount++;
            console.log(`  ✗ ${api.name} - 失败: ${result.error} (状态: ${result.status})`);
          }
        }
        
        console.log(`\n  API 测试结果: ${successCount} 成功, ${failCount} 失败`);
        
      } catch (error) {
        console.log(`✗ 登录失败: ${error.response?.data?.error || error.message}`);
      }
    }
    
    if (round < 3) {
      console.log('\n\n等待 2 秒后开始下一轮测试...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n\n========================================');
  console.log('所有测试完成');
  console.log('========================================\n');
}

runTests().catch(console.error);
