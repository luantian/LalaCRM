/**
 * 针对性验证客户管理权限修复(一次性脚本,跑完即弃)
 *   Fix 2  管理员始终可见明文联系方式
 *   Fix 1B 无查看权用户提交"与原值掩码一致"的字段被剔除;新真实值可正常录入
 *   Fix 3  GET /:id 与 /:id/contacts 挂 organization:list;/simple 与 /contacts/:id 保持开放
 */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000'

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function login(username) {
  const r = await call('POST', '/api/auth/login', { body: { username, password: 'Test123456!' } })
  if (r.status !== 200) throw new Error(`login ${username} 失败: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.token
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  (${detail})` : ''}`)
}

// ── 登录 ──
const adminTok = await login('testadmin')
const testerTok = await login('testuser')     // TESTER: 有 organization:list/add/edit, 无联系方式白名单
const approverTok = await login('testapprover') // APPROVER: 无客户管理权限

// ── Fix 2: 管理员看明文 ──
console.log('── Fix 2 管理员明文可见 ──')
const created = await call('POST', '/api/organizations', {
  token: adminTok, body: { name: `验证修复客户-${Date.now()}`, type: 'COMPANY', phone: '13812345678', email: 'zhangsan@example.com' }
})
const orgId = created.json?.id
check('admin 创建带联系方式的客户', created.status === 201, `id=${orgId}`)
const adminView = await call('GET', `/api/organizations/${orgId}`, { token: adminTok })
check('GET /:id admin 200(有 list 权限)', adminView.status === 200)
check('admin 看到明文 phone', adminView.json?.phone === '13812345678', adminView.json?.phone)
check('admin 看到明文 email', adminView.json?.email === 'zhangsan@example.com', adminView.json?.email)

// ── Fix 2 对照: TESTER 仍看脱敏 ──
const testerView = await call('GET', `/api/organizations/${orgId}`, { token: testerTok })
check('TESTER(有 list 权限) GET /:id 200', testerView.status === 200)
check('TESTER phone 脱敏', testerView.json?.phone === '***5678', testerView.json?.phone)
check('TESTER email 脱敏', testerView.json?.email === 'z***@example.com', testerView.json?.email)

// ── Fix 1B: 掩码值被剔除 ──
console.log('── Fix 1B 脱敏值回写防护 ──')
const maskedSave = await call('PUT', `/api/organizations/${orgId}`, {
  token: testerTok,
  body: { phone: '***5678', email: 'z***@example.com', address: 'TESTER 编辑的地址' }
})
check('TESTER 提交掩码值 PUT 200', maskedSave.status === 200)
const afterMasked = await call('GET', `/api/organizations/${orgId}`, { token: adminTok })
check('phone 未被掩码污染', afterMasked.json?.phone === '13812345678', afterMasked.json?.phone)
check('email 未被掩码污染', afterMasked.json?.email === 'zhangsan@example.com', afterMasked.json?.email)
check('非联系方式字段正常更新', afterMasked.json?.address === 'TESTER 编辑的地址', afterMasked.json?.address)

const realSave = await call('PUT', `/api/organizations/${orgId}`, {
  token: testerTok, body: { phone: '13900000000' }
})
const afterReal = await call('GET', `/api/organizations/${orgId}`, { token: adminTok })
check('新录入真实 phone 正常保存', realSave.status === 200 && afterReal.json?.phone === '13900000000', afterReal.json?.phone)

// ── Fix 1B 联系人路径回归(admin 正常编辑) ──
const contactAdd = await call('POST', `/api/organizations/${orgId}/contacts`, {
  token: adminTok, body: { name: '验证联系人', phone: '13811112222', email: 'contact@example.com' }
})
const contactId = contactAdd.json?.id
check('admin 添加联系人 201', contactAdd.status === 201)
const contactUpd = await call('PUT', `/api/organizations/${orgId}/contacts/${contactId}`, {
  token: adminTok, body: { name: '验证联系人-改', phone: '13833334444' }
})
check('admin 编辑联系人 200 且明文返回', contactUpd.status === 200 && contactUpd.json?.phone === '13833334444', contactUpd.json?.phone)

// ── Fix 3: 端点权限 ──
console.log('── Fix 3 端点权限收紧/保持 ──')
const noPermDetail = await call('GET', `/api/organizations/${orgId}`, { token: approverTok })
check('无 list 权限 GET /:id → 403', noPermDetail.status === 403, `实际 ${noPermDetail.status}`)
const noPermContacts = await call('GET', `/api/organizations/${orgId}/contacts`, { token: approverTok })
check('无 list 权限 GET /:id/contacts → 403', noPermContacts.status === 403, `实际 ${noPermContacts.status}`)
const simpleOpen = await call('GET', '/api/organizations/simple', { token: approverTok })
check('无权限 GET /simple 仍 200(下拉专用,保持开放)', simpleOpen.status === 200)
const contactSimpleOpen = await call('GET', '/api/organizations/contacts/simple', { token: approverTok })
check('无权限 GET /contacts/simple 仍 200', contactSimpleOpen.status === 200)
const contactDetailOpen = await call('GET', `/api/organizations/contacts/${contactId}`, { token: approverTok })
check('无权限 GET /contacts/:id 仍 200(选择器专用)', contactDetailOpen.status === 200)
check('GET /contacts/:id 联系方式仍脱敏', contactDetailOpen.json?.phone === '***2222' || contactDetailOpen.json?.phone === '***4444', contactDetailOpen.json?.phone)

// ── 清理 ──
const del = await call('DELETE', `/api/organizations/${orgId}`, { token: adminTok })
check('清理: 删除验证客户', del.status === 200)

const failed = results.filter(r => !r.ok)
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
