import { Response } from 'express'
import { readFileSync } from 'fs'
import XLSX from 'xlsx'
import logger from './logger'

/**
 * 导出为 CSV
 */
export function exportCSV(res: Response, filename: string, columns: { key: string; label: string }[], data: any[]) {
  const headers = columns.map((c: any) => c.label)
  const rows = data.map(item =>
    columns.map(col => {
      const val = getNestedValue(item, col.key)
      if (val === null || val === undefined) return ''
      const str = String(val)
      // CSV 安全：转义双引号和公式字符
      const escaped = str.replace(/"/g, '""')
      if (/^[=+\-@\t\r]/.test(escaped)) return "'" + escaped
      return escaped
    })
  )

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\r\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`)
  res.send('﻿' + csv) // BOM for Excel
}

/**
 * 导出为 Excel
 * @param colWidths 可选：各列宽度（字符数），未指定的列默认 18
 */
export function exportExcel(res: Response, filename: string, sheetName: string, columns: { key: string; label: string }[], data: any[], colWidths?: number[]) {
  const rows = data.map(item => {
    const row: Record<string, any> = {}
    for (const col of columns) {
      row[col.label] = getNestedValue(item, col.key) ?? ''
    }
    return row
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // 设置列宽：调用方可按列指定（如内容列加宽）
  ws['!cols'] = columns.map((_, i) => ({ wch: colWidths?.[i] ?? 18 }))

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`)
  res.send(buffer)
}

/**
 * 导入日期解析：兼容三种形态——
 *  1. Excel 日期序列值（SheetJS 读 CSV 时会把日期样文本嗅探为数值序列）
 *  2. 'YYYY-MM-DD' / 'YYYY/M/D' 字符串（按本地零点解析，避免 UTC 偏移移日）
 *  3. 其他可解析字符串；空值返回 fallback（默认当前时间）
 */
export function parseImportDate(val: any, fallback: Date = new Date()): Date {
  if (val == null || val === '') return fallback
  if (val instanceof Date) return val
  if (typeof val === 'number' && isFinite(val)) {
    // Excel 1900 日期体系序列值 → 当日 UTC 零点
    return new Date(Math.round((val - 25569) * 86400000))
  }
  const s = String(val).trim()
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? fallback : d
}

/**
 * 解析导入文件（CSV 或 Excel）
 * 返回行数据数组（对象数组）
 */
export function parseImportFile(file: Express.Multer.File): { data: Record<string, any>[]; error?: string } {
  try {
    const ext = file.originalname.split('.').pop()?.toLowerCase()
    // multer 磁盘存储时 file.buffer 不存在，从临时文件读回
    const getBuffer = (): Buffer => file.buffer ?? readFileSync(file.path)

    if (ext === 'csv') {
      const content = getBuffer().toString('utf-8').replace(/^﻿/, '') // 去 BOM
      const wb = XLSX.read(content, { type: 'string' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      return { data: data as Record<string, any>[] }
    }

    if (['xlsx', 'xls'].includes(ext || '')) {
      const wb = XLSX.read(getBuffer(), { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      return { data: data as Record<string, any>[] }
    }

    return { data: [], error: '不支持的文件格式，请上传 CSV 或 Excel 文件' }
  } catch (err: any) {
    logger.error('Parse import file error:', err)
    return { data: [], error: `文件解析失败: ${err.message}` }
  }
}

/**
 * 根据 label 映射把导入行数据转换为数据库字段
 * labelMap: { "Excel列名": "数据库字段名" }
 */
export function mapImportRow(row: Record<string, any>, labelMap: Record<string, string>): Record<string, any> {
  const mapped: Record<string, any> = {}
  for (const [label, field] of Object.entries(labelMap)) {
    if (row[label] !== undefined) {
      mapped[field] = row[label]
    }
  }
  return mapped
}

/**
 * 获取嵌套属性值（支持 "customer.name" 格式）
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}
