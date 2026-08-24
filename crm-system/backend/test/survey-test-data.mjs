/** 摸底:按已知测试命名前缀统计各业务表的测试数据量 */
import { Client } from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const PREFIXES = ['冒烟', '范围测试-', 'E2E', 'TESTER客户', '验证修复', '无权限创建', '无项目报销验证', '测试']

// 表 -> 名称字段(从 schema 摸清的)
const TABLES = [
  ['Organization', 'name'],
  ['OrgContact', 'name'],
  ['Project', 'name'],
  ['Opportunity', 'name'],
  ['Quotation', 'name'],
  ['Contract', 'name'],
  ['Procurement', 'name'],
  ['Expense', 'title'],
  ['BusinessTrip', 'title'],
  ['Task', 'title'],
  ['DailyReport', 'reportDate'],
]

const c = new Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

console.log('═══ 各表总数 vs 匹配测试前缀的数量 ═══\n')
const summary = []
for (const [table, col] of TABLES) {
  try {
    const total = (await c.query(`SELECT COUNT(*)::int n FROM "${table}" WHERE "deletedAt" IS NULL`)).rows[0].n
    const like = PREFIXES.map(p => `"${col}" LIKE '${p}%'`).join(' OR ')
    const hit = (await c.query(`SELECT COUNT(*)::int n FROM "${table}" WHERE "deletedAt" IS NULL AND (${like})`)).rows[0].n
    const samples = (await c.query(`SELECT "${col}" v FROM "${table}" WHERE "deletedAt" IS NULL AND (${like}) LIMIT 3`)).rows.map(r => r.v)
    summary.push([table, total, hit, samples.join(' | ')])
  } catch (e) {
    summary.push([table, '-', `ERR:${e.message.slice(0, 40)}`, ''])
  }
}
console.log('表                | 活跃总数 | 测试数据 | 样例')
for (const [t, total, hit, s] of summary) {
  console.log(`${t.padEnd(17)}| ${String(total).padEnd(8)} | ${String(hit).padEnd(8)} | ${s}`)
}

// 顺带看软删数据量(历史测试残留)
console.log('\n═══ 已软删(不可见但占库)的行数 ═══')
for (const [table] of TABLES.slice(0, 6)) {
  const n = (await c.query(`SELECT COUNT(*)::int n FROM "${table}" WHERE "deletedAt" IS NOT NULL`)).rows[0].n
  if (n > 0) console.log(`  ${table}: ${n}`)
}

await c.end()
