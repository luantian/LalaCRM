import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Tag, Tabs, Button, Modal, Form, Input, Select, DatePicker, Empty, List, Badge, Popconfirm, Tooltip, App as AntApp } from 'antd'
import {
  UserOutlined, ProjectOutlined, FileTextOutlined,
  CheckCircleOutlined, ClockCircleOutlined, FundOutlined,
  CarOutlined, AccountBookOutlined, SendOutlined,
  DashboardOutlined, PlusOutlined, CheckOutlined, PlayCircleOutlined,
  DeleteOutlined, ExclamationCircleOutlined, EditOutlined, StopOutlined
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

  const user = safeJsonParse(localStorage.getItem('user'), {})
  const userPermissions = safeJsonParse(localStorage.getItem('permissions'), [])

  // 快捷操作权限映射
  const quickActions = [
    { label: '新增客户', icon: <UserOutlined />, path: '/customers', color: '#1890ff', bg: '#e6f7ff', perm: 'edit_customers' },
    { label: '新建商机', icon: <FundOutlined />, path: '/opportunities', color: '#722ed1', bg: '#f9f0ff', perm: 'edit_opportunities' },
    { label: '新建项目', icon: <ProjectOutlined />, path: '/projects', color: '#13c2c2', bg: '#e6fffb', perm: 'create_projects' },
    { label: '查看报价', icon: <FileTextOutlined />, path: '/quotations', color: '#52c41a', bg: '#f6ffed', perm: 'view_quotations' },
    { label: '填写日报', icon: <SendOutlined />, path: '/daily-reports', color: '#fa8c16', bg: '#fff7e6', perm: 'create_reports' },
    { label: '申请出差', icon: <CarOutlined />, path: '/business-trips', color: '#eb2f96', bg: '#fff0f6', perm: 'submit_trips' },
    { label: '申请报销', icon: <AccountBookOutlined />, path: '/expenses', color: '#f5222d', bg: '#fff1f0', perm: 'submit_expenses' },
  ]

  // 根据权限过滤快捷操作
  const filteredQuickActions = quickActions.filter(action => {
    // 管理员拥有所有权限
    if (user.role === 'ADMIN') return true
    // 检查用户是否有该权限
    return userPermissions.includes(action.perm)
  })

  // 获取今日打卡状态
  const fetchTodayCheckIn = async () => {
    try {
      const data: any = await getTodayCheckIn()
      setTodayCheckIn(data)
    } catch (error) {
      console.error('获取今日打卡状态失败:', error)
    }
  }

  // 快速打卡
  const handleQuickCheckIn = async () => {
    try {
      const now = dayjs()
      const hour = now.hour()

      // 根据时间判断是上班打卡还是下班打卡
      // 12点前认为是上班打卡，12点后认为是下班打卡
      const period = hour < 12 ? 'MORNING' : 'EVENING'

      const result: any = await checkIn({ period })

      // 根据打卡类型显示不同的消息
      const typeMessages: Record<string, string> = {
        NORMAL: '打卡成功！',
        LATE: '打卡成功（迟到）',
        EARLY_LEAVE: '打卡成功（早退）',
        AUTO: '出差打卡成功！'
      }

      message.success(typeMessages[result.type] || '打卡成功！')
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

  const priorityMap: Record<string, { text: string; color: string }> = {
    LOW: { text: '低', color: 'default' },
    MEDIUM: { text: '中', color: 'blue' },
    HIGH: { text: '高', color: 'orange' },
    URGENT: { text: '紧急', color: 'red' },
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

  // 任务分组：未完成在前，已完成在后
  const sortTasks = (list: any[]) => {
    const active = list.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    const done = list.filter(t => t.status === 'COMPLETED' || t.status === 'CANCELLED')
    return [...active, ...done]
  }

  const activeTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const activeDelegated = delegatedTasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')

  return (
    <div>
      {/* 问候语 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{greeting}，{user.name || user.username || ''} 👋</h2>
        <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
          {dayjs().format('YYYY年M月D日 dddd')}
        </div>
      </div>

      {/* 快捷操作 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}
        styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>快捷操作</div>
        <Row gutter={[12, 12]}>
          {filteredQuickActions.map(item => (
            <Col xs={6} sm={6} md={3} key={item.label}>
              <div
                onClick={() => navigate(item.path)}
                style={{
                  textAlign: 'center',
                  padding: '10px 4px',
                  borderRadius: 8,
                  background: item.bg,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ fontSize: 20, color: item.color, marginBottom: 4 }}>{item.icon}</div>
                <div style={{ fontSize: 12, color: '#333', fontWeight: 500 }}>{item.label}</div>
              </div>
            </Col>
          ))}

          {/* 快速打卡按钮 */}
          <Col xs={6} sm={6} md={3}>
            {(() => {
              const now = dayjs()
              const hour = now.hour()
              const morningChecked = todayCheckIn?.morningCheckedIn
              const eveningChecked = todayCheckIn?.eveningCheckedIn

              // 判断当前应该显示什么状态
              let label = '快速打卡'
              let icon = <ClockCircleOutlined />
              let color = '#52c41a'
              let bg = '#f6ffed'
              let disabled = false

              if (hour < 12) {
                // 上午：显示上班打卡状态
                if (morningChecked) {
                  label = '已上班打卡'
                  icon = <CheckCircleOutlined />
                  color = '#52c41a'
                  bg = '#f6ffed'
                  disabled = true
                } else if (hour >= 9) {
                  label = '上班打卡(迟到)'
                  icon = <ClockCircleOutlined />
                  color = '#fa8c16'
                  bg = '#fff7e6'
                }
              } else {
                // 下午：显示下班打卡状态
                if (eveningChecked) {
                  label = '已下班打卡'
                  icon = <CheckCircleOutlined />
                  color = '#52c41a'
                  bg = '#f6ffed'
                  disabled = true
                } else if (hour < 17 || (hour === 17 && now.minute() < 30)) {
                  label = '下班打卡(早退)'
                  icon = <ClockCircleOutlined />
                  color = '#fa8c16'
                  bg = '#fff7e6'
                }
              }

              return (
                <div
                  onClick={disabled ? undefined : handleQuickCheckIn}
                  style={{
                    textAlign: 'center',
                    padding: '10px 4px',
                    borderRadius: 8,
                    background: bg,
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: disabled ? 0.8 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled) {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ fontSize: 20, color: color, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 500 }}>{label}</div>
                </div>
              )
            })()}
          </Col>
        </Row>
      </Card>

      {/* 任务管理面板 */}
      <Card
        style={{ borderRadius: 12, marginBottom: 16 }}
        styles={{ body: { padding: '12px 16px' } }}
        title={<span><DashboardOutlined /> 任务管理</span>}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setEditingTask(null); taskForm.resetFields(); setTaskModalVisible(true) }}>委派任务</Button>}
      >
        <Tabs
          activeKey={taskType}
          onChange={(k) => setTaskType(k as 'assigned' | 'delegated')}
          items={[
            {
              key: 'assigned',
              label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>我的待办 {activeTasks.length > 0 && <Badge count={activeTasks.length} size="small" style={{ marginLeft: 2, backgroundColor: '#1890ff' }} />}</span>,
              children: tasks.length === 0
                ? <Empty description="暂无任务" style={{ padding: 20 }} />
                : (
                  <List
                    dataSource={sortTasks(tasks)}
                    renderItem={(task: any) => {
                      const p = priorityMap[task.priority] || priorityMap.MEDIUM
                      const s = statusMap[task.status] || statusMap.PENDING
                      const isOverdue = task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day') && !['COMPLETED', 'CANCELLED', 'SUBMITTED'].includes(task.status)
                      const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED'
                      const isSubmitted = task.status === 'SUBMITTED'
                      return (
                        <List.Item
                          style={{ padding: '10px 0', opacity: isDone ? 0.6 : 1 }}
                          actions={[
                            !isDone && !isSubmitted && task.status === 'PENDING' && (
                              <Button key="start" size="small" type="link" icon={<PlayCircleOutlined />} onClick={() => handleUpdateTask(task.id, 'IN_PROGRESS')}>开始</Button>
                            ),
                            !isDone && !isSubmitted && (
                              <Button key="submit" size="small" type="link" icon={<CheckOutlined />} style={{ color: '#52c41a' }} onClick={() => handleUpdateTask(task.id, 'SUBMITTED')}>提交完成</Button>
                            ),
                            isSubmitted && (
                              <span key="waiting" style={{ fontSize: 12, color: '#faad14' }}><ClockCircleOutlined /> 等待确认</span>
                            ),
                            !isDone && !isSubmitted && (
                              <Popconfirm key="cancel" title="确定取消此任务？" onConfirm={() => handleUpdateTask(task.id, 'CANCELLED')}>
                                <Button size="small" type="link" icon={<StopOutlined />} danger>取消</Button>
                              </Popconfirm>
                            ),
                            <Tooltip key="edit" title="编辑"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditTask(task)} /></Tooltip>,
                            <Popconfirm key="del" title="确定删除此任务？" onConfirm={() => handleDeleteTask(task.id)}>
                              <Button size="small" type="text" icon={<DeleteOutlined />} danger /></Popconfirm>,
                          ].filter(Boolean) as any}
                        >
                          <List.Item.Meta
                            title={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: isDone ? 'line-through' : 'none' }}>
                                <span style={{ fontSize: 13 }}>{task.title}</span>
                                <Tag color={p.color} style={{ fontSize: 11 }}>{p.text}</Tag>
                                <Tag color={s.color} style={{ fontSize: 11 }}>{s.text}</Tag>
                                {isOverdue && <Tag color="error" style={{ fontSize: 11 }}><ExclamationCircleOutlined /> 逾期</Tag>}
                              </div>
                            }
                            description={
                              <div>
                                <span style={{ fontSize: 12, color: '#999' }}>
                                  委派人：{task.assigner?.name || '-'}
                                  {task.dueDate && <span style={{ marginLeft: 12, color: isOverdue ? '#f5222d' : '#999' }}>截止：{dayjs(task.dueDate).format('YYYY-MM-DD')}</span>}
                                  {task.status === 'COMPLETED' && task.completedAt && <span style={{ marginLeft: 12, color: '#52c41a' }}>✓ 完成于 {dayjs(task.completedAt).format('MM-DD HH:mm')}</span>}
                                </span>
                                {task.description && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{task.description}</div>}
                              </div>
                            }
                          />
                        </List.Item>
                      )
                    }}
                  />
                ),
            },
            {
              key: 'delegated',
              label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>我委派的 {activeDelegated.length > 0 && <Badge count={activeDelegated.length} size="small" style={{ marginLeft: 2, backgroundColor: '#722ed1' }} />}</span>,
              children: delegatedTasks.length === 0
                ? <Empty description="暂无委派任务" style={{ padding: 20 }} />
                : (
                  <List
                    dataSource={sortTasks(delegatedTasks)}
                    renderItem={(task: any) => {
                      const p = priorityMap[task.priority] || priorityMap.MEDIUM
                      const s = statusMap[task.status] || statusMap.PENDING
                      const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED'
                      const isSubmitted = task.status === 'SUBMITTED'
                      return (
                        <List.Item
                          style={{ padding: '10px 0', opacity: isDone ? 0.6 : 1 }}
                          actions={[
                            isSubmitted && (
                              <Popconfirm key="confirm" title="确认此任务已完成？" onConfirm={() => handleUpdateTask(task.id, 'COMPLETED')}>
                                <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }}>确认完成</Button>
                              </Popconfirm>
                            ),
                            isSubmitted && (
                              <Popconfirm key="reject" title="确定驳回此任务？将打回给执行人重新处理" onConfirm={() => handleUpdateTask(task.id, 'IN_PROGRESS')}>
                                <Button size="small" danger>驳回</Button>
                              </Popconfirm>
                            ),
                            !isDone && !isSubmitted && (
                              <Popconfirm key="cancel" title="确定取消此任务？" onConfirm={() => handleUpdateTask(task.id, 'CANCELLED')}>
                                <Button size="small" type="link" icon={<StopOutlined />} danger>取消</Button>
                              </Popconfirm>
                            ),
                            <Tooltip key="edit" title="编辑"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditTask(task)} /></Tooltip>,
                            <Popconfirm key="del" title="确定删除此任务？" onConfirm={() => handleDeleteTask(task.id)}>
                              <Button size="small" type="text" icon={<DeleteOutlined />} danger /></Popconfirm>,
                          ].filter(Boolean) as any}
                        >
                          <List.Item.Meta
                            title={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: isDone ? 'line-through' : 'none' }}>
                                <span style={{ fontSize: 13 }}>{task.title}</span>
                                <Tag color={p.color} style={{ fontSize: 11 }}>{p.text}</Tag>
                                <Tag color={s.color} style={{ fontSize: 11 }}>{s.text}</Tag>
                              </div>
                            }
                            description={
                              <div>
                                <span style={{ fontSize: 12, color: '#999' }}>
                                  指派给：{(task.assignees || []).map((a: any) => a.name).join('、') || '-'}
                                  {task.dueDate && <span style={{ marginLeft: 12 }}>截止：{dayjs(task.dueDate).format('YYYY-MM-DD')}</span>}
                                  {task.status === 'COMPLETED' && task.completedAt && <span style={{ marginLeft: 12, color: '#52c41a' }}>✓ 已完成于 {dayjs(task.completedAt).format('MM-DD HH:mm')}</span>}
                                </span>
                                {task.description && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{task.description}</div>}
                              </div>
                            }
                          />
                        </List.Item>
                      )
                    }}
                  />
                ),
            },
          ]}
        />
      </Card>

      {/* 委派/编辑任务弹窗 */}
      <Modal
        title={editingTask ? '编辑任务' : '委派任务'}
        open={taskModalVisible}
        onOk={handleCreateTask}
        onCancel={() => { setTaskModalVisible(false); setEditingTask(null); taskForm.resetFields() }}
        okText={editingTask ? '保存' : '确认'}
        cancelText="取消"
      >
        <Form form={taskForm} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="请输入任务标题" />
          </Form.Item>
          <Form.Item name="assigneeIds" label="指派给" rules={[{ required: true, message: '请选择指派人' }]}>
            <Select mode="multiple" showSearch optionFilterProp="label" placeholder="选择成员（可多选）">
              {users.filter((u: any) => u.id !== user.id).map((u: any) => (
                <Select.Option key={u.id} value={u.id} label={u.name}>
                  {u.name} ({u.username})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} placeholder="描述任务内容（可选）" />
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
