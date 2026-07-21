import { useEffect, useState } from 'react'
import { Card, Row, Col, Button, message, Tag, Modal, Input, Space } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, CarOutlined, ExclamationCircleOutlined, CalendarOutlined, SunOutlined, MoonOutlined, TrophyOutlined, FireOutlined } from '@ant-design/icons'
import { getCheckIns, getTodayCheckIn, checkIn, makeupCheckIn, getCheckInStats } from '../services/api'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')
import type { Dayjs } from 'dayjs'

// 2026年法定节假日和传统节日
const HOLIDAYS_2026: Record<string, { name: string; type: 'legal' | 'festival' }> = {
  // 元旦
  '2026-01-01': { name: '元旦', type: 'legal' },
  // 春节
  '2026-01-26': { name: '除夕', type: 'legal' },
  '2026-01-27': { name: '春节', type: 'legal' },
  '2026-01-28': { name: '春节', type: 'legal' },
  '2026-01-29': { name: '春节', type: 'legal' },
  '2026-01-30': { name: '春节', type: 'legal' },
  '2026-01-31': { name: '春节', type: 'legal' },
  '2026-02-01': { name: '春节', type: 'legal' },
  // 清明节
  '2026-04-05': { name: '清明节', type: 'legal' },
  // 劳动节
  '2026-05-01': { name: '劳动节', type: 'legal' },
  '2026-05-02': { name: '劳动节', type: 'legal' },
  '2026-05-03': { name: '劳动节', type: 'legal' },
  // 端午节
  '2026-05-31': { name: '端午节', type: 'legal' },
  // 中秋节
  '2026-09-25': { name: '中秋节', type: 'legal' },
  // 国庆节
  '2026-10-01': { name: '国庆节', type: 'legal' },
  '2026-10-02': { name: '国庆节', type: 'legal' },
  '2026-10-03': { name: '国庆节', type: 'legal' },
  '2026-10-04': { name: '国庆节', type: 'legal' },
  '2026-10-05': { name: '国庆节', type: 'legal' },
  '2026-10-06': { name: '国庆节', type: 'legal' },
  '2026-10-07': { name: '国庆节', type: 'legal' },
  // 传统节日
  '2026-02-14': { name: '情人节', type: 'festival' },
  '2026-03-08': { name: '妇女节', type: 'festival' },
  '2026-05-04': { name: '青年节', type: 'festival' },
  '2026-06-01': { name: '儿童节', type: 'festival' },
  '2026-07-01': { name: '建党节', type: 'festival' },
  '2026-08-01': { name: '建军节', type: 'festival' },
  '2026-09-10': { name: '教师节', type: 'festival' },
}

