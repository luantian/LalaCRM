import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取客户跟进记录列表
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, userId, type, page = '1', pageSize = '20' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    const where: any = { deletedAt: null }
    if (customerId) where.customerId = parseInt(customerId as string)
    // 非管理员只能查看自己的跟进记录
    if (req.user?.role !== 'ADMIN') {
      where.userId = req.user!.id
    } else if (userId) {
      where.userId = parseInt(userId as string)
    }
    if (type) where.type = type as string

    const [total, records] = await Promise.all([
      prisma.customerFollowUp.count({ where }),
      prisma.customerFollowUp.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ])

    res.json({
      data: records,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get follow-ups error:', error)
    res.status(500).json({ error: '获取跟进记录失败' })
  }
})

// 获取待跟进提醒（下次跟进日期在今天或之前的记录）
router.get('/reminders', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const reminders = await prisma.customerFollowUp.findMany({
      where: {
        deletedAt: null,
        OR: [
          { nextDate: { lte: today } }, // 已到期
          { nextDate: { lte: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000) } } // 3天内到期
        ],
        userId: req.user?.id
      },
      include: {
        customer: { select: { id: true, name: true } }
      },
      orderBy: { nextDate: 'asc' },
      take: 20
    })

    res.json({ data: reminders })
  } catch (error) {
    logger.error('Get reminders error:', error)
    res.status(500).json({ error: '获取提醒失败' })
  }
})

// 获取跟进统计
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, userId } = req.query
    const where: any = { deletedAt: null }
    if (customerId) where.customerId = parseInt(customerId as string)
    // 非管理员只能查看自己的统计
    if (req.user?.role !== 'ADMIN') {
      where.userId = req.user!.id
    } else if (userId) {
      where.userId = parseInt(userId as string)
    }

    const [total, typeStats] = await Promise.all([
      prisma.customerFollowUp.count({ where }),
      prisma.customerFollowUp.groupBy({
        by: ['type'],
        where,
        _count: { id: true }
      })
    ])

    const typeCount: Record<string, number> = {}
    typeStats.forEach(item => {
      typeCount[item.type] = item._count.id
    })

    // 本月跟进数
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthCount = await prisma.customerFollowUp.count({
      where: { ...where, createdAt: { gte: monthStart } }
    })

    res.json({
      total,
      monthCount,
      byType: typeCount
    })
  } catch (error) {
    logger.error('Get follow-up stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 创建跟进记录
router.post('/', authenticateToken, logOperation('客户跟进', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, type, content, nextPlan, nextDate, result, attachments } = req.body

    if (!customerId || !type || !content) {
      return res.status(400).json({ error: '客户ID、跟进方式和内容不能为空' })
    }

    const record = await prisma.customerFollowUp.create({
      data: {
        customerId: parseInt(customerId),
        userId: req.user!.id,
        type,
        content,
        nextPlan,
        nextDate: nextDate ? new Date(nextDate) : null,
        result,
        attachments: attachments ? JSON.stringify(attachments) : null
      },
      include: {
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } }
      }
    })

    logger.info(`Follow-up created for customer ${customerId} by ${req.user?.username}`)
    res.status(201).json(record)
  } catch (error) {
    logger.error('Create follow-up error:', error)
    res.status(500).json({ error: '创建跟进记录失败' })
  }
})

// 更新跟进记录
router.put('/:id', authenticateToken, logOperation('客户跟进', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    const { type, content, nextPlan, nextDate, result, attachments } = req.body

    const existing = await prisma.customerFollowUp.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '记录不存在' })
    }

    // 只能更新自己的记录（管理员除外）
    if (existing.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权操作此记录' })
    }

    const record = await prisma.customerFollowUp.update({
      where: { id },
      data: {
        type,
        content,
        nextPlan,
        nextDate: nextDate ? new Date(nextDate) : nextDate === null ? null : undefined,
        result,
        attachments: attachments ? JSON.stringify(attachments) : undefined
      },
      include: {
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } }
      }
    })

    logger.info(`Follow-up ${id} updated by ${req.user?.username}`)
    res.json(record)
  } catch (error) {
    logger.error('Update follow-up error:', error)
    res.status(500).json({ error: '更新跟进记录失败' })
  }
})

// 删除跟进记录
router.delete('/:id', authenticateToken, logOperation('客户跟进', 'DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)

    // 只能删除自己的记录（管理员除外）
    const record = await prisma.customerFollowUp.findFirst({ where: { id, deletedAt: null } })
    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }
    if (record.userId !== req.user?.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的跟进记录' })
    }

    await prisma.customerFollowUp.update({ where: { id }, data: { deletedAt: new Date() } })

    logger.info(`Follow-up ${id} deleted by ${req.user?.username}`)
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete follow-up error:', error)
    res.status(500).json({ error: '删除跟进记录失败' })
  }
})

export default router
