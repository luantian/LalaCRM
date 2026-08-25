import prisma from '../lib/prisma'
import { Router, Request, Response } from 'express'
import { authenticateToken, checkPermission, AuthRequest } from '../middleware/auth'
import logger from '../utils/logger'
import fs from 'fs'
import path from 'path'
import { Client, QueryResult } from 'pg'
import { Readable } from 'stream'

const router = Router()

// 页面级权限：拥有"数据库备份"页面（system:backup:list）即可查看；
// 写操作在各自端点用按钮权限（create/download/delete/restore/config）校验。
// 注意权限标识必须与菜单库一致——此前这里写的是不存在的 system:backup:backup，
// 导致非管理员角色无论怎么配菜单都 403。
router.use(authenticateToken)
router.use(checkPermission('system:backup:list'))

// 备份目录（放在 src 下，方便 Docker volume 挂载）
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../../src/backups'))

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

// 解析数据库连接信息
const getDbConfig = () => {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error('DATABASE_URL 未配置')
  }
  return { connectionString: dbUrl }
}
// 生成备份文件名
const generateBackupFileName = (): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  return `backup_${timestamp}.sql`
}

// 获取列的真实类型（处理 USER-DEFINED、数组、字符长度等）
const getColumnDataType = async (
  client: Client,
  schema: string,
  tableName: string,
  columnName: string
): Promise<string> => {
  const result = await client.query(`
    SELECT 
      c.data_type,
      c.udt_name,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_identity,
      c.identity_generation,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as full_type
    FROM information_schema.columns c
    LEFT JOIN pg_catalog.pg_attribute a 
      ON a.attrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
      AND a.attname = c.column_name
    WHERE c.table_schema = $1 AND c.table_name = $2 AND c.column_name = $3
  `, [schema, tableName, columnName])
  
  if (result.rows.length === 0) return 'text'
  
  const col = result.rows[0]
  
  // 处理数组类型（format_type 已经返回带 [] 的名称，无需再追加）
  if (col.data_type === 'ARRAY') {
    return col.full_type
  }
  
  // 处理枚举类型
  if (col.data_type === 'USER-DEFINED') {
    return `"${col.udt_name}"`
  }
  
  // 处理字符类型（varchar, char）
  if (col.data_type === 'character varying' && col.character_maximum_length) {
    return `character varying(${col.character_maximum_length})`
  }
  if (col.data_type === 'character' && col.character_maximum_length) {
    return `character(${col.character_maximum_length})`
  }
  
  // 处理 numeric 类型
  if (col.data_type === 'numeric' && col.numeric_precision) {
    if (col.numeric_scale && col.numeric_scale > 0) {
      return `numeric(${col.numeric_precision}, ${col.numeric_scale})`
    }
    return `numeric(${col.numeric_precision})`
  }
  
  // 处理 identity 列
  if (col.is_identity === 'YES') {
    return `${col.full_type} GENERATED ${col.identity_generation} AS IDENTITY`
  }
  
  return col.data_type
}

