/** 冒烟/测试数据清理:单事务硬删除,失败整体回滚。前置:已做 pg_dump 全量备份 */
import { Client } from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const STRONG = ['冒烟%', '范围测试-%', 'E2E%', 'TESTER客户%', '验证修复%', '无权限创建%', '无项目报销验证%']
const WEAK = ['测试%']
const TEST_USERS = ['testadmin', 'testuser', 'testapprover']

const c = new Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

const q = async (sql, params = []) => (await c.query(sql, params)).rows
const like = (arr) => arr.map(p => `'${p}'`).join(', ')

// 各表可用的名称列/归属列(动态探测)
const MAINS = ['Task', 'DailyReport', 'Expense', 'BusinessTrip', 'Quotation', 'Contract', 'Procurement', 'Opportunity', 'Project', 'OrgContact', 'Organization']
const colsOf = {}
for (const t of ['Organization', 'Project', 'Opportunity', 'Quotation', 'Contract', 'Procurement', 'Expense', 'BusinessTrip', 'Task', 'DailyReport']) {
  colsOf[t] = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='${t}'`)).map(r => r.column_name)
}
const nameCol = (t) => ['name', 'title', 'contractNo'].find(x => colsOf[t]?.includes(x)) || null
const ownerCol = (t) => ['ownerId', 'userId', 'assignerId', 'creatorId'].find(x => colsOf[t]?.includes(x)) || null

console.log('── 名称/归属列探测 ──')
for (const t of Object.keys(colsOf)) console.log(`  ${t}: name=${nameCol(t)} owner=${ownerCol(t)}`)

const deleted = {}
try {
  await c.query('BEGIN')

  await c.query(`CREATE TEMP TABLE tmp_users AS SELECT id FROM "User" WHERE username IN (${TEST_USERS.map(u => `'${u}'`).join(', ')})`)
  const nUsers = (await q(`SELECT COUNT(*)::int n FROM tmp_users`))[0].n
  if (nUsers !== 3) throw new Error(`测试账号应为 3 个,实际 ${nUsers} —— 中止(防止误删)`)

  // 根集:强前缀 OR 测试账号名下,再沿外键扩张(关系列存在才拼,避免假设列名)
  const has = (t, col) => colsOf[t]?.includes(col) ? ` OR "${col}" IN (SELECT id FROM ${col === 'organizationId' ? 'tmp_orgs' : col === 'projectId' ? 'tmp_projects' : col === 'opportunityId' ? 'tmp_opps' : col === 'tripId' ? 'tmp_trips' : '?'})` : ''
  const setSQL = {
    tmp_orgs: `"Organization" WHERE "${nameCol('Organization')}" LIKE ANY(ARRAY[${like(STRONG)}])`,
    tmp_projects: `"Project" WHERE "${nameCol('Project')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Project', 'organizationId')}`,
    tmp_opps: `"Opportunity" WHERE "${nameCol('Opportunity')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Opportunity', 'organizationId')}${has('Opportunity', 'projectId')}`,
    tmp_quot: `"Quotation" WHERE "${nameCol('Quotation')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Quotation', 'organizationId')}${has('Quotation', 'projectId')}${has('Quotation', 'opportunityId')}`,
    tmp_contracts: `"Contract" WHERE "${nameCol('Contract')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Contract', 'organizationId')}${has('Contract', 'projectId')}`,
    tmp_proc: `"Procurement" WHERE "${nameCol('Procurement')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Procurement', 'projectId')}`,
    tmp_trips: `"BusinessTrip" WHERE "${nameCol('BusinessTrip')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('BusinessTrip', 'organizationId')}${has('BusinessTrip', 'projectId')}`,
    tmp_expenses: `"Expense" WHERE "${nameCol('Expense')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Expense', 'organizationId')}${has('Expense', 'projectId')}${has('Expense', 'tripId')}`,
    tmp_tasks: `"Task" WHERE "${nameCol('Task')}" LIKE ANY(ARRAY[${like(STRONG)}])${has('Task', 'projectId')}${has('Task', 'organizationId')}`,
    tmp_reports: `"DailyReport" WHERE "userId" IN (SELECT id FROM tmp_users)`,
  }
  // 测试账号名下的数据也算(owner 列存在的表)
  for (const [tmp, table] of [['tmp_orgs', 'Organization'], ['tmp_projects', 'Project'], ['tmp_opps', 'Opportunity'], ['tmp_quot', 'Quotation'], ['tmp_expenses', 'Expense']]) {
    const oc = ownerCol(table)
    if (oc) setSQL[tmp] += ` OR "${oc}" IN (SELECT id FROM tmp_users)`
  }
  const ocT = ownerCol('Task'); if (ocT) setSQL.tmp_tasks += ` OR "${ocT}" IN (SELECT id FROM tmp_users)`
  const ocB = ownerCol('BusinessTrip'); if (ocB) setSQL.tmp_trips += ` OR "${ocB}" IN (SELECT id FROM tmp_users)`
  // 弱前缀(测试*)仅测试账号名下才纳入
  for (const [tmp, table] of [['tmp_expenses', 'Expense'], ['tmp_trips', 'BusinessTrip'], ['tmp_tasks', 'Task']]) {
    const nc = nameCol(table), oc = ownerCol(table)
    if (nc && oc) setSQL[tmp] += ` OR ("${nc}" LIKE ANY(ARRAY[${like(WEAK)}]) AND "${oc}" IN (SELECT id FROM tmp_users))`
  }

  console.log('\n── 圈定的测试数据量 ──')
  for (const tmp of Object.keys(setSQL)) {
    await c.query(`CREATE TEMP TABLE ${tmp} AS SELECT id FROM ${setSQL[tmp]}`)
    const label = { tmp_orgs: '客户', tmp_projects: '项目', tmp_opps: '商机', tmp_quot: '报价单', tmp_contracts: '合同', tmp_proc: '采购', tmp_trips: '出差', tmp_expenses: '报销', tmp_tasks: '任务', tmp_reports: '日报' }[tmp]
    console.log(`  ${label}: ${(await q(`SELECT COUNT(*)::int n FROM ${tmp}`))[0].n}`)
  }

  // 弱前缀但属于真实账号的行:跳过并报告
  for (const table of ['Expense', 'BusinessTrip', 'Task', 'Project', 'Organization']) {
    const nc = nameCol(table), oc = ownerCol(table)
    if (!nc || !oc) continue
    const rows = await q(`SELECT t."${nc}" n, u.username FROM "${table}" t JOIN "User" u ON u.id=t."${oc}" WHERE t."${nc}" LIKE ANY(ARRAY[${like(WEAK)}]) AND u.username NOT IN (${TEST_USERS.map(u => `'${u}'`).join(', ')}) LIMIT 5`)
    if (rows.length) console.log(`  ⚠️ 跳过(真实账号的测试*命名): ${table}: ${rows.map(r => `${r.n}(${r.username})`).join(', ')}`)
  }

  // 子表(FK 引用主表集的非主表)先删
  const tmpOf = { Organization: 'tmp_orgs', OrgContact: 'tmp_orgs', Project: 'tmp_projects', Opportunity: 'tmp_opps', Quotation: 'tmp_quot', Contract: 'tmp_contracts', Procurement: 'tmp_proc', Expense: 'tmp_expenses', BusinessTrip: 'tmp_trips', Task: 'tmp_tasks', DailyReport: 'tmp_reports' }
  const norm = (s) => s.replace(/^public\./, '').replace(/"/g, '')
  const fksRaw = await q(`
    SELECT DISTINCT conrelid::regclass::text AS child_raw, a.attname AS fkcol, confrelid::regclass::text AS parent_raw
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE con.contype = 'f'`)
  const fks = fksRaw
    .map(r => ({ child: norm(r.child_raw), fkcol: r.fkcol, parent: norm(r.parent_raw) }))
    .filter(r => MAINS.includes(r.parent) && !MAINS.includes(r.child))
  console.log('\n── 删除子表数据 ──')
  for (const { child, fkcol, parent } of fks) {
    if (MAINS.includes(child) || !tmpOf[parent]) continue
    const r = await c.query(`DELETE FROM "${child}" WHERE "${fkcol}" IN (SELECT id FROM ${tmpOf[parent]})`)
    if (r.rowCount > 0) { deleted[child] = (deleted[child] || 0) + r.rowCount; console.log(`  ${child}.${fkcol}: -${r.rowCount}`) }
  }

  // 主表按依赖序删
  console.log('\n── 删除主表数据 ──')
  for (const t of MAINS) {
    const tmp = tmpOf[t]
    // OrgContact 走外键删(组织的联系人),其余主表按自身 id 删
    const r = t === 'OrgContact'
      ? await c.query(`DELETE FROM "OrgContact" WHERE "organizationId" IN (SELECT id FROM ${tmp})`)
      : await c.query(`DELETE FROM "${t}" WHERE id IN (SELECT id FROM ${tmp})`)
    deleted[t] = r.rowCount
    console.log(`  ${t}: -${r.rowCount}`)
  }

  await c.query('COMMIT')
  console.log('\n✅ 事务已提交')
} catch (e) {
  await c.query('ROLLBACK')
  console.error('❌ 已回滚,未删任何数据:', e.message)
  process.exit(1)
}
await c.end()
