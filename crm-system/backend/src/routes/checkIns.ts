import prisma from '../lib/prisma'
import { Router } from 'express'
import { authenticateToken, AuthRequest, checkPermission, checkAdmin } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const router = Router()

// 序列化打卡记录：确保时间字段带有明确的 UTC 标记（"Z"后缀），
// 避免前端因缺少时区信息而把 UTC 时间误当本地时间显示
function serializeCheckIn(record: any) {
  if (!record) return record
  return {
    ...record,
    checkInTime: record.checkInTime ? dayjs(record.checkInTime).utc().toISOString() : record.checkInTime,
    checkInDate: record.checkInDate ? dayjs(record.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD') + 'T00:00:00.000Z' : record.checkInDate,
  }
}

// 每月补卡次数限制
const MAX_MAKEUP_PER_MONTH = 1

// 通宵加班阈值：加班结束时间超过凌晨 2 点算通宵
const OVERNIGHT_OVERTIME_HOUR = 2

// 通宵加班后第二天弹性上班时间：10:00 前不算迟到
const NEXT_DAY_FLEXIBLE_HOUR = 10

// 考勤统计不展示测试账号：test 前缀用户名均为开发/联调测试账号
// （testadmin/testuser/testapprover 及手工建的 test*），真实员工为拼音实名。
// 今日出勤与月度统计两处统一排除，避免测试账号混入考勤报表。
const ATTENDANCE_EXCLUDED_USERNAME_PREFIXES = ['test']

/** 考勤场景的用户查询条件：叠加部门过滤 + 排除测试账号 */
function attendanceUserWhere(extra: any = {}): any {
  return {
    ...extra,
    AND: [
      ...(extra.AND || []),
      ...ATTENDANCE_EXCLUDED_USERNAME_PREFIXES.map(p => ({ username: { not: { startsWith: p } } })),
    ],
  }
}

/**
 * 获取打卡日期的起止范围（以自然日 0 点为分界）
 * 凌晨 0 点后即新的一天，不再归属前一天
 * 例如：当前 UTC+8 时间 8月12日 01:00 → 属于 8月12日 的打卡
 *       当前 UTC+8 时间 8月12日 23:00 → 属于 8月12日 的打卡
 */
function getCheckInDayRange(now?: dayjs.Dayjs) {
  const localNow = (now || dayjs()).tz('Asia/Shanghai')
  const checkInDate = localNow.startOf('day')

  // 构建时间范围：从 checkInDate 当天 00:00 到次日 00:00
  const start = checkInDate
  const end = checkInDate.add(1, 'day')

  return {
    start: start.toDate(),
    end: end.toDate(),
    checkInDate: checkInDate.toDate() // UTC+8 当天 00:00 的 Date 对象
  }
}

/**
 * 计算工作日天数（排除周末和法定节假日；Holiday 表中 isWorkday=true 的
 * 调休上班日即使是周六日也按工作日计算）
 */
async function getWorkdaysCount(month: dayjs.Dayjs): Promise<number> {
  const start = month.startOf('month')
  const end = month.endOf('month')

  // 查询该月的所有节假日（含放假日与调休上班日）
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: start.toDate(),
        lte: end.toDate()
      }
    }
  })

  const holidayDates = new Set(
    holidays.filter((h: any) => !h.isWorkday).map((h: any) => dayjs(h.date).format('YYYY-MM-DD'))
  )
  const makeupWorkdayDates = new Set(
    holidays.filter((h: any) => h.isWorkday).map((h: any) => dayjs(h.date).format('YYYY-MM-DD'))
  )

  let count = 0
  let current = start

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dayOfWeek = current.day()
    const dateStr = current.format('YYYY-MM-DD')

    // 周末（周六=6，周日=0）：默认非工作日，但调休上班日（isWorkday=true）除外
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    if (makeupWorkdayDates.has(dateStr)) {
      count++
    } else if (!isWeekend && !holidayDates.has(dateStr)) {
      count++
    }
    current = current.add(1, 'day')
  }
  return count
}

/**
 * 统计从月初到指定日期（含）的工作日数量
 * 用于当前月份：只算已经过去的工作日，避免未来日期算成缺勤
 */
async function getWorkdaysUpTo(month: dayjs.Dayjs, upTo: dayjs.Dayjs): Promise<number> {
  const start = month.startOf('month')
  const end = upTo.isAfter(month.endOf('month')) ? month.endOf('month') : upTo.startOf('day')

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start.toDate(), lte: end.toDate() } }
  })
  const holidayDates = new Set(
    holidays.filter((h: any) => !h.isWorkday).map((h: any) => dayjs(h.date).format('YYYY-MM-DD'))
  )
  const makeupWorkdayDates = new Set(
    holidays.filter((h: any) => h.isWorkday).map((h: any) => dayjs(h.date).format('YYYY-MM-DD'))
  )

  let count = 0
  let current = start
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dow = current.day()
    const ds = current.format('YYYY-MM-DD')
    const isWeekend = dow === 0 || dow === 6
    if (makeupWorkdayDates.has(ds)) count++
    else if (!isWeekend && !holidayDates.has(ds)) count++
    current = current.add(1, 'day')
  }
  return count
}

