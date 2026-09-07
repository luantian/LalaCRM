import { readFileSync } from 'fs'
import XLSX from 'xlsx'
import prisma from '../lib/prisma'

/**
 * 客户旧版 Excel 导入辅助
 * 样本见 docs/:工作日报(技术).xlsx、费用报销单、出差统计表
 * 共性:表头上方有"报销人:xxx"等信息行,数据从表头行之后开始
 */

/** 读取上传 Excel 的第一个 sheet 为二维网格(日期单元格保留为 Date 对象) */
export function readLegacySheet(file: Express.Multer.File): any[][] {
  const buf = file.buffer ?? readFileSync(file.path)
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
}

/** 在给定行里找 "报销人:xxx" 文本,提取姓名 */
export function findPersonName(rows: any[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const m = /报销人[:：]\s*(\S+)/.exec(String(cell || ''))
      if (m) return m[1]
    }
  }
  return null
}

/** 按姓名精确匹配系统用户 */
export async function userIdByName(name?: string | null): Promise<number | null> {
  if (!name) return null
  const u = await prisma.user.findFirst({ where: { name }, select: { id: true } })
  return u?.id ?? null
}

/**
 * 客户名文本匹配组织:先精确同名,再"组织名包含于文本"(取最长匹配)
 * 如"哈尔滨工程大学姜凯楠博士"→"哈尔滨工程大学"
 */
export async function orgIdByText(text?: string | null): Promise<number | null> {
  const s = String(text || '').trim()
  if (!s) return null
  const exact = await prisma.organization.findFirst({ where: { name: s, deletedAt: null }, select: { id: true } })
  if (exact) return exact.id
  const orgs = await prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
  const hits = orgs.filter(o => o.name.length >= 4 && s.includes(o.name))
    .sort((a, b) => b.name.length - a.name.length)
  return hits[0]?.id ?? null
}

/** 旧表格日期(Date对象/序列值/'2026-08-04'/'2026年8月4日'文本)→ 本地零点 Date;解析失败返回 null */
export function legacyDateToLocal(val: any): Date | null {
  if (val == null || val === '') return null
  if (val instanceof Date && !isNaN(val.getTime())) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate())
  }
  if (typeof val === 'number' && isFinite(val)) {
    const d = new Date(Math.round((val - 25569) * 86400000))
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  const s = String(val).trim()
  const m = /^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d2 = new Date(s)
  if (!isNaN(d2.getTime())) return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return null
}
