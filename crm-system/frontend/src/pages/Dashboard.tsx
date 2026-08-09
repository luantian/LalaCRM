import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Tag, Tabs, Button, Modal, Form, Input, Select, DatePicker, Badge, Popconfirm, App as AntApp, Upload, Typography, Divider, Dropdown, Pagination, Timeline } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined,
  DashboardOutlined, PlusOutlined, CheckOutlined, PlayCircleOutlined,
  DeleteOutlined, ExclamationCircleOutlined, EditOutlined, StopOutlined,
  InboxOutlined, SendOutlined, CalendarOutlined, FieldTimeOutlined,
  SunOutlined, MoonOutlined, SearchOutlined, FileOutlined, UploadOutlined,
  DownloadOutlined, EyeOutlined, PaperClipOutlined,
  ProjectOutlined, TeamOutlined, CheckSquareOutlined,
  EllipsisOutlined, UserOutlined
} from '@ant-design/icons'
import { getTasks, createTask, updateTask, deleteTask, getUserDropdown, getTodayCheckIn, checkIn, safeJsonParse, getTaskRecords, createTaskRecord, updateTaskRecord, uploadTaskFiles, uploadTaskRecordFiles, downloadTaskRecordFileUrl, downloadTaskFileUrl, previewTaskFileUrl, previewTaskRecordFileUrl, openFilePreview, isPreviewableFile, getPreviewUrl, getProjects, getMyInProgressProjects } from '../services/api'
import dayjs from 'dayjs'

const { TextArea } = Input
const { Text } = Typography

