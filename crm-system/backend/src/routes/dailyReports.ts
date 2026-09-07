import prisma from '../lib/prisma'
import { Router } from 'express'
import { isAdmin, hasAnyRole } from '../utils/permission'
import { hasAllDataScope } from '../middleware/dataScope'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { clampPagination } from '../middleware/validation'
import logger from '../utils/logger'
import { exportCSV, exportExcel, parseImportFile, mapImportRow, parseImportDate } from '../utils/exportImport'
import { readLegacySheet, userIdByName, orgIdByText, legacyDateToLocal } from '../utils/legacyImport'
import { upload } from '../middleware/upload'

const router = Router()

/**
 * 日报数据可见性：管理员可查看全部，非管理员只能查看自己的日报
 */
async function getReportScopeWhere(userId: number): Promise<Record<string, any>> {
  // 管理员或数据范围为 ALL 的角色（如总经理/销售经理）可见全部日报，其余只看自己
  return (await isAdmin(userId)) || (await hasAllDataScope(userId)) ? {} : { userId }
}

/**
 * 规范化待办事项：去除空串、限制最多 50 条
 */
function normalizeTodos(todos: unknown): string[] {
  if (!Array.isArray(todos)) return []
  return todos
    .map(t => (typeof t === 'string' ? t.trim() : String(t ?? '').trim()))
    .filter(Boolean)
    .slice(0, 50)
}

interface NormalizedEntry {
  id?: number
  organizationId: number | null
  projectId: number | null
  title: string | null
  content: string
  hours: number | null
}

/**
 * 规范化日报条目：过滤空条目、限制最多 50 条；工时 0-24 小时
 */
function normalizeEntries(entries: unknown): NormalizedEntry[] {
  if (!Array.isArray(entries)) return []
  return entries
    .map((e: any) => {
      const rawHours = Number(e?.hours)
      return {
        id: typeof e?.id === 'number' ? e.id : undefined,
        organizationId: e?.organizationId || null,
        projectId: e?.projectId || null,
        title: (typeof e?.title === 'string' && e.title.trim()) || null,
        content: typeof e?.content === 'string' ? e.content.trim() : '',
        hours: Number.isFinite(rawHours) && rawHours > 0 && rawHours <= 24 ? Math.round(rawHours * 10) / 10 : null
      }
    })
    .filter(e => e.content || e.title)
    .slice(0, 50)
}

/** 条目列表 → 日报 content 缓存文本 */
function entriesToContent(entries: { title: string | null; content: string }[]): string {
  return entries.map(e => [e.title, e.content].filter(Boolean).join('\n')).join('\n')
}

/** 本地时区安全的日期串（toISOString 在 UTC+8 会偏移一天） */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 解析 YYYY-MM-DD 为本地日期（new Date('YYYY-MM-DD') 会按 UTC 午夜解析导致时区偏移）；endOfDay 时含当天全部时间 */
function parseLocalDate(s: string, endOfDay = false): Date {
  const [y, m, d] = s.split('-').map(Number)
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d)
}

/** 条目统一 include 结构 */
const entryInclude = {
  entries: {
    where: { deletedAt: null },
    include: {
      organization: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } }
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
  }
}

// 获取工作日报列表（分页，支持筛选）—— 管理员可查看全部，非管理员只能查看自己的
router.get('/', authenticateToken, checkPermission('office:dailyreport:list'), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      userId = '',
      projectId = '',
      organizationId = '',
      startDate = '',
      endDate = '',
      type = '',
      search = ''
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = await getReportScopeWhere(req.user!.id)

    // 构建查询条件：合并数据权限和筛选条件
    const conditions: any[] = []
    if (Object.keys(dataScopeWhere).length > 0) {
      conditions.push(dataScopeWhere)
    }

    // 前端筛选：指定某个用户的日报（需在数据权限范围内）
    if (userId) {
      conditions.push({ userId: parseInt(userId as string) })
    }

    if (projectId) {
      const pid = parseInt(projectId as string)
      // 日报级或任一条目级关联都命中
      conditions.push({
        OR: [{ projectId: pid }, { entries: { some: { projectId: pid } } }]
      })
    }

    if (organizationId) {
      const oid = parseInt(organizationId as string)
      conditions.push({
        OR: [{ organizationId: oid }, { entries: { some: { organizationId: oid } } }]
      })
    }

    if (type) {
      conditions.push({ type: type as string })
    }

    if (startDate || endDate) {
      const dateCondition: any = {}
      if (startDate) dateCondition.gte = parseLocalDate(startDate as string)
      if (endDate) dateCondition.lte = parseLocalDate(endDate as string, true)
      conditions.push({ reportDate: dateCondition })
    }

    if (search) {
      conditions.push({
        OR: [
          { content: { contains: search as string, mode: 'insensitive' } },
          { plan: { contains: search as string, mode: 'insensitive' } },
          { issues: { contains: search as string, mode: 'insensitive' } },
          { entries: { some: { content: { contains: search as string, mode: 'insensitive' } } } },
          { entries: { some: { title: { contains: search as string, mode: 'insensitive' } } } }
        ]
      })
    }

    const where: any = { deletedAt: null, ...(conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}) }

    const total = await prisma.dailyReport.count({ where })

    const reports = await prisma.dailyReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        ...entryInclude
      },
      orderBy: { reportDate: 'desc' },
      skip,
      take
    })

    res.json({
      data: reports,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get daily reports error:', error)
    res.status(500).json({ error: '获取工作日报列表失败' })
  }
})

