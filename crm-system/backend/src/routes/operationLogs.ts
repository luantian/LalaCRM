import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// 操作日志列表（分页 + 筛选）
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能查看操作日志' })
    }

    const {
      page = '1',
      pageSize = '20',
      module,
      action,
      userId,
      startDate,
      endDate,
      search,
    } = req.query

    const where: any = {}

    if (module) where.module = String(module)
    if (action) where.action = String(action)
    if (userId) where.userId = Number(userId)

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }

    if (search) {
      const s = String(search)
      where.OR = [
        { module: { contains: s } },
        { action: { contains: s } },
        { target: { contains: s } },
      ]
    }

    const total = await prisma.operationLog.count({ where })
    const list = await prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    })

    res.json({
      code: 200,
      data: { list, total, page: Number(page), pageSize: Number(pageSize) },
    })
  } catch (err) {
    console.error('Get operation logs error:', err)
    res.status(500).json({ code: 500, message: '获取操作日志失败' })
  }
})

// 基础统计
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能查看操作日志' })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const [totalToday, totalWeek, allLogs] = await Promise.all([
      prisma.operationLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.operationLog.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.operationLog.groupBy({
        by: ['action'],
        _count: true,
      }),
    ])

    const byAction = allLogs.reduce((acc: Record<string, number>, item) => {
      acc[item.action] = item._count
      return acc
    }, {})

    res.json({
      code: 200,
      data: { totalToday, totalWeek, byAction },
    })
  } catch (err) {
    console.error('Get operation log stats error:', err)
    res.status(500).json({ code: 500, message: '获取统计失败' })
  }
})

// 清理 30 天前的日志（仅管理员）
router.delete('/clean', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ code: 403, message: '无权限' })
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const result = await prisma.operationLog.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    })

    res.json({ code: 200, message: '清理完成', data: { deleted: result.count } })
  } catch (err) {
    console.error('Clean operation logs error:', err)
    res.status(500).json({ code: 500, message: '清理日志失败' })
  }
})

export default router
