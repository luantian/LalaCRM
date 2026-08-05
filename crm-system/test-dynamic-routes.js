/**
 * 动态路由权限过滤测试脚本
 * 测试前端动态路由过滤和后端API权限控制是否一致
 */

const http = require('http');

function login(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function testApiAccess(token, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, path });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('动态路由权限过滤测试');
  console.log('========================================\n');

  const testUsers = [
    { username: 'admin', password: 'admin123', role: '管理员' },
    { username: 'director', password: '123456', role: '项目总监' },
    { username: 'manager1', password: '123456', role: '项目经理' },
    { username: 'user1', password: '123456', role: '普通用户' }
  ];

  // 路由与权限对应关系
  const routePermissionTests = [
    { path: '/organizations', perm: 'crm:organization:list', name: '客户管理' },
    { path: '/opportunities', perm: 'crm:opportunity:list', name: '售前管理' },
    { path: '/projects', perm: 'project:project:list', name: '项目管理' },
    { path: '/expenses', perm: 'finance:expense:list', name: '费用报销' },
    { path: '/daily-reports', perm: 'office:dailyreport:list', name: '日报管理' },
    { path: '/users', perm: 'system:user:list', name: '用户管理' }
  ];

  for (const user of testUsers) {
    console.log(`\n【${user.role} - ${user.username}】`);
    console.log('─'.repeat(50));

    try {
      const loginResult = await login(user.username, user.password);
      
      if (!loginResult.token) {
        console.log('✗ 登录失败');
        continue;
      }

      const perms = loginResult.user?.permissions || loginResult.permissions || [];
      const menus = loginResult.user?.menus || loginResult.menus || [];
      
      console.log(`✓ 登录成功`);
      console.log(`  权限数量: ${perms.length}`);
      console.log(`  菜单数量: ${menus.length}`);

      // 提取菜单路径
      const extractPaths = (menuList) => {
        const paths = [];
        const traverse = (items) => {
          for (const item of items) {
            if (item.path && item.menuType !== 'BUTTON') {
              paths.push(item.path);
            }
            if (item.children && item.children.length > 0) {
              traverse(item.children);
            }
          }
        };
        traverse(menuList);
        return paths;
      };

      const menuPaths = extractPaths(menus);
      console.log(`  可见路由: ${menuPaths.join(', ')}`);

      // 测试API访问权限
      console.log('\n  API访问测试:');
      for (const test of routePermissionTests) {
        const hasPermission = perms.includes('*') || perms.includes(test.perm);
        const canAccessMenu = menuPaths.includes(test.path);
        
        try {
          const apiResult = await testApiAccess(loginResult.token, test.path);
          const canAccessApi = apiResult.status === 200;

          const status = hasPermission && canAccessMenu && canAccessApi ? '✓' : '✗';
          console.log(`    ${status} ${test.name} (${test.path})`);
          console.log(`       权限: ${hasPermission ? '有' : '无'}, 菜单: ${canAccessMenu ? '可见' : '不可见'}, API: ${canAccessApi ? '可访问' : '拒绝'}`);
          
          // 检查不一致
          if (hasPermission !== canAccessMenu || hasPermission !== canAccessApi) {
            console.log(`       ⚠️ 警告: 权限、菜单、API访问不一致!`);
          }
        } catch (err) {
          console.log(`    ✗ ${test.name} - 测试失败: ${err.message}`);
        }
      }

    } catch (err) {
      console.log(`✗ 测试失败: ${err.message}`);
    }
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

runTests().catch(console.error);
