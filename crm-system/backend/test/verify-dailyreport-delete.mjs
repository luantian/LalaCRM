/** 验证非管理员(有 dailyreport:add)的日报删除链路 */
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

const login = await call('POST', '/api/auth/login', { body: { username: 'testuser', password: 'Test123456!' } })
if (login.status !== 200) { console.error('login failed:', login.status, login.json); process.exit(1) }
const tok = login.json.token
console.log('testuser permissions 含 add:', login.json.user.permissions.includes('office:dailyreport:add'),
  '| 含 *:', login.json.user.permissions.includes('*'),
  '| 含(不存在的)delete:', login.json.user.permissions.includes('office:dailyreport:delete'))

const today = new Date().toISOString().slice(0, 10)
const created = await call('POST', '/api/daily-reports', {
  token: tok,
  body: { reportDate: today, type: 'WORK', entries: [], todos: [], plan: '', hours: 1 }
})
console.log('创建日报:', created.status, created.status === 201 ? `id=${created.json?.id}` : JSON.stringify(created.json).slice(0, 150))
if (created.status !== 201) process.exit(1)

const del = await call('DELETE', `/api/daily-reports/${created.json.id}`, { token: tok })
console.log('testuser 删除自己的日报:', del.status, del.status === 200 ? '✅ 后端链路通' : JSON.stringify(del.json).slice(0, 150))

const delAgain = await call('DELETE', `/api/daily-reports/${created.json.id}`, { token: tok })
console.log('重复删除(应 404/400):', delAgain.status)
process.exit(del.status === 200 ? 0 : 1)
