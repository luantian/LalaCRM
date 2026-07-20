import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取月报列表
router.get('/', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const { userId, year, page = '1', pageSize = '10' } = req.query

    const where: any = { deletedAt: null }
    if (userId) {
      where.userId = parseInt(userId as string)
    } else {
      if (req.user?.role !== 'ADMIN') {
        where.userId = req.user!.id
      }
    }

    if (year) {
      where.year = parseInt(year as string)
    }

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    const [total, reports] = await Promise.all([
      prisma.monthlyReport.count({ where }),
      prisma.monthlyReport.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } }
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
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
    logger.error('Get monthly reports error:', error)
    res.status(500).json({ error: '获取月报列表失败' })
  }
})

// 获取单个月报
router.get('/:id', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.monthlyReport.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    if (!report) {
      return res.status(404).json({ error: '月报不存在' })
    }

    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '没有权限查看此月报' })
    }

    res.json(report)
  } catch (error) {
    logger.error('Get monthly report error:', error)
    res.status(500).json({ error: '获取月报失败' })
  }
})

// 创建月报（手动）
router.post('/', authenticateToken, checkPermission('create_reports'), logOperation('月报', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { year, month, summary, achievements, issues, nextMonthPlan } = req.body

    if (!year || !month || !summary) {
      return res.status(400).json({ error: '年份、月份和总结不能为空' })
    }

    const y = parseInt(year)
    const m = parseInt(month)

    if (m < 1 || m > 12) {
      return res.status(400).json({ error: '月份必须在1-12之间' })
    }

    // 获取该月的日报统计
    const startDate = new Date(y, m - 1, 1)
    const endDate = new Date(y, m, 0, 23, 59, 59, 999)

    const dailyReports = await prisma.dailyReport.findMany({
      where: {
        deletedAt: null,
        userId: req.user!.id,
        reportDate: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    const totalHours = dailyReports.reduce((sum, r) => sum + Number(r.hours || 0), 0)

    const report = await prisma.monthlyReport.create({
      data: {
        userId: req.user!.id,
        year: y,
        month: m,
        summary,
        achievements,
        issues,
        nextMonthPlan,
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
    logger.error('Create monthly report error:', error)
    res.status(500).json({ error: '创建月报失败' })
  }
})

// 更新月报
router.put('/:id', authenticateToken, checkPermission('create_reports'), logOperation('月报', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { summary, achievements, issues, nextMonthPlan, status } = req.body

    const report = await prisma.monthlyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '月报不存在' })
    }

    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能修改自己的月报' })
    }

    const updated = await prisma.monthlyReport.update({
      where: { id },
      data: {
        summary: summary || report.summary,
        achievements: achievements !== undefined ? achievements : report.achievements,
        issues: issues !== undefined ? issues : report.issues,
        nextMonthPlan: nextMonthPlan !== undefined ? nextMonthPlan : report.nextMonthPlan,
        status: status || report.status
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update monthly report error:', error)
    res.status(500).json({ error: '更新月报失败' })
  }
})

// 删除月报
router.delete('/:id', authenticateToken, checkPermission('create_reports'), logOperation('月报', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.monthlyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '月报不存在' })
    }

    if (report.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的月报' })
    }

    if (report.status !== 'DRAFT' && req.user?.role !== 'ADMIN') {
      return res.status(400).json({ error: '只能删除草稿状态的月报' })
    }

    await prisma.monthlyReport.update({ where: { id }, data: { deletedAt: new Date() } })

    res.json({ message: '删除月报成功' })
  } catch (error) {
    logger.error('Delete monthly report error:', error)
    res.status(500).json({ error: '删除月报失败' })
  }
})

// 提交月报
router.post('/:id/submit', authenticateToken, logOperation('月报', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const report = await prisma.monthlyReport.findFirst({ where: { id, deletedAt: null } })
    if (!report) {
      return res.status(404).json({ error: '月报不存在' })
    }

    if (report.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能提交自己的月报' })
    }

    if (report.status !== 'DRAFT') {
      return res.status(400).json({ error: '只能提交草稿状态的月报' })
    }

    const updated = await prisma.monthlyReport.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Submit monthly report error:', error)
    res.status(500).json({ error: '提交月报失败' })
  }
})

export default router