// 日报统计概览（本月报告数、总工时、按类型统计）—— 管理员可查看全部，非管理员只能查看自己的
router.get('/stats/overview', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const where = {
      deletedAt: null,
      reportDate: {
        gte: monthStart,
        lte: monthEnd
      },
      ...dataScopeWhere
    }

    const reports = await prisma.dailyReport.findMany({ where })

    const totalReports = reports.length
    const totalHours = Number(reports.reduce((sum, r) => sum + Number(r.hours || 0), 0).toFixed(1))
    const totalTodos = reports.reduce((sum, r) => sum + ((r.todos as string[] | null)?.length || 0), 0)
    const totalEntries = await prisma.dailyReportEntry.count({
      where: { reportId: { in: reports.map(r => r.id) }, deletedAt: null }
    })

    const typeCount = reports.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    res.json({
      totalReports,
      totalHours,
      totalTodos,
      totalEntries,
      work: typeCount['WORK'] || 0,
      preSales: typeCount['PRE_SALES'] || 0,
      project: typeCount['PROJECT'] || 0,
      meeting: typeCount['MEETING'] || 0,
      training: typeCount['TRAINING'] || 0,
      other: typeCount['OTHER'] || 0
    })
  } catch (error) {
    logger.error('Get daily report stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// ===== 导出共用（CSV/Excel 同一套筛选、映射、行结构）=====

/** 构建导出筛选条件（与列表页一致；显式筛选不能越过数据权限：非管理员已有 userId 限制） */
function buildReportFilterWhere(query: any, baseWhere: any): any {
  const { userId = '', projectId = '', organizationId = '', startDate = '', endDate = '', type = '', search = '' } = query
  const where: any = { ...baseWhere }

  if (userId && where.userId === undefined) {
    where.userId = parseInt(userId)
  }

  if (projectId) {
    const pid = parseInt(projectId)
    where.AND = [...(where.AND || []), { OR: [{ projectId: pid }, { entries: { some: { projectId: pid } } }] }]
  }

  if (organizationId) {
    const oid = parseInt(organizationId)
    where.AND = [...(where.AND || []), { OR: [{ organizationId: oid }, { entries: { some: { organizationId: oid } } }] }]
  }

  if (type) {
    where.type = type
  }

  if (startDate || endDate) {
    where.reportDate = {}
    if (startDate) {
      where.reportDate.gte = parseLocalDate(startDate)
    }
    if (endDate) {
      where.reportDate.lte = parseLocalDate(endDate, true)
    }
  }

  if (search) {
    where.OR = [
      { content: { contains: search, mode: 'insensitive' } },
      { plan: { contains: search, mode: 'insensitive' } },
      { issues: { contains: search, mode: 'insensitive' } },
      { entries: { some: { content: { contains: search, mode: 'insensitive' } } } },
      { entries: { some: { title: { contains: search, mode: 'insensitive' } } } }
    ]
  }

  return where
}

// 导出统一列（CSV 与 Excel 保持一致）
const columns = [
  { key: 'reportDate', label: '日期' },
  { key: 'userName', label: '姓名' },
  { key: 'orgName', label: '客户' },
  { key: 'projName', label: '项目' },
  { key: 'typeLabel', label: '类型' },
  { key: 'sourceLabel', label: '来源' },
  { key: 'notesText', label: '工作内容(Notes)' },
  { key: 'todosText', label: '待办事项' },
  { key: 'plan', label: '后续计划' },
  { key: 'hours', label: '工时' }
]

const reportTypeLabel: Record<string, string> = {
  WORK: '工作',
  PRE_SALES: '售前',
  PROJECT: '项目',
  MEETING: '会议',
  TRAINING: '培训',
  OTHER: '其他'
}

const sourceLabelMap: Record<string, string> = {
  INVOICE: '发票', RECEIPT: '回款', CONTRACT: '合同', SHIPMENT: '发货',
  PROCUREMENT: '采购', PROCUREMENT_PAYMENT: '采购付款', TASK: '任务', NOTE: '项目备注',
  OPPORTUNITY: '售前', QUOTATION: '报价', EXPENSE: '报销', BUSINESS_TRIP: '出差',
  PROJECT: '项目', ORGANIZATION: '客户'
}

/**
 * 导出统一行结构：一天多件事 = 多行（一条 entry 一行）。
 * 日报级字段（类型/待办/计划/工时）只出现在该日报块的首行，
 * 后续行留空——避免逐行重复导致的大片重复内容，工时列也可直接求和。
 * 日期/姓名每行保留，便于在 Excel 中筛选。
 * 注：状态列已去掉——日报无审批流，全部恒为草稿，无信息量。
 */
function buildExportRows(reports: any[]): any[] {
  return reports.flatMap((r: any) => {
    const entryList: any[] = (r.entries && r.entries.length > 0)
      ? r.entries
      : [{ title: null, content: r.content, organization: null, project: null, sourceType: null }]
    return entryList.map((e: any, idx: number) => {
      const first = idx === 0
      return {
        reportDate: toLocalDateStr(r.reportDate),
        userName: r.user?.name || '',
        orgName: e.organization?.name || r.organization?.name || '',
        projName: e.project?.name || r.project?.name || '',
        typeLabel: first ? (reportTypeLabel[r.type] || r.type || '') : '',
        sourceLabel: sourceLabelMap[e.sourceType] || (e.source === 'AUTO' ? '自动' : '手动'),
        notesText: (e.content || e.title || '').split('\n').filter(Boolean).join('；'),
        todosText: first && Array.isArray(r.todos) ? r.todos.join('；') : '',
        plan: first ? (r.plan || '') : '',
        hours: first && r.hours != null ? Number(r.hours) : ''
      }
    })
  })
}

// 导出日报 CSV —— 管理员可导出全部，非管理员只能导出自己的
router.get('/export/csv', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const where = buildReportFilterWhere(req.query, { deletedAt: null, ...dataScopeWhere })

    const reports = await prisma.dailyReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        ...entryInclude
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'asc' }]
    })

    const escape = (val: any): string => {
      if (val == null) return ''
      let str = String(val).replace(/"/g, '""')
      // 防公式注入：= + - @ 开头的单元格加单引号前缀
      if (/^[=+\-@\t\r]/.test(str)) str = "'" + str
      return `"${str}"`
    }

    const rows = buildExportRows(reports).map(row => columns.map(c => escape(row[c.key])).join(','))

    const csv = '﻿' + [columns.map(c => c.label).join(','), ...rows].join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="daily-reports.csv"')
    res.send(csv)
  } catch (error) {
    logger.error('Export daily reports CSV error:', error)
    res.status(500).json({ error: '导出 CSV 失败' })
  }
})

