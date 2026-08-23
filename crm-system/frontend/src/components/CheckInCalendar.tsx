import dayjs, { Dayjs } from 'dayjs'

/**
 * 每日打卡数据（归一化，供日历渲染）
 * 各页面把自己的数据源映射成此结构即可共用日历
 */
export interface CalendarDayData {
  date: string // YYYY-MM-DD
  status:
    | 'NORMAL'        // 正常（早晚都打了）
    | 'INCOMPLETE'    // 打卡不完整（只打了一次）
    | 'LATE'          // 迟到
    | 'EARLY_LEAVE'   // 早退
    | 'MAKEUP'        // 补卡
    | 'AUTO'          // 出差自动打卡
    | 'OVERTIME'      // 加班打卡（非工作日有打卡记录）
    | 'ABSENT'        // 过去工作日未打卡（旧值，兼容）
    | 'NOT_CHECKED'   // 过去工作日未打卡（中性表述）
    | 'FUTURE'        // 未来日期
    | 'REST'          // 休息日（周末/无记录的当天）
    | 'HOLIDAY_LEGAL' // 法定假日
    | 'HOLIDAY_EXTRA' // 调休/传统节日
  morningTime?: string | null
  eveningTime?: string | null
  holidayName?: string | null
}

interface CheckInCalendarProps {
  month: Dayjs
  /** 每日数据，key 为 YYYY-MM-DD；缺失的日期按 休息/未来 处理 */
  days: Record<string, CalendarDayData>
  /** 点击某天 */
  onDayClick?: (day: CalendarDayData, date: Dayjs) => void
  /** 某天是否可点击（控制指针样式与悬停效果） */
  isDayClickable?: (day: CalendarDayData, date: Dayjs) => boolean
  /** 是否显示底部图例，默认 true */
  showLegend?: boolean
  /** 紧凑模式（弹窗内使用）：格子更矮 */
  compact?: boolean
}

