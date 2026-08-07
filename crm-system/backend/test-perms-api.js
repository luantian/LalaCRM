const http = require('http');

const BASE_URL = 'http://localhost:5000';

// 测试用账号
const accounts = [
  { username: 'admin', password: 'admin123', label: '超级管理员(admin)' },
  { username: 'test_admin', password: 'test123', label: '测试管理员(test_admin)' },
  { username: 'test_user1', password: 'test123', label: '测试用户1(test_user1)' },
  { username: 'viewer_test', password: 'test123', label: '查看者(viewer_test)' },
  { username: 'luantian', password: 'test123', label: '乱天(luantian)' },
];

function login(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const req = http.request(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function apiCall(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    
    const req = http.request(`${BASE_URL}${path}`, { method, headers }, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, body: b }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// 权限测试用例
const permTests = [
  { method: 'GET', path: '/api/users', perm: 'system:user:list', label: '用户列表' },
  { method: 'POST', path: '/api/users', perm: 'system:user:add', label: '创建用户', body: { username: 'test_xxx', password: 'test123', email: 'xxx@test.com', name: '测试' } },
  { method: 'GET', path: '/api/roles', perm: 'system:role:list', label: '角色列表' },
  { method: 'GET', path: '/api/departments', perm: 'system:department:list', label: '部门列表' },
  { method: 'GET', path: '/api/organizations', perm: 'crm:organization:list', label: '客户列表' },
  { method: 'POST', path: '/api/organizations', perm: 'crm:organization:add', label: '创建客户', body: { name: '测试客户' } },
  { method: 'GET', path: '/api/projects', perm: 'project:project:list', label: '项目列表' },
  { method: 'GET', path: '/api/opportunities', perm: 'crm:opportunity:list', label: '售前列表' },
  { method: 'GET', path: '/api/daily-reports', perm: 'office:dailyreport:list', label: '日报列表' },
  { method: 'GET', path: '/api/operation-logs', perm: 'system:log:list', label: '操作日志列表' },
  { method: 'GET', path: '/api/menu-items', perm: 'system:menu:list', label: '菜单列表' },
];

async function main() {
  console.log('===========================================');
  console.log('   LalaCRM 权限系统全面测试');
  console.log('===========================================\n');

  // 1. 登录所有账号
  const tokens = {};
  const userInfos = {};
  for (const acc of accounts) {
    const res = await login(acc.username, acc.password);
    if (res.status === 200) {
      tokens[acc.username] = res.body.token;
      userInfos[acc.username] = res.body.user;
      console.log(`[登录成功] ${acc.label}: permissions=[${res.body.user.permissions.length}个] ${res.body.user.permissions.includes('*') ? '⭐拥有通配符权限*' : ''}`);
    } else {
      console.log(`[登录失败] ${acc.label}: ${res.body.error || JSON.stringify(res.body)}`);
      // 尝试其他密码
      const res2 = await login(acc.username, 'Admin123');
      if (res2.status === 200) {
        tokens[acc.username] = res2.body.token;
        userInfos[acc.username] = res2.body.user;
        console.log(`  -> 使用备用密码登录成功: permissions=[${res2.body.user.permissions.length}个]`);
      } else {
        console.log(`  -> 备用密码也失败`);
      }
    }
  }

  console.log('\n===========================================');
  console.log('   /me 接口权限一致性检查');
  console.log('===========================================\n');

  // 2. 检查 /me 接口返回的权限
  for (const username of Object.keys(tokens)) {
    const meRes = await apiCall('GET', '/api/auth/me', tokens[username]);
    if (meRes.status === 200) {
      const loginPerms = userInfos[username]?.permissions || [];
      const mePerms = meRes.body.permissions || [];
      const loginSet = new Set(loginPerms);
      const meSet = new Set(mePerms);
      
      const missingInMe = loginPerms.filter(p => !meSet.has(p));
      const extraInMe = mePerms.filter(p => !loginSet.has(p));
      
      if (missingInMe.length === 0 && extraInMe.length === 0) {
        console.log(`[${username}] /me 权限与登录一致 (${mePerms.length}个)`);
      } else {
        console.log(`[${username}] /me 权限不一致！`);
        if (missingInMe.length > 0) console.log(`  登录有但/me没有: ${missingInMe.join(', ')}`);
        if (extraInMe.length > 0) console.log(`  /me有但登录没有: ${extraInMe.join(', ')}`);
      }
    }
  }

  console.log('\n===========================================');
  console.log('   API 权限访问测试');
  console.log('===========================================\n');

  // 3. 逐个用户测试各 API 接口
  for (const acc of accounts) {
    if (!tokens[acc.username]) {
      console.log(`\n--- ${acc.label}: 跳过(无token) ---`);
      continue;
    }
    
    console.log(`\n--- ${acc.label} ---`);
    console.log(`User.role=${userInfos[acc.username]?.role} JWT.permissions包含*: ${userInfos[acc.username]?.permissions?.includes('*')}`);
    
    for (const test of permTests) {
      const res = await apiCall(test.method, test.path, tokens[acc.username], test.body);
      let status = '';
      if (res.status === 200) {
        status = '✅ 200 可访问';
      } else if (res.status === 403) {
        status = '🚫 403 无权限';
      } else if (res.status === 401) {
        status = '🔒 401 未认证';
      } else {
        status = `⚠️  ${res.status} ${res.body?.error || ''}`;
      }
      console.log(`  ${test.label.padEnd(12)} (${test.perm.padEnd(28)}): ${status}`);
    }
  }

  console.log('\n===========================================');
  console.log('   菜单数据检查');
  console.log('===========================================\n');

  // 4. 检查登录返回的菜单数据
  for (const acc of accounts) {
    if (!tokens[acc.username]) continue;
    const loginRes = await login(acc.username, acc.password);
    if (loginRes.status === 200) {
      const menus = loginRes.body.menus || [];
      console.log(`[${acc.username}] 返回 ${menus.length} 个菜单/权限节点`);
    }
  }

  console.log('\n===========================================');
  console.log('   关键问题检查');
  console.log('===========================================\n');

  // 5. 检查 test_admin 的特殊情况
  if (tokens['test_admin']) {
    console.log('--- test_admin 详细检查 ---');
    console.log('问题: User.role=USER, 但 UserRole=ADMIN');
    console.log('登录时 JWT 是否包含 * 权限?');
    console.log(`  答案: ${userInfos['test_admin']?.permissions?.includes('*') ? '是(包含*)' : '否(不包含*)'}`);
    
    // 尝试访问需要管理员的接口
    const usersRes = await apiCall('GET', '/api/users', tokens['test_admin']);
    console.log(`  访问用户列表: ${usersRes.status}`);
    
    // 查看权限
    console.log(`  JWT中的permissions: [${userInfos['test_admin']?.permissions?.length}个]`);
    
    // 检查 isAdmin 中间件的行为
    // 虽然JWT不包含*，但后端 isAdmin() 会查UserRole表，所以可能仍然能访问
    const adminEndpoints = [
      { path: '/api/users', perm: 'system:user:list' },
      { path: '/api/roles', perm: 'system:role:list' },
    ];
    for (const ep of adminEndpoints) {
      const res = await apiCall('GET', ep.path, tokens['test_admin']);
      console.log(`  ${ep.path} (${ep.perm}): ${res.status} ${res.status === 200 ? '✅' : '❌'}`);
    }
  }

  console.log('\n===========================================');
  console.log('   测试完成');
  console.log('===========================================');
}

main().catch(console.error);