// 获取单个日报详情
router.get('/:id', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const report = await prisma.dailyReport.findFirst({
      where: { id, deletedAt: null, ...dataScopeWhere },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        ...entryInclude
      }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    res.json(report)
  } catch (error) {
    res.status(500).json({ error: '获取工作日报详情失败' })
  }
})

// 创建工作日报（分条：entries 为当天做的多件事）
router.post('/', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const {
      reportDate,
      type,
      entries,
      todos,
      plan,
      hours,
      status = 'DRAFT'
    } = req.body

    const normalized = normalizeEntries(entries)
    // 日报级客户/项目取第一个有条目关联的（兼容筛选/导出）
    const firstWith = normalized.find(e => e.organizationId || e.projectId)
    // 总工时 = 各条目工时之和
    const totalHours = Number(normalized.reduce((sum, e) => sum + (e.hours || 0), 0).toFixed(1))

    const report = await prisma.dailyReport.create({
      data: {
        reportDate: new Date(reportDate),
        type,
        projectId: firstWith?.projectId || null,
        organizationId: firstWith?.organizationId || null,
        content: entriesToContent(normalized),
        todos: normalizeTodos(todos),
        plan,
        hours: totalHours,
        status: status || 'DRAFT',
        userId: req.user!.id,
        entries: {
          create: normalized.map(e => ({
            organizationId: e.organizationId,
            projectId: e.projectId,
            title: e.title,
            content: e.content,
            hours: e.hours,
            source: 'MANUAL'
          }))
        }
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        ...entryInclude
      }
    })

    res.status(201).json(report)
  } catch (error) {
    logger.error('Create daily report error:', error)
    res.status(500).json({ error: '创建工作日报失败' })
  }
})

// 更新工作日报（分条差量更新：有id的更新、无id的新增、缺失的软删除）
router.put('/:id', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      reportDate,
      type,
      entries,
      todos,
      plan,
      hours
    } = req.body

    const existing = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 只能更新自己的日报（管理员除外）
    if (existing.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能修改自己的日报' })
    }

    // 手动条目差量同步（不动 AUTO 来源的条目）
    const normalized = normalizeEntries(entries)
    const updatedIds = normalized.map(e => e.id).filter((v): v is number => !!v)
    const existingManualEntries = await prisma.dailyReportEntry.findMany({
      where: { reportId: id, deletedAt: null, source: 'MANUAL' }
    })

    const now = new Date()
    for (const e of existingManualEntries) {
      if (!updatedIds.includes(e.id)) {
        await prisma.dailyReportEntry.update({ where: { id: e.id }, data: { deletedAt: now } })
      }
    }
    for (const e of normalized) {
      if (e.id && existingManualEntries.some(x => x.id === e.id)) {
        await prisma.dailyReportEntry.update({
          where: { id: e.id },
          data: { organizationId: e.organizationId, projectId: e.projectId, title: e.title, content: e.content, hours: e.hours }
        })
      } else if (!e.id) {
        await prisma.dailyReportEntry.create({
          data: { reportId: id, organizationId: e.organizationId, projectId: e.projectId, title: e.title, content: e.content, hours: e.hours, source: 'MANUAL' }
        })
      }
    }

    // 重算 content 缓存与日报级关联；总工时 = 全部有效条目（含自动）工时之和
    const allEntries = await prisma.dailyReportEntry.findMany({
      where: { reportId: id, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })
    const firstWith = allEntries.find(e => e.organizationId || e.projectId)
    const totalHours = Number(allEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0).toFixed(1))

    const report = await prisma.dailyReport.update({
      where: { id },
      data: {
        reportDate: new Date(reportDate),
        type,
        projectId: firstWith?.projectId ?? existing.projectId,
        organizationId: firstWith?.organizationId ?? existing.organizationId,
        content: entriesToContent(allEntries),
        todos: normalizeTodos(todos),
        plan,
        hours: totalHours
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        ...entryInclude
      }
    })

    res.json(report)
  } catch (error) {
    logger.error('Update daily report error:', error)
    res.status(500).json({ error: '更新工作日报失败' })
  }
})

