import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Tag, Tabs, Button, Modal, Form, Input, Select, DatePicker, Badge, Popconfirm, App as AntApp } from 'antd'
import {
  UserOutlined, ProjectOutlined, FileTextOutlined,
  CheckCircleOutlined, ClockCircleOutlined, FundOutlined,
  CarOutlined, AccountBookOutlined, SendOutlined,
  DashboardOutlined, PlusOutlined, CheckOutlined, PlayCircleOutlined,
  DeleteOutlined, ExclamationCircleOutlined, EditOutlined, StopOutlined,
  InboxOutlined, CalendarOutlined, FieldTimeOutlined,
  SunOutlined, MoonOutlined
} from '@ant-design/icons'
import { getTasks, createTask, updateTask, deleteTask, getUserDropdown, getTodayCheckIn, checkIn, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

function Dashboard() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<any[]>([])
  const [delegatedTasks, setDelegatedTasks] = useState<any[]>([])
  const [taskModalVisible, setTaskModalVisible] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [taskForm] = Form.useForm()
  const [taskType, setTaskType] = useState<'assigned' | 'delegated'>('assigned')
  const [users, setUsers] = useState<any[]>([])
  const [todayCheckIn, setTodayCheckIn] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState(dayjs())

  const user = safeJsonParse(localStorage.getItem('user'), {})
  const userPermissions = safeJsonParse(localStorage.getItem('permissions'), [])

  // Update time every minute for display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(dayjs()), 60000)
    return () => clearInterval(timer)
  }, [])

  // 快捷操作
  const quickActions = [
    { label: '新增客户', icon: <UserOutlined />, path: '/customers', color: '#4f46e5', bg: '#eef2ff', perm: 'edit_customers' },
    { label: '新建商机', icon: <FundOutlined />, path: '/opportunities', color: '#7c3aed', bg: '#f5f3ff', perm: 'edit_opportunities' },
    { label: '新建项目', icon: <ProjectOutlined />, path: '/projects', color: '#0891b2', bg: '#ecfeff', perm: 'create_projects' },
    { label: '查看报价', icon: <FileTextOutlined />, path: '/quotations', color: '#059669', bg: '#ecfdf5', perm: 'view_quotations' },
    { label: '填写日报', icon: <SendOutlined />, path: '/daily-reports', color: '#d97706', bg: '#fffbeb', perm: 'create_reports' },
    { label: '申请出差', icon: <CarOutlined />, path: '/business-trips', color: '#db2777', bg: '#fdf2f8', perm: 'submit_trips' },
    { label: '申请报销', icon: <AccountBookOutlined />, path: '/expenses', color: '#dc2626', bg: '#fef2f2', perm: 'submit_expenses' },
  ]

  const filteredQuickActions = quickActions.filter(action => {
    if (user.role === 'ADMIN') return true
    return userPermissions.includes(action.perm)
  })

  const fetchTodayCheckIn = async () => {
    try {
      const data: any = await getTodayCheckIn()
      setTodayCheckIn(data)
    } catch (error) {
      console.error('获取今日打卡状态失败:', error)
    }
  }

  const handleQuickCheckIn = async () => {
    try {
      const hour = dayjs().hour()
      const period = hour < 12 ? 'MORNING' : 'EVENING'
      const result: any = await checkIn({ period })
      message.success(result?.message || '打卡成功！')
      fetchTodayCheckIn()
    } catch (error: any) {
      message.error(error?.error || '打卡失败')
    }
  }

  const fetchTasks = async () => {
    try {
      const [assigned, delegated] = await Promise.all([
        getTasks({ type: 'assigned' }) as any,
        getTasks({ type: 'delegated' }) as any,
      ])
      setTasks(Array.isArray(assigned) ? assigned : [])
      setDelegatedTasks(Array.isArray(delegated) ? delegated : [])
    } catch (e) { /* ignore */ }
  }

  const fetchUsers = async () => {
    try {
      const data = await getUserDropdown() as any
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) { /* ignore */ }
  }

  const priorityMap: Record<string, { text: string; color: string; hex: string }> = {
    LOW: { text: '低', color: 'default', hex: '#94a3b8' },
    MEDIUM: { text: '中', color: 'blue', hex: '#3b82f6' },
    HIGH: { text: '高', color: 'orange', hex: '#f59e0b' },
    URGENT: { text: '紧急', color: 'red', hex: '#ef4444' },
  }
  const statusMap: Record<string, { text: string; color: string }> = {
    PENDING: { text: '待处理', color: 'default' },
    IN_PROGRESS: { text: '进行中', color: 'processing' },
    SUBMITTED: { text: '待确认', color: 'gold' },
    COMPLETED: { text: '已完成', color: 'success' },
    CANCELLED: { text: '已取消', color: 'warning' },
  }

  const handleUpdateTask = async (id: number, status: string) => {
    try {
      await updateTask(id, { status })
      message.success(status === 'COMPLETED' ? '任务已完成 🎉' : '任务已更新')
      fetchTasks()
    } catch (e) {
      message.error('更新失败')
    }
  }

  const handleDeleteTask = async (id: number) => {
    try {
      await deleteTask(id)
      message.success('任务已删除')
      fetchTasks()
    } catch (e) {
      message.error('删除失败')
    }
  }

  const handleCreateTask = async () => {
    try {
      const values = await taskForm.validateFields()
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: values.title,
          description: values.description,
          priority: values.priority,
          dueDate: values.dueDate ? values.dueDate.toDate() : null,
          assigneeIds: values.assigneeIds,
        })
        message.success('任务已更新')
      } else {
        await createTask({ ...values, dueDate: values.dueDate ? values.dueDate.toDate() : undefined })
        message.success('任务已委派')
      }
      setTaskModalVisible(false)
      setEditingTask(null)
      taskForm.resetFields()
      fetchTasks()
    } catch (e) {
      message.error('操作失败')
    }
  }

  const openEditTask = (task: any) => {
    setEditingTask(task)
    taskForm.setFieldsValue({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate ? dayjs(task.dueDate) : null,
      assigneeIds: task.assignees ? task.assignees.map((a: any) => a.id) : [],
    })
    setTaskModalVisible(true)
  }

  useEffect(() => {
    fetchTasks()
    fetchUsers()
    fetchTodayCheckIn()
  }, [])

  // 时段问候
  const hour = dayjs().hour()
  const greeting = hour < 6 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  const greetingIcon = hour < 6 ? '🌙' : hour < 9 ? '🌅' : hour < 12 ? '☀️' : hour < 14 ? '🌤️' : hour < 18 ? '🌇' : '🌙'

  const sortTasks = (list: any[]) => {
    const active = list.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    const done = list.filter(t => t.status === 'COMPLETED' || t.status === 'CANCELLED')
    return [...active, ...done]
  }

  const activeTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const activeDelegated = delegatedTasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')

  // Check-in card state computation
  const morningChecked = todayCheckIn?.morningCheckedIn
  const eveningChecked = todayCheckIn?.eveningCheckedIn
  const isAllChecked = morningChecked && eveningChecked

  let checkinStatusText = ''

  if (hour < 12) {
    if (morningChecked) {
      const mc = todayCheckIn?.morningCount || 1
      checkinStatusText = `✓ ${todayCheckIn?.morningRecord ? dayjs(todayCheckIn.morningRecord.checkInTime).format('HH:mm') : ''} 已签到${mc > 1 ? ` (共${mc}次，以最早为准)` : ''}`
    } else if (hour >= 9) {
      checkinStatusText = '⚠ 已超过 09:00'
    } else {
      checkinStatusText = '✦ 请在 09:00 前打卡'
    }
  } else {
    if (eveningChecked) {
      const ec = todayCheckIn?.eveningCount || 1
      checkinStatusText = `✓ ${todayCheckIn?.eveningRecord ? dayjs(todayCheckIn.eveningRecord.checkInTime).format('HH:mm') : ''} 已签退${ec > 1 ? ` (共${ec}次，以最晚为准)` : ''}`
    } else if (hour < 17 || (hour === 17 && currentTime.minute() < 30)) {
      checkinStatusText = '⚠ 未到 17:30'
    } else {
      checkinStatusText = '✦ 可以下班打卡了'
    }
  }

  // Empty state component
  const renderEmpty = (icon: React.ReactNode, text: string, sub: string) => (
    <div className="bd-empty-state">
      <div className="bd-empty-state-icon">{icon}</div>
      <div className="bd-empty-state-text">{text}</div>
      <div className="bd-empty-state-sub">{sub}</div>
    </div>
  )

  // Task list item renderer
  const renderTaskItem = (task: any, isDelegated: boolean) => {
    const p = priorityMap[task.priority] || priorityMap.MEDIUM
    const s = statusMap[task.status] || statusMap.PENDING
    const isOverdue = task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day') && !['COMPLETED', 'CANCELLED', 'SUBMITTED'].includes(task.status)
    const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED'
    const isSubmitted = task.status === 'SUBMITTED'

    return (
      <div
        className={`bd-task-item${isDone ? ' done' : ''}`}
        style={{ borderLeftColor: p.hex }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, textDecoration: isDone ? 'line-through' : 'none' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{task.title}</span>
              <Tag color={p.color} style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>{p.text}</Tag>
              <Tag color={s.color} style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>{s.text}</Tag>
              {isOverdue && <Tag color="error" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}><ExclamationCircleOutlined /> 逾期</Tag>}
            </div>
            {/* Description row */}
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              {isDelegated ? '指派给：' : '委派人：'}
              <span style={{ color: '#374151', fontWeight: 500 }}>
                {isDelegated
                  ? (task.assignees || []).map((a: any) => a.name).join('、') || '-'
                  : (task.assigner?.name || '-')
                }
              </span>
              {task.dueDate && (
                <span style={{ marginLeft: 12, color: isOverdue ? '#ef4444' : '#6b7280' }}>
                  <ClockCircleOutlined style={{ marginRight: 3 }} />
                  截止：{dayjs(task.dueDate).format('YYYY-MM-DD')}
                </span>
              )}
              {task.status === 'COMPLETED' && task.completedAt && (
                <span style={{ marginLeft: 12, color: '#059669' }}>
                  <CheckCircleOutlined style={{ marginRight: 3 }} />
                  完成于 {dayjs(task.completedAt).format('MM-DD HH:mm')}
                </span>
              )}
            </div>
            {task.description && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.description}
              </div>
            )}
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            {!isDelegated && !isDone && !isSubmitted && task.status === 'PENDING' && (
              <Button type="link" size="small" icon={<PlayCircleOutlined />} style={{ color: '#4f46e5' }} onClick={() => handleUpdateTask(task.id, 'IN_PROGRESS')}>开始</Button>
            )}
            {!isDelegated && !isDone && !isSubmitted && (
              <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#059669' }} onClick={() => handleUpdateTask(task.id, 'SUBMITTED')}>提交</Button>
            )}
            {isDelegated && isSubmitted && (
              <Popconfirm title="确认此任务已完成？" onConfirm={() => handleUpdateTask(task.id, 'COMPLETED')}>
                <Button type="link" size="small" style={{ color: '#059669' }} icon={<CheckCircleOutlined />}>确认</Button>
              </Popconfirm>
            )}
            {isDelegated && isSubmitted && (
              <Popconfirm title="确定驳回此任务？" onConfirm={() => handleUpdateTask(task.id, 'IN_PROGRESS')}>
                <Button type="link" size="small" danger>驳回</Button>
              </Popconfirm>
            )}
            {!isDelegated && isSubmitted && (
              <span style={{ fontSize: 12, color: '#d97706', padding: '2px 8px', background: '#fffbeb', borderRadius: 4 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />等待确认
              </span>
            )}
            {!isDone && !isSubmitted && (
              <Popconfirm title="确定取消此任务？" onConfirm={() => handleUpdateTask(task.id, 'CANCELLED')}>
                <Button type="link" size="small" danger icon={<StopOutlined />}>取消</Button>
              </Popconfirm>
            )}
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditTask(task)}>编辑</Button>
            <Popconfirm title="确定删除此任务？" onConfirm={() => handleDeleteTask(task.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bd-page-enter">
      {/* ====== Greeting Section ====== */}
      <div className="bd-page-enter" style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>
            {greetingIcon}{' '}
            <span>{greeting}，</span>
            <span className="bd-greeting-name">{user.name || user.username || ''}</span>
          </h2>
          <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined />
            <span>{dayjs().format('YYYY年M月D日 dddd')}</span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <FieldTimeOutlined />
            <span>{currentTime.format('HH:mm')}</span>
          </div>
        </div>
        {activeTasks.length > 0 && (
          <div style={{
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
            borderRadius: 10,
            border: '1px solid #e0e7ff',
            fontSize: 13,
            color: '#4f46e5',
            fontWeight: 500,
          }}>
            📋 待办 <strong>{activeTasks.length}</strong> 项
          </div>
        )}
      </div>

      {/* ====== Check-in Section ====== */}
      <Card
        className="bd-page-enter-d1"
        style={{
          marginBottom: 24,
          borderRadius: 16,
          border: '1px solid #f1f5f9',
          overflow: 'hidden',
          background: isAllChecked
            ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
            : (hour < 12 && morningChecked) || (hour >= 12 && eveningChecked)
              ? 'linear-gradient(135deg, #f0fdf4 0%, #f0f9ff 100%)'
              : 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)'
        }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <Row gutter={24} align="middle">
          {/* Left: Title & Status */}
          <Col xs={24} md={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'linear-gradient(135deg, #059669, #10b981)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18,
              }}>
                <CalendarOutlined />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>今日考勤</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {dayjs().format('M月D日 dddd')} · 当前 {currentTime.format('HH:mm')}
                </div>
              </div>
            </div>

            {/* Status badges */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 10,
                background: morningChecked ? '#fff' : '#f9fafb',
                border: `1.5px solid ${morningChecked ? '#a7f3d0' : '#e5e7eb'}`,
                transition: 'all 0.2s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <SunOutlined style={{ color: morningChecked ? '#f59e0b' : '#d1d5db', fontSize: 16 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: morningChecked ? '#059669' : '#9ca3af' }}>上班打卡</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: morningChecked ? '#059669' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                  {morningChecked && todayCheckIn?.morningRecord
                    ? dayjs(todayCheckIn.morningRecord.checkInTime).format('HH:mm')
                    : '--:--'}
                </div>
                {(todayCheckIn?.morningCount || 0) > 1 && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    共 {todayCheckIn.morningCount} 次 · 以最早为准
                  </div>
                )}
              </div>

              <div style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 10,
                background: eveningChecked ? '#fff' : '#f9fafb',
                border: `1.5px solid ${eveningChecked ? '#a7f3d0' : '#e5e7eb'}`,
                transition: 'all 0.2s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <MoonOutlined style={{ color: eveningChecked ? '#6366f1' : '#d1d5db', fontSize: 16 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: eveningChecked ? '#059669' : '#9ca3af' }}>下班打卡</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: eveningChecked ? '#059669' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                  {eveningChecked && todayCheckIn?.eveningRecord
                    ? dayjs(todayCheckIn.eveningRecord.checkInTime).format('HH:mm')
                    : '--:--'}
                </div>
                {(todayCheckIn?.eveningCount || 0) > 1 && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    共 {todayCheckIn.eveningCount} 次 · 以最晚为准
                  </div>
                )}
              </div>
            </div>

            {checkinStatusText && (
              <div style={{ fontSize: 12, color: '#6b7280' }}>{checkinStatusText}</div>
            )}
          </Col>

          {/* Right: Single Check-in Button */}
          <Col xs={24} md={12} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Button
              size="large"
              icon={isAllChecked ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
              onClick={handleQuickCheckIn}
              style={{
                height: 72,
                fontSize: 20,
                fontWeight: 700,
                borderRadius: 16,
                minWidth: 200,
                background: isAllChecked
                  ? 'linear-gradient(135deg, #059669, #10b981)'
                  : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                color: '#fff',
                border: 'none',
                boxShadow: isAllChecked
                  ? '0 4px 16px rgba(5, 150, 105, 0.3)'
                  : '0 4px 16px rgba(79, 70, 229, 0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              {isAllChecked ? '✓ 已打卡' : '打卡'}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ====== Quick Action Cards ====== */}
      <Row gutter={[16, 16]} className="bd-page-enter-d1" style={{ marginBottom: 24 }}>
        {filteredQuickActions.map((item, idx) => (
          <Col xs={8} sm={8} md={6} lg={3} key={item.label}>
            <div
              className="bd-quick-action"
              onClick={() => navigate(item.path)}
              style={{ '--qa-color': item.color } as React.CSSProperties}
            >
              <style>{`.bd-quick-action:nth-child(${idx + 1})::before { background: ${item.color}; }`}</style>
              <div className="bd-qa-icon-circle" style={{ background: item.bg, color: item.color }}>
                {item.icon}
              </div>
              <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, lineHeight: 1.4 }}>{item.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* ====== Task Management Panel ====== */}
      <Card
        className="bd-page-enter-d2"
        style={{ borderRadius: 16, marginBottom: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}
        styles={{ body: { padding: '16px 20px' }, header: { padding: '16px 20px 0', borderBottom: 'none' } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 16,
            }}>
              <DashboardOutlined />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>任务管理</span>
          </div>
        }
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => { setEditingTask(null); taskForm.resetFields(); setTaskModalVisible(true) }}
            style={{ borderRadius: 8, fontWeight: 600, background: '#4f46e5', boxShadow: '0 2px 8px rgba(79,70,229,0.25)' }}
          >
            委派任务
          </Button>
        }
      >
        {/* Gradient divider under header */}
        <div className="bd-section-divider" style={{ marginBottom: 16 }} />

        <Tabs
          activeKey={taskType}
          onChange={(k) => setTaskType(k as 'assigned' | 'delegated')}
          items={[
            {
              key: 'assigned',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <span>我的待办</span>
                  {activeTasks.length > 0 && (
                    <Badge
                      count={activeTasks.length}
                      size="small"
                      style={{ backgroundColor: '#4f46e5', boxShadow: '0 0 0 2px rgba(79,70,229,0.15)', fontWeight: 600 }}
                    />
                  )}
                </span>
              ),
              children: tasks.length === 0
                ? renderEmpty(<InboxOutlined />, '暂无任务', '轻松一刻，没有待办事项需要处理')
                : (
                  <div>
                    {sortTasks(tasks).map((task: any) => (
                      <div key={task.id}>
                        {renderTaskItem(task, false)}
                      </div>
                    ))}
                  </div>
                ),
            },
            {
              key: 'delegated',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <span>我委派的</span>
                  {activeDelegated.length > 0 && (
                    <Badge
                      count={activeDelegated.length}
                      size="small"
                      style={{ backgroundColor: '#7c3aed', boxShadow: '0 0 0 2px rgba(124,58,237,0.15)', fontWeight: 600 }}
                    />
                  )}
                </span>
              ),
              children: delegatedTasks.length === 0
                ? renderEmpty(<SendOutlined />, '暂无委派任务', '还没有委派给其他人的任务')
                : (
                  <div>
                    {sortTasks(delegatedTasks).map((task: any) => (
                      <div key={task.id}>
                        {renderTaskItem(task, true)}
                      </div>
                    ))}
                  </div>
                ),
            },
          ]}
        />
      </Card>

      {/* ====== Delegate / Edit Task Modal ====== */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: editingTask
                ? 'linear-gradient(135deg, #059669, #10b981)'
                : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14,
            }}>
              {editingTask ? <EditOutlined /> : <PlusOutlined />}
            </div>
            <span style={{ fontWeight: 600 }}>{editingTask ? '编辑任务' : '委派任务'}</span>
          </div>
        }
        open={taskModalVisible}
        onOk={handleCreateTask}
        onCancel={() => { setTaskModalVisible(false); setEditingTask(null); taskForm.resetFields() }}
        okText={editingTask ? '保存' : '确认'}
        cancelText="取消"
        okButtonProps={{ style: { background: '#4f46e5', borderColor: '#4f46e5', borderRadius: 8 } }}
        cancelButtonProps={{ style: { borderRadius: 8 } }}
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form form={taskForm} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="请输入任务标题" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="assigneeIds" label="指派给" rules={[{ required: true, message: '请选择指派人' }]}>
            <Select mode="multiple" showSearch optionFilterProp="label" placeholder="选择成员（可多选）" style={{ borderRadius: 8 }}>
              {users.filter((u: any) => u.id !== user.id).map((u: any) => (
                <Select.Option key={u.id} value={u.id} label={u.name}>
                  {u.name} ({u.username})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} placeholder="描述任务内容（可选）" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="priority" label="优先级" initialValue="MEDIUM">
                <Select>
                  <Select.Option value="LOW">低</Select.Option>
                  <Select.Option value="MEDIUM">中</Select.Option>
                  <Select.Option value="HIGH">高</Select.Option>
                  <Select.Option value="URGENT">紧急</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dueDate" label="截止日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default Dashboard
