import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { clampPagination } from '../middleware/validation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取周报列表
router.get('/', authenticateToken, checkPermission('view_reports'), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const { userId, year, page = '1', pageSize = '10' } = req.query

    const where: any = { deletedAt: null }
    // 非管理员/经理只能查看自己的周报（忽略 userId 参数）
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      where.userId = req.user!.id
    } else if (userId) {
      where.userId = parseInt(userId as string)
    }

    if (year) {
      const y = parseInt(year as string)
      where.weekStart = {
        gte: new Date(y, 0, 1),
        lt: new Date(y + 1, 0, 1)
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    const [total, reports] = await Promise.all([
      prisma.weeklyReport.count({ where }),
      prisma.weeklyReport.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } }
        },
        orderBy: { weekStart: 'desc' },
        skip,
        take
      })
    ])

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
    logger.error('Get weekly reports error:', error)
    res.status(500).json({ error: '获取周报列表失败' })
  }
})

// 获取单个周报
router.get('/:id', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.weeklyReport.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    if (!report) {
      return res.status(404).json({ error: '周报不存在' })
    }

    // 检查权限
    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
      return res.status(403).json({ error: '没有权限查看此周报' })
    }

    res.json(report)
  } catch (error) {
    logger.error('Get weekly report error:', error)
    res.status(500).json({ error: '获取周报失败' })
  }
})

// 创建周报（手动）
router.post('/', authenticateToken, checkPermission('create_reports'), logOperation('周报', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { weekStart, weekEnd, summary, highlights, issues, nextWeekPlan } = req.body

    if (!weekStart || !weekEnd || !summary) {
      return res.status(400).json({ error: '周开始日期、结束日期和总结不能为空' })
    }

    // 获取该周的日报统计
    const dailyReports = await prisma.dailyReport.findMany({
      where: {
        deletedAt: null,
        userId: req.user!.id,
        reportDate: {
          gte: new Date(weekStart),
          lte: new Date(weekEnd)
        }
      }
    })

    const totalHours = dailyReports.reduce((sum, r) => sum + Number(r.hours || 0), 0)

    const report = await prisma.weeklyReport.create({
      data: {
        userId: req.user!.id,
        weekStart: new Date(weekStart),
        weekEnd: new Date(weekEnd),
        summary,
        highlights,
        issues,
        nextWeekPlan,
        totalHours,
        reportCount: dailyReports.length,
        status: 'DRAFT'
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(report)
  } catch (error) {
    logger.error('Create weekly report error:', error)
    res.status(500).json({ error: '创建周报失败' })
  }
})

// 更新周报
router.put('/:id', authenticateToken, checkPermission('create_reports'), logOperation('周报', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { summary, highlights, issues, nextWeekPlan, status } = req.body

    const report = await prisma.weeklyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '周报不存在' })
    }

    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能修改自己的周报' })
    }

    const updated = await prisma.weeklyReport.update({
      where: { id },
      data: {
        summary: summary || report.summary,
        highlights: highlights !== undefined ? highlights : report.highlights,
        issues: issues !== undefined ? issues : report.issues,
        nextWeekPlan: nextWeekPlan !== undefined ? nextWeekPlan : report.nextWeekPlan,
        status: status || report.status
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update weekly report error:', error)
    res.status(500).json({ error: '更新周报失败' })
  }
})

// 删除周报
router.delete('/:id', authenticateToken, checkPermission('create_reports'), logOperation('周报', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.weeklyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '周报不存在' })
    }

    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的周报' })
    }

    if (report.status !== 'DRAFT' && req.user?.role !== 'ADMIN') {
      return res.status(400).json({ error: '只能删除草稿状态的周报' })
    }

    await prisma.weeklyReport.update({ where: { id }, data: { deletedAt: new Date() } })

    res.json({ message: '删除周报成功' })
  } catch (error) {
    logger.error('Delete weekly report error:', error)
    res.status(500).json({ error: '删除周报失败' })
  }
})

// 提交周报
router.post('/:id/submit', authenticateToken, logOperation('周报', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.weeklyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '周报不存在' })
    }

    if (report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能提交自己的周报' })
    }

    if (report.status !== 'DRAFT') {
      return res.status(400).json({ error: '只能提交草稿状态的周报' })
    }

    const updated = await prisma.weeklyReport.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Submit weekly report error:', error)
    res.status(500).json({ error: '提交周报失败' })
  }
})

export default router