// 删除工作日报
router.delete('/:id', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 管理员可以删除任何日报
    if (await isAdmin(req.user!.id)) {
      // 管理员直接通过权限检查
    } else {
      // 普通用户只能删除自己的草稿状态日报
      if (report.userId !== req.user!.id) {
        return res.status(403).json({ error: '只能删除自己的日报' })
      }

      if (report.status !== 'DRAFT') {
        return res.status(400).json({ error: '只能删除草稿状态的日报' })
      }
    }

    // 级联软删除子实体（只有这些模型有 deletedAt）
    await prisma.dailyReportItem.updateMany({ where: { reportId: id }, data: { deletedAt: new Date() } })
    await prisma.dailyReportEntry.updateMany({ where: { reportId: id }, data: { deletedAt: new Date() } })
    await prisma.dailyReportTimeEntry.updateMany({ where: { reportId: id }, data: { deletedAt: new Date() } })
    await prisma.dailyReportComment.updateMany({ where: { reportId: id }, data: { deletedAt: new Date() } })
    await prisma.dailyReportFile.updateMany({ where: { reportId: id }, data: { deletedAt: new Date() } })

    // 辅助/关联表没有 deletedAt，执行硬删除
    await prisma.dailyReportTag.deleteMany({ where: { reportId: id } })
    await prisma.dailyReportVisibility.deleteMany({ where: { reportId: id } })
    await prisma.dailyReportFavorite.deleteMany({ where: { reportId: id } })
    await prisma.dailyReportHistory.deleteMany({ where: { reportId: id } })
    await prisma.dailyReportArchive.deleteMany({ where: { originalId: id } })
    await prisma.dailyReportRelation.deleteMany({ where: { reportId: id } })

    await prisma.dailyReport.update({ where: { id }, data: { deletedAt: new Date() } })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete daily report error:', error)
    res.status(500).json({ error: '删除工作日报失败' })
  }
})

// 提交日报
router.post('/:id/submit', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    if (report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能提交自己的日报' })
    }

    if (report.status !== 'DRAFT') {
      return res.status(400).json({ error: '只能提交草稿状态的日报' })
    }

    const updated = await prisma.dailyReport.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Submit daily report error:', error)
    res.status(500).json({ error: '提交日报失败' })
  }
})

// 审批日报（批准）
router.post('/:id/approve', authenticateToken, checkPermission('office:dailyreport:approve'), logOperation('工作日报', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { id: true, deptId: true } } }
    })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    if (report.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只能审批已提交的日报' })
    }

    // 自审批防护：不能审批自己的日报（管理员除外）
    if (report.userId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能审批自己的日报' })
    }

    const updated = await prisma.dailyReport.update({
      where: { id },
      data: { status: 'APPROVED' },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Approve daily report error:', error)
    res.status(500).json({ error: '审批日报失败' })
  }
})

// 拒绝日报
router.post('/:id/reject', authenticateToken, checkPermission('office:dailyreport:approve'), logOperation('工作日报', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    if (report.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只能拒绝已提交的日报' })
    }

    // 自审批防护：不能拒绝自己的日报（管理员除外）
    if (report.userId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能拒绝自己的日报' })
    }

    const updated = await prisma.dailyReport.update({
      where: { id },
      data: { status: 'REJECTED', issues: reason || report.issues },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Reject daily report error:', error)
    res.status(500).json({ error: '拒绝日报失败' })
  }
})

// 评分日报
router.post('/:id/rate', authenticateToken, checkPermission('office:dailyreport:approve'), logOperation('工作日报', 'RATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { rating } = req.body

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '评分必须在1-5之间' })
    }

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 自评分防护：不能给自己的日报评分（管理员除外）
    if (report.userId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能给自己的日报评分' })
    }

    const updated = await prisma.dailyReport.update({
      where: { id },
      data: { rating, ratedBy: req.user!.id, ratedAt: new Date() },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Rate daily report error:', error)
    res.status(500).json({ error: '评分失败' })
  }
})

// 获取日报评论列表
router.get('/:id/comments', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    // 非管理员只能查看自己日报的评论
    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }
    if (report.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能查看自己的日报' })
    }

    const comments = await prisma.dailyReportComment.findMany({
      where: { reportId: id, parentId: null, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          where: { deletedAt: null },
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    res.json(comments)
  } catch (error) {
    logger.error('Get daily report comments error:', error)
    res.status(500).json({ error: '获取评论失败' })
  }
})

