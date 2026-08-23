import { useEffect, useState, useCallback } from 'react'
import { Card, Table, DatePicker, Row, Col, Spin, Modal, message } from 'antd'
import {
  ClockCircleOutlined, CheckCircleOutlined,
  TeamOutlined, CalendarOutlined, FireOutlined, WarningOutlined, UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../services/api'
import CheckInCalendar, { type CalendarDayData } from '../components/CheckInCalendar'

const { MonthPicker } = DatePicker

interface TodayItem {
  userId: number
  username: string
  name: string
  department: { id: number; name: string } | null
  morningTime: string | null
  morningType: string | null
  eveningTime: string | null
  eveningType: string | null
  overtimeStart: string | null
  overtimeEnd: string | null
  status: string
}

interface TodaySummary {
  total: number
  checkedIn: number
  late: number
  notChecked: number
  businessTrip: number
  onOvertime: number
}

interface MonthItem {
  userId: number
  username: string
  name: string
  department: { id: number; name: string } | null
  attendanceDays: number
  lateDays: number
  earlyLeaveDays: number
  absenceDays: number
  businessTripDays: number
  makeupDays: number
  incompleteDays: number
  overtimeHours: number
  attendanceRate: number
  workdaysInMonth: number
}

interface MonthSummary {
  totalEmployees: number
  avgAttendanceRate: number
  totalLateDays: number
  totalAbsenceDays: number
  totalBusinessTripDays: number
  totalOvertimeHours: number
}

// ====== 设计令牌 ======
const C = {
  primary: '#4f46e5',
  success: '#10b981',
  warning: '#f59e0b',
  info: '#3b82f6',
  textMain: '#111827',
  textSub: '#6b7280',
  textTer: '#9ca3af',
  border: '#e5e7eb',
  bgSoft: '#f9fafb',
}

// 状态 → 药丸样式（圆点 + 浅底）
const STATUS_PILL: Record<string, { label: string; color: string; bg: string }> = {
  NORMAL: { label: '正常', color: '#059669', bg: '#ecfdf5' },
  LATE: { label: '迟到', color: '#b45309', bg: '#fffbeb' },
  EARLY_LEAVE: { label: '早退', color: '#b91c1c', bg: '#fef2f2' },
  INCOMPLETE: { label: '打卡不完整', color: '#b45309', bg: '#fffbeb' },
  BUSINESS_TRIP: { label: '出差', color: '#1d4ed8', bg: '#eff6ff' },
  MAKEUP: { label: '补卡', color: '#6d28d9', bg: '#f5f3ff' },
  NOT_CHECKED: { label: '未打卡', color: '#6b7280', bg: '#f3f4f6' },
  ABSENT: { label: '未打卡', color: '#6b7280', bg: '#f3f4f6' },
  REST: { label: '休息', color: '#9ca3af', bg: '#f9fafb' },
  FUTURE: { label: '未到', color: '#9ca3af', bg: '#f9fafb' },
}

// 圆形头像（姓氏首字）
function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600,
    }}>
      {name?.slice(0, 1) || '?'}
    </div>
  )
}

// 状态药丸
function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_PILL[status] || { label: status, color: C.textSub, bg: C.bgSoft }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 10px', borderRadius: 999,
      background: cfg.bg, color: cfg.color,
      fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  )
}

