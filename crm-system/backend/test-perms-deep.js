const http = require('http');
const BASE_URL = 'http://localhost:5000';

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
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function api(method, path, token, body) {
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

async function main() {
  console.log('=============================================');
  console.log('   权限系统深度测试 - 发现潜在问题');
  console.log('=============================================\n');

  // 登录
  const logins = {};
  for (const [u, p] of [['admin','admin123'], ['test_admin','test123'], ['test_user1','test123'], ['viewer_test','test123']]) {
    const r = await login(u, p);
    if (r.status === 200) logins[u] = r.body;
  }

  let issues = 0;

  // ========== 问题1: 操作日志接口硬编码 isAdmin ==========
  console.log('【问题1】操作日志接口硬编码isAdmin检查');
  console.log('operationLogs.ts GET / 使用 isAdmin() 而非 checkPermission("system:log:list")');
  console.log('test_user1 拥有 system:log:list 权限，但可能无法访问操作日志\n');
  
  const test_user1_has_log_list = logins['test_user1']?.user?.permissions?.includes('system:log:list');
  console.log(`test_user1 JWT中有 system:log:list: ${test_user1_has_log_list}`);
  
  const opLogRes = await api('GET', '/api/operation-logs', logins['test_user1']?.token);
  console.log(`test_user1 访问 GET /api/operation-logs: ${opLogRes.status} ${opLogRes.body?.error || ''}`);
  if (test_user1_has_log_list && opLogRes.status === 403) {
    console.log('  ❌ 发现问题！有 system:log:list 权限但被403，因为路由硬编码了isAdmin检查');
    issues++;
  }
  
  const loginLogRes = await api('GET', '/api/login-logs', logins['test_user1']?.token);
  console.log(`test_user1 访问 GET /api/login-logs: ${loginLogRes.status} ${loginLogRes.body?.error || ''}`);
  if (test_user1_has_log_list && loginLogRes.status !== 200) {
    console.log(`  ⚠️ login-logs也返回 ${loginLogRes.status}`);
  }

  // ========== 问题2: test_admin 的 User.role vs UserRole 不一致 ==========
  console.log('\n【问题2】test_admin User.role=USER 但 UserRole=ADMIN');
  console.log('登录时 JWT 权限和中间件实际行为不一致\n');
  
  const ta_perms = logins['test_admin']?.user?.permissions || [];
  console.log(`test_admin JWT中权限数量: ${ta_perms.length}`);
  console.log(`test_admin JWT包含*: ${ta_perms.includes('*')}`);
  console.log(`test_admin 前端会以为它只有${ta_perms.length}个权限`);
  
  // 测试一个 TEST_ENGINEER 角色没有但 ADMIN 角色有的权限
  // 先查看 TEST_ENGINEER 没有的权限
  const te_perms = new Set(logins['test_user1']?.user?.permissions || []);
  const ta_jwt_perms = new Set(ta_perms);
  
  // 测试 test_admin 能否做管理员操作
  const adminTestRes = await api('GET', '/api/users', logins['test_admin']?.token);
  console.log(`test_admin 访问 GET /api/users: ${adminTestRes.status} (因为中间件isAdmin查UserRole=ADMIN)`);
  
  // 问题：前端看到的权限列表和后端实际行为不一致
  if (!ta_perms.includes('*') && adminTestRes.status === 200) {
    console.log('  ❌ 发现问题！JWT中没有*但能访问管理员接口');
    console.log('  原因：中间件isAdmin()查UserRole表返回true，但登录时用的是User.role判断');
    issues++;
  }

  // ========== 问题3: TEST_ENGINEER 角色权限过大 ==========
  console.log('\n【问题3】TEST_ENGINEER 角色拥有61个权限，包含大量系统管理权限');
  const systemPerms = ta_perms.filter(p => p.startsWith('system:'));
  console.log(`TEST_ENGINEER 的系统管理权限: ${systemPerms.join(', ')}`);
  if (systemPerms.length > 5) {
    console.log('  ⚠️ 提醒：TEST_ENGINEER角色权限过大，拥有用户管理、角色管理、菜单管理等敏感权限');
  }

  // ========== 问题4: 前端权限检查依赖JWT中的permissions ==========
  console.log('\n【问题4】前端权限控制依赖JWT中的permissions列表');
  console.log('前端 HasPermission/PermissionButton 组件使用的是登录时返回的 permissions 数组');
  console.log('但后端 checkPermission 中间件会实时查数据库（isAdmin + getUserPerms）');
  console.log('如果管理员在后台修改了用户角色，前端看到的权限列表不会实时更新（直到重新登录）');
  
  // 验证：前端是否只用JWT permissions做权限判断
  // 如果一个用户被移除了某个权限但JWT还没过期，前端可能显示按钮但后端会403

  // ========== 问题5: viewer_test 权限验证 ==========
  console.log('\n【问题5】viewer_test (USER角色) 权限验证');
  const v_perms = logins['viewer_test']?.user?.permissions || [];
  console.log(`viewer_test 权限: ${v_perms.join(', ')}`);
  
  // USER角色有 crm:opportunity:list 和 crm:opportunity:edit
  const oppRes = await api('GET', '/api/opportunities', logins['viewer_test']?.token);
  console.log(`viewer_test 访问售前列表: ${oppRes.status}`);
  
  // 但没有 crm:opportunity:add
  // 查看它能否创建售前
  const oppCreateRes = await api('POST', '/api/opportunities', logins['viewer_test']?.token, { name: '测试售前' });
  console.log(`viewer_test 创建售前: ${oppCreateRes.status} ${oppCreateRes.body?.error || ''}`);

  // ========== 问题6: 缓存一致性 ==========
  console.log('\n【问题6】权限缓存一致性');
  console.log('isAdmin/getUserPerms 有60秒内存缓存');
  console.log('角色菜单变更后 clearPermissionCache() 会被调用');
  console.log('但在多实例部署时，内存缓存不会跨实例同步');

  // ========== 总结 ==========
  console.log('\n=============================================');
  console.log(`   测试完成，发现 ${issues} 个明确问题`);
  console.log('=============================================');
  
  if (issues > 0) {
    console.log('\n问题汇总：');
    console.log('1. operationLogs.ts 的 GET / 用硬编码 isAdmin() 检查，而非 checkPermission 中间件');
    console.log('   → 拥有 system:log:list 权限的非ADMIN角色用户无法查看操作日志');
    console.log('2. test_admin 的 User.role=USER 但 UserRole=ADMIN');
    console.log('   → 登录JWT权限列表和后端实际管理员行为不一致');
    console.log('   → 前端看到的权限按钮和后端实际放行不匹配');
  }
}

main().catch(console.error);