// 添加评论
router.post('/:id/comments', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'COMMENT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { content, parentId } = req.body

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '评论内容不能为空' })
    }

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 非管理员只能评论自己的日报
    if (report.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能评论自己的日报' })
    }

    const comment = await prisma.dailyReportComment.create({
      data: {
        reportId: id,
        userId: req.user!.id,
        content: content.trim(),
        parentId: parentId || null
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(comment)
  } catch (error) {
    logger.error('Add daily report comment error:', error)
    res.status(500).json({ error: '添加评论失败' })
  }
})

// 删除评论
router.delete('/:id/comments/:commentId', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'DELETE_COMMENT'), async (req: AuthRequest, res) => {
  try {
    const commentId = parseInt(req.params.commentId as string)

    const comment = await prisma.dailyReportComment.findFirst({ where: { id: commentId, deletedAt: null } })
    if (!comment) {
      return res.status(404).json({ error: '评论不存在' })
    }

    if (comment.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能删除自己的评论' })
    }

    await prisma.dailyReportComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除评论成功' })
  } catch (error) {
    logger.error('Delete daily report comment error:', error)
    res.status(500).json({ error: '删除评论失败' })
  }
})

// 获取日报提交率统计 —— 管理员可查看全部，非管理员只能查看自己的
router.get('/stats/submission-rate', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, userId } = req.query

    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const where: any = { deletedAt: null, ...dataScopeWhere }
    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) where.reportDate.gte = parseLocalDate(startDate as string)
      if (endDate) where.reportDate.lte = parseLocalDate(endDate as string, true)
    }
    // 显式筛选不能越过数据权限：非管理员（已有 userId 限制）时忽略该筛选
    if (userId && where.userId === undefined) {
      where.userId = parseInt(userId as string)
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      select: { status: true, userId: true, reportDate: true }
    })

    const total = reports.length
    const submitted = reports.filter(r => r.status !== 'DRAFT').length
    const approved = reports.filter(r => r.status === 'APPROVED').length
    const rejected = reports.filter(r => r.status === 'REJECTED').length

    res.json({
      total,
      submitted,
      approved,
      rejected,
      draft: total - submitted,
      submissionRate: total > 0 ? ((submitted / total) * 100).toFixed(2) : '0.00',
      approvalRate: submitted > 0 ? ((approved / submitted) * 100).toFixed(2) : '0.00'
    })
  } catch (error) {
    logger.error('Get submission rate stats error:', error)
    res.status(500).json({ error: '获取提交率统计失败' })
  }
})

// 获取日报质量统计 —— 管理员可查看全部，非管理员只能查看自己的
router.get('/stats/quality', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, userId } = req.query

    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const where: any = { deletedAt: null, rating: { not: null }, ...dataScopeWhere }
    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) where.reportDate.gte = parseLocalDate(startDate as string)
      if (endDate) where.reportDate.lte = parseLocalDate(endDate as string, true)
    }
    // 显式筛选不能越过数据权限：非管理员（已有 userId 限制）时忽略该筛选
    if (userId && where.userId === undefined) {
      where.userId = parseInt(userId as string)
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      select: { rating: true }
    })

    const total = reports.length
    const ratings = reports.map((r: any) => r.rating as number)
    const avgRating = total > 0 ? (ratings.reduce((a, b) => a + b, 0) / total).toFixed(2) : '0.00'
    const maxRating = total > 0 ? Math.max(...ratings) : 0
    const minRating = total > 0 ? Math.min(...ratings) : 0

    // 评分分布
    const distribution = {
      '5': ratings.filter(r => r === 5).length,
      '4': ratings.filter(r => r === 4).length,
      '3': ratings.filter(r => r === 3).length,
      '2': ratings.filter(r => r === 2).length,
      '1': ratings.filter(r => r === 1).length
    }

    res.json({
      total,
      avgRating: parseFloat(avgRating),
      maxRating,
      minRating,
      distribution
    })
  } catch (error) {
    logger.error('Get quality stats error:', error)
    res.status(500).json({ error: '获取质量统计失败' })
  }
})

// ==================== 日报工作条目管理 ====================

// 获取日报工作条目列表
router.get('/:id/items', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 非管理员只能查看自己日报的工作条目
    if (report.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能查看自己的日报' })
    }

    const items = await prisma.dailyReportItem.findMany({
      where: { reportId, deletedAt: null },
      include: {
        project: { select: { id: true, name: true } },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            rejectionReason: true,
            records: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'asc' },
              include: {
                user: { select: { id: true, name: true } }
              }
            }
          }
        }
      },
      orderBy: { order: 'asc' }
    })

    res.json(items)
  } catch (error) {
    logger.error('Get daily report items error:', error)
    res.status(500).json({ error: '获取工作条目失败' })
  }
})

