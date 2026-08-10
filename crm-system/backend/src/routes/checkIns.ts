import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const router = Router()
const prisma = new PrismaClient()

// 序列化打卡记录：确保时间字段带有明确的 UTC 标记（"Z"后缀），
// 避免前端因缺少时区信息而把 UTC 时间误当本地时间显示
function serializeCheckIn(record: any) {
  if (!record) return record
  return {
    ...record,
    checkInTime: record.checkInTime ? dayjs(record.checkInTime).utc().toISOString() : record.checkInTime,
    checkInDate: record.checkInDate ? dayjs(record.checkInDate).utc().format('YYYY-MM-DD') + 'T00:00:00.000Z' : record.checkInDate,
  }
}

// 每月补卡次数限制
const MAX_MAKEUP_PER_MONTH = 1

// 通宵加班阈值：加班结束时间超过凌晨 2 点算通宵
const OVERNIGHT_OVERTIME_HOUR = 2

// 通宵加班后第二天弹性上班时间：10:00 前不算迟到
const NEXT_DAY_FLEXIBLE_HOUR = 10

// 工作日切分点：凌晨 5 点（UTC+8）。5 点前算昨天加班，5 点后算今天
const DAY_BOUNDARY_HOUR = 5
const UTC_OFFSET = 8 // UTC+8（中国标准时间）

/**
 * 获取 UTC+8 本地时间
 * 无论服务器在什么时区，都返回用户视角的本地时间
 */
function getUTC8Local(now: dayjs.Dayjs): dayjs.Dayjs {
  return dayjs(now.valueOf()).utc().add(UTC_OFFSET, 'hour')
}

/**
 * 获取打卡日期的起止范围（以 UTC+8 凌晨 5 点为分界）
 * 所有边界计算基于 UTC+8 时区
 * 例如：当前 UTC+8 时间 7 月 22 日 03:00 → 属于 7 月 21 日 的打卡
 *       当前 UTC+8 时间 7 月 22 日 06:00 → 属于 7 月 22 日 的打卡
 */
function getCheckInDayRange(now: dayjs.Dayjs) {
  const localNow = getUTC8Local(now)
  const localHour = localNow.hour()

  let checkInDate: dayjs.Dayjs
  if (localHour < DAY_BOUNDARY_HOUR) {
    // UTC+8 凌晨 5 点前 → 属于昨天的打卡周期
    checkInDate = localNow.subtract(1, 'day').startOf('day')
  } else {
    // UTC+8 凌晨 5 点后 → 属于今天的打卡周期
    checkInDate = localNow.startOf('day')
  }

  // 构建时间范围（转换为 UTC 存储）
  const start = checkInDate.add(DAY_BOUNDARY_HOUR, 'hour').subtract(UTC_OFFSET, 'hour') // UTC+8 5AM → UTC 上一天 21:00
  const end = start.add(1, 'day')

  return {
    start: start.toDate(),
    end: end.toDate(),
    checkInDate: checkInDate.toDate() // UTC+8 当天 00:00 的 Date 对象
  }
}

/**
 * 计算工作日天数（排除周末和法定节假日）
 */
async function getWorkdaysCount(month: dayjs.Dayjs): Promise<number> {
  const start = month.startOf('month')
  const end = month.endOf('month')
  
  // 查询该月的所有节假日
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: start.toDate(),
        lte: end.toDate()
      },
      isWorkday: false
    }
  })
  
  const holidayDates = new Set(holidays.map((h: any) => dayjs(h.date).format('YYYY-MM-DD')))
  
  let count = 0
  let current = start

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dayOfWeek = current.day()
    const dateStr = current.format('YYYY-MM-DD')
    
    // 排除周末（周六=6，周日=0）和法定节假日
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
      count++
    }
    current = current.add(1, 'day')
  }
  return count
}

/**
 * 判断是否为节假日或周末
 */
async function isHolidayOrWeekend(date: dayjs.Dayjs): Promise<boolean> {
  const dayOfWeek = date.day()
  if (dayOfWeek === 0 || dayOfWeek === 6) return true
  
  const holiday = await prisma.holiday.findFirst({
    where: {
      date: date.startOf('day').toDate(),
      isWorkday: false
    }
  })
  
  return !!holiday
}

