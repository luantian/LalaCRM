import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import { clampPagination } from '../middleware/validation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取工作日报列表（分页，支持筛选）
router.get('/', authenticateToken, checkPermission('view_reports'), applyDataScope('userId'), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      userId = '',
      projectId = '',
      startDate = '',
      endDate = '',
      type = '',
      search = ''
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

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
      conditions.push({ projectId: parseInt(projectId as string) })
    }

    if (type) {
      conditions.push({ type: type as string })
    }

    if (startDate || endDate) {
      const dateCondition: any = {}
      if (startDate) dateCondition.gte = new Date(startDate as string)
      if (endDate) dateCondition.lte = new Date(endDate as string)
      conditions.push({ reportDate: dateCondition })
    }

    if (search) {
      conditions.push({
        OR: [
          { content: { contains: search as string, mode: 'insensitive' } },
          { plan: { contains: search as string, mode: 'insensitive' } },
          { issues: { contains: search as string, mode: 'insensitive' } }
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
        project: { select: { id: true, name: true } }
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

// 日报统计概览（本月报告数、总工时、按类型统计）
router.get('/stats/overview', authenticateToken, checkPermission('view_reports'), applyDataScope('userId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const where = {
      deletedAt: null,
      ...dataScopeWhere,
      reportDate: {
        gte: monthStart,
        lte: monthEnd
      }
    }

    const reports = await prisma.dailyReport.findMany({ where })

    const totalReports = reports.length
    const totalHours = reports.reduce((sum, r) => sum + Number(r.hours), 0)

    const typeCount = reports.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    res.json({
      totalReports,
      totalHours,
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

// 导出日报 CSV
router.get('/export/csv', authenticateToken, checkPermission('view_reports'), applyDataScope('userId'), async (req: AuthRequest, res) => {
  try {
    const {
      userId = '',
      projectId = '',
      startDate = '',
      endDate = '',
      type = '',
      search = ''
    } = req.query

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, ...dataScopeWhere }

    if (userId) {
      where.userId = parseInt(userId as string)
    }

    if (projectId) {
      where.projectId = parseInt(projectId as string)
    }

    if (type) {
      where.type = type as string
    }

    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) {
        where.reportDate.gte = new Date(startDate as string)
      }
      if (endDate) {
        where.reportDate.lte = new Date(endDate as string)
      }
    }

    if (search) {
      where.OR = [
        { content: { contains: search as string, mode: 'insensitive' } },
        { plan: { contains: search as string, mode: 'insensitive' } },
        { issues: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      },
      orderBy: { reportDate: 'desc' }
    })

    const typeMap: Record<string, string> = {
      WORK: '工作',
      PRE_SALES: '售前',
      PROJECT: '项目',
      MEETING: '会议',
      TRAINING: '培训',
      OTHER: '其他'
    }

    const escape = (val: any): string => {
      if (val == null) return ''
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const header = '日期,姓名,项目,类型,工作内容,明日计划,问题,时长'
    const rows = reports.map(r =>
      [
        escape(r.reportDate.toISOString().slice(0, 10)),
        escape(r.user?.name || ''),
        escape(r.project?.name || ''),
        escape(typeMap[r.type] || r.type),
        escape(r.content),
        escape(r.plan),
        escape(r.issues),
        escape(Number(r.hours).toFixed(1))
      ].join(',')
    )

    const csv = '﻿' + [header, ...rows].join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="daily-reports.csv"')
    res.send(csv)
  } catch (error) {
    logger.error('Export daily reports CSV error:', error)
    res.status(500).json({ error: '导出 CSV 失败' })
  }
})

// 获取单个日报详情
router.get('/:id', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const report = await prisma.dailyReport.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 数据权限：非管理员/经理只能查看自己的日报
    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      return res.status(403).json({ error: '没有权限查看此日报' })
    }

    res.json(report)
  } catch (error) {
    res.status(500).json({ error: '获取工作日报详情失败' })
  }
})

// 创建工作日报
router.post('/', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const {
      reportDate,
      type,
      projectId,
      content,
      plan,
      issues,
      hours,
      status = 'DRAFT'
    } = req.body

    const report = await prisma.dailyReport.create({
      data: {
        reportDate: new Date(reportDate),
        type,
        projectId: projectId || null,
        content,
        plan,
        issues,
        hours: parseFloat(hours || 0),
        status: status || 'DRAFT',
        userId: req.user!.id
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(report)
  } catch (error) {
    logger.error('Create daily report error:', error)
    res.status(500).json({ error: '创建工作日报失败' })
  }
})

// 更新工作日报
router.put('/:id', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      reportDate,
      type,
      projectId,
      content,
      plan,
      issues,
      hours
    } = req.body

    const existing = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 只能更新自己的日报（管理员/经理除外）
    if (existing.userId !== req.user!.id && req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      return res.status(403).json({ error: '无权操作此记录' })
    }

    const report = await prisma.dailyReport.update({
      where: { id },
      data: {
        reportDate: new Date(reportDate),
        type,
        projectId: projectId || null,
        content,
        plan,
        issues,
        hours: parseFloat(hours || 0)
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(report)
  } catch (error) {
    logger.error('Update daily report error:', error)
    res.status(500).json({ error: '更新工作日报失败' })
  }
})

// 删除工作日报
router.delete('/:id', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 只有创建者可以删除草稿状态的日报
    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的日报' })
    }

    if (report.status !== 'DRAFT' && req.user?.role !== 'ADMIN') {
      return res.status(400).json({ error: '只能删除草稿状态的日报' })
    }

    // 级联软删除子实体（只有这些模型有 deletedAt）
    await prisma.dailyReportItem.updateMany({ where: { reportId: id }, data: { deletedAt: new Date() } })
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
router.post('/:id/submit', authenticateToken, logOperation('工作日报', 'SUBMIT'), async (req: AuthRequest, res) => {
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
router.post('/:id/approve', authenticateToken, logOperation('工作日报', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { deptId: true } } }
    })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 只有管理员或上级可以审批
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER' && req.user?.role !== 'PROJECT_MANAGER') {
      return res.status(403).json({ error: '没有审批权限' })
    }

    if (report.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只能审批已提交的日报' })
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
router.post('/:id/reject', authenticateToken, logOperation('工作日报', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body

    const report = await prisma.dailyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER' && req.user?.role !== 'PROJECT_MANAGER') {
      return res.status(403).json({ error: '没有审批权限' })
    }

    if (report.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只能拒绝已提交的日报' })
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
router.post('/:id/rate', authenticateToken, logOperation('工作日报', 'RATE'), async (req: AuthRequest, res) => {
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

    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER' && req.user?.role !== 'PROJECT_MANAGER') {
      return res.status(403).json({ error: '没有评分权限' })
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
router.get('/:id/comments', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

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
router.post('/:id/comments', authenticateToken, logOperation('工作日报', 'COMMENT'), async (req: AuthRequest, res) => {
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
router.delete('/:id/comments/:commentId', authenticateToken, logOperation('工作日报', 'DELETE_COMMENT'), async (req: AuthRequest, res) => {
  try {
    const commentId = parseInt(req.params.commentId as string)

    const comment = await prisma.dailyReportComment.findFirst({ where: { id: commentId, deletedAt: null } })
    if (!comment) {
      return res.status(404).json({ error: '评论不存在' })
    }

    if (comment.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的评论' })
    }

    await prisma.dailyReportComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除评论成功' })
  } catch (error) {
    logger.error('Delete daily report comment error:', error)
    res.status(500).json({ error: '删除评论失败' })
  }
})

// 获取日报提交率统计
router.get('/stats/submission-rate', authenticateToken, checkPermission('view_reports'), applyDataScope('userId'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, userId } = req.query

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, ...dataScopeWhere }
    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) where.reportDate.gte = new Date(startDate as string)
      if (endDate) where.reportDate.lte = new Date(endDate as string)
    }
    // 非管理员只能查看自己的统计
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      where.userId = req.user!.id
    } else if (userId) {
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

// 获取日报质量统计
router.get('/stats/quality', authenticateToken, checkPermission('view_reports'), applyDataScope('userId'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, userId } = req.query

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, rating: { not: null }, ...dataScopeWhere }
    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) where.reportDate.gte = new Date(startDate as string)
      if (endDate) where.reportDate.lte = new Date(endDate as string)
    }
    // 非管理员只能查看自己的统计
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      where.userId = req.user!.id
    } else if (userId) {
      where.userId = parseInt(userId as string)
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      select: { rating: true }
    })

    const total = reports.length
    const ratings = reports.map(r => r.rating as number)
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
router.get('/:id/items', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    const items = await prisma.dailyReportItem.findMany({
      where: { reportId, deletedAt: null },
      include: {
        project: { select: { id: true, name: true } }
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
router.post('/:id/items', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'CREATE_ITEM'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)
    const { projectId, title, content, hours, priority, status, result, startTime, endTime, timeType } = req.body

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
    }

    // 检查权限：只能为自己的日报添加条目（管理员除外）
    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
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
router.put('/:id/items/:itemId', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'UPDATE_ITEM'), async (req: AuthRequest, res) => {
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
    if (item.report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
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
router.delete('/:id/items/:itemId', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'DELETE_ITEM'), async (req: AuthRequest, res) => {
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
    if (item.report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
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
router.get('/:id/time-entries', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(req.params.id as string)

    const report = await prisma.dailyReport.findFirst({
      where: { id: reportId, deletedAt: null }
    })

    if (!report) {
      return res.status(404).json({ error: '工作日报不存在' })
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
router.post('/:id/time-entries', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'CREATE_TIME_ENTRY'), async (req: AuthRequest, res) => {
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
    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
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
router.put('/:id/time-entries/:entryId', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'UPDATE_TIME_ENTRY'), async (req: AuthRequest, res) => {
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
    if (entry.report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
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
router.delete('/:id/time-entries/:entryId', authenticateToken, checkPermission('create_reports'), logOperation('工作日报', 'DELETE_TIME_ENTRY'), async (req: AuthRequest, res) => {
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
    if (entry.report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的日报工时条目' })
    }

    await prisma.dailyReportTimeEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除工时条目成功' })
  } catch (error) {
    logger.error('Delete daily report time entry error:', error)
    res.status(500).json({ error: '删除工时条目失败' })
  }
})

// 获取工时统计（按项目、按类型）
router.get('/stats/hours-analysis', authenticateToken, checkPermission('view_reports'), applyDataScope('userId'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, userId } = req.query

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, ...dataScopeWhere }
    if (startDate || endDate) {
      where.reportDate = {}
      if (startDate) where.reportDate.gte = new Date(startDate as string)
      if (endDate) where.reportDate.lte = new Date(endDate as string)
    }
    // 非管理员只能查看自己的统计
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      where.userId = req.user!.id
    } else if (userId) {
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

export default router