// 创建日报工作条目
router.post('/:id/items', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'CREATE_ITEM'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const { projectId, title, content, hours, priority, status, result, startTime, endTime, timeType } = req.body

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 检查权限：只能为自己的日报添加条目
    if (report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能为自己的日报添加工作条目' })
    }

    const item = await prisma.dailyReportItem.create({
      data: {
        reportId,
        projectId: projectId || null,
        title,
        content,
        hours: hours ? parseFloat(hours) : null,
        priority: priority || 'MEDIUM',
        status: status || 'COMPLETED',
        result,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        timeType: timeType || 'NORMAL'
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(item)
  } catch (error) {
    logger.error('Create daily report item error:', error)
    res.status(500).json({ error: '创建工作条目失败' })
  }
})

// 更新日报工作条目
router.put('/:id/items/:itemId', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'UPDATE_ITEM'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const itemId = parseInt(req.params.itemId as string)
    const { projectId, title, content, hours, priority, status, result, startTime, endTime, timeType } = req.body

    const item = await prisma.dailyReportItem.findFirst({
      where: { id: itemId, deletedAt: null },
      include: { report: true }
    })

    if (!item || item.reportId !== reportId) {
      return res.status(404).json({ error: '工作条目不存在' })
    }

    // 检查权限
    if (item.report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能修改自己的日报条目' })
    }

    const updated = await prisma.dailyReportItem.update({
      where: { id: itemId },
      data: {
        projectId: projectId !== undefined ? (projectId || null) : item.projectId,
        title: title !== undefined ? title : item.title,
        content: content !== undefined ? content : item.content,
        hours: hours !== undefined ? (hours ? parseFloat(hours) : null) : item.hours,
        priority: priority || item.priority,
        status: status || item.status,
        result: result !== undefined ? result : item.result,
        startTime: startTime !== undefined ? (startTime ? new Date(startTime) : null) : item.startTime,
        endTime: endTime !== undefined ? (endTime ? new Date(endTime) : null) : item.endTime,
        timeType: timeType || item.timeType
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update daily report item error:', error)
    res.status(500).json({ error: '更新工作条目失败' })
  }
})

// 删除日报工作条目
router.delete('/:id/items/:itemId', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'DELETE_ITEM'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const itemId = parseInt(req.params.itemId as string)

    const item = await prisma.dailyReportItem.findFirst({
      where: { id: itemId, deletedAt: null },
      include: { report: true }
    })

    if (!item || item.reportId !== reportId) {
      return res.status(404).json({ error: '工作条目不存在' })
    }

    // 检查权限
    if (item.report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能删除自己的日报条目' })
    }

    await prisma.dailyReportItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除工作条目成功' })
  } catch (error) {
    logger.error('Delete daily report item error:', error)
    res.status(500).json({ error: '删除工作条目失败' })
  }
})

// ==================== 日报工时条目管理 ====================

// 获取日报工时条目列表
router.get('/:id/time-entries', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 非管理员只能查看自己日报的工时条目
    if (report.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能查看自己的日报' })
    }

    const timeEntries = await prisma.dailyReportTimeEntry.findMany({
      where: { reportId, deletedAt: null },
      include: {
        project: { select: { id: true, name: true } }
      },
      orderBy: { startTime: 'asc' }
    })

    res.json(timeEntries)
  } catch (error) {
    logger.error('Get daily report time entries error:', error)
    res.status(500).json({ error: '获取工时条目失败' })
  }
})

// 创建日报工时条目
router.post('/:id/time-entries', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'CREATE_TIME_ENTRY'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const { projectId, description, hours, startTime, endTime, type } = req.body

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 检查权限
    if (report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能为自己的日报添加工时条目' })
    }

    const timeEntry = await prisma.dailyReportTimeEntry.create({
      data: {
        reportId,
        projectId: projectId || null,
        description,
        hours: parseFloat(hours),
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        type: type || 'NORMAL'
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(timeEntry)
  } catch (error) {
    logger.error('Create daily report time entry error:', error)
    res.status(500).json({ error: '创建工时条目失败' })
  }
})

// 更新日报工时条目
router.put('/:id/time-entries/:entryId', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'UPDATE_TIME_ENTRY'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const entryId = parseInt(req.params.entryId as string)
    const { projectId, description, hours, startTime, endTime, type } = req.body

    const entry = await prisma.dailyReportTimeEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: { report: true }
    })

    if (!entry || entry.reportId !== reportId) {
      return res.status(404).json({ error: '工时条目不存在' })
    }

    // 检查权限
    if (entry.report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能修改自己的日报工时条目' })
    }

    const updated = await prisma.dailyReportTimeEntry.update({
      where: { id: entryId },
      data: {
        projectId: projectId !== undefined ? (projectId || null) : entry.projectId,
        description: description !== undefined ? description : entry.description,
        hours: hours !== undefined ? parseFloat(hours) : entry.hours,
        startTime: startTime !== undefined ? (startTime ? new Date(startTime) : null) : entry.startTime,
        endTime: endTime !== undefined ? (endTime ? new Date(endTime) : null) : entry.endTime,
        type: type || entry.type
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update daily report time entry error:', error)
    res.status(500).json({ error: '更新工时条目失败' })
  }
})