// 获取打卡记录（支持按月查询）
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { month } = req.query
    const userId = req.user!.id

    const targetMonth = month ? dayjs.utc(month as string) : dayjs.utc()
    const startDate = targetMonth.startOf('month').toDate()
    const endDate = targetMonth.endOf('month').toDate()

    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        deletedAt: null,
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
      const dateKey = dayjs.utc(r.checkInDate).format('YYYY-MM-DD')
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
        deletedAt: null,
        type: 'MAKEUP',
        checkInDate: { gte: startDate, lte: endDate }
      }
    })

    const workdaysInMonth = await getWorkdaysCount(targetMonth)

    res.json({
      records: records.map(serializeCheckIn),
      dailySummary: Array.from(dailyMap.entries()).map(([date, d]) => ({
        date,
        morning: serializeCheckIn(d.morning),
        evening: serializeCheckIn(d.evening),
        morningCount: records.filter(r => dayjs(r.checkInDate).format('YYYY-MM-DD') === date && r.period === 'MORNING').length,
        eveningCount: records.filter(r => dayjs(r.checkInDate).format('YYYY-MM-DD') === date && r.period === 'EVENING').length,
      })),
      stats: {
        total: records.length,
        normal,
        auto,
        makeup,
        makeupRemaining: MAX_MAKEUP_PER_MONTH - makeupCount,
        workdaysInMonth
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
        deletedAt: null,
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

    // 检查昨天是否通宵加班(用于今天的弹性上班判断)
    const yesterday = range.checkInDate
    const yesterdayRange = {
      start: new Date(yesterday.getTime() - 24 * 60 * 60 * 1000),
      end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000)
    }
    
    const yesterdayRecords = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        deletedAt: null,
        checkInDate: yesterday,
        overtimeEndTime: { not: null }
      }
    })

    // 判断是否通宵加班(加班结束时间超过凌晨2点)
    let isOvernightOvertime = false
    let flexibleCheckInTime: Date | null = null
    if (yesterdayRecords.length > 0) {
      const overtimeRecord = yesterdayRecords[0]
      if (overtimeRecord.overtimeEndTime) {
        const overtimeEnd = dayjs(overtimeRecord.overtimeEndTime).tz('Asia/Shanghai')
        const endHour = overtimeEnd.hour()
        
        // 如果加班结束时间在凌晨2点之后,算通宵加班
        if (endHour >= OVERNIGHT_OVERTIME_HOUR && endHour < 12) {
          isOvernightOvertime = true
          // 设置弹性上班时间(10:00前不算迟到)
          const flexibleDate = dayjs(range.checkInDate).tz('Asia/Shanghai').hour(NEXT_DAY_FLEXIBLE_HOUR).minute(0).second(0)
          flexibleCheckInTime = flexibleDate.toDate()
        }
      }
    }

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
      morningRecord: serializeCheckIn(morningRecord),
      eveningRecord: serializeCheckIn(eveningRecord),
      morningCount: morningRecords.length,
      eveningCount: eveningRecords.length,
      allRecords: records.map(serializeCheckIn),
      checkInDate: dayjs(range.checkInDate).utc().startOf('day').toISOString(),
      onBusinessTrip: !!activeTrip,
      activeTrip,
      // 加班相关
      isOvernightOvertime, // 昨天是否通宵加班
      flexibleCheckInTime: flexibleCheckInTime ? dayjs(flexibleCheckInTime).utc().toISOString() : null, // 弹性上班时间
      overtimeRecord: records.find(r => r.overtimeStartTime) ? {
        startTime: records.find(r => r.overtimeStartTime)?.overtimeStartTime,
        endTime: records.find(r => r.overtimeEndTime)?.overtimeEndTime,
        isOvernight: records.find(r => r.isOvernightOvertime)?.isOvernightOvertime
      } : null
    })
  } catch (error) {
    logger.error('Get today check-in error:', error)
    res.status(500).json({ error: '获取今日打卡状态失败' })
  }
})

