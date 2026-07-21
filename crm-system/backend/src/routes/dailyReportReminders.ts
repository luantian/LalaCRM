import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取提醒设置
router.get('/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const reminder = await prisma.dailyReportReminder.findFirst({
      where: { userId: req.user!.id, deletedAt: null }
    })

    // 如果没有设置，返回默认值
    if (!reminder) {
      return res.json({
        userId: req.user!.id,
        reminderTime: '18:00',
        isEnabled: true,
        lastRemindedAt: null
      })
    }

    res.json(reminder)
  } catch (error) {
    logger.error('Get reminder settings error:', error)
    res.status(500).json({ error: '获取提醒设置失败' })
  }
})

// 更新提醒设置
router.put('/settings', authenticateToken, logOperation('日报提醒', 'UPDATE_SETTINGS'), async (req: AuthRequest, res) => {
  try {
    const { reminderTime, isEnabled } = req.body

    // 验证时间格式
    if (reminderTime && !/^\d{2}:\d{2}$/.test(reminderTime)) {
      return res.status(400).json({ error: '提醒时间格式不正确，应为 HH:mm' })
    }

    const reminder = await prisma.dailyReportReminder.upsert({
      where: { userId: req.user!.id },
      update: {
        reminderTime: reminderTime || '18:00',
        isEnabled: isEnabled !== undefined ? isEnabled : true
      },
      create: {
        userId: req.user!.id,
        reminderTime: reminderTime || '18:00',
        isEnabled: isEnabled !== undefined ? isEnabled : true
      }
    })

    res.json(reminder)
  } catch (error) {
    logger.error('Update reminder settings error:', error)
    res.status(500).json({ error: '更新提醒设置失败' })
  }
})

// 获取未提交日报的日期
router.get('/missing-dates', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请提供开始和结束日期' })
    }

    const start = new Date(startDate as string)
    const end = new Date(endDate as string)

    // 获取该时间段内的所有日报
    const reports = await prisma.dailyReport.findMany({
      where: {
        userId: req.user!.id,
        reportDate: {
          gte: start,
          lte: end
        }
      },
      select: { reportDate: true }
    })

    // 提取已提交日报的日期
    const reportedDates = new Set(
      reports.map(r => r.reportDate.toISOString().split('T')[0])
    )

    // 找出未提交日报的日期
    const missingDates: string[] = []
    const currentDate = new Date(start)

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayOfWeek = currentDate.getDay()

      // 排除周末（可选：可以通过设置配置是否排除）
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        if (!reportedDates.has(dateStr)) {
          missingDates.push(dateStr)
        }
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    res.json({
      missingDates,
      count: missingDates.length
    })
  } catch (error) {
    logger.error('Get missing dates error:', error)
    res.status(500).json({ error: '获取未提交日期失败' })
  }
})

// 获取提醒统计
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { days = 30 } = req.query
    const daysCount = parseInt(days as string)

    // 计算时间范围
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysCount)

    // 获取该时间段内的所有日报
    const reports = await prisma.dailyReport.findMany({
      where: {
        userId: req.user!.id,
        reportDate: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    // 计算工作日数
    let workDays = 0
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay()
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workDays++
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // 统计
    const submittedDays = reports.length
    const missingDays = workDays - submittedDays
    const submissionRate = workDays > 0 ? ((submittedDays / workDays) * 100).toFixed(2) : '0.00'

    // 总工时
    const totalHours = reports.reduce((sum, r) => sum + Number(r.hours || 0), 0)

    // 平均每天工时
    const avgHoursPerDay = submittedDays > 0 ? (totalHours / submittedDays).toFixed(2) : '0.00'

    res.json({
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days: daysCount
      },
      workDays,
      submittedDays,
      missingDays,
      submissionRate: parseFloat(submissionRate),
      totalHours: parseFloat(totalHours.toFixed(2)),
      avgHoursPerDay: parseFloat(avgHoursPerDay)
    })
  } catch (error) {
    logger.error('Get reminder stats error:', error)
    res.status(500).json({ error: '获取提醒统计失败' })
  }
})

// 手动触发提醒（测试用）
router.post('/test', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // 检查今天是否已提交日报
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayReport = await prisma.dailyReport.findFirst({
      where: {
        userId: req.user!.id,
        reportDate: {
          gte: today,
          lt: tomorrow
        }
      }
    })

    if (todayReport) {
      res.json({
        message: '今天已提交日报，无需提醒',
        submitted: true
      })
    } else {
      res.json({
        message: '今天还未提交日报，请及时提交',
        submitted: false,
        reminderTime: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Test reminder error:', error)
    res.status(500).json({ error: '测试提醒失败' })
  }
})

export default router
