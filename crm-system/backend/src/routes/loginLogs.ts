import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// 登录日志列表（分页 + 筛选）
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能查看登录日志' })
    }

    const {
      page = '1',
      pageSize = '20',
      username,
      status,
      startDate,
      endDate,
    } = req.query

    const where: any = {}

    if (username) where.username = { contains: String(username) }
    if (status) where.status = String(status)

    if (startDate || endDate) {
      where.loginTime = {}
      if (startDate) where.loginTime.gte = new Date(startDate as string)
      if (endDate) where.loginTime.lte = new Date(endDate as string)
    }

    const total = await prisma.loginLog.count({ where })
    const list = await prisma.loginLog.findMany({
      where,
      orderBy: { loginTime: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    })

    res.json({
      code: 200,
      data: { list, total, page: Number(page), pageSize: Number(pageSize) },
    })
  } catch (err) {
    console.error('Get login logs error:', err)
    res.status(500).json({ code: 500, message: '获取登录日志失败' })
  }
})

// 登录日志统计
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能查看登录日志' })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [totalToday, successCount, failCount] = await Promise.all([
      prisma.loginLog.count({ where: { loginTime: { gte: todayStart } } }),
      prisma.loginLog.count({
        where: { loginTime: { gte: todayStart }, status: 'SUCCESS' },
      }),
      prisma.loginLog.count({
        where: { loginTime: { gte: todayStart }, status: 'FAILED' },
      }),
    ])

    res.json({
      code: 200,
      data: { totalToday, successCount, failCount },
    })
  } catch (err) {
    console.error('Get login log stats error:', err)
    res.status(500).json({ code: 500, message: '获取统计失败' })
  }
})

// 清理 90 天前的登录日志
router.delete('/clean', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ code: 403, message: '无权限' })
    }

    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const result = await prisma.loginLog.deleteMany({
      where: { loginTime: { lt: ninetyDaysAgo } },
    })

    res.json({ code: 200, message: '清理完成', data: { deleted: result.count } })
  } catch (err) {
    console.error('Clean login logs error:', err)
    res.status(500).json({ code: 500, message: '清理日志失败' })
  }
})

export default router
