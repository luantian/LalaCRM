const http = require('http')

const BASE = 'http://localhost:5000'

// 先获取各用户的token
async function login(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password })
    const req = http.request(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve(json.token || null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.write(data)
    req.end()
  })
}

async function apiGet(path, token) {
  return new Promise((resolve) => {
    const req = http.request(`${BASE}/api${path}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve({ status: res.statusCode, data: json })
        } catch { resolve({ status: res.statusCode, data: body }) }
      })
    })
    req.on('error', () => resolve({ status: 0, data: 'ERROR' }))
    req.end()
  })
}

async function main() {
  console.log('========================================')
  console.log('  LalaCRM 权限系统测试')
  console.log('========================================')

  // 登录获取token
  console.log('\n--- 登录获取Token ---')
  const users = {
    admin: await login('admin', 'admin123'),
    luantian: await login('luantian', 'test123'),
    sales: await login('sales_test', 'test123'),
    viewer: await login('viewer_test', 'test123'),
    team: await login('team_test_user', 'test123')
  }
  Object.entries(users).forEach(([name, token]) => {
    console.log(`  ${name}: ${token ? '✅ 登录成功' : '❌ 登录失败'}`)
  })

  // 测试矩阵
  const tests = [
    // 客户管理
    { name: '客户列表', path: '/organizations', perm: 'crm:organization:list' },
    // 售前管理
    { name: '售前列表', path: '/opportunities', perm: 'crm:opportunity:list' },
    // 报价管理
    { name: '报价列表', path: '/quotations', perm: 'crm:quotation:list' },
    // 项目管理
    { name: '项目列表', path: '/projects', perm: 'project:project:list' },
    // 合同管理
    { name: '合同列表', path: '/contracts', perm: 'project:contract:list' },
    // 采购管理
    { name: '采购列表', path: '/procurements', perm: 'project:procurement:list' },
    // 费用报销
    { name: '费用列表', path: '/expenses', perm: 'finance:expense:list' },
    // 发票管理
    { name: '发票列表', path: '/invoices', perm: 'finance:expense:list' },
    // 日报管理
    { name: '日报列表', path: '/daily-reports', perm: 'office:dailyreport:list' },
    // 出差管理
    { name: '出差列表', path: '/business-trips', perm: 'office:trip:list' },
    // 系统管理
    { name: '用户管理', path: '/users', perm: 'system:user:list' },
    { name: '角色管理', path: '/roles', perm: 'system:role:list' },
    { name: '菜单管理', path: '/menus', perm: 'system:menu:list' },
  ]

  // 测试用户角色说明
  console.log('\n--- 用户角色说明 ---')
  console.log('  admin(用户1): 管理员, roleId=1(管理员)')
  console.log('  luantian(用户3): roleId=2(测试工程师, dataScope=SELF)')
  console.log('  sales_test(用户5): roleId=6(普通用户, dataScope=ALL)')
  console.log('  viewer_test(用户6): roleId=6(普通用户, dataScope=ALL)')
  console.log('  team_test_user(用户23): roleId=39(团队成员权限)')

  // 逐个测试
  const userNames = ['admin', 'luantian', 'sales', 'viewer', 'team']
  console.log('\n--- 权限测试结果 ---')
  console.log('')
  
  // 打印表头
  const header = '模块'.padEnd(12) + userNames.map(n => n.padEnd(14)).join('')
  console.log(header)
  console.log('-'.repeat(header.length))

  for (const test of tests) {
    const results = []
    for (const userName of userNames) {
      const token = users[userName]
      if (!token) {
        results.push('❌未登录'.padEnd(14))
        continue
      }
      const res = await apiGet(test.path, token)
      let status = ''
      if (res.status === 200) {
        const total = res.data.total || res.data.length || (res.data.data ? res.data.data.length : '?')
        status = `✅${res.status}(${total}条)`
      } else if (res.status === 403) {
        status = `🚫403无权限`
      } else if (res.status === 401) {
        status = `🔒401未认证`
      } else {
        status = `⚠️${res.status}`
      }
      results.push(status.padEnd(14))
    }
    console.log(test.name.padEnd(12) + results.join(''))
  }

  console.log('\n--- 数据量测试（管理员可见数据） ---')
  const adminToken = users.admin
  if (adminToken) {
    const modules = [
      { name: '客户', path: '/organizations' },
      { name: '售前', path: '/opportunities' },
      { name: '报价', path: '/quotations' },
      { name: '项目', path: '/projects' },
      { name: '合同', path: '/contracts' },
      { name: '采购', path: '/procurements' },
      { name: '费用', path: '/expenses' },
      { name: '发票', path: '/invoices' },
      { name: '日报', path: '/daily-reports' },
      { name: '出差', path: '/business-trips' },
    ]
    for (const m of modules) {
      const res = await apiGet(m.path, adminToken)
      if (res.status === 200) {
        const total = res.data.total || res.data.length || 0
        console.log(`  ${m.name}: ${total} 条`)
      }
    }
  }

  console.log('\n========================================')
  console.log('  测试完成!')
  console.log('========================================')
}

main().catch(console.error)
