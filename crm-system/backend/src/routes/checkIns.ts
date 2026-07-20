import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import dayjs from 'dayjs'

const router = Router()
const prisma = new PrismaClient()

// 每月补卡次数限制
const MAX_MAKEUP_PER_MONTH = 3

// 获取打卡记录（支持按月查询）
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { month } = req.query
    const userId = req.user!.id

    // 默认查询当月
    const targetMonth = month ? dayjs(month as string) : dayjs()
    const startDate = targetMonth.startOf('month').toDate()
    const endDate = targetMonth.endOf('month').toDate()

    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        checkInDate: { gte: startDate, lte: endDate }
      },
      include: {
        trip: { select: { id: true, title: true, destination: true } }
      },
      orderBy: { checkInDate: 'asc' }
    })

    // 统计
    const normal = records.filter(r => r.type === 'NORMAL').length
    const auto = records.filter(r => r.type === 'AUTO').length
    const makeup = records.filter(r => r.type === 'MAKEUP').length

    // 本月补卡次数
    const makeupCount = await prisma.dailyCheckIn.count({
      where: {
        userId,
        type: 'MAKEUP',
        checkInDate: { gte: startDate, lte: endDate }
      }
    })

    res.json({
      records,
      stats: {
        total: records.length,
        normal,
        auto,
        makeup,
        makeupRemaining: MAX_MAKEUP_PER_MONTH - makeupCount,
        workdaysInMonth: getWorkdaysCount(targetMonth)
      }
    })
  } catch (error) {
    logger.error('Get check-ins error:', error)
    res.status(500).json({ error: '获取打卡记录失败' })
  }
})

// 今日打卡状态
router.get('/today', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const today = dayjs().startOf('day').toDate()
    const tomorrow = dayjs().add(1, 'day').startOf('day').toDate()

    // 查询今日所有打卡记录（上班和下班）
    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        checkInDate: { gte: today, lt: tomorrow }
      },
      include: {
        trip: { select: { id: true, title: true, destination: true } }
      }
    })

    const morningRecord = records.find(r => r.period === 'MORNING')
    const eveningRecord = records.find(r => r.period === 'EVENING')

    // 检查今日是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        OR: [
          { startDate: { lte: today }, endDate: { gte: today } }
        ]
      },
      select: { id: true, title: true, destination: true }
    })

    res.json({
      morningCheckedIn: !!morningRecord,
      eveningCheckedIn: !!eveningRecord,
      morningRecord,
      eveningRecord,
      onBusinessTrip: !!activeTrip,
      activeTrip
    })
  } catch (error) {
    logger.error('Get today check-in error:', error)
    res.status(500).json({ error: '获取今日打卡状态失败' })
  }
})

// 打卡
router.post('/', authenticateToken, logOperation('打卡管理', 'CHECKIN'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { period = 'MORNING' } = req.body // 默认上班打卡
    const now = dayjs()
    const today = now.startOf('day').toDate()
    const tomorrow = now.add(1, 'day').startOf('day').toDate()

    // 检查该时段是否已打卡
    const existing = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        checkInDate: { gte: today, lt: tomorrow },
        period: period as any
      }
    })

    if (existing) {
      return res.status(400).json({ error: period === 'MORNING' ? '今日已上班打卡' : '今日已下班打卡' })
    }

    // 检查是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        OR: [
          { startDate: { lte: today }, endDate: { gte: today } }
        ]
      }
    })

    // 根据时间自动判断打卡类型
    let checkInType = 'NORMAL'
    if (activeTrip) {
      checkInType = 'AUTO'
    } else {
      const hour = now.hour()
      const minute = now.minute()
      const currentTime = hour * 60 + minute // 转换为分钟数便于比较

      if (period === 'MORNING') {
        // 上班打卡：9:00前正常，9:00后迟到
        const workStart = 9 * 60 // 9:00 = 540分钟
        if (currentTime > workStart) {
          checkInType = 'LATE'
        }
      } else if (period === 'EVENING') {
        // 下班打卡：17:30后正常，17:30前早退
        const workEnd = 17 * 60 + 30 // 17:30 = 1050分钟
        if (currentTime < workEnd) {
          checkInType = 'EARLY_LEAVE'
        }
      }
    }

    const record = await prisma.dailyCheckIn.create({
      data: {
        userId,
        checkInDate: today,
        checkInTime: now.toDate(),
        period: period as any,
        type: checkInType as any,
        tripId: activeTrip?.id || null,
        location: activeTrip ? `出差: ${activeTrip.destination}` : '办公室'
      }
    })

    // 返回打卡类型信息
    const typeLabels: Record<string, string> = {
      NORMAL: '正常',
      LATE: '迟到',
      EARLY_LEAVE: '早退',
      AUTO: '出差',
      MAKEUP: '补卡'
    }

    res.status(201).json({
      ...record,
      typeLabel: typeLabels[checkInType],
      trip: activeTrip ? { id: activeTrip.id, title: activeTrip.title, destination: activeTrip.destination } : null
    })
  } catch (error) {
    logger.error('Check-in error:', error)
    res.status(500).json({ error: '打卡失败' })
  }
})