/**
 * Holiday.date 是 @db.Date 列，Prisma 会把 DateTime 参数截断为 UTC 日历日期。
 * dayjs.tz 的 UTC+8 当天零点 instant 是前一天 16:00Z，直接传参等值查询会
 * 错查前一天（节假日全部错位一天），必须转成"当天 UTC 零点"再查。
 */
function holidayDateKey(date: dayjs.Dayjs): Date {
  return new Date(`${date.tz('Asia/Shanghai').format('YYYY-MM-DD')}T00:00:00Z`)
}

/**
 * 判断是否为节假日或周末（调休上班日除外：Holiday 表 isWorkday=true
 * 的周六日按工作日处理，允许补卡）
 */
async function isHolidayOrWeekend(date: dayjs.Dayjs): Promise<boolean> {
  const dayOfWeek = date.day()
  const dateKey = holidayDateKey(date)

  // 调休上班日：即使是周六日也算工作日
  const makeup = await prisma.holiday.findFirst({
    where: {
      date: dateKey,
      isWorkday: true
    }
  })
  if (makeup) return false

  if (dayOfWeek === 0 || dayOfWeek === 6) return true

  const holiday = await prisma.holiday.findFirst({
    where: {
      date: dateKey,
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

    const targetMonth = month ? dayjs.tz(month as string + '-01', 'Asia/Shanghai') : dayjs().tz('Asia/Shanghai')
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
      const dateKey = dayjs(r.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD')
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
    // P3 fix: 只统计MORNING的MAKEUP记录，避免重复计数（每次补卡创建早+晚两条）
    const makeup = records.filter(r => r.type === 'MAKEUP' && r.period === 'MORNING').length

    // 统计补卡次数：只统计MORNING记录，因为每次补卡创建早+晚两条记录
    const makeupCount = await prisma.dailyCheckIn.count({
      where: {
        userId,
        deletedAt: null,
        type: 'MAKEUP',
        period: 'MORNING', // 只统计早上的，避免重复计数
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
        morningCount: records.filter(r => dayjs(r.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD') === date && r.period === 'MORNING').length,
        eveningCount: records.filter(r => dayjs(r.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD') === date && r.period === 'EVENING').length,
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

    let morningRecord = morningRecords.length > 0 ? morningRecords[0] : null // 最早
    let eveningRecord = eveningRecords.length > 0 ? eveningRecords[eveningRecords.length - 1] : null // 最晚

    // 检查昨天是否通宵加班(用于今天的弹性上班判断)
    // 注意:必须查"昨天"(checkInDate = 今天-1天)。通宵加班的加班结束时间落在今天凌晨,
    // 但记录挂在昨天那条下班打卡上,由 /overtime/end 写入 isOvernightOvertime 标志。
    const yesterdayDate = new Date(range.checkInDate.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayOvertime = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        deletedAt: null,
        checkInDate: yesterdayDate,
        isOvernightOvertime: true
      }
    })

    const isOvernightOvertime = !!yesterdayOvertime
    let flexibleCheckInTime: Date | null = null
    if (isOvernightOvertime) {
      // 弹性上班时间(10:00前不算迟到)
      const flexibleDate = dayjs(range.checkInDate).tz('Asia/Shanghai').hour(NEXT_DAY_FLEXIBLE_HOUR).minute(0).second(0)
      flexibleCheckInTime = flexibleDate.toDate()
    }

    // 检查当前打卡日期是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        deletedAt: null,
        startDate: { lte: range.checkInDate },
        endDate: { gte: range.checkInDate }
      },
      select: { id: true, title: true, destination: true }
    })

    // P2 fix: 出差自动打卡 — 如果在出差期间且未打卡，自动创建 AUTO 类型记录
    if (activeTrip) {
      const localNow = now.tz('Asia/Shanghai')
      const localHour = localNow.hour()
      let needRefresh = false

      // 早上 9:00 后自动创建上班打卡
      if (!morningRecord && localHour >= 9) {
        const morningTime = new Date(range.checkInDate.getTime() + 9 * 60 * 60 * 1000) // 9:00 UTC+8
        await prisma.dailyCheckIn.create({
          data: {
            userId,
            checkInDate: range.checkInDate,
            checkInTime: morningTime,
            period: 'MORNING',
            type: 'AUTO',
            tripId: activeTrip.id,
            location: `出差: ${activeTrip.destination}`
          }
        })
        needRefresh = true
      }

      // 晚上 18:00 后自动创建下班打卡
      if (!eveningRecord && localHour >= 18) {
        const eveningTime = new Date(range.checkInDate.getTime() + 18 * 60 * 60 * 1000) // 18:00 UTC+8
        await prisma.dailyCheckIn.create({
          data: {
            userId,
            checkInDate: range.checkInDate,
            checkInTime: eveningTime,
            period: 'EVENING',
            type: 'AUTO',
            tripId: activeTrip.id,
            location: `出差: ${activeTrip.destination}`
          }
        })
        needRefresh = true
      }

      // 重新查询记录
      if (needRefresh) {
        const freshRecords = await prisma.dailyCheckIn.findMany({
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
        const freshMorning = freshRecords.filter(r => r.period === 'MORNING')
        const freshEvening = freshRecords.filter(r => r.period === 'EVENING')
        records.length = 0
        records.push(...freshRecords)
        morningRecords.length = 0
        morningRecords.push(...freshMorning)
        eveningRecords.length = 0
        eveningRecords.push(...freshEvening)
        morningRecord = morningRecords.length > 0 ? morningRecords[0] : null
        eveningRecord = eveningRecords.length > 0 ? eveningRecords[eveningRecords.length - 1] : null
      }
    }

    res.json({
      morningCheckedIn: !!morningRecord,
      eveningCheckedIn: !!eveningRecord,
      morningRecord: serializeCheckIn(morningRecord),
      eveningRecord: serializeCheckIn(eveningRecord),
      morningCount: morningRecords.length,
      eveningCount: eveningRecords.length,
      allRecords: records.map(serializeCheckIn),
      checkInDate: dayjs(range.checkInDate).tz('Asia/Shanghai').startOf('day').toISOString(),
      onBusinessTrip: !!activeTrip,
      activeTrip,
      // 今天是否为工作日（供前端展示"加班打卡"而非正常上下班文案）
      // 注意必须显式转到上海时区：range.checkInDate 是"上海零点"时刻(UTC 视角为前一天 16:00)，
      // 裸 dayjs() 按服务器本地时区解读，在 UTC 容器上会把周一判成周日 → 误显示"加班"
      isWorkdayToday: !(await isHolidayOrWeekend(dayjs(range.checkInDate).tz('Asia/Shanghai').startOf('day'))),
      // 加班相关
      isOvernightOvertime, // 昨天是否通宵加班
      flexibleCheckInTime: flexibleCheckInTime ? dayjs(flexibleCheckInTime).toISOString() : null, // 弹性上班时间
      overtimeRecord: await (async () => {
        // 先从今天的记录中查找
        const todayOvertime = records.find(r => r.overtimeStartTime)
        if (todayOvertime) {
          return {
            startTime: todayOvertime.overtimeStartTime,
            endTime: todayOvertime.overtimeEndTime,
            isOvernight: todayOvertime.isOvernightOvertime
          }
        }
        // 如果今天没有，查昨天是否有未结束的加班（跨天加班）
        const yesterdayDate = new Date(range.checkInDate.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayOvertime = await prisma.dailyCheckIn.findFirst({
          where: {
            userId,
            deletedAt: null,
            checkInDate: yesterdayDate,
            overtimeStartTime: { not: null },
            overtimeEndTime: null
          }
        })
        if (yesterdayOvertime) {
          return {
            startTime: yesterdayOvertime.overtimeStartTime,
            endTime: yesterdayOvertime.overtimeEndTime,
            isOvernight: yesterdayOvertime.isOvernightOvertime
          }
        }
        return null
      })()
    })
  } catch (error) {
    logger.error('Get today check-in error:', error)
    res.status(500).json({ error: '获取今日打卡状态失败' })
  }
})

// 打卡（自动判断上下班，前端不需要传 period）
router.post('/', authenticateToken, checkPermission('office:checkin:add'), logOperation('打卡管理', 'CHECKIN'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const now = dayjs()
    const range = getCheckInDayRange(now)

    // 自动判断时段：根据 UTC+8 本地时间
    const localNow = now.tz('Asia/Shanghai')
    const localHour = localNow.hour()
    const localMinute = localNow.minute()
    const localTime = localHour * 60 + localMinute // UTC+8 的分钟数
    const period = localHour < 12 ? 'MORNING' : 'EVENING'

    // 检查是否在出差
    const activeTrip = await prisma.businessTrip.findFirst({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        deletedAt: null,
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
    } else if (await isHolidayOrWeekend(localNow.startOf('day'))) {
      // 非工作日（周末且非调休上班日，或法定节假日）：记录为加班打卡，
      // 不做迟到/早退判断
      checkInType = 'OVERTIME'
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
      // 同样显式上海时区，避免 UTC 容器上"昨天"算错一天
      const yesterday = dayjs(range.checkInDate).tz('Asia/Shanghai').startOf('day').subtract(1, 'day')
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
          const morningTime = dayjs(existingMorningRecord.checkInTime).tz('Asia/Shanghai')
          const requiredEveningTime = morningTime.add(9, 'hour')
          const currentEveningTime = localNow.hour() * 60 + localNow.minute()
          const requiredEveningMinutes = requiredEveningTime.hour() * 60 + requiredEveningTime.minute()

          if (currentEveningTime < requiredEveningMinutes) {
            checkInType = 'EARLY_LEAVE'
          }
        }
      }
    }

    // P0 fix: 不再软删除旧记录，保留所有打卡记录
    // 早上取最早、晚上取最晚，由查询逻辑自动判断哪条有效

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
        checkInDate: range.checkInDate,
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
    logger.error('Check-in error:', error?.message || error)
    res.status(500).json({ error: error?.message || '打卡失败' })
  }
})

// 加班打卡：开始加班
router.post('/overtime/start', authenticateToken, checkPermission('office:checkin:add'), logOperation('打卡管理', 'OVERTIME_START'), async (req: AuthRequest, res) => {
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
    let existingOvertime = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        deletedAt: null,
        checkInDate: range.checkInDate,
        overtimeStartTime: { not: null }
      }
    })

    // 如果今天没有，也检查昨天是否有未结束的加班（跨天加班未结束）
    if (!existingOvertime) {
      const yesterdayDate = new Date(range.checkInDate.getTime() - 24 * 60 * 60 * 1000)
      existingOvertime = await prisma.dailyCheckIn.findFirst({
        where: {
          userId,
          deletedAt: null,
          checkInDate: yesterdayDate,
          overtimeStartTime: { not: null },
          overtimeEndTime: null
        }
      })
    }

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
router.post('/overtime/end', authenticateToken, checkPermission('office:checkin:add'), logOperation('打卡管理', 'OVERTIME_END'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const now = dayjs()

    // 查找今天的加班记录（使用与加班开始时相同的日期计算逻辑）
    const range = getCheckInDayRange(now)
    const overtimeRecord = await prisma.dailyCheckIn.findFirst({
      where: {
        userId,
        deletedAt: null,
        overtimeStartTime: { not: null },
        overtimeEndTime: null,
        checkInDate: range.checkInDate
      }
    })

    if (!overtimeRecord) {
      // 也查一下前一天的加班（跨天加班：昨天开始的加班今天才结束）
      const yesterdayDate = new Date(range.checkInDate.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayOvertime = await prisma.dailyCheckIn.findFirst({
        where: {
          userId,
          deletedAt: null,
          overtimeStartTime: { not: null },
          overtimeEndTime: null,
          checkInDate: yesterdayDate
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
    const localNow = now.tz('Asia/Shanghai')
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
router.post('/makeup', authenticateToken, checkPermission('office:checkin:add'), logOperation('打卡管理', 'MAKEUP'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { date, notes } = req.body

    if (!date) {
      return res.status(400).json({ error: '请选择补卡日期' })
    }

    // 使用 UTC+8 时区处理补卡日期
    const targetDate = dayjs.tz(date, 'Asia/Shanghai').startOf('day')
    const today = dayjs().tz('Asia/Shanghai').startOf('day')

    if (targetDate.isAfter(today)) {
      return res.status(400).json({ error: '不能补未来的卡' })
    }

    // 检查是否为节假日或周末
    const isHoliday = await isHolidayOrWeekend(targetDate)
    if (isHoliday) {
      return res.status(400).json({ error: '节假日和周末不能补卡' })
    }

    // 检查本月补卡次数：只统计MORNING记录，避免重复计数
    const monthStart = targetDate.startOf('month').toDate()
    const monthEnd = targetDate.endOf('month').toDate()
    const makeupCount = await prisma.dailyCheckIn.count({
      where: {
        userId,
        deletedAt: null,
        type: 'MAKEUP',
        period: 'MORNING', // 只统计早上的，因为每次补卡创建早+晚两条记录
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

    const targetMonth = month ? dayjs.tz(month as string + '-01', 'Asia/Shanghai') : dayjs().tz('Asia/Shanghai')
    const startDate = targetMonth.startOf('month').toDate()
    const endDate = targetMonth.endOf('month').toDate()

    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        deletedAt: null,
        checkInDate: { gte: startDate, lte: endDate }
      }
    })

    // 出勤口径：只算工作日（周末/节假日加班打卡不计出勤，避免出勤率超 100%）；
    // 当月统计截至昨天（今天还没过完：打了卡也不计，没打卡更不算缺勤）
    const nowSh = dayjs().tz('Asia/Shanghai')
    const isCurrentMonth = targetMonth.isSame(nowSh, 'month')
    const todayStr = nowSh.format('YYYY-MM-DD')
    const statsHolidays = await prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } }
    })
    const holidayWorkday = new Map(
      statsHolidays.map(h => [dayjs(h.date).tz('Asia/Shanghai').format('YYYY-MM-DD'), h.isWorkday])
    )
    const uniqueDates = new Set(records.map((r: any) => dayjs(r.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD')))
    const attendance = [...uniqueDates].filter(ds => {
      if (isCurrentMonth && ds >= todayStr) return false
      const makeupDay = holidayWorkday.get(ds)
      if (makeupDay !== undefined) return makeupDay
      const dow = dayjs.tz(ds, 'Asia/Shanghai').day()
      return dow !== 0 && dow !== 6
    }).length

    const normal = records.filter(r => r.type === 'NORMAL').length
    const auto = records.filter(r => r.type === 'AUTO').length
    // 只统计MORNING的MAKEUP记录，避免重复计数（每次补卡创建早+晚两条）
    const makeup = records.filter(r => r.type === 'MAKEUP' && r.period === 'MORNING').length
    const workdays = isCurrentMonth
      ? await getWorkdaysUpTo(targetMonth, nowSh.subtract(1, 'day'))
      : await getWorkdaysCount(targetMonth)

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
    const targetYear = year ? parseInt(year as string) : dayjs().tz('Asia/Shanghai').year()

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
        date: dayjs(h.date).tz('Asia/Shanghai').format('YYYY-MM-DD'),
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
router.post('/holidays', authenticateToken, checkAdmin, logOperation('打卡管理', 'HOLIDAY'), async (req: AuthRequest, res) => {
  try {
    const { date, name, isWorkday } = req.body

    if (!date || !name) {
      return res.status(400).json({ error: '日期和名称不能为空' })
    }

    // Holiday.date 是 @db.Date 列,Prisma 按 UTC 日历日期截断,
    // 上海零点 instant 会整体提前一天入库,必须用 UTC 零点构造
    const holidayDate = holidayDateKey(dayjs.tz(date, 'Asia/Shanghai'))
    const year = dayjs.tz(date, 'Asia/Shanghai').year()

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
      date: dayjs(holiday.date).tz('Asia/Shanghai').format('YYYY-MM-DD'),
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
router.delete('/holidays/:id', authenticateToken, checkAdmin, logOperation('打卡管理', 'HOLIDAY'), async (req: AuthRequest, res) => {
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

// ==================== 团队考勤统计 API ====================

/**
 * GET /api/check-ins/team-stats
 * 获取团队月度考勤统计
 * Query: ?month=YYYY-MM&departmentId=number
 */
router.get('/team-stats', authenticateToken, checkPermission('office:attendance:list'), async (req: AuthRequest, res) => {
  try {
    const { month, departmentId } = req.query

    const targetMonth = month
      ? dayjs.tz(month as string + '-01', 'Asia/Shanghai')
      : dayjs().tz('Asia/Shanghai')

    const startDate = targetMonth.startOf('month').toDate()
    const endDate = targetMonth.endOf('month').toDate()

    // 获取用户列表（可按部门过滤）
    const userWhere: any = attendanceUserWhere(
      departmentId ? { deptId: parseInt(departmentId as string) } : {}
    )

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        username: true,
        name: true,
        dept: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    })

    // 获取该月所有打卡记录
    const allRecords = await prisma.dailyCheckIn.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        deletedAt: null,
        checkInDate: { gte: startDate, lte: endDate }
      },
      orderBy: { checkInDate: 'asc' }
    })

    const workdaysInMonth = await getWorkdaysCount(targetMonth)

    // 当前月份只统计到今天的工作日，避免未来日期被算成缺勤
    const nowSh = dayjs().tz('Asia/Shanghai')
    const isCurrentMonth = targetMonth.isSame(nowSh, 'month')
    const effectiveWorkdays = isCurrentMonth
      ? await getWorkdaysUpTo(targetMonth, nowSh.subtract(1, 'day'))
      : workdaysInMonth

    // 节假日/调休（用于逐个工作日判断）
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } }
    })
    const holidayMap = new Map(
      holidays.map(h => [dayjs(h.date).tz('Asia/Shanghai').format('YYYY-MM-DD'), h])
    )
    // 截至昨天的工作日列表（当月）：今天还没过完，不计入出勤/缺勤统计
    const workdayKeys: string[] = []
    const todayStr = nowSh.format('YYYY-MM-DD')
    for (let i = 1; i <= targetMonth.daysInMonth(); i++) {
      const d = targetMonth.date(i)
      if (isCurrentMonth && !d.isBefore(nowSh, 'day')) break
      const h = holidayMap.get(d.format('YYYY-MM-DD'))
      const isWorkday = h ? h.isWorkday : (d.day() !== 0 && d.day() !== 6)
      if (isWorkday) workdayKeys.push(d.format('YYYY-MM-DD'))
    }

    // 已批准的出差（覆盖当月），用于抵扣无打卡记录的工作日
    const approvedTrips = await prisma.businessTrip.findMany({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      select: { ownerId: true, startDate: true, endDate: true }
    })

    // 为每个用户统计
    const teamStats = users.map(user => {
      const userRecords = allRecords.filter(r => r.userId === user.id)

      // 按日期分组
      const dailyMap = new Map<string, { morning?: any; evening?: any }>()
      for (const r of userRecords) {
        const dateKey = dayjs(r.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD')
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

      let attendanceDays = 0
      let lateDays = 0
      let earlyLeaveDays = 0
      let businessTripDays = 0
      let makeupDays = 0
      let incompleteDays = 0
      let totalOvertimeMinutes = 0

      for (const [key, dayData] of dailyMap.entries()) {
        const hasMorning = !!dayData.morning
        const hasEvening = !!dayData.evening

        // 出勤/缺勤口径：只算工作日（周末/节假日加班打卡不计出勤，避免出勤率超 100%），
        // 当月只算到昨天（今天未结束不算）；迟到/早退/出差/补卡是既成事实，工作日当天也计
        const dayHoliday = holidayMap.get(key)
        const isWorkdayKey = dayHoliday
          ? dayHoliday.isWorkday
          : (dayjs.tz(key, 'Asia/Shanghai').day() % 6 !== 0)
        const countedForAttendance = isWorkdayKey && (!isCurrentMonth || key < todayStr)

        if (countedForAttendance && (hasMorning || hasEvening)) attendanceDays++
        if (isWorkdayKey) {
          if (dayData.morning?.type === 'LATE' || dayData.morning?.type === 'LATE_AND_EARLY') lateDays++
          if (dayData.evening?.type === 'EARLY_LEAVE' || dayData.evening?.type === 'LATE_AND_EARLY') earlyLeaveDays++
          if (dayData.morning?.type === 'AUTO' || dayData.evening?.type === 'AUTO') businessTripDays++
          if (dayData.morning?.type === 'MAKEUP' || dayData.evening?.type === 'MAKEUP') makeupDays++
          // 今天只打了上班卡不算不完整（下班还没到）
          if (hasMorning !== hasEvening && countedForAttendance) incompleteDays++
        }

        if (dayData.evening?.overtimeStartTime && dayData.evening?.overtimeEndTime) {
          totalOvertimeMinutes += dayjs(dayData.evening.overtimeEndTime).diff(dayjs(dayData.evening.overtimeStartTime), 'minute')
        }
      }

      // 已批准出差覆盖且无打卡记录的工作日 → 计入出勤与出差，不算未打卡
      const userTrips = approvedTrips.filter(t => t.ownerId === user.id)
      const tripCoveredNoRecord = workdayKeys.filter(key => {
        if (dailyMap.has(key)) return false
        const dayStart = dayjs.tz(`${key} 00:00:00`, 'Asia/Shanghai')
        return userTrips.some(t =>
          !dayjs(t.startDate).tz('Asia/Shanghai').isAfter(dayStart, 'day') &&
          !dayjs(t.endDate).tz('Asia/Shanghai').isBefore(dayStart, 'day')
        )
      }).length
      attendanceDays += tripCoveredNoRecord
      businessTripDays += tripCoveredNoRecord

      const absenceDays = Math.max(0, effectiveWorkdays - attendanceDays)
      const attendanceRate = effectiveWorkdays > 0
        ? Math.round((attendanceDays / effectiveWorkdays) * 100)
        : 0

      return {
        userId: user.id,
        username: user.username,
        name: user.name,
        department: user.dept,
        attendanceDays,
        lateDays,
        earlyLeaveDays,
        absenceDays,
        businessTripDays,
        makeupDays,
        incompleteDays,
        overtimeHours: Math.round(totalOvertimeMinutes / 60 * 10) / 10,
        attendanceRate,
        workdaysInMonth: effectiveWorkdays
      }
    })

    const teamSummary = {
      totalEmployees: users.length,
      avgAttendanceRate: teamStats.length > 0
        ? Math.round(teamStats.reduce((sum, s) => sum + s.attendanceRate, 0) / teamStats.length)
        : 0,
      totalLateDays: teamStats.reduce((sum, s) => sum + s.lateDays, 0),
      totalAbsenceDays: teamStats.reduce((sum, s) => sum + s.absenceDays, 0),
      totalBusinessTripDays: teamStats.reduce((sum, s) => sum + s.businessTripDays, 0),
      totalOvertimeHours: Math.round(teamStats.reduce((sum, s) => sum + s.overtimeHours, 0) * 10) / 10
    }

    res.json({
      month: targetMonth.format('YYYY-MM'),
      workdaysInMonth: effectiveWorkdays,
      teamSummary,
      teamStats
    })
  } catch (error) {
    logger.error('Get team stats error:', error)
    res.status(500).json({ error: '获取团队统计失败' })
  }
})

/**
 * GET /api/check-ins/user-stats
 * 查看指定用户某月的每日打卡状况（考勤统计页面点击姓名查看）
 * Query: ?userId=number&month=YYYY-MM
 */
router.get('/user-stats', authenticateToken, checkPermission('office:attendance:list'), async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.query.userId as string)
    const month = req.query.month as string
    if (!userId) {
      return res.status(400).json({ error: '缺少 userId 参数' })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, dept: { select: { id: true, name: true } } }
    })
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const targetMonth = month
      ? dayjs.tz(`${month}-01`, 'Asia/Shanghai')
      : dayjs().tz('Asia/Shanghai')
    const startDate = targetMonth.startOf('month')
    const endDate = targetMonth.endOf('month')

    const records = await prisma.dailyCheckIn.findMany({
      where: {
        userId,
        deletedAt: null,
        checkInDate: { gte: startDate.toDate(), lte: endDate.toDate() }
      },
      orderBy: { checkInDate: 'asc' }
    })

    // 当月已批准的出差（按天判断是否覆盖）
    const trips = await prisma.businessTrip.findMany({
      where: {
        ownerId: userId,
        status: 'APPROVED',
        deletedAt: null,
        startDate: { lte: endDate.toDate() },
        endDate: { gte: startDate.toDate() }
      },
      select: { startDate: true, endDate: true }
    })
    const tripRanges = trips.map(t => ({
      start: dayjs(t.startDate).tz('Asia/Shanghai').startOf('day'),
      end: dayjs(t.endDate).tz('Asia/Shanghai').startOf('day')
    }))
    const isOnTrip = (d: dayjs.Dayjs) => tripRanges.some(r => !r.start.isAfter(d) && !r.end.isBefore(d))

    // 节假日/调休
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: startDate.toDate(), lte: endDate.toDate() } }
    })
    const holidayMap = new Map(
      holidays.map(h => [dayjs(h.date).tz('Asia/Shanghai').format('YYYY-MM-DD'), h])
    )

    const nowSh = dayjs().tz('Asia/Shanghai')
    const todaySh = nowSh.startOf('day')
    const isCurrentMonth = targetMonth.isSame(nowSh, 'month')

    // 逐天组装
    const dailyList: any[] = []
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
    let workdays = 0
    let attendanceDays = 0
    let lateDays = 0
    let earlyLeaveDays = 0
    let makeupDays = 0
    let businessTripDays = 0
    let incompleteDays = 0
    let totalOvertimeMinutes = 0

    const daysInMonth = targetMonth.daysInMonth()
    for (let i = 1; i <= daysInMonth; i++) {
      const day = targetMonth.date(i)
      const key = day.format('YYYY-MM-DD')
      const dayRecords = records.filter(
        r => dayjs(r.checkInDate).tz('Asia/Shanghai').format('YYYY-MM-DD') === key
      )
      const morningRecord = dayRecords.filter(r => r.period === 'MORNING')
        .sort((a, b) => dayjs(a.checkInTime).valueOf() - dayjs(b.checkInTime).valueOf())[0]
      const eveningRecord = dayRecords.filter(r => r.period === 'EVENING')
        .sort((a, b) => dayjs(b.checkInTime).valueOf() - dayjs(a.checkInTime).valueOf())[0]

      const holiday = holidayMap.get(key)
      const isWorkday = holiday ? holiday.isWorkday : (day.day() !== 0 && day.day() !== 6)
      const isFuture = day.isAfter(todaySh)
      const isToday = isCurrentMonth && day.isSame(todaySh, 'day')

      let status: string
      if (morningRecord || eveningRecord) {
        if (morningRecord?.type === 'LATE' || morningRecord?.type === 'LATE_AND_EARLY') status = 'LATE'
        else if (eveningRecord?.type === 'EARLY_LEAVE' || eveningRecord?.type === 'LATE_AND_EARLY') status = 'EARLY_LEAVE'
        else if (morningRecord?.type === 'AUTO' || eveningRecord?.type === 'AUTO') status = 'BUSINESS_TRIP'
        else if (morningRecord?.type === 'MAKEUP' || eveningRecord?.type === 'MAKEUP') status = 'MAKEUP'
        else if (morningRecord && eveningRecord) status = 'NORMAL'
        else if (!eveningRecord && isCurrentMonth && day.isSame(todaySh, 'day')) status = 'NORMAL' // 今天只打了上班卡
        else status = 'INCOMPLETE' // 只打了一次卡（漏上班或漏下班）
      } else if (isWorkday && isOnTrip(day)) {
        status = 'BUSINESS_TRIP'
      } else if (!isWorkday) {
        status = 'REST'
      } else if (isFuture || isToday) {
        // 未来及今天（还没打卡）显示待打卡：今天没过完不算未打卡
        status = 'FUTURE'
      } else {
        status = 'NOT_CHECKED'
      }

      // 汇总口径：出勤/缺勤只算工作日且当月截至昨天（今天未结束不算缺勤）；
      // 迟到/早退/补卡/出差是既成事实，工作日当天也计；加班时长任何日期都累计
      if (isWorkday && !(isCurrentMonth && !day.isBefore(todaySh, 'day'))) workdays++
      if (morningRecord || eveningRecord) {
        if (isWorkday) {
          if (!isToday) attendanceDays++
          if (status === 'LATE') lateDays++
          if (status === 'EARLY_LEAVE') earlyLeaveDays++
          if (status === 'MAKEUP') makeupDays++
          if (status === 'BUSINESS_TRIP') businessTripDays++
          // 今天只打了上班卡不算不完整（下班还没到）
          if ((!morningRecord && eveningRecord) || (morningRecord && !eveningRecord && !isToday)) incompleteDays++
        }
        if (eveningRecord?.overtimeStartTime && eveningRecord.overtimeEndTime) {
          totalOvertimeMinutes += dayjs(eveningRecord.overtimeEndTime).diff(dayjs(eveningRecord.overtimeStartTime), 'minute')
        }
      } else if (status === 'BUSINESS_TRIP') {
        if (!isToday) attendanceDays++
        businessTripDays++
      }

      dailyList.push({
        date: key,
        weekday: WEEKDAYS[day.day()],
        isWorkday,
        isFuture,
        morningTime: morningRecord ? dayjs(morningRecord.checkInTime).tz('Asia/Shanghai').format('HH:mm') : null,
        morningType: morningRecord?.type || null,
        eveningTime: eveningRecord ? dayjs(eveningRecord.checkInTime).tz('Asia/Shanghai').format('HH:mm') : null,
        eveningType: eveningRecord?.type || null,
        overtimeStart: eveningRecord?.overtimeStartTime
          ? dayjs(eveningRecord.overtimeStartTime).tz('Asia/Shanghai').format('HH:mm')
          : null,
        overtimeEnd: eveningRecord?.overtimeEndTime
          ? dayjs(eveningRecord.overtimeEndTime).tz('Asia/Shanghai').format('HH:mm')
          : null,
        status,
        note: holiday?.name || null,
        isMakeupWorkday: holiday?.isWorkday === true
      })
    }

    const absenceDays = Math.max(0, workdays - attendanceDays)
    res.json({
      user,
      month: targetMonth.format('YYYY-MM'),
      workdays,
      summary: {
        attendanceDays,
        lateDays,
        earlyLeaveDays,
        absenceDays,
        makeupDays,
        businessTripDays,
        incompleteDays,
        overtimeHours: Math.round(totalOvertimeMinutes / 60 * 10) / 10,
        attendanceRate: workdays > 0 ? Math.round((attendanceDays / workdays) * 100) : 0
      },
      dailyList
    })
  } catch (error) {
    logger.error('Get user stats error:', error)
    res.status(500).json({ error: '获取个人打卡状况失败' })
  }
})

/**
 * GET /api/check-ins/today-team
 * 获取团队出勤情况（默认今天，可通过 date 参数查看任意日期）
 * Query: ?departmentId=number&date=YYYY-MM-DD
 */
router.get('/today-team', authenticateToken, checkPermission('office:attendance:list'), async (req: AuthRequest, res) => {
  try {
    const { departmentId, date } = req.query
    // 支持查询任意历史日期（默认今天）
    const now = date
      ? dayjs.tz(`${date as string} 00:00:00`, 'Asia/Shanghai')
      : dayjs().tz('Asia/Shanghai')
    const range = getCheckInDayRange(now)
    // 是否为"实时今天"（今天只打了上班卡、下班还没打，不算异常）
    const isLiveToday = !date || now.isSame(dayjs().tz('Asia/Shanghai'), 'day')

    const userWhere: any = attendanceUserWhere(
      departmentId ? { deptId: parseInt(departmentId as string) } : {}
    )

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        username: true,
        name: true,
        dept: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    })

    // 获取今日所有打卡记录
    const todayRecords = await prisma.dailyCheckIn.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        deletedAt: null,
        checkInDate: { gte: range.start, lt: range.end }
      },
      orderBy: { checkInTime: 'asc' }
    })

    // 查询当日出差的人（指定日期时按全天重叠判断）
    const todayDate = now.format('YYYY-MM-DD')
    const tripEndBound = date ? range.end : now.toDate()
    const activeTrips = await prisma.businessTrip.findMany({
      where: {
        startDate: { lte: tripEndBound },
        endDate: { gte: range.start },
        status: 'APPROVED',
        deletedAt: null
      },
      select: { ownerId: true }
    })
    const tripUserIds = new Set(activeTrips.map(t => t.ownerId))

    // 当日是否休息日（节假日/调休表 + 周末）
    // 注意:Holiday.date 是 @db.Date 列,范围端点会被 Prisma 截断为 UTC 日期,
    // 用 [range.start, range.end) 会错查进前一天 → 假日次日被误判为休息日。
    // 必须用当天 UTC 零点做等值查询。
    const dayHoliday = await prisma.holiday.findFirst({
      where: { date: holidayDateKey(now) },
      select: { isWorkday: true, name: true }
    })
    const isRestDay = dayHoliday ? !dayHoliday.isWorkday : (now.day() === 0 || now.day() === 6)

    // 为每个用户组装今日打卡状态
    const todayList = users.map(user => {
      const userRecords = todayRecords.filter(r => r.userId === user.id)
      const morningRecord = userRecords.filter(r => r.period === 'MORNING').sort((a, b) => dayjs(a.checkInTime).valueOf() - dayjs(b.checkInTime).valueOf())[0]
      const eveningRecord = userRecords.filter(r => r.period === 'EVENING').sort((a, b) => dayjs(b.checkInTime).valueOf() - dayjs(a.checkInTime).valueOf())[0]

      const isOnTrip = tripUserIds.has(user.id)

      // 无记录时：出差 > 休息日 > 未打卡（中性表述，避免月初/休息日满屏"缺勤"）
      let status = 'NOT_CHECKED'
      if (morningRecord || eveningRecord) {
        if (morningRecord?.type === 'LATE' || morningRecord?.type === 'LATE_AND_EARLY') {
          status = 'LATE'
        } else if (eveningRecord?.type === 'EARLY_LEAVE' || eveningRecord?.type === 'LATE_AND_EARLY') {
          status = 'EARLY_LEAVE'
        } else if (morningRecord?.type === 'AUTO' || eveningRecord?.type === 'AUTO') {
          status = 'BUSINESS_TRIP'
        } else if (morningRecord && eveningRecord) {
          status = 'NORMAL'
        } else if (!eveningRecord && isLiveToday) {
          // 今天实时视图：只打了上班卡，下班还没打，暂时算正常
          status = 'NORMAL'
        } else {
          // 只打了一次卡（漏上班或漏下班）→ 打卡不完整
          status = 'INCOMPLETE'
        }
      } else if (isOnTrip) {
        status = 'BUSINESS_TRIP'
      } else if (isRestDay) {
        status = 'REST'
      }

      return {
        userId: user.id,
        username: user.username,
        name: user.name,
        department: user.dept,
        restNote: status === 'REST' ? (dayHoliday?.name || null) : null,
        morningTime: morningRecord ? dayjs(morningRecord.checkInTime).tz('Asia/Shanghai').format('HH:mm') : null,
        morningType: morningRecord?.type || null,
        eveningTime: eveningRecord ? dayjs(eveningRecord.checkInTime).tz('Asia/Shanghai').format('HH:mm') : null,
        eveningType: eveningRecord?.type || null,
        overtimeStart: eveningRecord?.overtimeStartTime
          ? dayjs(eveningRecord.overtimeStartTime).tz('Asia/Shanghai').format('HH:mm')
          : null,
        overtimeEnd: eveningRecord?.overtimeEndTime
          ? dayjs(eveningRecord.overtimeEndTime).tz('Asia/Shanghai').format('HH:mm')
          : null,
        status
      }
    })

    // 汇总
    const summary = {
      total: users.length,
      checkedIn: todayList.filter(t => t.status === 'NORMAL' || t.status === 'LATE' || t.status === 'INCOMPLETE' || t.status === 'EARLY_LEAVE').length,
      late: todayList.filter(t => t.status === 'LATE').length,
      notChecked: todayList.filter(t => t.status === 'NOT_CHECKED').length,
      rest: todayList.filter(t => t.status === 'REST').length,
      businessTrip: todayList.filter(t => t.status === 'BUSINESS_TRIP').length,
      onOvertime: todayList.filter(t => t.overtimeStart && !t.overtimeEnd).length
    }

    res.json({
      date: todayDate,
      summary,
      todayList
    })
  } catch (error) {
    logger.error('Get today team error:', error)
    res.status(500).json({ error: '获取今日出勤失败' })
  }
})

export default router

