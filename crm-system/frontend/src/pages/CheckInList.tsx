import { useEffect, useState } from 'react'
import { Card, Row, Col, Button, message, Tag, Modal, Input, Space } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, CarOutlined, ExclamationCircleOutlined, CalendarOutlined, TrophyOutlined, FireOutlined } from '@ant-design/icons'
import { getCheckIns, getTodayCheckIn, checkIn, makeupCheckIn, getCheckInStats, getHolidays } from '../services/api'
import CheckInCalendar, { type CalendarDayData } from '../components/CheckInCalendar'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

// 安全地把后端返回的时间转为用户本地时间显示
const formatTime = (t: string | Date) => dayjs.utc(t).local().format('HH:mm')
import type { Dayjs } from 'dayjs'

// 节假日类型
type HolidayInfo = { name: string; type: 'legal' | 'festival'; isWorkday?: boolean }

function CheckInList() {
  const [todayStatus, setTodayStatus] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [makeupModalVisible, setMakeupModalVisible] = useState(false)
  const [makeupDate, setMakeupDate] = useState<Dayjs | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [makeupNotes, setMakeupNotes] = useState('')
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({})

  useEffect(() => {
    fetchData()
    fetchTodayStatus()
    fetchHolidays()
  }, [currentMonth])

  const fetchHolidays = async () => {
    try {
      const year = currentMonth.year()
      const data: any = await getHolidays({ year })
      const holidayMap: Record<string, HolidayInfo> = {}
      for (const h of (data.holidays || [])) {
        // isWorkday=false → 法定假日, isWorkday=true → 调休/传统节日
        holidayMap[h.date] = {
          name: h.name,
          type: h.isWorkday ? 'festival' : 'legal',
          isWorkday: !!h.isWorkday
        }
      }
      setHolidays(holidayMap)
    } catch (error) {
      console.error('获取节假日数据失败:', error)
    }
  }

  const fetchData = async () => {
    try {
      const [recordsRes, statsRes]: any[] = await Promise.all([
        getCheckIns({ month: currentMonth.format('YYYY-MM') }),
        getCheckInStats({ month: currentMonth.format('YYYY-MM') })
      ])
      console.log('[fetchData] records:', recordsRes.records?.length, '条')
      setRecords(recordsRes.records || [])
      setStats(statsRes)
    } catch (error) {
      console.error('获取打卡数据失败:', error)
    }
  }

  const fetchTodayStatus = async () => {
    try {
      const data: any = await getTodayCheckIn()
      setTodayStatus(data)
    } catch (error) {
      console.error('获取今日状态失败:', error)
    }
  }

  const handleCheckIn = async () => {
    setCheckingIn(true)
    try {
      console.log('[打卡] 发送请求, 当前时间:', dayjs().format('HH:mm:ss'))
      const result: any = await checkIn({})
      console.log('[打卡] 响应:', result)
      message.success(result?.message || '打卡成功')
      // 等待一小段时间确保数据库提交完成，然后刷新数据
      await new Promise(resolve => setTimeout(resolve, 500))
      await fetchTodayStatus()
      await fetchData()
    } catch (error: any) {
      console.error('[打卡] 失败:', error)
      message.error(error?.error || error?.message || '打卡失败')
    } finally {
      setCheckingIn(false)
    }
  }

  const handleOpenMakeup = (date: Dayjs) => {
    setMakeupDate(date)
    setMakeupNotes('')
    setMakeupModalVisible(true)
  }

  // 某天是否不可补卡：周末与法定假日不可，调休上班日（isWorkday=true）按工作日处理可补
  const isBlockedForMakeup = (date: Dayjs) => {
    const holidayInfo = holidays[date.format('YYYY-MM-DD')]
    if (holidayInfo?.isWorkday) return false
    if (date.day() === 0 || date.day() === 6) return true
    return !!holidayInfo
  }

  const handleMakeupSubmit = async () => {
    if (!makeupDate) return

    if (isBlockedForMakeup(makeupDate)) {
      message.error('节假日和周末不能补卡')
      return
    }
    
    try {
      const res: any = await makeupCheckIn({
        date: makeupDate.format('YYYY-MM-DD'),
        notes: makeupNotes || '补卡'
      })
      message.success(`补卡成功！本月剩余 ${res.makeupRemaining} 次`)
      setMakeupModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error?.error || '补卡失败')
    }
  }

  // 后端允许多次打卡：早上取最早、晚上取最晚生效（与工作总览页一致），前端不再按次数封顶
  const isMorningPeriod = dayjs().hour() < 12
  const periodLabel = todayStatus?.isWorkdayToday === false ? '加班' : (isMorningPeriod ? '上班' : '下班')
  const periodCheckedIn = isMorningPeriod ? !!todayStatus?.morningCheckedIn : !!todayStatus?.eveningCheckedIn
  const periodCheckCount = (isMorningPeriod ? todayStatus?.morningCount : todayStatus?.eveningCount) || 0

  return (
    <div>
      {/* Hero Section - 今日打卡状态 */}
      <Card
        style={{
          borderRadius: 16,
          border: 'none',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          marginBottom: 24,
          overflow: 'hidden'
        }}
        styles={{ body: { padding: '32px' } }}
      >
        <Row gutter={24} align="middle">
          <Col xs={24} md={12}>
            <div style={{ color: '#fff', marginBottom: 24 }}>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>
                {dayjs().format('YYYY年M月D日 dddd')}
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#fff' }}>
                今日打卡
              </h1>
              <div style={{ fontSize: 16, opacity: 0.9, marginTop: 8 }}>
                {(() => {
                  // 显示生效时间（早上取最早、晚上取最晚的那条），避免与按钮下方的次数提示重复
                  const m = todayStatus?.morningRecord ? dayjs.utc(todayStatus.morningRecord.checkInTime).local() : null
                  const e = todayStatus?.eveningRecord ? dayjs.utc(todayStatus.eveningRecord.checkInTime).local() : null
                  if (!m && !e) return '今日尚未打卡'
                  if (todayStatus?.isWorkdayToday === false) {
                    return `加班 ${m ? m.format('HH:mm') : '--:--'} — ${e ? e.format('HH:mm') : '进行中'}`
                  }
                  return `上班 ${m ? m.format('HH:mm') : '--:--'} · 下班 ${e ? e.format('HH:mm') : '--:--'}`
                })()}
              </div>
            </div>

            {todayStatus?.onBusinessTrip && (
              <Tag
                icon={<CarOutlined />}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: '#fff',
                  fontSize: 13,
                  padding: '4px 12px',
                  marginBottom: 16
                }}
              >
                出差中：{todayStatus.activeTrip?.destination}
              </Tag>
            )}
          </Col>

          <Col xs={24} md={12} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <Button
                size="large"
                loading={checkingIn}
                icon={periodCheckedIn ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                onClick={handleCheckIn}
                style={{
                  height: 72,
                  fontSize: 20,
                  fontWeight: 700,
                  borderRadius: 16,
                  minWidth: 200,
                  background: 'rgba(255,255,255,0.95)',
                  border: 'none',
                  color: '#667eea',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}
              >
                {checkingIn ? '打卡中...' : `${periodCheckedIn ? '✓ ' : ''}${periodLabel}打卡`}
              </Button>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
                {todayStatus?.isWorkdayToday === false
                  ? '今日休息 · 打卡将记录为加班，可多次打卡'
                  : periodCheckedIn
                    ? `本时段已打 ${periodCheckCount} 次 · ${isMorningPeriod ? '以最早为准' : '以最晚为准'}，可再打`
                    : `当前为${isMorningPeriod ? '上班' : '下班'}时段`}
              </div>

              {/* 迟到/早退标记和建议下班时间（休息日加班不适用上下班规则） */}
              {todayStatus?.isWorkdayToday === false ? (
                todayStatus?.morningRecord || todayStatus?.eveningRecord ? (
                  <div style={{ marginTop: 12 }}>
                    <Tag
                      style={{
                        background: 'rgba(99, 102, 241, 0.25)',
                        border: '1px solid rgba(129, 140, 248, 0.6)',
                        color: '#c7d2fe',
                        fontSize: 12,
                        padding: '2px 8px',
                      }}
                    >
                      🌙 加班打卡
                    </Tag>
                  </div>
                ) : null
              ) : todayStatus?.morningRecord && (
                <div style={{ marginTop: 12 }}>
                  {/* 判断是否迟到：直接用后端判定的打卡类型（含通宵加班次日 10:00 弹性），避免前端按 9:00 重算导致不一致 */}
                  {(() => {
                    const morningTime = dayjs.utc(todayStatus.morningRecord.checkInTime).local()
                    const isLate = ['LATE', 'LATE_AND_EARLY'].includes(todayStatus.morningRecord.type)

                    if (isLate) {
                      return (
                        <Tag
                          color="orange"
                          style={{
                            background: 'rgba(251, 146, 60, 0.2)',
                            border: '1px solid rgba(251, 146, 60, 0.5)',
                            color: '#fed7aa',
                            fontSize: 12,
                            padding: '2px 8px',
                            marginBottom: 8
                          }}
                        >
                          迟到 {morningTime.format('HH:mm')}
                        </Tag>
                      )
                    }
                    return null
                  })()}
                  
                  {/* 建议下班时间 */}
                  {(() => {
                    const morningTime = dayjs.utc(todayStatus.morningRecord.checkInTime).local()
                    const suggestedEveningTime = morningTime.add(9, 'hour')
                    
                    return (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                        建议 {suggestedEveningTime.format('HH:mm')} 后下班打卡
                      </div>
                    )
                  })()}
                </div>
              )}
              
              {/* 早退标记（休息日加班不适用） */}
              {todayStatus?.isWorkdayToday !== false && todayStatus?.eveningRecord && todayStatus?.morningRecord && (() => {
                const morningTime = dayjs.utc(todayStatus.morningRecord.checkInTime).local()
                const eveningTime = dayjs.utc(todayStatus.eveningRecord.checkInTime).local()
                const requiredTime = morningTime.add(9, 'hour')
                const isEarlyLeave = eveningTime.isBefore(requiredTime)
                
                if (isEarlyLeave) {
                  return (
                    <Tag
                      color="red"
                      style={{
                        background: 'rgba(248, 113, 113, 0.2)',
                        border: '1px solid rgba(248, 113, 113, 0.5)',
                        color: '#fecaca',
                        fontSize: 12,
                        padding: '2px 8px',
                        marginTop: 8
                      }}
                    >
                      早退（需工作至 {requiredTime.format('HH:mm')}）
                    </Tag>
                  )
                }
                return null
              })()}
            </div>
          </Col>
        </Row>
      </Card>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card
            style={{
              borderRadius: 12,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              background: '#fff'
            }}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <TrophyOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>本月出勤</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#667eea' }}>
                  {stats?.attendance || 0}
                  <span style={{ fontSize: 14, color: '#999', marginLeft: 4 }}>/ {stats?.workdays || 0} 天</span>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            style={{
              borderRadius: 12,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              background: '#fff'
            }}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FireOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>出勤率</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: stats?.attendanceRate >= 90 ? '#10b981' : '#f59e0b' }}>
                  {stats?.attendanceRate || 0}%
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            style={{
              borderRadius: 12,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              background: '#fff'
            }}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CarOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>出差打卡</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
                  {stats?.auto || 0}
                  <span style={{ fontSize: 14, color: '#999', marginLeft: 4 }}>次</span>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            style={{
              borderRadius: 12,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              background: '#fff'
            }}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ClockCircleOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>补卡剩余</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: (stats?.makeupRemaining ?? 1) > 0 ? '#f59e0b' : '#ff4d4f' }}>
                  {stats?.makeupRemaining ?? 1}
                  <span style={{ fontSize: 14, color: '#999', marginLeft: 4 }}>/ 1 次</span>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 自定义日历 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CalendarOutlined style={{ fontSize: 20, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                  {currentMonth.format('YYYY年M月')}
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                  打卡记录
                </div>
              </div>
            </div>
            <Space>
              <Button
                size="small"
                onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}
                style={{ borderRadius: 8 }}
              >
                上月
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() => setCurrentMonth(dayjs())}
                style={{ borderRadius: 8, background: '#667eea', borderColor: '#667eea' }}
              >
                本月
              </Button>
              <Button
                size="small"
                onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}
                style={{ borderRadius: 8 }}
              >
                下月
              </Button>
            </Space>
          </div>
        }
        style={{
          borderRadius: 16,
          border: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          background: '#fff'
        }}
        styles={{ body: { padding: '24px' } }}
      >
        <CheckInCalendar
          month={currentMonth}
          days={(() => {
            const map: Record<string, CalendarDayData> = {}
            const daysInMonth = currentMonth.daysInMonth()
            const today = dayjs()
            for (let d = 1; d <= daysInMonth; d++) {
              const date = currentMonth.date(d)
              const dateStr = date.format('YYYY-MM-DD')
              const dayRecords = records.filter(r => dayjs(r.checkInDate).isSame(date, 'day'))
              const morningRecord = dayRecords.find(r => r.period === 'MORNING')
              const eveningRecord = dayRecords.find(r => r.period === 'EVENING')
              const hasCheckedIn = dayRecords.length > 0
              const holiday = holidays[dateStr]
              const types = dayRecords.map(r => r.type) as string[]

              let status: CalendarDayData['status']
              // 非工作日：周末（调休上班日除外）或法定假日
              const isMakeupWorkday = holiday?.isWorkday === true
              const isWeekendDay = date.day() === 0 || date.day() === 6
              const isNonWorkday = (isWeekendDay && !isMakeupWorkday) || (!!holiday && !holiday.isWorkday)

              if (types.includes('AUTO')) {
                status = 'AUTO'
              } else if (types.includes('OVERTIME') || (isNonWorkday && hasCheckedIn)) {
                // 非工作日的打卡记录显示为加班（含旧数据兼容：此前周日记为 NORMAL）
                status = 'OVERTIME'
              } else if (types.includes('MAKEUP')) {
                status = 'MAKEUP'
              } else if (types.includes('LATE') || types.includes('LATE_AND_EARLY')) {
                status = 'LATE'
              } else if (types.includes('EARLY_LEAVE')) {
                status = 'EARLY_LEAVE'
              } else if (morningRecord && eveningRecord) {
                status = 'NORMAL'
              } else if (hasCheckedIn) {
                // 今天只打了上班卡不算"不完整"（下班时间未到），与后端统计口径一致
                status = date.isSame(today, 'day') && morningRecord ? 'NORMAL' : 'INCOMPLETE'
              } else if (holiday) {
                status = holiday.type === 'legal' ? 'HOLIDAY_LEGAL' : 'HOLIDAY_EXTRA'
              } else if (!date.isBefore(today, 'day') && !isNonWorkday) {
                // 今天及未来的工作日显示"待打卡"（今天还没打卡/没到下班不算缺勤）
                status = 'FUTURE'
              } else if (date.isBefore(today, 'day') && !isNonWorkday) {
                status = 'ABSENT'
              } else {
                status = 'REST'
              }

              map[dateStr] = {
                date: dateStr,
                status,
                morningTime: morningRecord ? formatTime(morningRecord.checkInTime) : null,
                eveningTime: eveningRecord ? formatTime(eveningRecord.checkInTime) : null,
                holidayName: holiday?.name || null,
                isMakeupWorkday: holiday?.isWorkday === true,
              }
            }
            return map
          })()}
          onDayClick={(day, date) => {
            if (day.status === 'ABSENT' && (stats?.makeupRemaining ?? 0) > 0 && !isBlockedForMakeup(date)) {
              handleOpenMakeup(date)
            }
          }}
          isDayClickable={(day, date) => {
            return day.status === 'ABSENT' && (stats?.makeupRemaining ?? 0) > 0 && !isBlockedForMakeup(date)
          }}
        />
      </Card>

      {/* 补卡弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#f59e0b', fontSize: 20 }} />
            <span style={{ fontSize: 18, fontWeight: 600 }}>申请补卡</span>
          </div>
        }
        open={makeupModalVisible}
        onOk={handleMakeupSubmit}
        onCancel={() => setMakeupModalVisible(false)}
        okText="确认补卡"
        okButtonProps={{ style: { background: '#667eea', borderColor: '#667eea' } }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{
            padding: '12px 16px',
            background: '#f8f9fa',
            borderRadius: 8,
            marginBottom: 16
          }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>补卡日期</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>
              {makeupDate?.format('YYYY年M月D日 dddd')}
            </div>
          </div>

          <div style={{
            padding: '12px 16px',
            background: '#fff7ed',
            borderRadius: 8,
            border: '1px solid #fed7aa'
          }}>
            <div style={{ fontSize: 13, color: '#92400e', marginBottom: 4 }}>本月剩余补卡次数</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>
              {stats?.makeupRemaining ?? 1} <span style={{ fontSize: 14, color: '#92400e' }}>/ 1 次</span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>补卡原因</div>
          <Input.TextArea
            rows={3}
            placeholder="请填写补卡原因（如：忘记打卡、手机没电等）"
            value={makeupNotes}
            onChange={(e) => setMakeupNotes(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </div>

        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: '#fef2f2',
          borderRadius: 6,
          fontSize: 12,
          color: '#dc2626'
        }}>
          注意：补卡记录将标记为"补卡"类型，与正常打卡有明确区分
        </div>
      </Modal>
    </div>
  )
}

export default CheckInList
