const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// 测试用户
const testUsers = [
  { username: 'admin', password: 'admin123', role: '管理员' },
  { username: 'zhangsan', password: '123456', role: '销售总监' },
  { username: 'lisi', password: '123456', role: '销售经理' },
  { username: 'wangwu', password: '123456', role: '普通用户' }
];

async function testPermissions() {
  console.log('=== 权限系统全面测试 ===\n');

  for (const user of testUsers) {
    console.log(`\n--- 测试用户: ${user.username} (${user.role}) ---`);
    
    try {
      // 1. 登录获取 token
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        username: user.username,
        password: user.password
      });
      
      const token = loginRes.data.token;
      console.log('✓ 登录成功');

      // 2. 获取用户信息
      const userInfoRes = await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const userInfo = userInfoRes.data;
      console.log(`用户权限:`, userInfo.permissions?.length || 0, '个');
      console.log('权限列表:', userInfo.permissions?.slice(0, 5).join(', ') + (userInfo.permissions?.length > 5 ? '...' : ''));

      // 3. 测试各种 API 端点
      const endpoints = [
        { name: '获取组织列表', method: 'get', url: '/organizations', perm: 'crm:organization:list' },
        { name: '获取商机列表', method: 'get', url: '/opportunities', perm: 'crm:opportunity:list' },
        { name: '获取项目列表', method: 'get', url: '/projects', perm: 'crm:project:list' },
        { name: '获取日报列表', method: 'get', url: '/daily-reports', perm: 'crm:dailyReport:list' },
        { name: '获取审批列表', method: 'get', url: '/approvals', perm: 'crm:approval:list' }
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await axios[endpoint.method](`${BASE_URL}${endpoint.url}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log(`✓ ${endpoint.name} - 状态: ${res.status}`);
        } catch (err) {
          if (err.response?.status === 403) {
            console.log(`✗ ${endpoint.name} - 无权限 (403)`);
          } else {
            console.log(`✗ ${endpoint.name} - 错误: ${err.response?.status || err.message}`);
          }
        }
      }

    } catch (err) {
      console.log(`✗ 登录失败: ${err.response?.data?.message || err.message}`);
    }
  }

  console.log('\n=== 测试完成 ===');
}

testPermissions().catch(console.error);
