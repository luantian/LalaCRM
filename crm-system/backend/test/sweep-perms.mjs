/** 扫描:前端引用的权限点 vs 数据库/种子实际存在的权限点 */
import { Client } from 'pg'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'
dotenv.config()

// 1. 收集前端所有权限串
const FE_DIR = join(process.cwd(), '..', 'frontend', 'src')
const fePerms = new Map() // perm -> [file:line]
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!/\.(tsx?|ts)$/.test(name)) continue
    const lines = readFileSync(p, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/['"`](?:crm|system|office|finance|project|dashboard):[a-zA-Z:]+['"`]/g)) {
        const perm = m[0].slice(1, -1)
        if (!fePerms.has(perm)) fePerms.set(perm, [])
        fePerms.get(perm).push(`${name}:${i + 1}`)
      }
    })
  }
}
walk(FE_DIR)

// 2. 数据库现有权限点
const c = new Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const dbPerms = new Set((await c.query(`SELECT perm FROM "MenuItem" WHERE perm IS NOT NULL`)).rows.map(r => r.perm))
await c.end()

// 3. seed.js 里的权限点
const seed = readFileSync(join(process.cwd(), 'prisma', 'seed.js'), 'utf8')
const seedPerms = new Set([...seed.matchAll(/perm:\s*'([^']+)'/g)].map(m => m[1]))

console.log(`前端引用 ${fePerms.size} 个权限点,数据库有 ${dbPerms.size} 个,seed 有 ${seedPerms.size} 个\n`)
const missing = [...fePerms.keys()].filter(p => !dbPerms.has(p))
if (missing.length === 0) {
  console.log('✅ 前端引用的权限点全部存在于数据库')
} else {
  console.log(`❌ 前端引用但数据库不存在的权限点(= 死按钮/死分支,${missing.length} 个):`)
  for (const p of missing) {
    const inSeed = seedPerms.has(p)
    console.log(`  ${p}  <- ${fePerms.get(p).join(', ')}  ${inSeed ? '(seed有但库里没有——需重跑seed)' : '(seed也没有——从未定义过)'}`)
  }
}