// 补卡
router.post('/makeup', authenticateToken, logOperation('打卡管理', 'MAKEUP'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { date, notes } = req.body

    if (!date) {
      return res.status(400).json({ error: '请选择补卡日期' })
    }

    const targetDate = dayjs(date).startOf('day')
    const today = dayjs().startOf('day')

    // 不能补未来的卡
    if (targetDate.isAfter(today)) {
      return res.status(400).json({ error: '不能补未来的卡' })
    }

    // 检查该日期是否已有打卡记录
    const tomorrow = targetDate.add(1, 'day').toDate()
    const existing = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        checkInDate: { gte: targetDate.toDate(), lt: tomorrow }
      }
    })

    if (existing) {
      return res.status(400).json({ error: '该日期已有打卡记录' })
    }

    // 检查本月补卡次数
    const monthStart = targetDate.startOf('month').toDate()
    const monthEnd = targetDate.endOf('month').toDate()
    const makeupCount = await prisma.dailyCheckIn.count({
      where: {
        userId,
        type: 'MAKEUP',
        checkInDate: { gte: monthStart, lte: monthEnd }
      }
    })

    if (makeupCount >= MAX_MAKEUP_PER_MONTH) {
      return res.status(400).json({ error: `本月补卡次数已用完（${MAX_MAKEUP_PER_MONTH}次/月）` })
    }

    const record = await prisma.dailyCheckIn.create({
      data: {
        userId,
        checkInDate: targetDate.toDate(),
        checkInTime: targetDate.hour(9).minute(0).toDate(), // 默认补卡时间为 9:00
        type: 'MAKEUP',
        location: '补卡',
        notes: notes || '补卡'
      }
    })

    res.status(201).json({
      ...record,
      makeupRemaining: MAX_MAKEUP_PER_MONTH - makeupCount - 1
    })
  } catch (error) {
    logger.error('Makeup check-in error:', error)
    res.status(500).json({ error: '补卡失败' })
  }
})

// 获取打卡统计
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { month } = req.query

    const targetMonth = month ? dayjs(month as string) : dayjs()
    const startDate = targetMonth.startOf('month').toDate()
    const endDate = targetMonth.endOf('month').toDate()

    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        checkInDate: { gte: startDate, lte: endDate }
      }
    })

    // 按日期分组，统计有打卡的天数
    const uniqueDates = new Set(records.map(r => dayjs(r.checkInDate).format('YYYY-MM-DD')))
    const attendance = uniqueDates.size

    const normal = records.filter(r => r.type === 'NORMAL').length
    const auto = records.filter(r => r.type === 'AUTO').length
    const makeup = records.filter(r => r.type === 'MAKEUP').length
    const workdays = getWorkdaysCount(targetMonth)

    res.json({
      total: records.length,
      normal,
      auto,
      makeup,
      workdays,
      attendance,
      attendanceRate: workdays > 0 ? Math.round((attendance / workdays) * 100) : 0,
      makeupRemaining: MAX_MAKEUP_PER_MONTH - makeup
    })
  } catch (error) {
    logger.error('Get check-in stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 计算工作日天数（简单计算：周一到周五）
function getWorkdaysCount(month: dayjs.Dayjs): number {
  const start = month.startOf('month')
  const end = month.endOf('month')
  let count = 0
  let current = start

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dayOfWeek = current.day()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
    current = current.add(1, 'day')
  }
  return count
}

export default router
