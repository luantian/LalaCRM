import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取我的通知
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { isRead } = req.query
    const where: any = { userId: req.user!.id, deletedAt: null }
    if (isRead !== undefined) where.isRead = isRead === 'true'

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.id, deletedAt: null, isRead: false }
    })

    res.json({ data: notifications, unreadCount })
  } catch (error) {
    logger.error('Get notifications error:', error)
    res.status(500).json({ error: '获取通知失败' })
  }
})

// 标记已读
router.put('/:id/read', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const notification = await prisma.notification.findFirst({ where: { id, deletedAt: null } })
    if (!notification) {
      return res.status(404).json({ error: '通知不存在' })
    }

    if (notification.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权操作此通知' })
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    })
    res.json({ message: '已标记为已读' })
  } catch (error) {
    logger.error('Mark read error:', error)
    res.status(500).json({ error: '操作失败' })
  }
})

// 全部已读
router.put('/read-all', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, deletedAt: null, isRead: false },
      data: { isRead: true }
    })
    res.json({ message: '全部已读' })
  } catch (error) {
    logger.error('Mark all read error:', error)
    res.status(500).json({ error: '操作失败' })
  }
})

export default router
