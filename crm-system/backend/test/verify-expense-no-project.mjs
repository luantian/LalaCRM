/** 验证:不关联项目也能创建报销(前端放开必填后的后端行为确认) */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000'

const r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'testuser', password: 'Test123456!' })
})
const t = (await r.json()).token

const today = new Date().toISOString().slice(0, 10)
const c = await fetch(`${BASE}/api/expenses`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  body: JSON.stringify({
    title: `无项目报销验证-${Date.now()}`, totalAmount: 50,
    items: [{ category: '办公用品', amount: 50, expenseDate: today, description: '验证可不关联项目' }]
  })
})
const j = await c.json()
if (c.status === 201) {
  console.log(`不带 projectId 创建报销: 201, projectId=${j.projectId === null ? 'null ✅ 后端接受无项目报销' : j.projectId}`)
  const d = await fetch(`${BASE}/api/expenses/${j.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
  console.log('清理测试报销:', d.status)
} else {
  console.log('创建失败:', c.status, JSON.stringify(j).slice(0, 150))
  process.exit(1)
}
