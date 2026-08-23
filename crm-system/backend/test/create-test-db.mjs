/**
 * 测试辅助脚本：创建独立的测试数据库 crm_test
 *
 * 用途：为 API 冒烟测试搭建完全隔离的数据库环境，
 *       绝不影响开发库 crm_db。
 *
 * 运行方式（在 backend 目录下）:
 *   node test/create-test-db.mjs
 */
import pg from 'pg'

const TEST_DB = 'crm_test'
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres'

const client = new pg.Client({ connectionString: ADMIN_URL })

async function main() {
  await client.connect()

  // 若存在旧测试库则先删除（幂等）
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`)
  console.log(`✓ 已删除旧数据库（如存在）: ${TEST_DB}`)

  await client.query(`CREATE DATABASE ${TEST_DB}`)
  console.log(`✓ 已创建测试数据库: ${TEST_DB}`)

  await client.end()
  console.log('测试数据库准备完成')
}

main().catch((err) => {
  console.error('创建测试数据库失败:', err.message)
  process.exit(1)
})