// 打卡（自动判断上下班，前端不需要传 period）
router.post('/', authenticateToken, checkPermission('attendance:checkin:write'), logOperation('打卡管理', 'CHECKIN'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const now = dayjs()
    const range = getCheckInDayRange(now)

    // 自动判断时段：根据 UTC+8 本地时间
    const localNow = getUTC8Local(now)
    const localHour = localNow.hour()
    const localMinute = localNow.minute()
    const localTime = localHour * 60 + localMinute // UTC+8 的分钟数
    const period = localHour < 12 ? 'MORNING' : 'EVENING'

    // 检查是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        startDate: { lte: range.checkInDate },
        endDate: { gte: range.checkInDate }
      },
      select: {
        id: true,
        title: true,
        destination: true
      }
    })

    // 根据弹性工作制规则判断打卡类型
    let checkInType = 'NORMAL'
    if (activeTrip) {
      checkInType = 'AUTO'
    } else {
      // 查询当天早上打卡记录（用于判断晚上是否早退）
      const existingMorningRecord = await prisma.dailyCheckIn.findFirst({
        where: {
          userId,
          deletedAt: null,
          checkInDate: range.checkInDate,
          period: 'MORNING'
        },
        orderBy: { checkInTime: 'asc' }
      })

      // 查询昨天是否有通宵加班记录（用于弹性上班判断）
      const yesterday = dayjs(range.checkInDate).subtract(1, 'day')
      const overnightOvertimeRecord = await prisma.dailyCheckIn.findFirst({
        where: {
          userId,
          deletedAt: null,
          checkInDate: yesterday.toDate(),
          isOvernightOvertime: true
        }
      })

      if (period === 'MORNING') {
        // 上班打卡：8:30-9:00 正常，9:00 后迟到
        // 如果昨天通宵加班，10:00 前不算迟到
        const workStart = overnightOvertimeRecord ? NEXT_DAY_FLEXIBLE_HOUR * 60 : 9 * 60
        if (localTime > workStart) {
          checkInType = 'LATE'
        }
      } else if (period === 'EVENING') {
        // 下班打卡：根据早上打卡时间判断是否早退
        // 规则：晚上打卡时间 >= 早上打卡时间 + 9 小时
        if (existingMorningRecord) {
          const morningTime = dayjs(existingMorningRecord.checkInTime)
          const requiredEveningTime = morningTime.add(9, 'hour')
          const currentEveningTime = localNow.hour() * 60 + localNow.minute()
          const requiredEveningMinutes = requiredEveningTime.hour() * 60 + requiredEveningTime.minute()
          
          if (currentEveningTime < requiredEveningMinutes) {
            checkInType = 'EARLY_LEAVE'
          }
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
        deletedAt: null,
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
      ...serializeCheckIn(record),
      typeLabel: typeLabels[checkInType],
      trip: activeTrip ? { id: activeTrip.id, title: activeTrip.title, destination: activeTrip.destination } : null,
      morningCount: existingRecords.length,
      isEffective: !isUpdate || existingRecords.length === 1,
      message: isUpdate && existingRecords.length > 1
        ? (period === 'MORNING' ? '已记录，以最早打卡为准' : '已记录，以最晚打卡为准')
        : '打卡成功'
    })
  } catch (error: any) {
    logger.error('Check-in error:', error?.message || error, JSON.stringify(error, Object.getOwnPropertyNames(error)))
    res.status(500).json({ error: error?.message || '打卡失败' })
  }
})

// 加班打卡：开始加班
router.post('/overtime/start', authenticateToken, checkPermission('attendance:checkin:write'), logOperation('打卡管理', 'OVERTIME_START'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const now = dayjs()
    const range = getCheckInDayRange(now)

    // 检查是否已下班（必须先下班才能开始加班）
    const eveningRecord = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        deletedAt: null,
        checkInDate: range.checkInDate,
        period: 'EVENING'
      },
      orderBy: { checkInTime: 'desc' }
    })

    if (!eveningRecord) {
      return res.status(400).json({ error: '请先进行下班打卡，再开始加班' })
    }

    // 检查今天是否已开始过加班
    const existingOvertime = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        deletedAt: null,
        checkInDate: range.checkInDate,
        overtimeStartTime: { not: null }
      }
    })

    if (existingOvertime) {
      return res.status(400).json({ error: '今天已开始过加班，请使用"结束加班"按钮' })
    }

    // 更新最新的下班记录，设置加班开始时间
    await prisma.dailyCheckIn.update({
      where: { id: eveningRecord.id },
      data: {
        overtimeStartTime: now.toDate()
      }
    })

    res.json({
      message: '加班打卡成功',
      overtimeStartTime: now.toISOString(),
      isOvernight: false
    })
  } catch (error: any) {
    logger.error('加班打卡失败:', error)
    res.status(500).json({ error: error?.message || '加班打卡失败' })
  }
})

