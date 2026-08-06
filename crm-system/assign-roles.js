const axios = require('axios');
const BASE = 'http://localhost:5000/api';

async function main() {
  // 1. admin登录
  const loginRes = await axios.post(BASE + '/auth/login', { username: 'admin', password: 'admin123' });
  const token = loginRes.data.token;
  console.log('Admin登录成功, userId:', loginRes.data.user?.id);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. 查看admin的角色信息
  const usersRes = await axios.get(BASE + '/users', { headers });
  const allUsers = usersRes.data.users || usersRes.data;
  const adminUser = allUsers.find(u => u.username === 'admin');
  console.log('\nadmin用户:', { id: adminUser?.id, roleId: adminUser?.roleId, role: adminUser?.role, roleRef: adminUser?.roleRef });
  
  // 3. 查看所有角色
  const rolesRes = await axios.get(BASE + '/roles', { headers });
  const roles = rolesRes.data.roles || rolesRes.data;
  console.log('\n系统角色:');
  roles.forEach(r => console.log(`  ID=${r.id} name=${r.name} displayName=${r.displayName} roleKey=${r.roleKey || '-'}`));

  // 4. 找sales_test和viewer_test
  const salesUser = allUsers.find(u => u.username === 'sales_test');
  const viewerUser = allUsers.find(u => u.username === 'viewer_test');
  console.log('\nsales_test:', { id: salesUser?.id, roleId: salesUser?.roleId, role: salesUser?.role });
  console.log('viewer_test:', { id: viewerUser?.id, roleId: viewerUser?.roleId, role: viewerUser?.role });

  // 5. 检查是否已有USER角色，如果没有就创建一个
  let userRole = roles.find(r => r.name === 'USER');
  if (!userRole) {
    console.log('\nUSER角色不存在，创建...');
    const createRes = await axios.post(BASE + '/roles', {
      name: 'USER',
      displayName: '普通用户',
      roleKey: 'user',
      description: '普通用户角色，拥有基本业务操作权限'
    }, { headers });
    userRole = createRes.data;
    console.log('创建USER角色成功:', { id: userRole.id, name: userRole.name });
  } else {
    console.log('\nUSER角色已存在:', { id: userRole.id });
  }

  // 6. 给sales_test分配USER角色
  if (salesUser) {
    console.log(`\n分配角色 roleId=${userRole.id} 给 sales_test(id=${salesUser.id})...`);
    const r1 = await axios.put(`${BASE}/users/${salesUser.id}`, { roleId: userRole.id }, { headers });
    console.log('结果:', r1.status, JSON.stringify(r1.data).substring(0, 200));
  }

  // 7. 给viewer_test分配USER角色
  if (viewerUser) {
    console.log(`\n分配角色 roleId=${userRole.id} 给 viewer_test(id=${viewerUser.id})...`);
    const r2 = await axios.put(`${BASE}/users/${viewerUser.id}`, { roleId: userRole.id }, { headers });
    console.log('结果:', r2.status, JSON.stringify(r2.data).substring(0, 200));
  }

  // 8. 验证
  console.log('\n=== 验证分配结果 ===');
  const verifyRes = await axios.get(BASE + '/users', { headers });
  const verifyUsers = verifyRes.data.users || verifyRes.data;
  const vs = verifyUsers.find(u => u.username === 'sales_test');
  const vv = verifyUsers.find(u => u.username === 'viewer_test');
  console.log('sales_test:', { id: vs?.id, roleId: vs?.roleId, role: vs?.role });
  console.log('viewer_test:', { id: vv?.id, roleId: vv?.roleId, role: vv?.role });

  // 9. 检查USER角色有没有菜单权限
  console.log('\n=== 检查角色菜单权限 ===');
  const roleMenusRes = await axios.get(`${BASE}/role-menus/${userRole.id}`, { headers });
  console.log(`USER角色(roleId=${userRole.id})的菜单:`, JSON.stringify(roleMenusRes.data).substring(0, 300));
}

main().catch(e => {
  console.error('Error:', e.response?.data || e.message);
});
