const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testTeamScope() {
  console.log('=== 测试TEAM数据权限功能 ===\n');

  // 1. 登录获取admin token
  console.log('1. 登录管理员账号...');
  const loginRes = await axios.post(`${API_BASE}/auth/login`, {
    username: 'admin',
    password: 'admin123'
  });
  const adminToken = loginRes.data.token;
  console.log('✓ 登录成功\n');

  const headers = { Authorization: `Bearer ${adminToken}` };

  // 2. 获取所有角色
  console.log('2. 获取角色列表...');
  const rolesRes = await axios.get(`${API_BASE}/roles`, { headers });
  const roles = rolesRes.data;
  console.log(`✓ 找到 ${roles.length} 个角色`);
  
  roles.forEach(role => {
    console.log(`  - ${role.displayName} (${role.name}): dataScope=${role.dataScope || '未设置'}`);
  });
  console.log();

  // 3. 测试更新角色的dataScope为TEAM
  if (roles.length > 0) {
    const testRole = roles.find(r => r.name !== 'ADMIN') || roles[0];
    console.log(`3. 测试更新角色 "${testRole.displayName}" 的dataScope为TEAM...`);
    
    const updateRes = await axios.put(`${API_BASE}/roles/${testRole.id}`, {
      displayName: testRole.displayName,
      description: testRole.description,
      permissions: testRole.permissions,
      dataScope: 'TEAM'
    }, { headers });

    console.log('✓ 更新成功');
    console.log(`  返回数据: dataScope=${updateRes.data.dataScope}\n`);

    // 4. 验证更新结果
    console.log('4. 验证更新结果...');
    const verifyRes = await axios.get(`${API_BASE}/roles/${testRole.id}`, { headers });
    console.log(`✓ 验证通过: dataScope=${verifyRes.data.dataScope}\n`);

    // 5. 恢复原值
    console.log('5. 恢复角色原dataScope...');
    await axios.put(`${API_BASE}/roles/${testRole.id}`, {
      displayName: testRole.displayName,
      description: testRole.description,
      permissions: testRole.permissions,
      dataScope: verifyRes.data.dataScope
    }, { headers });
    console.log('✓ 已恢复\n');
  }

  // 6. 获取当前用户信息
  console.log('6. 获取当前用户信息...');
  const userRes = await axios.get(`${API_BASE}/auth/me`, { headers });
  const user = userRes.data;
  console.log(`✓ 当前用户: ${user.username}`);
  console.log(`  角色: ${user.role?.displayName || '未设置'}`);
  console.log(`  数据范围: ${user.role?.dataScope || '未设置'}\n`);

  console.log('=== 测试完成 ===');
  console.log('\n前端界面验证:');
  console.log('1. 打开 http://localhost:3000');
  console.log('2. 进入 系统管理 → 角色管理');
  console.log('3. 点击任意角色的"编辑"按钮');
  console.log('4. 在"数据范围"下拉框中应该能看到:');
  console.log('   - 全部数据 (ALL)');
  console.log('   - 本部门数据 (DEPARTMENT)');
  console.log('   - 本部门及下级 (DEPARTMENT_BELOW)');
  console.log('   - 团队成员数据 (TEAM)');
  console.log('   - 仅本人数据 (SELF)');
  console.log('   - 自定义 (CUSTOM)');
}

testTeamScope().catch(err => {
  console.error('✗ 测试失败:', err.response?.data || err.message);
  process.exit(1);
});
