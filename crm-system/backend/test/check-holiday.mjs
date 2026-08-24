import { Client } from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const c = new Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

const r = await c.query(`SELECT date, "isWorkday", name FROM "Holiday" WHERE date >= '2026-08-01' AND date <= '2026-09-30' ORDER BY date`)
console.log(`Holiday 表 8-9 月记录: ${r.rows.length} 条`)
for (const x of r.rows) {
  console.log(' ', new Date(x.date).toISOString().slice(0, 10), x.isWorkday ? '调休上班' : '放假', x.name || '')
}

// 模拟 /today 与打卡判定的关键计算(裸 dayjs vs 指定上海时区)
const dayjs = (await import('dayjs')).default
const utc = (await import('dayjs/plugin/utc.js')).default
const tz = (await import('dayjs/plugin/timezone.js')).default
dayjs.extend(utc); dayjs.extend(tz)
console.log('\n── 服务器视角的"今天" ──')
console.log('本机裸 dayjs()        :', dayjs().format('YYYY-MM-DD ddd HH:mm'), `(${['日','一','二','三','四','五','六'][dayjs().day()]})`)
console.log('上海时区 dayjs().tz   :', dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD ddd HH:mm'))
console.log('UTC dayjs().utc       :', dayjs().utc().format('YYYY-MM-DD ddd HH:mm'))
await c.end()