// 加班打卡：结束加班
router.post('/overtime/end', authenticateToken, checkPermission('attendance:checkin:write'), logOperation('打卡管理', 'OVERTIME_END'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const now = dayjs()

    // 查找今天的加班记录
    const today = dayjs().tz('Asia/Shanghai').startOf('day')
    const overtimeRecord = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        deletedAt: null,
        overtimeStartTime: { not: null },
        overtimeEndTime: null,
        checkInDate: today.toDate()
      }
    })

    if (!overtimeRecord) {
      // 也查一下昨天凌晨5点前的加班（跨天加班）
      const yesterday = dayjs().tz('Asia/Shanghai').subtract(1, 'day').startOf('day')
      const yesterdayOvertime = await prisma.dailyCheckIn.findFirst({
        where: {
          userId,
          deletedAt: null,
          overtimeStartTime: { not: null },
          overtimeEndTime: null,
          checkInDate: yesterday.toDate()
        }
      })

      if (!yesterdayOvertime) {
        return res.status(400).json({ error: '没有找到加班记录，请先开始加班' })
      }

      // 更新昨天的加班记录
      const isOvernight = true
      await prisma.dailyCheckIn.update({
        where: { id: yesterdayOvertime.id },
        data: {
          overtimeEndTime: now.toDate(),
          isOvernightOvertime: isOvernight
        }
      })

      // 计算加班时长
      const startTime = dayjs(yesterdayOvertime.overtimeStartTime)
      const endTime = now
      const durationHours = endTime.diff(startTime, 'hour', true)
      const durationMinutes = Math.round(durationHours * 60)

      res.json({
        message: '加班结束打卡成功',
        overtimeStartTime: yesterdayOvertime.overtimeStartTime,
        overtimeEndTime: now.toISOString(),
        isOvernight,
        duration: `${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`,
        nextDayFlexible: isOvernight, // 通宵加班，第二天可弹性上班
        nextDayFlexibleTime: isOvernight ? `${NEXT_DAY_FLEXIBLE_HOUR}:00` : null
      })
      return
    }

    // 判断是否通宵加班（加班结束时间 >= 凌晨2点）
    const localNow = getUTC8Local(now)
    const endHour = localNow.hour()
    const isOvernight = endHour >= OVERNIGHT_OVERTIME_HOUR && endHour < 12 // 凌晨2点到中午12点之间算通宵

    await prisma.dailyCheckIn.update({
      where: { id: overtimeRecord.id },
      data: {
        overtimeEndTime: now.toDate(),
        isOvernightOvertime: isOvernight
      }
    })

    // 计算加班时长
    const startTime = dayjs(overtimeRecord.overtimeStartTime)
    const endTime = now
    const durationHours = endTime.diff(startTime, 'hour', true)
    const durationMinutes = Math.round(durationHours * 60)

    res.json({
      message: '加班结束打卡成功',
      overtimeStartTime: overtimeRecord.overtimeStartTime,
      overtimeEndTime: now.toISOString(),
      isOvernight,
      duration: `${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`,
      nextDayFlexible: isOvernight, // 通宵加班，第二天可弹性上班
      nextDayFlexibleTime: isOvernight ? `${NEXT_DAY_FLEXIBLE_HOUR}:00` : null
    })
  } catch (error: any) {
    logger.error('结束加班失败:', error)
    res.status(500).json({ error: error?.message || '结束加班失败' })
  }
})

