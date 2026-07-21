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

// 工作日切分点：凌晨5点。5点前算昨天加班，5点后算今天
const DAY_BOUNDARY_HOUR = 5

/**
 * 获取打卡日期的起止范围（以凌晨5点为分界）
 * 例如：当前时间 7月22日 03:00 → 属于 7月21日 的打卡
 *       当前时间 7月22日 06:00 → 属于 7月22日 的打卡
 */
function getCheckInDayRange(now: dayjs.Dayjs) {
  if (now.hour() < DAY_BOUNDARY_HOUR) {
    // 凌晨5点前 → 属于昨天的打卡周期
    const day = now.subtract(1, 'day').startOf('day').add(DAY_BOUNDARY_HOUR, 'hour')
    return {
      start: day.toDate(),
      end: day.add(1, 'day').toDate(),
      checkInDate: now.subtract(1, 'day').startOf('day').toDate()
    }
  } else {
    // 凌晨5点后 → 属于今天的打卡周期
    const day = now.startOf('day').add(DAY_BOUNDARY_HOUR, 'hour')
    return {
      start: day.toDate(),
      end: day.add(1, 'day').toDate(),
      checkInDate: now.startOf('day').toDate()
    }
  }
}

// 获取打卡记录（支持按月查询）
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { month } = req.query
    const userId = req.user!.id

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
      orderBy: { checkInTime: 'asc' }
    })

    // 按日期分组，取每天最早上班和最晚下班
    const dailyMap = new Map<string, { morning?: any; evening?: any }>()
    for (const r of records) {
      const dateKey = dayjs(r.checkInDate).format('YYYY-MM-DD')
      if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, {})
      const day = dailyMap.get(dateKey)!
      if (r.period === 'MORNING') {
        if (!day.morning || dayjs(r.checkInTime).isBefore(dayjs(day.morning.checkInTime))) {
          day.morning = r
        }
      } else {
        if (!day.evening || dayjs(r.checkInTime).isAfter(dayjs(day.evening.checkInTime))) {
          day.evening = r
        }
      }
    }

    // 统计
    const normal = records.filter(r => r.type === 'NORMAL').length
    const auto = records.filter(r => r.type === 'AUTO').length
    const makeup = records.filter(r => r.type === 'MAKEUP').length

    const makeupCount = await prisma.dailyCheckIn.count({
      where: {
        userId,
        type: 'MAKEUP',
        checkInDate: { gte: startDate, lte: endDate }
      }
    })

    res.json({
      records,
      dailySummary: Array.from(dailyMap.entries()).map(([date, d]) => ({
        date,
        morning: d.morning,
        evening: d.evening,
        morningCount: records.filter(r => dayjs(r.checkInDate).format('YYYY-MM-DD') === date && r.period === 'MORNING').length,
        eveningCount: records.filter(r => dayjs(r.checkInDate).format('YYYY-MM-DD') === date && r.period === 'EVENING').length,
      })),
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
    const now = dayjs()
    const range = getCheckInDayRange(now)

    // 查询当前打卡周期内所有记录
    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        checkInTime: { gte: range.start, lt: range.end }
      },
      include: {
        trip: { select: { id: true, title: true, destination: true } }
      },
      orderBy: { checkInTime: 'asc' }
    })

    // 早上取第一次打卡，晚上取最后一次打卡
    const morningRecords = records.filter(r => r.period === 'MORNING')
    const eveningRecords = records.filter(r => r.period === 'EVENING')

    const morningRecord = morningRecords.length > 0 ? morningRecords[0] : null // 最早
    const eveningRecord = eveningRecords.length > 0 ? eveningRecords[eveningRecords.length - 1] : null // 最晚

    // 检查当前打卡日期是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        startDate: { lte: range.checkInDate },
        endDate: { gte: range.checkInDate }
      },
      select: { id: true, title: true, destination: true }
    })

    res.json({
      morningCheckedIn: !!morningRecord,
      eveningCheckedIn: !!eveningRecord,
      morningRecord,
      eveningRecord,
      morningCount: morningRecords.length,
      eveningCount: eveningRecords.length,
      allRecords: records,
      checkInDate: range.checkInDate,
      onBusinessTrip: !!activeTrip,
      activeTrip
    })
  } catch (error) {
    logger.error('Get today check-in error:', error)
    res.status(500).json({ error: '获取今日打卡状态失败' })
  }
})

// 打卡（允许多次打卡，早上取最早，晚上取最晚）
router.post('/', authenticateToken, logOperation('打卡管理', 'CHECKIN'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { period = 'MORNING' } = req.body
    const now = dayjs()
    const range = getCheckInDayRange(now)

    // 检查是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        startDate: { lte: range.checkInDate },
        endDate: { gte: range.checkInDate }
      }
    })

    // 根据时间自动判断打卡类型
    let checkInType = 'NORMAL'
    if (activeTrip) {
      checkInType = 'AUTO'
    } else {
      const hour = now.hour()
      const minute = now.minute()
      const currentTime = hour * 60 + minute

      if (period === 'MORNING') {
        // 上班打卡：9:00前正常，9:00后迟到
        const workStart = 9 * 60
        if (currentTime > workStart) {
          checkInType = 'LATE'
        }
      } else if (period === 'EVENING') {
        // 下班打卡：17:30后正常，17:30前早退
        const workEnd = 17 * 60 + 30
        if (currentTime < workEnd) {
          checkInType = 'EARLY_LEAVE'
        }
      }
    }

    const record = await prisma.dailyCheckIn.create({
      data: {
        userId,
        checkInDate: range.checkInDate,
        checkInTime: now.toDate(),
        period: period as any,
        type: checkInType as any,
        tripId: activeTrip?.id || null,
        location: activeTrip ? `出差: ${activeTrip.destination}` : '办公室'
      }
    })

    // 判断是否覆盖了之前的记录
    const existingRecords = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        checkInTime: { gte: range.start, lt: range.end },
        period: period as any
      },
      orderBy: { checkInTime: 'asc' }
    })

    let isUpdate = false
    if (period === 'MORNING' && existingRecords.length > 1) {
      // 早上多次打卡，只有最早的有效
      isUpdate = record.id !== existingRecords[0].id
    } else if (period === 'EVENING' && existingRecords.length > 1) {
      // 晚上多次打卡，只有最晚的有效
      isUpdate = record.id !== existingRecords[existingRecords.length - 1].id
    }

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
      trip: activeTrip ? { id: activeTrip.id, title: activeTrip.title, destination: activeTrip.destination } : null,
      morningCount: existingRecords.length,
      isEffective: !isUpdate || existingRecords.length === 1,
      message: isUpdate && existingRecords.length > 1
        ? (period === 'MORNING' ? '已记录，以最早打卡为准' : '已记录，以最晚打卡为准')
        : '打卡成功'
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

    if (targetDate.isAfter(today)) {
      return res.status(400).json({ error: '不能补未来的卡' })
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
        checkInTime: targetDate.hour(9).minute(0).toDate(),
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

    // 按日期分组统计出勤天数（每天有任意打卡记录即算出勤）
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

// 计算工作日天数
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