// 导出单个表的 SQL（分离 DROP 和 CREATE）
const exportTableSQL = async (
  client: Client,
  schema: string,
  tableName: string
): Promise<{ createSql: string; insertSql: string; foreignKeys: string[]; indexes: string[] }> => {
  const fullTableName = `"${schema}"."${tableName}"`
  
  // 获取表结构
  const columnsResult = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schema, tableName])
  
  let createSql = `-- Table: ${fullTableName}\n`
  createSql += `CREATE TABLE ${fullTableName} (\n`
  
  const columns: string[] = []
  for (const col of columnsResult.rows) {
    const dataType = await getColumnDataType(client, schema, tableName, col.column_name)
    let colDef = `  "${col.column_name}" ${dataType}`
    if (col.is_nullable === 'NO') colDef += ' NOT NULL'
    if (col.column_default) colDef += ` DEFAULT ${col.column_default}`
    columns.push(colDef)
  }
  
  // 获取主键
  const pkResult = await client.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
  `, [schema, tableName])
  
  if (pkResult.rows.length > 0) {
    const pkCols = pkResult.rows.map((r: any) => `"${r.column_name}"`).join(', ')
    columns.push(`  PRIMARY KEY (${pkCols})`)
  }
  
  // 获取 CHECK 约束
  const checkResult = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
    AND contype = 'c'
  `, [schema, tableName])
  
  for (const row of checkResult.rows) {
    columns.push(`  CONSTRAINT "${row.conname}" ${row.definition}`)
  }
  
  // 获取 UNIQUE 约束
  const uniqueResult = await client.query(`
    SELECT 
      tc.constraint_name,
      string_agg('"' || kcu.column_name || '"', ', ' ORDER BY kcu.ordinal_position) as unique_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = $1 
      AND tc.table_name = $2 
      AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
  `, [schema, tableName])
  
  for (const row of uniqueResult.rows) {
    columns.push(`  CONSTRAINT "${row.constraint_name}" UNIQUE (${row.unique_cols})`)
  }
  
  // 获取外键约束（不放入 CREATE TABLE，后面单独添加）
  const foreignKeys: string[] = []
  const fkResult = await client.query(`
    SELECT 
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema as foreign_table_schema,
      ccu.table_name as foreign_table_name,
      ccu.column_name as foreign_column_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = $1 
      AND tc.table_name = $2 
      AND tc.constraint_type = 'FOREIGN KEY'
  `, [schema, tableName])
  
  for (const row of fkResult.rows) {
    const refTable = `"${row.foreign_table_schema}"."${row.foreign_table_name}"`
    let fkSql = `ALTER TABLE ${fullTableName} ADD CONSTRAINT "${row.constraint_name}" FOREIGN KEY ("${row.column_name}") REFERENCES ${refTable}("${row.foreign_column_name}")`
    if (row.update_rule && row.update_rule !== 'NO ACTION') {
      fkSql += ` ON UPDATE ${row.update_rule}`
    }
    if (row.delete_rule && row.delete_rule !== 'NO ACTION') {
      fkSql += ` ON DELETE ${row.delete_rule}`
    }
    fkSql += ';'
    foreignKeys.push(fkSql)
  }

  // 获取索引（Prisma 的 @@unique/@index 生成的是独立索引而非表约束，需单独导出；
  // pkey 索引由主键约束自动创建，跳过；IF NOT EXISTS 保证幂等）
  const indexResult = await client.query(`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = $1 AND tablename = $2
  `, [schema, tableName])

  const indexes: string[] = indexResult.rows
    .map((r: any) => String(r.indexdef))
    .filter((def: string) => !def.includes('_pkey'))
    .map((def: string) => def.replace(/^CREATE (UNIQUE )?INDEX/, 'CREATE $1INDEX IF NOT EXISTS') + ';')

  createSql += columns.join(',\n')
  createSql += '\n);\n\n'
  
  // INSERT 语句
  let insertSql = ''
  const dataResult = await client.query(`SELECT * FROM ${fullTableName}`)
  if (dataResult.rows.length > 0) {
    for (const row of dataResult.rows) {
      const values = Object.values(row).map(v => {
        if (v === null) return 'NULL'
        if (typeof v === 'number') return v.toString()
        if (typeof v === 'boolean') return v ? 'true' : 'false'
        if (v instanceof Date) return `'${v.toISOString()}'`
        return `'${String(v).replace(/'/g, "''")}'`
      })
      insertSql += `INSERT INTO ${fullTableName} (${Object.keys(row).map(k => `"${k}"`).join(', ')}) VALUES (${values.join(', ')});\n`
    }
    insertSql += '\n'
  }
  
  return { createSql, insertSql, foreignKeys, indexes }
}