// 删除日报工时条目
router.delete('/:id/time-entries/:entryId', authenticateToken, checkPermission('office:dailyreport:add'), logOperation('工作日报', 'DELETE_TIME_ENTRY'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const entryId = parseInt(req.params.entryId as string)

    const entry = await prisma.dailyReportTimeEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: { report: true }
    })

    if (!entry || entry.reportId !== reportId) {
      return res.status(404).json({ error: '工时条目不存在' })
    }

    // 检查权限
    if (entry.report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能删除自己的日报工时条目' })
    }

    await prisma.dailyReportTimeEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除工时条目成功' })
  } catch (error) {
    logger.error('Delete daily report time entry error:', error)
    res.status(500).json({ error: '删除工时条目失败' })
  }
})

// 获取工时统计（按项目、按类型）—— 管理员可查看全部，非管理员只能查看自己的
router.get('/stats/hours-analysis', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, userId } = req.query

    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const where: any = { deletedAt: null, ...dataScopeWhere }
    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) where.reportDate.gte = parseLocalDate(startDate as string)
      if (endDate) where.reportDate.lte = parseLocalDate(endDate as string, true)
    }
    // 显式筛选不能越过数据权限：非管理员（已有 userId 限制）时忽略该筛选
    if (userId && where.userId === undefined) {
      where.userId = parseInt(userId as string)
    }

    // 获取工时条目
    const timeEntries = await prisma.dailyReportTimeEntry.findMany({
      where: {
        deletedAt: null,
        report: where
      },
      include: {
        project: { select: { id: true, name: true } },
        report: { select: { reportDate: true } }
      }
    })

    // 按项目统计
    const byProject: Record<string, number> = {}
    timeEntries.forEach(entry => {
      const projectName = entry.project?.name || '未分配项目'
      byProject[projectName] = (byProject[projectName] || 0) + Number(entry.hours)
    })

    // 按类型统计
    const byType: Record<string, number> = {}
    timeEntries.forEach(entry => {
      byType[entry.type] = (byType[entry.type] || 0) + Number(entry.hours)
    })

    // 总计
    const totalHours = timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0)

    res.json({
      totalHours,
      byProject,
      byType,
      entryCount: timeEntries.length
    })
  } catch (error) {
    logger.error('Get hours analysis error:', error)
    res.status(500).json({ error: '获取工时分析失败' })
  }
})

const labelMap: Record<string, string> = {
  '日期': 'reportDate',
  '类型': 'type',
  '工作内容': 'content',
  '工作内容(Notes)': 'content',
  '客户': 'organizationName',
  '项目': 'projectName',
  '待办事项': 'todos',
  '后续计划': 'plan',
  '明日计划': 'plan',
  '工时': 'hours'
}

// 导出日报 Excel —— 筛选条件、列结构、行数据与 CSV 完全一致
router.get('/export/excel', authenticateToken, checkPermission('office:dailyreport:list'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = await getReportScopeWhere(req.user!.id)
    const where = buildReportFilterWhere(req.query, { deletedAt: null, ...dataScopeWhere })

    const reports = await prisma.dailyReport.findMany({
      where,
      include: {
        user: { select: { name: true } },
        project: { select: { name: true } },
        organization: { select: { name: true } },
        ...entryInclude
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'asc' }]
    })

    const data = buildExportRows(reports)
    // 各列宽度：工作内容/待办/计划加宽，其余窄列
    exportExcel(res, 'daily-reports.xlsx', '工作日报', columns, data, [12, 10, 18, 18, 8, 10, 55, 25, 25, 8])
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

router.post('/import', authenticateToken, checkPermission('office:dailyreport:add'), upload.single('file'), logOperation('工作日报', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    // 旧版客户日报格式自动识别:走旧版导入逻辑,用哪个导入入口都能导
    if (looksLikeLegacyDaily(req.file)) return res.json(await handleLegacyDailyImport(req, req.file))
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, labelMap)

        // 客户/项目按名称匹配ID（匹配不到留空）
        let organizationId: number | null = null
        if (mapped.organizationName) {
          const org = await prisma.organization.findFirst({ where: { name: mapped.organizationName as string, deletedAt: null }, select: { id: true } })
          organizationId = org?.id || null
        }
        let projectId: number | null = null
        if (mapped.projectName) {
          const proj = await prisma.project.findFirst({ where: { name: mapped.projectName as string, deletedAt: null }, select: { id: true } })
          projectId = proj?.id || null
        }

        // 待办事项：按换行或分号拆分为数组
        const todos: string[] = typeof mapped.todos === 'string' && mapped.todos
          ? String(mapped.todos).split(/[\n;；]+/).map(s => s.trim()).filter(Boolean)
          : []

        const { organizationName, projectName, todos: _todos, ...rest } = mapped
        await prisma.dailyReport.create({
          data: {
            ...rest,
            reportDate: parseImportDate(mapped.reportDate),
            hours: parseFloat(mapped.hours) || 0,
            organizationId,
            projectId,
            todos,
            userId: req.user!.id,
          } as any
        })
        success++
      } catch { failed++ }
    }
    res.json({ message: `导入完成: 成功 ${success} 条, 失败 ${failed} 条`, success, failed })
  } catch (error) {
    logger.error('Import error:', error)
    res.status(500).json({ error: '导入失败' })
  }
})

