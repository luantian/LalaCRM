const http = require('http');

async function login(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const req = http.request({
      hostname: 'localhost', port: 5000, path: '/api/auth/login',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testApi(token, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 5000, path: '/api' + path,
      method: method, headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 200) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('=== API 端点权限检查测试 ===');
  
  const adminLogin = await login('admin', 'admin123');
  const user1Login = await login('user1', '123456');
  const manager1Login = await login('manager1', '123456');
  const directorLogin = await login('director', '123456');
  
  console.log('\nadmin permissions:', adminLogin.user?.permissions);
  console.log('user1 permissions count:', user1Login.user?.permissions?.length);
  console.log('manager1 permissions count:', manager1Login.user?.permissions?.length);
  console.log('director permissions count:', directorLogin.user?.permissions?.length);
  
  const endpoints = [
    { path: '/organizations', required: 'crm:organization:list' },
    { path: '/opportunities', required: 'crm:opportunity:list' },
    { path: '/projects', required: 'project:project:list' },
    { path: '/users', required: 'system:user:list' },
    { path: '/roles', required: 'system:role:list' },
    { path: '/daily-reports', required: 'office:dailyreport:list' },
    { path: '/business-trips', required: 'office:trip:list' },
    { path: '/expenses', required: 'finance:expense:list' },
    { path: '/check-ins', required: 'office:checkin:list' },
  ];
  
  const users = [
    { name: 'admin', token: adminLogin.token },
    { name: 'director', token: directorLogin.token },
    { name: 'manager1', token: manager1Login.token },
    { name: 'user1', token: user1Login.token },
  ];
  
  console.log('\n--- 权限测试结果 ---');
  console.log('用户\t\t' + endpoints.map(e => e.path.split('/')[1].substring(0, 8)).join('\t'));
  
  for (const user of users) {
    const results = [];
    for (const ep of endpoints) {
      const res = await testApi(user.token, 'GET', ep.path);
      results.push(res.status === 200 ? '✓200' : res.status === 403 ? '✗403' : '?' + res.status);
    }
    console.log(user.name + '\t\t' + results.join('\t'));
  }
  
  console.log('\n✓ = 有权限(200), ✗ = 无权限(403), ? = 其他状态');
}

runTests().catch(console.error);