function Dashboard() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<any[]>([])
  const [delegatedTasks, setDelegatedTasks] = useState<any[]>([])
  const [historicalTasks, setHistoricalTasks] = useState<any[]>([])
  const [taskModalVisible, setTaskModalVisible] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [taskForm] = Form.useForm()
  const [taskType, setTaskType] = useState<'assigned' | 'delegated' | 'historical'>('assigned')
  const [users, setUsers] = useState<any[]>([])
  const [todayCheckIn, setTodayCheckIn] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState(dayjs())
  const [completionModalVisible, setCompletionModalVisible] = useState(false)
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null)
  const [completionNote, setCompletionNote] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 6

  // 任务详情弹窗相关状态
  const [taskDetailVisible, setTaskDetailVisible] = useState(false)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [taskRecords, setTaskRecords] = useState<any[]>([])
  const [recordModalVisible, setRecordModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [recordForm] = Form.useForm()
  const [recordModalFiles, setRecordModalFiles] = useState<File[]>([])

  // 驳回弹窗相关状态
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false)
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // 提交弹窗相关状态
  const [submitModalVisible, setSubmitModalVisible] = useState(false)
  const [submittingTaskId, setSubmittingTaskId] = useState<number | null>(null)
  const [submitNote, setSubmitNote] = useState('')
  const [submitFiles, setSubmitFiles] = useState<FileList | null>(null)

  // 项目列表相关状态
  const [projects, setProjects] = useState<any[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  // 我参与的进行中项目
  const [myProjects, setMyProjects] = useState<any[]>([])

  const user = safeJsonParse(localStorage.getItem('user'), {})

  // Update time every minute for display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(dayjs()), 60000)
    return () => clearInterval(timer)
  }, [])

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
      const result: any = await checkIn({})
      message.success(result?.message || '打卡成功！')
      fetchTodayCheckIn()
    } catch (error: any) {
      message.error(error?.error || '打卡失败')
    }
  }

  const fetchTasks = async () => {
    try {
      const searchParams = searchKeyword ? { search: searchKeyword } : {}
      const [assigned, delegated, historical] = await Promise.all([
        getTasks({ type: 'assigned', ...searchParams }) as any,
        getTasks({ type: 'delegated', ...searchParams }) as any,
        getTasks({ type: 'historical', ...searchParams }) as any,
      ])
      setTasks(Array.isArray(assigned) ? assigned : [])
      setDelegatedTasks(Array.isArray(delegated) ? delegated : [])
      setHistoricalTasks(Array.isArray(historical) ? historical : [])
    } catch (e) { /* ignore */ }
  }

  const fetchUsers = async () => {
    try {
      const data = await getUserDropdown() as any
      // 按 id 去重，防止下拉列表出现重复选项
      const uniqueUsers = Array.isArray(data) 
        ? data.filter((u: any, index: number, self: any[]) => 
            index === self.findIndex((t: any) => t.id === u.id)
          )
        : []
      setUsers(uniqueUsers)
    } catch (e) { /* ignore */ }
  }

  const fetchProjects = async () => {
    setProjectsLoading(true)
    try {
      const data = await getProjects({ pageSize: 1000 }) as any
      setProjects(Array.isArray(data?.data) ? data.data : [])
    } catch (e) { /* ignore */ }
    setProjectsLoading(false)
  }

  const fetchMyProjects = async () => {
    try {
      const data = await getMyInProgressProjects() as any
      setMyProjects(Array.isArray(data) ? data : [])
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
  const taskTypeMap: Record<string, { text: string; color: string }> = {
    DAILY_WORK: { text: '日常工作', color: 'cyan' },
    PROJECT_TASK: { text: '项目任务', color: 'blue' },
    MEETING: { text: '会议任务', color: 'purple' },
    TRAINING: { text: '培训任务', color: 'green' },
    OTHER: { text: '其他任务', color: 'default' },
  }

  // 文件大小格式化
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleUpdateTask = async (id: number, status: string, completionNote?: string) => {
    try {
      const updateData: any = { status }
      if (completionNote !== undefined) {
        updateData.completionNote = completionNote
      }
      await updateTask(id, updateData)
      message.success(status === 'COMPLETED' ? '任务已完成 🎉' : '任务已更新')
      fetchTasks()
    } catch (e: any) {
      message.error(e?.error || '更新失败')
    }
  }

  const handleCompleteTask = (id: number) => {
    setCompletingTaskId(id)
    setCompletionNote('')
    setCompletionModalVisible(true)
  }

  const handleConfirmComplete = async () => {
    if (completingTaskId) {
      await handleUpdateTask(completingTaskId, 'COMPLETED', completionNote)
      setCompletionModalVisible(false)
      setCompletingTaskId(null)
      setCompletionNote('')
    }
  }

  const handleRejectTask = (id: number) => {
    setRejectingTaskId(id)
    setRejectionReason('')
    setRejectionModalVisible(true)
  }

  const handleConfirmReject = async () => {
    if (rejectingTaskId && rejectionReason.trim()) {
      try {
        await updateTask(rejectingTaskId, { status: 'IN_PROGRESS', rejectionReason })
        message.success('已驳回任务')
        setRejectionModalVisible(false)
        setRejectingTaskId(null)
        setRejectionReason('')
        fetchTasks()
      } catch (e: any) {
        message.error(e?.error || '驳回失败')
      }
    } else {
      message.warning('请填写驳回理由')
    }
  }

  const handleSubmitTask = (id: number) => {
    setSubmittingTaskId(id)
    setSubmitNote('')
    setSubmitModalVisible(true)
  }

  const handleConfirmSubmit = async () => {
    if (submittingTaskId && submitNote.trim()) {
      try {
        await updateTask(submittingTaskId, { status: 'SUBMITTED', completionNote: submitNote })
        
        // 上传附件
        if (submitFiles && submitFiles.length > 0) {
          await uploadTaskFiles(submittingTaskId, submitFiles)
        }
        
        message.success('任务已提交')
        setSubmitModalVisible(false)
        setSubmittingTaskId(null)
        setSubmitNote('')
        setSubmitFiles(null)
        fetchTasks()
      } catch (e: any) {
        message.error(e?.error || '提交失败')
      }
    } else {
      message.warning('请填写完成内容')
    }
  }

  const handleDeleteTask = async (id: number) => {
    try {
      await deleteTask(id)
      message.success('任务已删除')
      fetchTasks()
    } catch (e: any) {
      message.error(e?.error || '删除失败')
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
          taskType: values.taskType,
          projectId: values.taskType !== 'DAILY_WORK' ? values.projectId : null,
        })
        message.success('任务已更新')
      } else {
        await createTask({
          ...values,
          dueDate: values.dueDate ? values.dueDate.toDate() : undefined,
          taskType: values.taskType,
          projectId: values.taskType !== 'DAILY_WORK' ? values.projectId : null,
        })
        message.success('任务已委派')
      }
      setTaskModalVisible(false)
      setEditingTask(null)
      taskForm.resetFields()
      fetchTasks()
    } catch (e: any) {
      message.error(e?.error || '操作失败')
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
      taskType: task.type || 'DAILY_WORK',
      projectId: task.projectId || undefined,
    })
    setTaskModalVisible(true)
  }

  // 打开任务详情弹窗
  const openTaskDetail = async (task: any) => {
    setSelectedTask(task)
    setTaskDetailVisible(true)
    await fetchTaskRecords(task.id)
  }

  // 获取任务记录
  const fetchTaskRecords = async (taskId: number) => {
    try {
      const data: any = await getTaskRecords(taskId)
      setTaskRecords(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('获取任务记录失败:', error)
    }
  }

  // 创建/更新任务记录
  const handleSaveRecord = async () => {
    if (!selectedTask) return
    try {
      const values = await recordForm.validateFields()
      if (editingRecord) {
        await updateTaskRecord(selectedTask.id, editingRecord.id, values)
        message.success('记录已更新')
        // 如果有新附件，上传到已有记录
        if (recordModalFiles.length > 0) {
          const dataTransfer = new DataTransfer()
          recordModalFiles.forEach(f => dataTransfer.items.add(f))
          await uploadTaskRecordFiles(selectedTask.id, editingRecord.id, dataTransfer.files)
        }
      } else {
        const newRecord: any = await createTaskRecord(selectedTask.id, values)
        message.success('记录已创建')
        // 如果有附件，上传到新创建的记录
        if (recordModalFiles.length > 0 && newRecord?.id) {
          const dataTransfer = new DataTransfer()
          recordModalFiles.forEach(f => dataTransfer.items.add(f))
          await uploadTaskRecordFiles(selectedTask.id, newRecord.id, dataTransfer.files)
        }
      }
      setRecordModalVisible(false)
      setEditingRecord(null)
      recordForm.resetFields()
      setRecordModalFiles([])
      await fetchTaskRecords(selectedTask.id)
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }



  useEffect(() => {
    fetchTasks()
    fetchUsers()
    fetchTodayCheckIn()
    fetchProjects()
    fetchMyProjects()
  }, [])

  // 搜索时自动刷新任务列表
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTasks()
    }, 300) // 300ms 防抖
    return () => clearTimeout(timer)
  }, [searchKeyword])

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

  // Task mini-card renderer (grid card style)
  const renderTaskItem = (task: any, isDelegated: boolean) => {
    const p = priorityMap[task.priority] || priorityMap.MEDIUM
    const s = statusMap[task.status] || statusMap.PENDING
    const t = taskTypeMap[task.type] || taskTypeMap.DAILY_WORK
    const isOverdue = task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day') && !['COMPLETED', 'CANCELLED', 'SUBMITTED'].includes(task.status)
    const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED'
    const isSubmitted = task.status === 'SUBMITTED'

    // More actions dropdown items
    const moreMenuItems: any[] = []
    if (!isDone && !isSubmitted) {
      moreMenuItems.push({
        key: 'cancel',
        label: (
          <Popconfirm title="确定取消此任务？" onConfirm={() => handleUpdateTask(task.id, 'CANCELLED')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StopOutlined /> 取消</span>
          </Popconfirm>
        ),
      })
    }
    moreMenuItems.push(
      { key: 'detail', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openTaskDetail(task)}><EyeOutlined /> 详情</span> },
      { key: 'edit', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openEditTask(task)}><EditOutlined /> 编辑</span> },
      {
        key: 'delete',
        label: (
          <Popconfirm title="确定删除此任务？" onConfirm={() => handleDeleteTask(task.id)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ef4444' }}><DeleteOutlined /> 删除</span>
          </Popconfirm>
        ),
      },
    )

    return (
      <div
        style={{
          borderRadius: 12,
          padding: 14,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderLeft: `4px solid ${p.hex}`,
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
        onClick={() => openTaskDetail(task)}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.12)'
          e.currentTarget.style.transform = 'translateY(-3px)'
          e.currentTarget.style.borderColor = '#a5b4fc'
          e.currentTarget.style.borderLeftColor = p.hex
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.borderColor = '#e2e8f0'
          e.currentTarget.style.borderLeftColor = p.hex
        }}
      >
        {/* 右上角更多菜单 */}
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
            <Button
              size="small"
              type="text"
              icon={<EllipsisOutlined />}
              style={{ color: '#94a3b8', borderRadius: 6 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#4f46e5' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}
            />
          </Dropdown>
        </div>

        {/* Row 1: Title + priority dot */}
        <div
          style={{
            fontSize: 14, fontWeight: 600, color: '#1e293b',
            lineHeight: 1.45, marginBottom: 8,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            textDecoration: isDone ? 'line-through' : 'none',
            paddingRight: 4,
          }}
          title={task.title}
        >
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: p.hex, marginRight: 6, verticalAlign: 'middle',
          }} />
          {task.title}
        </div>

        {/* Row 2: Tags */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          <Tag color={t.color} style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>{t.text}</Tag>
          <Tag color={s.color} style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>{s.text}</Tag>
          {isOverdue && <Tag color="error" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}><ExclamationCircleOutlined /> 逾期</Tag>}
        </div>

        {/* Row 3: Metadata */}
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8, marginBottom: 10, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <UserOutlined style={{ color: '#94a3b8', fontSize: 11 }} />
            <span style={{ color: '#374151', fontWeight: 500 }}>
              {isDelegated
                ? (task.assignees || []).map((a: any) => a.name).join('、') || '-'
                : (task.assigner?.name || '-')}
            </span>
            <span style={{ color: '#cbd5e1', margin: '0 2px' }}>·</span>
            <span>{isDelegated ? '我委派' : '指派给我'}</span>
          </div>
          {task.type !== 'DAILY_WORK' && task.project && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6366f1' }}>
              <ProjectOutlined style={{ fontSize: 11 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.project.name}</span>
            </div>
          )}
          {task.dueDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isOverdue ? '#ef4444' : '#94a3b8' }}>
              <ClockCircleOutlined style={{ fontSize: 11 }} />
              截止 {dayjs(task.dueDate).format('YYYY-MM-DD')}
            </div>
          )}
          {task.description && (
            <div style={{
              fontSize: 11,
              color: '#6b7280',
              marginTop: 4,
              padding: '4px 6px',
              background: '#f8fafc',
              borderRadius: 4,
              borderLeft: '2px solid #cbd5e1',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.5,
            }} title={task.description}>
              <FileOutlined style={{ fontSize: 10, marginRight: 3, color: '#94a3b8' }} />
              {task.description}
            </div>
          )}
          {task.status === 'COMPLETED' && task.completedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669' }}>
              <CheckCircleOutlined style={{ fontSize: 11 }} />
              完成于 {dayjs(task.completedAt).format('MM-DD HH:mm')}
            </div>
          )}
          {task.completionNote && (
            <div style={{
              fontSize: 11,
              color: '#059669',
              marginTop: 4,
              padding: '4px 6px',
              background: '#f0fdf4',
              borderRadius: 4,
              borderLeft: '2px solid #059669',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.5,
            }} title={task.completionNote}>
              <CheckSquareOutlined style={{ fontSize: 10, marginRight: 3 }} />
              {task.completionNote}
            </div>
          )}
          {task.files && task.files.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6366f1', marginTop: 4 }}>
              <PaperClipOutlined style={{ fontSize: 11 }} />
              <span>{task.files.length} 个附件</span>
            </div>
          )}
        </div>

        {/* Row 4: Actions */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          paddingTop: 10, borderTop: '1px solid #f1f5f9',
        }}>
          {!isDelegated && !isDone && !isSubmitted && task.status === 'PENDING' && (
            <Button size="small" icon={<PlayCircleOutlined />} style={{ color: '#4f46e5', borderColor: '#c7d2fe', background: '#eef2ff', fontWeight: 600, borderRadius: 6 }} onClick={(e) => { e.stopPropagation(); handleUpdateTask(task.id, 'IN_PROGRESS') }}>开始</Button>
          )}
          {!isDelegated && !isDone && !isSubmitted && (
            <Button size="small" icon={<CheckOutlined />} style={{ color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 600, borderRadius: 6 }} onClick={(e) => { e.stopPropagation(); handleSubmitTask(task.id) }}>提交</Button>
          )}
          {isDelegated && isSubmitted && (
            <>
              <Button size="small" icon={<CheckCircleOutlined />} style={{ color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 600, borderRadius: 6 }} onClick={(e) => { e.stopPropagation(); handleCompleteTask(task.id) }}>确认</Button>
              <Button size="small" danger style={{ borderRadius: 6, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); handleRejectTask(task.id) }}>驳回</Button>
            </>
          )}
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

        {/* 搜索框 */}
        <Input
          placeholder="搜索任务标题、描述..."
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          allowClear
          style={{ marginBottom: 16, borderRadius: 8 }}
          size="middle"
        />

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
              children: activeTasks.length === 0
                ? renderEmpty(<InboxOutlined />, '暂无任务', '轻松一刻，没有待办事项需要处理')
                : (
                  <>
                    <Row gutter={[14, 14]}>
                      {sortTasks(activeTasks).slice((currentPage - 1) * pageSize, currentPage * pageSize).map((task: any) => (
                        <Col xs={24} sm={12} lg={8} xl={4} key={task.id}>
                          {renderTaskItem(task, false)}
                        </Col>
                      ))}
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                      <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={activeTasks.length}
                        onChange={(page) => setCurrentPage(page)}
                        showSizeChanger={false}
                        showQuickJumper
                        showTotal={(total) => `共 ${total} 条`}
                      />
                    </div>
                  </>
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
              children: activeDelegated.length === 0
                ? renderEmpty(<SendOutlined />, '暂无委派任务', '还没有委派给其他人的任务')
                : (
                  <>
                    <Row gutter={[14, 14]}>
                      {sortTasks(activeDelegated).slice((currentPage - 1) * pageSize, currentPage * pageSize).map((task: any) => (
                        <Col xs={24} sm={12} lg={8} xl={4} key={task.id}>
                          {renderTaskItem(task, true)}
                        </Col>
                      ))}
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                      <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={activeDelegated.length}
                        onChange={(page) => setCurrentPage(page)}
                        showSizeChanger={false}
                        showQuickJumper
                        showTotal={(total) => `共 ${total} 条`}
                      />
                    </div>
                  </>
                ),
            },
            {
              key: 'historical',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <span>历史任务</span>
                  {historicalTasks.length > 0 && (
                    <Badge
                      count={historicalTasks.length}
                      size="small"
                      style={{ backgroundColor: '#6b7280', boxShadow: '0 0 0 2px rgba(107,114,128,0.15)', fontWeight: 600 }}
                    />
                  )}
                </span>
              ),
              children: historicalTasks.length === 0
                ? renderEmpty(<ClockCircleOutlined />, '暂无历史任务', '还没有已完成或已取消的任务')
                : (
                  <>
                    <Row gutter={[14, 14]}>
                      {historicalTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((task: any) => (
                        <Col xs={24} sm={12} lg={8} xl={4} key={task.id}>
                          {renderTaskItem(task, task.assigner?.id === user.id)}
                        </Col>
                      ))}
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                      <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={historicalTasks.length}
                        onChange={(page) => setCurrentPage(page)}
                        showSizeChanger={false}
                        showQuickJumper
                        showTotal={(total) => `共 ${total} 条`}
                      />
                    </div>
                  </>
                ),
            },
          ]}
        />
      </Card>

      {/* ====== My In-Progress Projects Panel ====== */}
      <Card
        className="bd-page-enter-d2"
        style={{ borderRadius: 16, marginBottom: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}
        styles={{ body: { padding: '16px 20px' }, header: { padding: '16px 20px 0', borderBottom: 'none' } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 16,
            }}>
              <ProjectOutlined />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>我参与的项目</span>
            {myProjects.length > 0 && (
              <Badge
                count={myProjects.length}
                size="small"
                style={{ backgroundColor: '#0ea5e9', boxShadow: '0 0 0 2px rgba(14,165,233,0.15)', fontWeight: 600 }}
              />
            )}
          </div>
        }
        extra={
          myProjects.length > 0 ? (
            <Button
              type="link"
              size="small"
              onClick={() => navigate('/projects')}
              style={{ color: '#4f46e5', fontWeight: 600 }}
            >
              查看全部 →
            </Button>
          ) : null
        }
      >
        <div className="bd-section-divider" style={{ marginBottom: 16 }} />
        {myProjects.length === 0
          ? renderEmpty(<ProjectOutlined />, '暂无参与的项目', '目前没有参与的进行中项目')
          : (
            <Row gutter={[14, 14]}>
              {myProjects.map((project: any) => {
                const isOverdue = project.endDate && dayjs(project.endDate).isBefore(dayjs(), 'day')
                return (
                  <Col xs={24} sm={12} lg={8} key={project.id}>
                    <div
                      onClick={() => navigate(`/projects/${project.id}`)}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: '1px solid #f1f5f9',
                        background: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#c7d2fe'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,70,229,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#f1f5f9'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      {/* 顶部：名称 + 状态 */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <div
                          style={{
                            fontSize: 14, fontWeight: 600, color: '#1e293b',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            flex: 1, minWidth: 0, lineHeight: 1.4,
                          }}
                          title={project.name}
                        >
                          {project.name}
                        </div>
                        <Tag
                          color={project.status === 'IN_PROGRESS' ? 'processing' : 'cyan'}
                          style={{ fontSize: 11, margin: 0, borderRadius: 4, flexShrink: 0 }}
                        >
                          {project.status === 'COMPLETED' ? '已完成' : '进行中'}
                        </Tag>
                      </div>

                      {/* 组织 + 负责人 */}
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, lineHeight: 1.7 }}>
                        {project.organization && <div>🏢 {project.organization.name}</div>}
                        <div>👤 {project.owner?.name || '-'}</div>
                      </div>

                      {/* 统计信息 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#6b7280' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <TeamOutlined style={{ color: '#7c3aed', fontSize: 12 }} />
                            {project._count?.teamMembers || 0} 人
                            <span style={{ margin: '0 4px', color: '#e5e7eb' }}>|</span>
                            <CheckSquareOutlined style={{ color: '#059669', fontSize: 12 }} />
                            {project._count?.tasks || 0} 任务
                          </span>
                          {project.endDate && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: isOverdue ? '#ef4444' : '#9ca3af' }}>
                              <ClockCircleOutlined style={{ fontSize: 11 }} />
                              {isOverdue ? '已逾期 ' : '截止 '}
                              {dayjs(project.endDate).format('YYYY-MM-DD')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Col>
                )
              })}
            </Row>
          )
        }
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
        <Form form={taskForm} layout="vertical" initialValues={{ taskType: 'DAILY_WORK' }}>
          <Form.Item name="taskType" label="任务类型" rules={[{ required: true, message: '请选择任务类型' }]}>
            <Select placeholder="请选择任务类型" style={{ borderRadius: 8 }}>
              <Select.Option value="DAILY_WORK">日常工作</Select.Option>
              <Select.Option value="PROJECT_TASK">项目任务</Select.Option>
              <Select.Option value="MEETING">会议任务</Select.Option>
              <Select.Option value="TRAINING">培训任务</Select.Option>
              <Select.Option value="OTHER">其他任务</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.taskType !== currentValues.taskType}>
            {({ getFieldValue }) => {
              const taskType = getFieldValue('taskType')
              return taskType !== 'DAILY_WORK' ? (
                <Form.Item name="projectId" label="关联项目" rules={[{ required: true, message: '请选择关联项目' }]}>
                  <Select
                    placeholder="请选择关联项目"
                    showSearch
                    optionFilterProp="children"
                    style={{ borderRadius: 8 }}
                    loading={projectsLoading}
                  >
                    {projects.map((project: any) => (
                      <Select.Option key={project.id} value={project.id}>
                        {project.name}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              ) : null
            }}
          </Form.Item>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="请输入任务标题" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="assigneeIds" label="指派给" rules={[{ required: true, message: '请选择指派人' }]}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="选择成员（可多选）"
              style={{ borderRadius: 8 }}
              options={users.map((u: any) => ({
                value: u.id,
                label: `${u.name} (${u.username})`
              }))}
            />
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

      {/* 任务详情弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14,
            }}>
              <FileOutlined />
            </div>
            <span style={{ fontWeight: 600 }}>任务详情</span>
          </div>
        }
        open={taskDetailVisible}
        onCancel={() => { setTaskDetailVisible(false); setSelectedTask(null) }}
        footer={null}
        width={800}
        styles={{ body: { paddingTop: 16 } }}
      >
        {selectedTask && (<>
          <Tabs
            defaultActiveKey="info"
            items={[
              {
                key: 'info',
                label: <span>基本信息</span>,
                children: (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ fontSize: 16 }}>{selectedTask.title}</Text>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Tag color={taskTypeMap[selectedTask.type]?.color || taskTypeMap.DAILY_WORK.color}>{taskTypeMap[selectedTask.type]?.text || taskTypeMap.DAILY_WORK.text}</Tag>
                        <Tag color={priorityMap[selectedTask.priority]?.color}>{priorityMap[selectedTask.priority]?.text}</Tag>
                        <Tag color={statusMap[selectedTask.status]?.color}>{statusMap[selectedTask.status]?.text}</Tag>
                        {selectedTask.dueDate && (
                          <Tag icon={<ClockCircleOutlined />}>
                            截止：{dayjs(selectedTask.dueDate).format('YYYY-MM-DD')}
                          </Tag>
                        )}
                      </div>
                    </div>
                    <Divider style={{ margin: '12px 0' }} />
                    <div style={{ marginBottom: 12 }}>
                      <Text type="secondary">任务类型：</Text>
                      <Text>{taskTypeMap[selectedTask.type]?.text || taskTypeMap.DAILY_WORK.text}</Text>
                    </div>
                    {selectedTask.type !== 'DAILY_WORK' && selectedTask.project && (
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary">关联项目：</Text>
                        <Text>{selectedTask.project.name}</Text>
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <Text type="secondary">委派人：</Text>
                      <Text>{selectedTask.assigner?.name || '-'}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text type="secondary">指派给：</Text>
                      <Text>{(selectedTask.assignees || []).map((a: any) => a.name).join('、') || '-'}</Text>
                    </div>
                    {selectedTask.description && (
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary">任务描述：</Text>
                        <div style={{ marginTop: 4, padding: 12, background: '#f9fafb', borderRadius: 6 }}>
                          {selectedTask.description}
                        </div>
                      </div>
                    )}
                    {selectedTask.completionNote && (
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary">完成总结：</Text>
                        <div style={{ marginTop: 4, padding: 12, background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #059669' }}>
                          {selectedTask.completionNote}
                        </div>
                      </div>
                    )}
                    {selectedTask.rejectionReason && (
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary">驳回理由：</Text>
                        <div style={{ marginTop: 4, padding: 12, background: '#fef2f2', borderRadius: 6, borderLeft: '3px solid #ef4444' }}>
                          {selectedTask.rejectionReason}
                        </div>
                      </div>
                    )}
                    {selectedTask.files && selectedTask.files.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary">附件：</Text>
                        <div style={{ marginTop: 4 }}>
                          {selectedTask.files.map((file: any) => (
                            <div
                              key={file.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 12px',
                                background: '#f9fafb',
                                borderRadius: 6,
                                marginBottom: 6,
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#f3f4f6'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#f9fafb'
                              }}
                              onClick={() => {
                                const url = getPreviewUrl(downloadTaskFileUrl, file.id)
                                window.open(url, '_blank')
                              }}
                            >
                              <PaperClipOutlined style={{ color: '#6366f1', fontSize: 14 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: '#1e293b',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {file.fileName}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                  {formatFileSize(file.fileSize)}
                                </div>
                              </div>
                              {isPreviewableFile(file.fileName) && (
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<EyeOutlined />}
                                  style={{ color: '#0ea5e9' }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openFilePreview(previewTaskFileUrl, file.id)
                                  }}
                                />
                              )}
                              <Button
                                type="text"
                                size="small"
                                icon={<DownloadOutlined />}
                                style={{ color: '#6366f1' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const url = getPreviewUrl(downloadTaskFileUrl, file.id)
                                  window.open(url, '_blank')
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'records',
                label: (
                  <span>
                    操作日志
                    {taskRecords.length > 0 && <Badge count={taskRecords.length} size="small" style={{ marginLeft: 6 }} />}
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong>任务流转记录</Text>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => { setEditingRecord(null); recordForm.resetFields(); setRecordModalFiles([]); setRecordModalVisible(true) }}
                      >
                        Notes信息
                      </Button>
                    </div>
                    {taskRecords.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                        <InboxOutlined style={{ fontSize: 48, marginBottom: 12 }} />
                        <div>暂无操作记录</div>
                      </div>
                    ) : (
                      <Timeline
                        items={(() => {
                          // 按时间正序排列（最早在上）
                          const sorted = [...taskRecords].sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
                          return sorted.map((record: any) => {
                            const isSystemRecord = ['CREATE', 'START', 'SUBMIT', 'REJECT', 'COMPLETE'].includes(record.type)
                            const recordStyle: Record<string, { color: string; label: string; bg: string }> = {
                              CREATE: { color: '#4f46e5', label: '委派', bg: '#eef2ff' },
                              START: { color: '#3b82f6', label: '开始', bg: '#eff6ff' },
                              SUBMIT: { color: '#059669', label: '提交', bg: '#f0fdf4' },
                              REJECT: { color: '#ef4444', label: '驳回', bg: '#fef2f2' },
                              COMPLETE: { color: '#22c55e', label: '完成', bg: '#f0fdf4' },
                            }
                            const style = recordStyle[record.type]
                            return {
                              key: record.id,
                              color: style?.color || '#94a3b8',
                              children: (
                                <div>
                                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                                    <span>{dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}</span>
                                    <span style={{ margin: '0 8px', color: '#e5e7eb' }}>|</span>
                                    <span>{record.user?.name}</span>
                                  </div>
                                  <div
                                    style={{
                                      background: style?.bg || '#f9fafb',
                                      padding: '10px 14px',
                                      borderRadius: 8,
                                      borderLeft: style ? `3px solid ${style.color}` : '3px solid #d1d5db',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                      {style && (
                                        <Tag color={style.color} style={{ fontSize: 11, margin: 0, color: '#fff' }}>
                                          {style.label}
                                        </Tag>
                                      )}
                                      {!isSystemRecord && record.type && (
                                        <Tag style={{ fontSize: 11, margin: 0 }}>{record.type === 'NOTE' ? 'note' : record.type === 'CALL' ? '电话' : record.type === 'MEETING' ? '会议' : record.type === 'EMAIL' ? '邮件' : record.type === 'VISIT' ? '拜访' : record.type}</Tag>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6, marginBottom: record.files?.length ? 8 : 0 }}>{record.content}</div>
                                    {record.files && record.files.length > 0 && (
                                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {record.files.map((file: any) => (
                                          <div
                                            key={file.id}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 4,
                                              padding: '4px 8px',
                                              background: '#fff',
                                              border: '1px solid #e5e7eb',
                                              borderRadius: 4,
                                              fontSize: 12,
                                            }}
                                          >
                                            <PaperClipOutlined />
                                            <span style={{ color: '#1e293b', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {file.fileName}
                                            </span>
                                            {isPreviewableFile(file.fileName) && (
                                              <Button
                                                type="text"
                                                size="small"
                                                icon={<EyeOutlined />}
                                                style={{ color: '#0ea5e9', padding: '0 4px' }}
                                                onClick={() => openFilePreview(previewTaskRecordFileUrl, file.id)}
                                              />
                                            )}
                                            <Button
                                              type="text"
                                              size="small"
                                              icon={<DownloadOutlined />}
                                              style={{ color: '#6366f1', padding: '0 4px' }}
                                              onClick={() => {
                                                const url = getPreviewUrl(downloadTaskRecordFileUrl, file.id)
                                                window.open(url, '_blank')
                                              }}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ),
                            }
                          })
                        })()}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
          
          {/* 任务操作按钮 */}
          {selectedTask && selectedTask.status === 'SUBMITTED' && String(selectedTask.assigner?.id) === String(user?.id) && (
            <div style={{ marginTop: 16, padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button
                  danger
                  style={{ borderRadius: 6, fontWeight: 600 }}
                  onClick={() => {
                    setRejectingTaskId(selectedTask.id)
                    setRejectionModalVisible(true)
                  }}
                >
                  驳回
                </Button>
                <Button
                  icon={<CheckCircleOutlined />}
                  style={{ color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 600, borderRadius: 6 }}
                  onClick={async () => {
                    try {
                      await updateTask(selectedTask.id, { status: 'COMPLETED' })
                      message.success('任务已确认完成')
                      setTaskDetailVisible(false)
                      setSelectedTask(null)
                      fetchTasks()
                    } catch (e: any) {
                      message.error(e?.error || '操作失败')
                    }
                  }}
                >
                  确认完成
                </Button>
              </div>
            </div>
          )}
        </>)}
      </Modal>

      {/* 任务记录编辑弹窗 */}
      <Modal
        title={editingRecord ? '编辑记录' : 'Notes信息'}
        open={recordModalVisible}
        onOk={handleSaveRecord}
        onCancel={() => { setRecordModalVisible(false); setEditingRecord(null); recordForm.resetFields(); setRecordModalFiles([]) }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={recordForm} layout="vertical" initialValues={{ type: 'NOTE' }}>
          <Form.Item name="type" label="记录类型">
            <Select>
              <Select.Option value="NOTE">note</Select.Option>
              <Select.Option value="CALL">电话</Select.Option>
              <Select.Option value="MEETING">会议</Select.Option>
              <Select.Option value="EMAIL">邮件</Select.Option>
              <Select.Option value="VISIT">拜访</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="content" label="记录内容" rules={[{ required: true, message: '请输入记录内容' }]}>
            <TextArea rows={4} placeholder="请输入记录内容..." />
          </Form.Item>
          <Form.Item label="附件">
            <Upload
              multiple
              beforeUpload={() => false}
              fileList={recordModalFiles.map((f, i) => ({ uid: `${i}`, name: f.name, status: 'done' as const }))}
              onChange={({ fileList }) => {
                setRecordModalFiles(fileList.map(f => f.originFileObj as File).filter(Boolean))
              }}
              onRemove={(file) => {
                setRecordModalFiles(prev => prev.filter(f => f.name !== file.name))
              }}
            >
              <Button icon={<UploadOutlined />}>选择附件（可多选）</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* 完成任务工作记录弹窗 */}
      <Modal
        title="确认完成任务"
        open={completionModalVisible}
        onOk={handleConfirmComplete}
        onCancel={() => {
          setCompletionModalVisible(false)
          setCompletingTaskId(null)
          setCompletionNote('')
        }}
        okText="确认完成"
        cancelText="取消"
        okButtonProps={{ style: { background: '#059669', borderColor: '#059669' } }}
      >
        <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
          请填写完成总结/工作记录，作为此任务的工作记录：
        </div>
        <Input.TextArea
          rows={4}
          value={completionNote}
          onChange={(e) => setCompletionNote(e.target.value)}
          placeholder="请描述完成的工作内容、成果或 note 信息..."
          style={{ borderRadius: 8 }}
          autoFocus
        />
      </Modal>

      {/* 驳回任务弹窗 */}
      <Modal
        title="驳回任务"
        open={rejectionModalVisible}
        onOk={handleConfirmReject}
        onCancel={() => {
          setRejectionModalVisible(false)
          setRejectingTaskId(null)
          setRejectionReason('')
        }}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ style: { background: '#ef4444', borderColor: '#ef4444' } }}
      >
        <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
          请填写驳回理由，帮助任务执行人改进：
        </div>
        <Input.TextArea
          rows={4}
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="请说明驳回的原因，例如：工作内容不完整、质量不达标、需要补充材料等..."
          style={{ borderRadius: 8 }}
          autoFocus
        />
      </Modal>

      {/* 提交任务弹窗 */}
      <Modal
        title="提交任务"
        open={submitModalVisible}
        onOk={handleConfirmSubmit}
        onCancel={() => {
          setSubmitModalVisible(false)
          setSubmittingTaskId(null)
          setSubmitNote('')
          setSubmitFiles(null)
        }}
        okText="确认提交"
        cancelText="取消"
        okButtonProps={{ style: { background: '#059669', borderColor: '#059669' } }}
      >
        <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
          请填写完成内容，描述你完成的工作：
        </div>
        <Input.TextArea
          rows={4}
          value={submitNote}
          onChange={(e) => setSubmitNote(e.target.value)}
          placeholder="请描述你完成的工作内容、成果或 note 信息..."
          style={{ borderRadius: 8, marginBottom: 16 }}
          autoFocus
        />
        
        <div style={{ marginBottom: 8, color: '#6b7280', fontSize: 14 }}>
          附件（可选）：
        </div>
        <Upload.Dragger
          beforeUpload={() => false}
          multiple
          onChange={(info) => {
            const files = info.fileList.map(f => f.originFileObj).filter(Boolean) as File[]
            const dt = new DataTransfer()
            files.forEach(file => dt.items.add(file))
            setSubmitFiles(dt.files)
          }}
          onRemove={() => {
            setSubmitFiles(null)
            return true
          }}
          style={{ borderRadius: 8 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持单个或批量上传，最多10个文件</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default Dashboard