// 导出数据库
const exportDatabase = async (): Promise<{ fileName: string; filePath: string; fileSize: number }> => {
  const client = new Client(getDbConfig())
  await client.connect()
  
  const fileName = generateBackupFileName()
  const filePath = path.join(BACKUP_DIR, fileName)
  
  let sql = ''
  sql += `-- Database backup: ${new Date().toISOString()}\n`
  sql += `-- Generated by CRM Backup System\n\n`
  
  // ========== 1. 收集所有对象 ==========
  
  // 收集所有表
  const tablesResult = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `)
  
  // 收集所有枚举类型
  // 注意：pg 驱动对枚举标签的 array_agg 返回原始字符串 "{A,B}" 而非数组，
  // 因此改用 string_agg + quote_literal 在数据库端直接拼好带引号的值列表
  const typesResult = await client.query(`
    SELECT t.typname AS type_name,
           string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS enum_labels
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `)
  
  // 收集所有序列（排除 SERIAL 列自动创建的序列，这些序列由 CREATE TABLE 中的 SERIAL 自动重建）
  const sequencesResult = await client.query(`
    SELECT 
      s.sequence_name,
      s.data_type,
      s.start_value,
      s.minimum_value,
      s.maximum_value,
      s.increment,
      ps.seqcycle as is_cycle
    FROM information_schema.sequences s
    JOIN pg_sequence ps ON ps.seqrelid = (quote_ident(s.sequence_schema) || '.' || quote_ident(s.sequence_name))::regclass
    WHERE s.sequence_schema = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      JOIN pg_class c ON c.oid = d.objid
      WHERE c.relkind = 'S'
      AND c.oid = (quote_ident(s.sequence_schema) || '.' || quote_ident(s.sequence_name))::regclass
      AND d.classid = 'pg_class'::regclass
      AND d.refclassid = 'pg_class'::regclass
      AND d.deptype = 'a'
    )
    ORDER BY s.sequence_name
  `)
  
  // ========== 2. 导出 DROP 语句（先删除所有表，再删除类型和序列）==========
  
  // 2.1 删除所有表（CASCADE 会同时删除依赖的序列）
  sql += `-- ============================================================\n`
  sql += `-- Drop Tables\n`
  sql += `-- ============================================================\n\n`
  for (const table of tablesResult.rows) {
    const fullTableName = `"${table.table_schema}"."${table.table_name}"`
    sql += `DROP TABLE IF EXISTS ${fullTableName} CASCADE;\n`
  }
  sql += '\n'
  
  // 2.2 删除所有枚举类型
  sql += `-- ============================================================\n`
  sql += `-- Drop Enum Types\n`
  sql += `-- ============================================================\n\n`
  for (const row of typesResult.rows) {
    sql += `DROP TYPE IF EXISTS "${row.type_name}" CASCADE;\n`
  }
  sql += '\n'
  
  // 2.3 删除所有序列
  sql += `-- ============================================================\n`
  sql += `-- Drop Sequences\n`
  sql += `-- ============================================================\n\n`
  for (const row of sequencesResult.rows) {
    sql += `DROP SEQUENCE IF EXISTS "${row.sequence_name}" CASCADE;\n`
  }
  sql += '\n'
  
  // ========== 3. 导出 CREATE 语句（按依赖顺序创建）==========
  
  // 3.1 创建枚举类型
  sql += `-- ============================================================\n`
  sql += `-- Create Enum Types\n`
  sql += `-- ============================================================\n\n`
  for (const row of typesResult.rows) {
    const typeName = row.type_name
    sql += `CREATE TYPE "${typeName}" AS ENUM (${row.enum_labels});\n`
  }
  sql += '\n'
  
  // 3.2 创建序列
  sql += `-- ============================================================\n`
  sql += `-- Create Sequences\n`
  sql += `-- ============================================================\n\n`
  for (const row of sequencesResult.rows) {
    const seqName = row.sequence_name
    // 查询序列的 is_called 状态
    const currValResult = await client.query(`SELECT last_value, is_called FROM "${seqName}"`)
    const lastValue = currValResult.rows[0]?.last_value || row.start_value
    const isCalled = currValResult.rows[0]?.is_called || false
    
    sql += `CREATE SEQUENCE "${seqName}" AS ${row.data_type} START WITH ${row.start_value} INCREMENT BY ${row.increment} MINVALUE ${row.minimum_value} MAXVALUE ${row.maximum_value} ${row.is_cycle ? 'CYCLE' : 'NO CYCLE'};\n`
    if (isCalled) {
      sql += `SELECT setval('"${seqName}"', ${lastValue}, ${isCalled});\n`
    }
  }
  sql += '\n'
  
  // 3.3 创建表（包含主键、CHECK、UNIQUE约束，但不含外键）
  sql += `-- ============================================================\n`
  sql += `-- Create Tables\n`
  sql += `-- ============================================================\n\n`
  
  const allForeignKeys: string[] = []
  const allInserts: string[] = []
  const allIndexes: string[] = []

  for (const table of tablesResult.rows) {
    const result = await exportTableSQL(client, table.table_schema, table.table_name)
    sql += result.createSql
    allForeignKeys.push(...result.foreignKeys)
    allInserts.push(result.insertSql)
    allIndexes.push(...result.indexes)
  }

  // ========== 3.4 创建索引（表已创建、数据未插入，唯一索引可校验数据完整性）==========
  if (allIndexes.length > 0) {
    sql += `-- ============================================================\n`
    sql += `-- Create Indexes\n`
    sql += `-- ============================================================\n\n`

    for (const idx of allIndexes) {
      sql += `${idx}\n`
    }
    sql += '\n'
  }

  // ========== 4. 插入数据 ==========
  sql += `-- ============================================================\n`
  sql += `-- Insert Data\n`
  sql += `-- ============================================================\n\n`
  for (const insertSql of allInserts) {
    sql += insertSql
  }
  
  // ========== 5. 添加外键约束（所有表都已创建，可以安全添加外键）==========
  if (allForeignKeys.length > 0) {
    sql += `-- ============================================================\n`
    sql += `-- Add Foreign Key Constraints\n`
    sql += `-- ============================================================\n\n`
    
    for (const fk of allForeignKeys) {
      sql += `${fk}\n`
    }
    sql += '\n'
  }
  
  await client.end()
  
  // 使用异步文件写入,避免阻塞事件循环
  await fs.promises.writeFile(filePath, sql, 'utf-8')
  const stats = await fs.promises.stat(filePath)
  
  return { fileName, filePath, fileSize: stats.size }
}

// 恢复数据库
const restoreDatabase = async (filePath: string): Promise<void> => {
  // 使用异步文件读取，避免阻塞事件循环
  const sql = await fs.promises.readFile(filePath, 'utf-8')
  
  const client = new Client(getDbConfig())
  await client.connect()
  
  // 按行分割，智能识别 SQL 语句边界（处理字符串内的分号和换行）
  const lines = sql.split('\n')
  let currentStmt = ''
  let inString = false
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    // 跳过空行和纯注释行
    if (!trimmed || trimmed.startsWith('--')) {
      continue
    }
    
    // 累积当前语句
    currentStmt += (currentStmt ? ' ' : '') + trimmed
    
    // 检查是否到达语句结束（以分号结尾，且不在字符串内）
    // 简单判断：统计引号数量，奇数表示在字符串内
    const quoteCount = (currentStmt.match(/'/g) || []).length
    inString = quoteCount % 2 !== 0
    
    if (trimmed.endsWith(';') && !inString) {
      try {
        await client.query(currentStmt)
      } catch (error: any) {
        // 忽略一些可以容忍的错误（如表不存在）
        if (!error.message.includes('does not exist') && !error.message.includes('already exists')) {
          logger.warn('SQL 执行警告:', error.message)
        }
      }
      currentStmt = ''
      inString = false
    }
  }
  
  // 处理最后一条没有分号的语句
  if (currentStmt.trim()) {
    try {
      await client.query(currentStmt)
    } catch (error: any) {
      if (!error.message.includes('does not exist') && !error.message.includes('already exists')) {
        logger.warn('SQL 执行警告:', error.message)
      }
    }
  }
  
  await client.end()
}

// 备份锁（防止并发）
let isBackingUp = false

// 获取备份记录列表
router.get('/backups', async (req: Request, res: Response) => {
  try {
    const backups = await prisma.databaseBackup.findMany({
      orderBy: { createdAt: 'desc' }
    })
    res.json(backups)
  } catch (error) {
    logger.error('获取备份记录失败:', error)
    res.status(500).json({ error: '获取备份记录失败' })
  }
})

// 创建备份（手动触发）
router.post('/backup', checkPermission('system:backup:create'), async (req: AuthRequest, res: Response) => {
  if (isBackingUp) {
    return res.status(409).json({ error: '备份正在进行中，请稍后再试' })
  }
  
  isBackingUp = true
  const remark = req.body.remark || '手动备份'
  
  try {
    logger.info(`开始数据库备份，操作人: ${req.user?.username || 'unknown'}`)
    
    const { fileName, filePath, fileSize } = await exportDatabase()
    
    const backup = await prisma.databaseBackup.create({
      data: {
        fileName,
        filePath,
        fileSize,
        remark,
        status: 'SUCCESS'
      }
    })
    
    logger.info(`数据库备份成功: ${fileName}, 大小: ${fileSize} bytes`)
    
    res.json({
      message: '备份创建成功',
      backup
    })
  } catch (error) {
    logger.error('创建备份失败:', error)
    
    // 记录失败
    try {
      await prisma.databaseBackup.create({
        data: {
          fileName: `backup_failed_${Date.now()}.sql`,
          filePath: '',
          fileSize: 0,
          remark: remark + '（失败）',
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      })
    } catch (dbError) {
      logger.error('记录备份失败信息失败:', dbError)
    }
    
    res.status(500).json({ 
      error: '创建备份失败', 
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    isBackingUp = false
  }
})

// 下载备份文件
router.get('/backups/:id/download', checkPermission('system:backup:download'), async (req: Request, res: Response) => {
  try {
    const backupId = parseInt(req.params.id as string)
    
    const backup = await prisma.databaseBackup.findUnique({
      where: { id: backupId }
    })
    
    if (!backup) {
      return res.status(404).json({ error: '备份记录不存在' })
    }
    
    if (backup.status !== 'SUCCESS') {
      return res.status(400).json({ error: '该备份文件不可用' })
    }
    
    if (!fs.existsSync(backup.filePath)) {
      return res.status(404).json({ error: '备份文件不存在' })
    }
    
    res.download(backup.filePath, backup.fileName)
  } catch (error) {
    logger.error('下载备份失败:', error)
    res.status(500).json({ error: '下载备份失败' })
  }
})

// 删除备份记录
router.delete('/backups/:id', checkPermission('system:backup:delete'), async (req: Request, res: Response) => {
  try {
    const backupId = parseInt(req.params.id as string)
    
    const backup = await prisma.databaseBackup.findUnique({
      where: { id: backupId }
    })
    
    if (!backup) {
      return res.status(404).json({ error: '备份记录不存在' })
    }
    
    // 删除物理文件（使用 fs.rmSync，不拼 shell 命令，避免路径被注入时执行任意命令）
    if (backup.filePath) {
      try {
        fs.rmSync(backup.filePath, { force: true })
      } catch (fileError: any) {
        logger.warn(`删除备份文件失败: ${backup.filePath}`, fileError.message)
        // 文件删除失败，但继续删除数据库记录
      }
    }
    
    // 删除数据库记录
    await prisma.databaseBackup.delete({
      where: { id: backupId }
    })
    
    logger.info(`备份记录已删除: ${backup.fileName}`)
    
    res.json({ message: '备份删除成功' })
  } catch (error) {
    logger.error('删除备份失败:', error)
    res.status(500).json({ error: '删除备份失败' })
  }
})

// 恢复数据库（从备份文件）
router.post('/backups/:id/restore', checkPermission('system:backup:restore'), async (req: AuthRequest, res: Response) => {
  if (isBackingUp) {
    return res.status(409).json({ error: '备份正在进行中，无法执行恢复' })
  }
  
  const backupId = parseInt(req.params.id as string)
  
  try {
    const backup = await prisma.databaseBackup.findUnique({
      where: { id: backupId }
    })
    
    if (!backup) {
      return res.status(404).json({ error: '备份记录不存在' })
    }
    
    if (backup.status !== 'SUCCESS') {
      return res.status(400).json({ error: '该备份文件不可用' })
    }
    
    if (!fs.existsSync(backup.filePath)) {
      return res.status(404).json({ error: '备份文件不存在' })
    }
    
    logger.warn(`开始恢复数据库: ${backup.fileName}, 操作人: ${req.user?.username || 'unknown'}`)
    
    isBackingUp = true
    await restoreDatabase(backup.filePath)
    
    logger.info('数据库恢复成功')
    
    res.json({ message: '数据库恢复成功' })
  } catch (error) {
    logger.error('恢复数据库失败:', error)
    res.status(500).json({ 
      error: '恢复数据库失败', 
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    isBackingUp = false
  }
})

// 获取备份统计信息
router.get('/backup-stats', async (req: Request, res: Response) => {
  try {
    const stats = await prisma.databaseBackup.aggregate({
      _count: { id: true },
      _sum: { fileSize: true }
    })
    
    const lastBackup = await prisma.databaseBackup.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' }
    })
    
    res.json({
      totalBackups: stats._count.id,
      totalSize: stats._sum.fileSize || 0,
      lastBackupAt: lastBackup?.createdAt || null,
      lastBackupSize: lastBackup?.fileSize || 0
    })
  } catch (error) {
    logger.error('获取备份统计失败:', error)
    res.status(500).json({ error: '获取备份统计失败' })
  }
})

// 获取备份定时任务配置
router.get('/backup-schedule', async (req: Request, res: Response) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'backup_schedule' }
    })
    
    if (!config) {
      return res.json({
        enabled: false,
        time: '02:00:00',
        retentionDays: 30
      })
    }
    
    res.json(JSON.parse(config.value))
  } catch (error) {
    logger.error('获取备份配置失败:', error)
    res.status(500).json({ error: '获取备份配置失败' })
  }
})

// 更新备份定时任务配置
router.put('/backup-schedule', checkPermission('system:backup:config'), async (req: Request, res: Response) => {
  try {
    const { enabled, time, retentionDays } = req.body
    
    const config = { enabled, time, retentionDays }
    
    await prisma.systemConfig.upsert({
      where: { key: 'backup_schedule' },
      update: { value: JSON.stringify(config) },
      create: {
        key: 'backup_schedule',
        value: JSON.stringify(config)
      }
    })
    
    logger.info('备份配置已更新:', config)
    
    res.json({ message: '配置保存成功' })
  } catch (error) {
    logger.error('保存备份配置失败:', error)
    res.status(500).json({ error: '保存备份配置失败' })
  }
})

export default router