// 补卡
router.post('/makeup', authenticateToken, checkPermission('attendance:checkin:write'), logOperation('打卡管理', 'MAKEUP'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { date, notes } = req.body

    if (!date) {
      return res.status(400).json({ error: '请选择补卡日期' })
    }

    // 使用 UTC+8 时区处理补卡日期
    const targetDate = dayjs(date).tz('Asia/Shanghai').startOf('day')
    const today = dayjs().tz('Asia/Shanghai').startOf('day')

    if (targetDate.isAfter(today)) {
      return res.status(400).json({ error: '不能补未来的卡' })
    }

    // 检查是否为节假日或周末
    const isHoliday = await isHolidayOrWeekend(targetDate)
    if (isHoliday) {
      return res.status(400).json({ error: '节假日和周末不能补卡' })
    }

    // 检查本月补卡次数
    const monthStart = targetDate.startOf('month').toDate()
    const monthEnd = targetDate.endOf('month').toDate()
    const makeupCount = await prisma.dailyCheckIn.count({
      where: {
        userId,
        deletedAt: null,
        type: 'MAKEUP',
        checkInDate: { gte: monthStart, lte: monthEnd }
      }
    })

    if (makeupCount >= MAX_MAKEUP_PER_MONTH) {
      return res.status(400).json({ error: `本月补卡次数已用完（${MAX_MAKEUP_PER_MONTH}次/月）` })
    }

    // 补卡：设置早上 9:00 和晚上 18:00（UTC+8）
    const morningTime = targetDate.hour(9).minute(0).second(0)
    const eveningTime = targetDate.hour(18).minute(0).second(0)

    // 创建两条补卡记录（早上和晚上）
    const morningRecord = await prisma.dailyCheckIn.create({
      data: {
        userId,
        checkInDate: targetDate.toDate(),
        checkInTime: morningTime.toDate(),
        period: 'MORNING',
        type: 'MAKEUP',
        location: '补卡',
        notes: notes || '补卡'
      }
    })

    const eveningRecord = await prisma.dailyCheckIn.create({
      data: {
        userId,
        checkInDate: targetDate.toDate(),
        checkInTime: eveningTime.toDate(),
        period: 'EVENING',
        type: 'MAKEUP',
        location: '补卡',
        notes: notes || '补卡'
      }
    })

    res.status(201).json({
      morningRecord: serializeCheckIn(morningRecord),
      eveningRecord: serializeCheckIn(eveningRecord),
      makeupRemaining: MAX_MAKEUP_PER_MONTH - makeupCount
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

    const targetMonth = month ? dayjs.utc(month as string) : dayjs.utc()
    const startDate = targetMonth.startOf('month').toDate()
    const endDate = targetMonth.endOf('month').toDate()

    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        deletedAt: null,
        checkInDate: { gte: startDate, lte: endDate }
      }
    })

    // 按日期分组统计出勤天数（每天有任意打卡记录即算出勤）
    const uniqueDates = new Set(records.map((r: any) => dayjs(r.checkInDate).format('YYYY-MM-DD')))
    const attendance = uniqueDates.size

    const normal = records.filter(r => r.type === 'NORMAL').length
    const auto = records.filter(r => r.type === 'AUTO').length
    const makeup = records.filter(r => r.type === 'MAKEUP').length
    const workdays = await getWorkdaysCount(targetMonth)

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

// 获取节假日列表
router.get('/holidays', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { year } = req.query
    const targetYear = year ? parseInt(year as string) : dayjs().year()

    const holidays = await prisma.holiday.findMany({
      where: {
        year: targetYear
      },
      orderBy: {
        date: 'asc'
      }
    })

    res.json({
      holidays: holidays.map((h: any) => ({
        date: dayjs(h.date).format('YYYY-MM-DD'),
        name: h.name,
        isWorkday: h.isWorkday
      }))
    })
  } catch (error) {
    logger.error('Get holidays error:', error)
    res.status(500).json({ error: '获取节假日失败' })
  }
})

// 添加节假日（仅管理员）
router.post('/holidays', authenticateToken, checkPermission('attendance:holidays:write'), logOperation('打卡管理', 'HOLIDAY'), async (req: AuthRequest, res) => {
  try {
    const { date, name, isWorkday } = req.body

    if (!date || !name) {
      return res.status(400).json({ error: '日期和名称不能为空' })
    }

    const holidayDate = dayjs(date).tz('Asia/Shanghai').startOf('day').toDate()
    const year = dayjs(date).year()

    const holiday = await prisma.holiday.create({
      data: {
        date: holidayDate,
        name,
        year,
        isWorkday: isWorkday || false
      }
    })

    res.status(201).json({
      id: holiday.id,
      date: dayjs(holiday.date).format('YYYY-MM-DD'),
      name: holiday.name,
      isWorkday: holiday.isWorkday
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: '该日期已存在节假日记录' })
    }
    logger.error('Add holiday error:', error)
    res.status(500).json({ error: '添加节假日失败' })
  }
})

// 删除节假日（仅管理员）
router.delete('/holidays/:id', authenticateToken, checkPermission('attendance:holidays:write'), logOperation('打卡管理', 'HOLIDAY'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    await prisma.holiday.delete({
      where: {
        id: parseInt(id)
      }
    })

    res.json({ success: true })
  } catch (error) {
    logger.error('Delete holiday error:', error)
    res.status(500).json({ error: '删除节假日失败' })
  }
})

export default router