// 导入客户旧版日报 Excel(列:日期/客户名/详细信息(进度状态及详情)/待办事项,样本见 docs/)
// 归属人:取"客户名"列出现最多的系统用户(旧模板约定:公司事宜写自己名字),识别不出归导入者
// 客户名:精确/包含匹配组织(如"哈尔滨工程大学姜凯楠博士"→哈尔滨工程大学);匹不上且非本人名时保留为条目标题
// 同一天已有日报则追加条目,不重复建篇;周标记行(如"8月4日~8月7日")与模板说明行自动跳过
// 由 /import-legacy 直连,也被 /import 检测到旧版表头时自动转调(两个入口都可导)
async function handleLegacyDailyImport(req: AuthRequest, file: Express.Multer.File) {
  const grid = readLegacySheet(file)

    // 定位表头行:首列含"日期"
    const headerIdx = grid.findIndex(r => String(r[0] || '').includes('日期'))
    if (headerIdx < 0) throw new Error('未找到表头(第一列应为"日期")')

    type LegacyRow = { date: Date; who: string; content: string; todo: string }
    const rows: LegacyRow[] = []
    let skipped = 0
    for (const r of grid.slice(headerIdx + 1)) {
      const contentS = String(r[2] || '').trim()
      const whoS = String(r[1] || '').trim()
      // 无详细内容(空行/周标记行)、模板说明行一律跳过
      if (!contentS || contentS.includes('如果是公司事宜') || whoS.includes('单位+客户')) { skipped++; continue }
      const date = legacyDateToLocal(r[0])
      if (!date) { skipped++; continue }
      rows.push({ date, who: whoS, content: contentS, todo: String(r[3] || '').trim() })
    }
    if (rows.length === 0) return { message: '未解析到有效记录(需要"详细信息"列有内容)', success: 0, skipped }

    // 归属人:客户名列出现最多的系统用户
    const nameCount: Record<string, number> = {}
    for (const r of rows) { if (r.who) nameCount[r.who] = (nameCount[r.who] || 0) + 1 }
    let ownerUserId: number | null = null
    for (const [name] of Object.entries(nameCount).sort((a, b) => b[1] - a[1])) {
      ownerUserId = await userIdByName(name)
      if (ownerUserId) break
    }
    if (!ownerUserId) ownerUserId = req.user!.id
    const owner = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { name: true } })

    // 按天分组
    const byDay = new Map<string, LegacyRow[]>()
    for (const r of rows) {
      const key = `${r.date.getFullYear()}-${r.date.getMonth()}-${r.date.getDate()}`
      byDay.set(key, [...(byDay.get(key) || []), r])
    }

    let createdReports = 0, appendedReports = 0
    for (const dayRows of byDay.values()) {
      const dayStart = dayRows[0].date
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      let report = await prisma.dailyReport.findFirst({
        where: { userId: ownerUserId, reportDate: { gte: dayStart, lt: dayEnd }, deletedAt: null },
        orderBy: { id: 'desc' }
      })
      if (report) {
        appendedReports++
      } else {
        report = await prisma.dailyReport.create({
          data: { userId: ownerUserId, reportDate: dayStart, content: '', type: 'WORK', status: 'DRAFT' }
        })
        createdReports++
      }

      for (const r of dayRows) {
        const orgId = await orgIdByText(r.who)
        // 客户名匹不上组织且不是归属人自己 → 保留为条目标题,信息不丢
        const entryTitle = (orgId || !r.who || r.who === owner?.name) ? null : r.who
        await prisma.dailyReportEntry.create({
          data: {
            reportId: report.id,
            organizationId: orgId,
            title: entryTitle,
            content: r.content,
            source: 'MANUAL'
          }
        })
      }

      // 待办合并去重 + 重算 content 缓存与总工时(与自动写入逻辑一致)
      const newTodos = dayRows.map(r => r.todo).filter(t => t && t !== '/')
      const todos = [...new Set([...(Array.isArray(report.todos) ? report.todos : []), ...newTodos])]
      const entries = await prisma.dailyReportEntry.findMany({
        where: { reportId: report.id, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { title: true, content: true, hours: true }
      })
      const contentCache = entries.map(e => [e.title, e.content].filter(Boolean).join('\n')).join('\n')
      const totalHours = Number(entries.reduce((sum, e) => sum + Number(e.hours || 0), 0).toFixed(1))
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: { content: contentCache, hours: totalHours, todos }
      })
    }

  return {
    message: `导入完成:${rows.length} 条记录(新增 ${createdReports} 篇、追加 ${appendedReports} 篇日报),归属 ${owner?.name || '导入者'},跳过 ${skipped} 行`,
    success: rows.length,
    skipped
  }
}

/** 旧版客户日报格式特征:某行首列含"日期"且次列含"客户名" */
function looksLikeLegacyDaily(file: Express.Multer.File): boolean {
  try {
    return readLegacySheet(file).some(r => String(r[0] || '').includes('日期') && String(r[1] || '').includes('客户名'))
  } catch {
    return false
  }
}

router.post('/import-legacy', authenticateToken, checkPermission('office:dailyreport:add'), upload.single('file'), logOperation('工作日报', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    res.json(await handleLegacyDailyImport(req, req.file))
  } catch (error) {
    logger.error('Legacy import daily report error:', error)
    res.status(400).json({ error: error instanceof Error ? error.message : '导入失败' })
  }
})

export default router