// 状态 → 样式
const STATUS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  HOLIDAY_LEGAL: { bg: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)', border: '#ec4899', text: '#9f1239' },
  HOLIDAY_EXTRA: { bg: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', border: '#8b5cf6', text: '#5b21b6' },
  AUTO: { bg: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', border: '#3b82f6', text: '#1e40af' },
  OVERTIME: { bg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', border: '#6366f1', text: '#3730a3' },
  MAKEUP: { bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '#f59e0b', text: '#92400e' },
  LATE: { bg: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)', border: '#fb923c', text: '#9a3412' },
  EARLY_LEAVE: { bg: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)', border: '#f87171', text: '#991b1b' },
  NORMAL: { bg: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', border: '#10b981', text: '#065f46' },
  INCOMPLETE: { bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '#f59e0b', text: '#92400e' },
  ABSENT: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' },
  NOT_CHECKED: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' },
  FUTURE: { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' },
  REST: { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' },
}

// 图例配置
const LEGEND_ITEMS = [
  { label: '正常打卡', desc: '按时上下班', style: STATUS_STYLES.NORMAL },
  { label: '出差打卡', desc: '出差期间自动', style: STATUS_STYLES.AUTO },
  { label: '加班打卡', desc: '休息日到岗加班', style: STATUS_STYLES.OVERTIME },
  { label: '补卡/打卡不完整', desc: '补卡每月限1次', style: STATUS_STYLES.MAKEUP },
  { label: '迟到', desc: '9:00后上班打卡', style: STATUS_STYLES.LATE },
  { label: '早退', desc: '工作时长不满9小时', style: STATUS_STYLES.EARLY_LEAVE },
  { label: '未打卡', desc: '当日无打卡记录', style: STATUS_STYLES.NOT_CHECKED },
  { label: '休息日', desc: '周末及法定假日', style: STATUS_STYLES.REST },
  { label: '法定假日', desc: '国家法定节假日', style: STATUS_STYLES.HOLIDAY_LEGAL },
  { label: '传统节日', desc: '节日纪念日', style: STATUS_STYLES.HOLIDAY_EXTRA },
]

function CheckInCalendar({
  month,
  days,
  onDayClick,
  isDayClickable,
  showLegend = true,
  compact = false,
}: CheckInCalendarProps) {
  const today = dayjs()
  const daysInMonth = month.daysInMonth()
  const startDayOfWeek = month.startOf('month').day()

  // 构建格子：月初空白 + 每日
  const cells: React.ReactNode[] = []
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<div key={`empty-${i}`} />)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = month.date(d)
    const dateStr = date.format('YYYY-MM-DD')
    const info = days[dateStr]
    // 缺失数据兜底：未来 → 待打卡，其余 → 休息
    const day: CalendarDayData = info || {
      date: dateStr,
      status: date.isAfter(today, 'day') ? 'FUTURE' : 'REST',
    }
    const style = STATUS_STYLES[day.status] || STATUS_STYLES.REST
    const isToday = date.isSame(today, 'day')
    const clickable = isDayClickable?.(day, date) ?? false

    cells.push(
      <div
        key={d}
        onClick={() => onDayClick?.(day, date)}
        style={{
          background: style.bg,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: style.border,
          borderRadius: compact ? 10 : 12,
          padding: compact ? '8px 4px' : '12px 8px',
          minHeight: compact ? 76 : 90,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          position: 'relative',
          ...(isToday && {
            boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.3)',
            borderColor: '#667eea',
          }),
        }}
        onMouseEnter={(e) => {
          if (!clickable) return
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
        }}
        onMouseLeave={(e) => {
          if (!clickable) return
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = isToday ? '0 0 0 3px rgba(102, 126, 234, 0.3)' : 'none'
        }}
      >
        {/* 法定假日小表情 */}
        {day.status === 'HOLIDAY_LEGAL' && (
          <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 14, lineHeight: 1 }}>😊</div>
        )}

        {/* 休息日小表情（周末，右上角） */}
        {day.status === 'REST' && (
          <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 14, lineHeight: 1 }}>😴</div>
        )}

        {/* 日期数字 */}
        <div style={{
          fontSize: compact ? 15 : 18,
          fontWeight: 700,
          color: style.text,
          marginBottom: compact ? 4 : 8,
          textAlign: 'center',
        }}>
          {d}
          {isToday && (
            <div style={{ fontSize: 9, color: '#667eea', fontWeight: 600, marginTop: 2 }}>今天</div>
          )}
        </div>

        {/* 节假日名称 */}
        {day.holidayName && (
          <div style={{
            fontSize: compact ? 9 : 10,
            fontWeight: 600,
            color: style.text,
            textAlign: 'center',
            marginBottom: 4,
            padding: '2px 4px',
            background: 'rgba(255,255,255,0.5)',
            borderRadius: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {day.holidayName}
          </div>
        )}

        {/* 上/下班打卡时间 */}
        {(day.morningTime || day.eveningTime) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 4 }}>
            {day.morningTime && (
              <div style={{
                fontSize: compact ? 9 : 10,
                fontWeight: 600,
                color: style.text,
                background: 'rgba(255,255,255,0.6)',
                padding: compact ? '2px 4px' : '3px 6px',
                borderRadius: 6,
                textAlign: 'center',
                backdropFilter: 'blur(4px)',
              }}>
                ☀ {day.morningTime}
              </div>
            )}
            {day.eveningTime && (
              <div style={{
                fontSize: compact ? 9 : 10,
                fontWeight: 600,
                color: style.text,
                background: 'rgba(255,255,255,0.6)',
                padding: compact ? '2px 4px' : '3px 6px',
                borderRadius: 6,
                textAlign: 'center',
                backdropFilter: 'blur(4px)',
              }}>
                ☾ {day.eveningTime}
              </div>
            )}
          </div>
        )}

        {/* 未打卡标记（中性灰色，兼容旧 ABSENT 值） */}
        {(day.status === 'ABSENT' || day.status === 'NOT_CHECKED') && (
          <div style={{
            fontSize: compact ? 10 : 11,
            fontWeight: 600,
            color: '#9ca3af',
            textAlign: 'center',
            marginTop: 4,
          }}>
            未打卡
          </div>
        )}

        {/* 休息日标记（周末；图标在右上角，与法定假日样式统一） */}
        {day.status === 'REST' && (
          <div style={{ fontSize: compact ? 9 : 10, fontWeight: 600, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
            休息
          </div>
        )}

        {/* 未来日期标记 */}
        {day.status === 'FUTURE' && (
          <div style={{ fontSize: compact ? 9 : 10, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
            待打卡
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* 星期标题 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 8,
        marginBottom: 12,
      }}>
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} style={{
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: '#9ca3af',
            padding: '8px 0',
          }}>
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {cells}
      </div>

      {/* 图例 */}
      {showLegend && (
        <div style={{
          marginTop: 24,
          paddingTop: 24,
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: 32,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {LEGEND_ITEMS.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: item.style.bg,
                border: `2px solid ${item.style.border}`,
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CheckInCalendar