function CheckInList() {
  const [todayStatus, setTodayStatus] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [makeupModalVisible, setMakeupModalVisible] = useState(false)
  const [makeupDate, setMakeupDate] = useState<Dayjs | null>(null)
  const [makeupNotes, setMakeupNotes] = useState('')

  useEffect(() => {
    fetchData()
    fetchTodayStatus()
  }, [currentMonth])

  const fetchData = async () => {
    try {
      const [recordsRes, statsRes]: any[] = await Promise.all([
        getCheckIns({ month: currentMonth.format('YYYY-MM') }),
        getCheckInStats({ month: currentMonth.format('YYYY-MM') })
      ])
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

  const handleCheckIn = async (period: 'MORNING' | 'EVENING') => {
    try {
      const result: any = await checkIn({ period })
      message.success(result?.message || (period === 'MORNING' ? '上班打卡成功！' : '下班打卡成功！'))
      fetchTodayStatus()
      fetchData()
    } catch (error: any) {
      message.error(error?.error || '打卡失败')
    }
  }

  const handleOpenMakeup = (date: Dayjs) => {
    setMakeupDate(date)
    setMakeupNotes('')
    setMakeupModalVisible(true)
  }

  const handleMakeupSubmit = async () => {
    if (!makeupDate) return
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

  const todayCheckedCount = (todayStatus?.morningCheckedIn ? 1 : 0) + (todayStatus?.eveningCheckedIn ? 1 : 0)

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
                已完成 {todayCheckedCount}/2 次打卡
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

          <Col xs={24} md={12}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* 上班打卡按钮 */}
              <Button
                size="large"
                icon={todayStatus?.morningCheckedIn ? <CheckCircleOutlined /> : <SunOutlined />}
                onClick={() => handleCheckIn('MORNING')}
                block
                style={{
                  height: 64,
                  fontSize: 18,
                  fontWeight: 600,
                  borderRadius: 12,
                  background: todayStatus?.morningCheckedIn
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(255,255,255,0.95)',
                  border: 'none',
                  color: todayStatus?.morningCheckedIn ? '#fff' : '#667eea',
                  boxShadow: todayStatus?.morningCheckedIn ? 'none' : '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                {todayStatus?.morningCheckedIn
                  ? `✓ 上班打卡 ${todayStatus.morningRecord ? dayjs(todayStatus.morningRecord.checkInTime).format('HH:mm') : ''}${(todayStatus.morningCount || 0) > 1 ? ` (共${todayStatus.morningCount}次，以最早为准)` : ''}`
                  : todayStatus?.onBusinessTrip
                    ? '出差上班打卡'
                    : '上班打卡'}
              </Button>

              {/* 下班打卡按钮 */}
              <Button
                size="large"
                icon={todayStatus?.eveningCheckedIn ? <CheckCircleOutlined /> : <MoonOutlined />}
                onClick={() => handleCheckIn('EVENING')}
                block
                style={{
                  height: 64,
                  fontSize: 18,
                  fontWeight: 600,
                  borderRadius: 12,
                  background: todayStatus?.eveningCheckedIn
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(255,255,255,0.95)',
                  border: 'none',
                  color: todayStatus?.eveningCheckedIn ? '#fff' : '#f59e0b',
                  boxShadow: todayStatus?.eveningCheckedIn ? 'none' : '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                {todayStatus?.eveningCheckedIn
                  ? `✓ 下班打卡 ${todayStatus.eveningRecord ? dayjs(todayStatus.eveningRecord.checkInTime).format('HH:mm') : ''}${(todayStatus.eveningCount || 0) > 1 ? ` (共${todayStatus.eveningCount}次，以最晚为准)` : ''}`
                  : todayStatus?.onBusinessTrip
                    ? '出差下班打卡'
                    : '下班打卡'}
              </Button>
            </Space>
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
                <div style={{ fontSize: 24, fontWeight: 700, color: (stats?.makeupRemaining ?? 3) > 0 ? '#f59e0b' : '#ff4d4f' }}>
                  {stats?.makeupRemaining ?? 3}
                  <span style={{ fontSize: 14, color: '#999', marginLeft: 4 }}>/ 3 次</span>
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
        {/* 星期标题 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 8,
          marginBottom: 12
        }}>
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: '#9ca3af',
              padding: '8px 0'
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* 日期网格 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 8
        }}>
          {(() => {
            const firstDay = currentMonth.startOf('month')
            const startDayOfWeek = firstDay.day()
            const daysInMonth = currentMonth.daysInMonth()

            const cells = []

            // 添加空白单元格（月初前的天数）
            for (let i = 0; i < startDayOfWeek; i++) {
              cells.push(<div key={`empty-${i}`} />)
            }

            // 添加日期单元格
            for (let day = 1; day <= daysInMonth; day++) {
              const date = currentMonth.date(day)
              const dateStr = date.format('YYYY-MM-DD')
              const dayRecords = records.filter(r => dayjs(r.checkInDate).format('YYYY-MM-DD') === dateStr)
              const isToday = date.isSame(dayjs(), 'day')
              const isPast = date.isBefore(dayjs(), 'day')
              const isFuture = date.isAfter(dayjs(), 'day')

              const morningRecord = dayRecords.find(r => r.period === 'MORNING')
              const eveningRecord = dayRecords.find(r => r.period === 'EVENING')
              const hasCheckedIn = dayRecords.length > 0
              const holiday = HOLIDAYS_2026[dateStr]

              // 确定单元格样式
              let bgGradient = '#f9fafb'
              let borderColor = '#e5e7eb'
              let textColor = '#6b7280'

              if (holiday) {
                // 节假日特殊样式
                if (holiday.type === 'legal') {
                  bgGradient = 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)'
                  borderColor = '#ec4899'
                  textColor = '#9f1239'
                } else {
                  bgGradient = 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)'
                  borderColor = '#8b5cf6'
                  textColor = '#5b21b6'
                }
              } else if (hasCheckedIn) {
                const types = dayRecords.map(r => r.type)
                if (types.includes('AUTO')) {
                  bgGradient = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'
                  borderColor = '#3b82f6'
                  textColor = '#1e40af'
                } else if (types.includes('MAKEUP')) {
                  bgGradient = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
                  borderColor = '#f59e0b'
                  textColor = '#92400e'
                } else if (types.includes('LATE')) {
                  bgGradient = 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'
                  borderColor = '#fb923c'
                  textColor = '#9a3412'
                } else if (types.includes('EARLY_LEAVE')) {
                  bgGradient = 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)'
                  borderColor = '#f87171'
                  textColor = '#991b1b'
                } else {
                  bgGradient = 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
                  borderColor = '#10b981'
                  textColor = '#065f46'
                }
              } else if (isPast) {
                bgGradient = '#fee2e2'
                borderColor = '#fca5a5'
                textColor = '#dc2626'
              }

              cells.push(
                <div
                  key={day}
                  onClick={() => {
                    if (!hasCheckedIn && isPast && (stats?.makeupRemaining ?? 0) > 0) {
                      handleOpenMakeup(date)
                    }
                  }}
                  style={{
                    background: bgGradient,
                    border: `2px solid ${borderColor}`,
                    borderRadius: 12,
                    padding: '12px 8px',
                    minHeight: 90,
                    cursor: !hasCheckedIn && isPast ? 'pointer' : 'default',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    ...(isToday && {
                      boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.3)',
                      borderColor: '#667eea'
                    })
                  }}
                  onMouseEnter={(e) => {
                    if (!hasCheckedIn && isPast) {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!hasCheckedIn && isPast) {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = isToday ? '0 0 0 3px rgba(102, 126, 234, 0.3)' : 'none'
                    }
                  }}
                >
                  {/* 法定假日小表情 */}
                  {holiday && holiday.type === 'legal' && (
                    <div style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      fontSize: 14,
                      lineHeight: 1
                    }}>
                      😊
                    </div>
                  )}

                  {/* 日期数字 */}
                  <div style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: textColor,
                    marginBottom: 8,
                    textAlign: 'center'
                  }}>
                    {day}
                    {isToday && (
                      <div style={{
                        fontSize: 9,
                        color: '#667eea',
                        fontWeight: 600,
                        marginTop: 2
                      }}>
                        今天
                      </div>
                    )}
                  </div>

                  {/* 节假日显示 */}
                  {holiday && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: textColor,
                      textAlign: 'center',
                      marginBottom: 4,
                      padding: '2px 4px',
                      background: 'rgba(255,255,255,0.5)',
                      borderRadius: 4
                    }}>
                      {holiday.name}
                    </div>
                  )}

                  {/* 打卡状态 */}
                  {hasCheckedIn && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {morningRecord && (
                        <div style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: textColor,
                          background: 'rgba(255,255,255,0.6)',
                          padding: '3px 6px',
                          borderRadius: 6,
                          textAlign: 'center',
                          backdropFilter: 'blur(4px)'
                        }}>
                          ☀ {dayjs(morningRecord.checkInTime).format('HH:mm')}
                        </div>
                      )}
                      {eveningRecord && (
                        <div style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: textColor,
                          background: 'rgba(255,255,255,0.6)',
                          padding: '3px 6px',
                          borderRadius: 6,
                          textAlign: 'center',
                          backdropFilter: 'blur(4px)'
                        }}>
                          ☾ {dayjs(eveningRecord.checkInTime).format('HH:mm')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 缺勤标记 */}
                  {isPast && !hasCheckedIn && (
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#dc2626',
                      textAlign: 'center',
                      marginTop: 4
                    }}>
                      缺勤
                    </div>
                  )}

                  {/* 未来日期标记 */}
                  {isFuture && (
                    <div style={{
                      fontSize: 10,
                      color: '#9ca3af',
                      textAlign: 'center',
                      marginTop: 4
                    }}>
                      待打卡
                    </div>
                  )}
                </div>
              )
            }

            return cells
          })()}
        </div>

        {/* 图例 */}
        <div style={{
          marginTop: 24,
          paddingTop: 24,
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: 32,
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
              border: '2px solid #10b981'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>正常打卡</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>按时上下班</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
              border: '2px solid #3b82f6'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>出差打卡</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>出差期间自动</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px solid #f59e0b'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>补卡</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>每月限3次</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
              border: '2px solid #fb923c'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>迟到</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>9:00后打卡</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)',
              border: '2px solid #f87171'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>早退</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>17:30前打卡</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#fee2e2',
              border: '2px solid #fca5a5'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>缺勤</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>未打卡</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
              border: '2px solid #ec4899'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>法定假日</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>国家法定节假日</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
              border: '2px solid #8b5cf6'
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>传统节日</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>节日纪念日</div>
            </div>
          </div>
        </div>
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
              {stats?.makeupRemaining ?? 3} <span style={{ fontSize: 14, color: '#92400e' }}>/ 3 次</span>
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
