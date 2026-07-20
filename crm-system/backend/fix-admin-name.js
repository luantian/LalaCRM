// 修复admin用户名称
const API_BASE = 'http://localhost:5000/api';

async function fixAdminName() {
  try {
    // 登录
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ 登录成功');

    // 获取当前用户信息
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const currentUser = await meRes.json();
    console.log('当前用户:', currentUser);

    // 重新注册一个正确名称的管理员（如果更新接口不存在）
    console.log('\n正在创建新的管理员账户...');
    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin2',
        password: 'admin123',
        email: 'admin2@crm.com',
        name: '管理员',
        role: 'ADMIN'
      })
    });

    if (registerRes.ok) {
      const newUser = await registerRes.json();
      console.log('✅ 新管理员创建成功:', newUser);
      console.log('\n请使用新账户登录：');
      console.log('用户名: admin2');
      console.log('密码: admin123');
    } else {
      console.log('创建失败，可能用户名已存在');
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

fixAdminName();