// 指标卡：图标块 + 数字 + 标签 + 副文
function StatCard({ icon, tint, label, value, sub }: {
  icon: React.ReactNode; tint: string; label: string; value: React.ReactNode; sub?: string
}) {
  return (
    <Card size="small" style={{ borderRadius: 12, border: `1px solid ${C.border}` }} styles={{ body: { padding: '14px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.textMain, lineHeight: 1.2 }}>
            {value}<span style={{ fontSize: 12, fontWeight: 400, color: C.textSub, marginLeft: 4 }}>{sub}</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{label}</div>
        </div>
      </div>
    </Card>
  )
}

// 出勤率进度条
function RateBar({ value }: { value: number }) {
  const color = value >= 95 ? C.success : value >= 80 ? C.warning : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden', minWidth: 56 }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 3, background: color, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}%</span>
    </div>
  )
}

// 区块标题
function SectionTitle({ icon, tint, title, sub, extra }: {
  icon: React.ReactNode; tint: string; title: string; sub?: string; extra?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 15,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.textMain, lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: C.textTer, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>{extra}</div>
    </div>
  )
}

function AttendanceStats() {
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(dayjs())
  const [selectedDate, setSelectedDate] = useState(dayjs())

  const [todayList, setTodayList] = useState<TodayItem[]>([])
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null)
  const [monthList, setMonthList] = useState<MonthItem[]>([])
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null)
  const [workdaysInMonth, setWorkdaysInMonth] = useState(0)

  const isToday = selectedDate.isSame(dayjs(), 'day')

  const fetchTodayData = useCallback(async () => {
    try {
      const res = await api.get('/check-ins/today-team', {
        params: { date: selectedDate.format('YYYY-MM-DD') }
      }) as any
      setTodayList(res.todayList || [])
      setTodaySummary(res.summary || null)
    } catch (error: any) {
      message.error(error?.error || '获取出勤数据失败')
    }
  }, [selectedDate])

  const fetchMonthData = useCallback(async () => {
    setLoading(true)
    try {
      const monthStr = selectedMonth.format('YYYY-MM')
      const params: any = { month: monthStr }
      const res = await api.get('/check-ins/team-stats', { params }) as any
      setMonthList(res.teamStats || [])
      setMonthSummary(res.teamSummary || null)
      setWorkdaysInMonth(res.workdaysInMonth || 0)
    } catch (error: any) {
      message.error(error?.error || '获取月度统计失败')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => { fetchTodayData() }, [fetchTodayData])
  useEffect(() => { fetchMonthData() }, [fetchMonthData])

  // ====== 个人打卡状况弹窗 ======
  const [detailUser, setDetailUser] = useState<{ userId: number; name: string } | null>(null)
  const [detailMonth, setDetailMonth] = useState(dayjs())
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState<any>(null)

  const openDetail = (userId: number, name: string, month: dayjs.Dayjs) => {
    setDetailUser({ userId, name })
    setDetailMonth(month)
  }

  const fetchDetail = useCallback(async () => {
    if (!detailUser) return
    setDetailLoading(true)
    try {
      const res = await api.get('/check-ins/user-stats', {
        params: { userId: detailUser.userId, month: detailMonth.format('YYYY-MM') }
      }) as any
      setDetailData(res)
    } catch (error: any) {
      message.error(error?.error || '获取个人打卡状况失败')
    } finally {
      setDetailLoading(false)
    }
  }, [detailUser, detailMonth])

  useEffect(() => {
    if (detailUser) fetchDetail()
  }, [detailUser, detailMonth, fetchDetail])

  // 需关注提醒
  type AlertItem = { type: 'absence' | 'late'; name: string; days: number }
  const absenceAlerts: AlertItem[] = []
  const lateAlerts: AlertItem[] = []
  if (monthList.length > 0) {
    monthList.forEach(item => {
      if (item.absenceDays >= 2) absenceAlerts.push({ type: 'absence', name: item.name, days: item.absenceDays })
      if (item.lateDays >= 3) lateAlerts.push({ type: 'late', name: item.name, days: item.lateDays })
    })
  }
  const totalAlerts = absenceAlerts.length + lateAlerts.length

  // ====== 今日明细列 ======
  const todayColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record: TodayItem) => (
        <a
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.textMain, fontWeight: 500 }}
          onClick={() => openDetail(record.userId, v, selectedDate)}
          title="查看此人打卡状况"
        >
          <Avatar name={v} />
          {v}
        </a>
      ),
    },
    {
      title: '上班打卡',
      key: 'morning',
      render: (_: any, record: TodayItem) => {
        if (!record.morningTime) return <span style={{ color: C.textTer }}>—</span>
        const isLate = record.morningType === 'LATE' || record.morningType === 'LATE_AND_EARLY'
        return (
          <span style={{ color: isLate ? C.warning : C.textMain, fontWeight: isLate ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
            {record.morningTime}{isLate && <span style={{ fontSize: 11, marginLeft: 3 }}>迟</span>}
          </span>
        )
      },
    },
    {
      title: '下班打卡',
      key: 'evening',
      render: (_: any, record: TodayItem) => {
        if (!record.eveningTime) return <span style={{ color: C.textTer }}>—</span>
        return <span style={{ color: C.textMain, fontVariantNumeric: 'tabular-nums' }}>{record.eveningTime}</span>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <StatusPill status={status} />,
    },
    {
      title: '加班',
      key: 'overtime',
      render: (_: any, record: TodayItem) => {
        if (!record.overtimeStart) return <span style={{ color: C.textTer }}>—</span>
        if (record.overtimeEnd) {
          return <span style={{ color: C.primary, fontVariantNumeric: 'tabular-nums' }}>{record.overtimeStart} - {record.overtimeEnd}</span>
        }
        return <span style={{ color: C.primary }}>{record.overtimeStart} 进行中</span>
      },
    },
  ]

  // ====== 月度统计列 ======
  const numCol = (title: string, key: keyof MonthItem, warn = false) => ({
    title,
    dataIndex: key as string,
    key: key as string,
    align: 'center' as const,
    sorter: (a: MonthItem, b: MonthItem) => (a[key] as number) - (b[key] as number),
    render: (v: number) => v > 0
      ? <span style={{ color: warn ? C.warning : C.textMain, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      : <span style={{ color: C.textTer, fontVariantNumeric: 'tabular-nums' }}>{v}</span>,
  })

  const monthColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record: MonthItem) => (
        <a
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.textMain, fontWeight: 500 }}
          onClick={() => openDetail(record.userId, v, selectedMonth)}
          title="查看此人打卡状况"
        >
          <Avatar name={v} />
          {v}
        </a>
      ),
    },
    numCol('出勤天数', 'attendanceDays'),
    numCol('迟到', 'lateDays', true),
    numCol('早退', 'earlyLeaveDays', true),
    numCol('未打卡', 'absenceDays'),
    numCol('补卡', 'makeupDays'),
    numCol('出差', 'businessTripDays'),
    numCol('加班(h)', 'overtimeHours'),
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      width: 150,
      sorter: (a: MonthItem, b: MonthItem) => a.attendanceRate - b.attendanceRate,
      render: (v: number) => <RateBar value={v} />,
    },
  ]

  // 个人日历数据
  const DETAIL_STATUS_MAP: Record<string, CalendarDayData['status']> = {
    NORMAL: 'NORMAL', LATE: 'LATE', EARLY_LEAVE: 'EARLY_LEAVE', INCOMPLETE: 'INCOMPLETE',
    MAKEUP: 'MAKEUP', BUSINESS_TRIP: 'AUTO', ABSENT: 'NOT_CHECKED', NOT_CHECKED: 'NOT_CHECKED',
    FUTURE: 'FUTURE', REST: 'REST',
  }
  const detailDays: Record<string, CalendarDayData> = {}
  for (const d of (detailData?.dailyList || [])) {
    detailDays[d.date] = {
      date: d.date,
      status: DETAIL_STATUS_MAP[d.status] || 'REST',
      morningTime: d.morningTime || null,
      eveningTime: d.eveningTime || null,
      holidayName: d.note || null,
    }
  }

  return (
    <div className="bd-page-enter" style={{ padding: 24 }}>
      {/* ====== 页头 ====== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 17,
        }}>
          <CalendarOutlined />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.textMain }}>考勤统计</h2>
          <div style={{ fontSize: 12, color: C.textTer, marginTop: 2 }}>
            团队出勤实时概览与月度汇总 · 数据截止 {dayjs().format('HH:mm')}
          </div>
        </div>
      </div>

      <Spin spinning={loading}>
        {/* ====== 今日出勤 ====== */}
        <div style={{ marginBottom: 28 }}>
          <SectionTitle
            icon={<ClockCircleOutlined />}
            tint="linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)"
            title={isToday ? '今日出勤' : `${selectedDate.format('M月D日')} 出勤`}
            sub={isToday ? '实时更新' : '历史查看'}
            extra={
              <>
                <DatePicker
                  size="small"
                  value={selectedDate}
                  onChange={(v) => v && setSelectedDate(v)}
                  allowClear={false}
                  disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                />
              </>
            }
          />
          {todaySummary && (
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={8} md={4}>
                <StatCard icon={<TeamOutlined />} tint="#6366f1" label="应出勤" value={todaySummary.total} sub="人" />
              </Col>
              <Col xs={12} sm={8} md={5}>
                <StatCard
                  icon={<CheckCircleOutlined />} tint="#10b981" label="已打卡" value={todaySummary.checkedIn}
                  sub={todaySummary.total > 0 ? `人 · ${Math.round(todaySummary.checkedIn / todaySummary.total * 100)}%` : '人'}
                />
              </Col>
              <Col xs={12} sm={8} md={5}>
                <StatCard icon={<FireOutlined />} tint="#3b82f6" label="出差" value={todaySummary.businessTrip} sub="人" />
              </Col>
              <Col xs={12} sm={8} md={5}>
                <StatCard icon={<ClockCircleOutlined />} tint="#f59e0b" label="迟到" value={todaySummary.late} sub="人" />
              </Col>
              <Col xs={12} sm={8} md={5}>
                <StatCard icon={<UserOutlined />} tint="#9ca3af" label="未打卡" value={todaySummary.notChecked} sub="人" />
              </Col>
            </Row>
          )}
          <Card size="small" style={{ borderRadius: 12, border: `1px solid ${C.border}` }}>
            <Table
              dataSource={todayList}
              columns={todayColumns}
              rowKey="userId"
              pagination={false}
              size="middle"
            />
          </Card>
        </div>

        {/* ====== 月度统计 ====== */}
        <div>
          <SectionTitle
            icon={<TeamOutlined />}
            tint="linear-gradient(135deg, #059669 0%, #10b981 100%)"
            title={`月度统计 · ${selectedMonth.format('YYYY年M月')}`}
            sub={`共 ${monthSummary?.totalEmployees || 0} 人 · 当月 ${workdaysInMonth} 个工作日`}
            extra={
              <MonthPicker
                size="small"
                value={selectedMonth}
                onChange={(v) => v && setSelectedMonth(v)}
                allowClear={false}
                disabledDate={(d) => d.isAfter(dayjs(), 'month')}
              />
            }
          />
          {monthSummary && (
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <StatCard icon={<CheckCircleOutlined />} tint="#10b981" label="团队平均出勤率" value={`${monthSummary.avgAttendanceRate}%`} />
              </Col>
              <Col xs={12} sm={6}>
                <StatCard icon={<ClockCircleOutlined />} tint="#f59e0b" label="迟到合计" value={monthSummary.totalLateDays} sub="人次" />
              </Col>
              <Col xs={12} sm={6}>
                <StatCard icon={<UserOutlined />} tint="#9ca3af" label="未打卡合计" value={monthSummary.totalAbsenceDays} sub="天" />
              </Col>
              <Col xs={12} sm={6}>
                <StatCard icon={<FireOutlined />} tint="#7c3aed" label="加班合计" value={monthSummary.totalOvertimeHours} sub="小时" />
              </Col>
            </Row>
          )}
          <Card size="small" style={{ borderRadius: 12, border: `1px solid ${C.border}` }}>
            <Table
              dataSource={monthList}
              columns={monthColumns}
              rowKey="userId"
              pagination={false}
              size="middle"
              summary={(data) => {
                if (!monthSummary || data.length === 0) return null
                return (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 600 }}>
                      <Table.Summary.Cell index={0}>
                        <span style={{ color: C.textMain }}>团队汇总</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="center">
                        <span style={{ fontWeight: 600 }}>{monthList.reduce((s, i) => s + i.attendanceDays, 0)}</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="center">
                        <span style={{ color: monthSummary.totalLateDays > 0 ? C.warning : undefined, fontWeight: 600 }}>
                          {monthSummary.totalLateDays}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="center">—</Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="center">
                        <span style={{ fontWeight: 600 }}>{monthSummary.totalAbsenceDays}</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="center">—</Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="center">
                        <span style={{ color: C.primary }}>{monthSummary.totalBusinessTripDays}</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="center">
                        <span style={{ color: C.primary, fontWeight: 600 }}>{monthSummary.totalOvertimeHours}</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={8}>
                        <RateBar value={monthSummary.avgAttendanceRate} />
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )
              }}
            />
          </Card>

          {/* 需关注 —— 轻量提示条 */}
          {totalAlerts > 0 && (
            <Card
              size="small"
              style={{
                marginTop: 16, borderRadius: 12,
                border: `1px solid ${C.border}`,
                borderLeft: '3px solid #f59e0b',
                background: '#fffbeb40',
              }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: absenceAlerts.length && lateAlerts.length ? 8 : 0, flexWrap: 'wrap' }}>
                <WarningOutlined style={{ color: C.warning }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.textMain }}>需关注</span>
                {absenceAlerts.length > 0 && (
                  <span style={{ fontSize: 12, color: C.textSub }}>
                    未打卡 ≥ 2 天：{absenceAlerts.map(a => `${a.name}(${a.days}天)`).join('、')}
                  </span>
                )}
                {lateAlerts.length > 0 && (
                  <span style={{ fontSize: 12, color: C.textSub }}>
                    迟到 ≥ 3 次：{lateAlerts.map(a => `${a.name}(${a.days}次)`).join('、')}
                  </span>
                )}
              </div>
            </Card>
          )}
        </div>
      </Spin>

      {/* ====== 个人打卡状况弹窗 ====== */}
      <Modal
        open={!!detailUser}
        onCancel={() => setDetailUser(null)}
        footer={null}
        width={960}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {detailUser && <Avatar name={detailUser.name} />}
            <span style={{ fontSize: 16, fontWeight: 600, color: C.textMain }}>
              {detailUser?.name} · 打卡状况
            </span>
            <MonthPicker
              size="small"
              value={detailMonth}
              onChange={(v) => v && setDetailMonth(v)}
              allowClear={false}
              disabledDate={(d) => d.isAfter(dayjs(), 'month')}
            />
          </div>
        }
      >
        <Spin spinning={detailLoading}>
          {/* 汇总指标 */}
          {detailData?.summary && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[
                { label: '出勤', value: `${detailData.summary.attendanceDays}/${detailData.workdays} 天`, color: C.success },
                { label: '出勤率', value: `${detailData.summary.attendanceRate}%`, color: detailData.summary.attendanceRate >= 90 ? C.success : C.warning },
                { label: '迟到', value: `${detailData.summary.lateDays} 次`, color: detailData.summary.lateDays > 0 ? C.warning : C.textSub },
                { label: '早退', value: `${detailData.summary.earlyLeaveDays} 次`, color: detailData.summary.earlyLeaveDays > 0 ? C.warning : C.textSub },
                { label: '未打卡', value: `${detailData.summary.absenceDays} 天`, color: C.textSub },
                { label: '补卡', value: `${detailData.summary.makeupDays} 次`, color: detailData.summary.makeupDays > 0 ? C.primary : C.textSub },
                { label: '出差', value: `${detailData.summary.businessTripDays} 天`, color: detailData.summary.businessTripDays > 0 ? C.primary : C.textSub },
                { label: '加班', value: `${detailData.summary.overtimeHours} h`, color: detailData.summary.overtimeHours > 0 ? C.primary : C.textSub },
              ].map((s: any) => (
                <div
                  key={s.label}
                  style={{
                    padding: '4px 12px', borderRadius: 999,
                    background: C.bgSoft, border: `1px solid ${C.border}`,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: C.textSub }}>{s.label} </span>
                  <span style={{ color: s.color, fontWeight: 600 }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* 日历视图 */}
          <CheckInCalendar
            month={detailMonth}
            days={detailDays}
            compact
            showLegend={false}
          />

          {/* 图例 */}
          <div style={{
            marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
            fontSize: 12, color: C.textSub,
          }}>
            {[
              { label: '正常', color: '#10b981' },
              { label: '迟到', color: '#fb923c' },
              { label: '早退', color: '#f87171' },
              { label: '未打卡', color: '#d1d5db' },
              { label: '补卡/不完整', color: '#f59e0b' },
              { label: '出差', color: '#3b82f6' },
              { label: '法定假日', color: '#ec4899' },
            ].map(item => (
              <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, display: 'inline-block' }} />
                {item.label}
              </span>
            ))}
          </div>
        </Spin>
      </Modal>
    </div>
  )
}

export default AttendanceStats
