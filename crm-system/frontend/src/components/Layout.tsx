import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout as AntLayout, Menu, Button, Spin, Avatar, Dropdown, Space, Badge, Empty, Modal, Tag, Tooltip, Popconfirm, App as AntApp } from 'antd'
import {
  DashboardOutlined,
  UserOutlined,
  DollarOutlined,
  ProjectOutlined,
  FileTextOutlined,
  LogoutOutlined,
  CarOutlined,
  AccountBookOutlined,
  TeamOutlined,
  SafetyOutlined,
  SettingOutlined,
  MenuOutlined,
  FundOutlined,
  ScheduleOutlined,
  BookOutlined,
  FileSearchOutlined,
  LoginOutlined,
  AuditOutlined,
  BarChartOutlined,
  BellOutlined,
  CheckOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import * as Icons from '@ant-design/icons'
import { useWebSocket } from '../hooks/useWebSocket'
import { getNotifications, markNotificationRead, markAllNotificationsRead, getTasks, updateTask } from '../services/api'
import dayjs from 'dayjs'

const { Header, Sider, Content } = AntLayout

// 动态渲染图标
const renderIcon = (iconName: string) => {
  const IconComp = (Icons as any)[iconName]
  return IconComp ? <IconComp /> : null
}

interface MenuItem {
  id: number
  key: string
  icon: string
  label: string
  parentId: number | null
  order: number
  isVisible: boolean
  requiredRoles: string[]
  menuType?: string
  perm?: string
  children?: MenuItem[]
}

function Layout() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [taskDetailVisible, setTaskDetailVisible] = useState(false)
  const [taskDetail, setTaskDetail] = useState<any>(null)

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

  // 获取用户有权限的菜单
  const fetchMenus = async () => {
    try {
      setLoading(true)
      // 优先从localStorage读取（登录时已存储）
      const cached = localStorage.getItem('menus')
      if (cached) {
        setMenus(JSON.parse(cached))
        setLoading(false)
      }
      // 同时从后端刷新（确保最新）
      const response: any = await api.get('/auth/menus')
      const menuList = response.menus || response || []
      setMenus(menuList)
      localStorage.setItem('menus', JSON.stringify(menuList))
    } catch (error: any) {
      console.error('获取菜单失败:', error)
      // 如果API失败，尝试用旧的缓存
      const cached = localStorage.getItem('menus')
      if (cached) {
        setMenus(JSON.parse(cached))
      } else {
        message.error('获取菜单失败')
      }
    } finally {
      setLoading(false)
    }
  }

  // 无 token 直接跳转登录
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    // 有 token 才获取菜单和通知
    fetchMenus()
    fetchNotifications()
    // 每 30 秒轮询通知
    const timer = setInterval(fetchNotifications, 30000)
    return () => clearInterval(timer)
  }, [])

  const fetchNotifications = async () => {
    try {
      const data: any = await getNotifications()
      setNotifications(data?.data || [])
      setUnreadCount(data?.unreadCount || 0)
    } catch (e) { /* ignore */ }
  }

  // WebSocket 实时消息处理
  const handleWebSocketMessage = useCallback((data: any) => {
    // 收到任何任务相关事件，刷新通知列表
    if (['TASK_ASSIGNED', 'TASK_SUBMITTED', 'TASK_COMPLETED', 'TASK_REJECTED'].includes(data.type)) {
      fetchNotifications()
      // 显示提示消息
      const msgMap: Record<string, string> = {
        TASK_ASSIGNED: `📋 新任务：${data.title}`,
        TASK_SUBMITTED: `✅ 任务已提交确认：${data.title}`,
        TASK_COMPLETED: `🎉 任务已确认完成：${data.title}`,
        TASK_REJECTED: `↩️ 任务被驳回：${data.title}`,
      }
      if (msgMap[data.type]) {
        message.info(msgMap[data.type])
      }
    }
  }, [])

  // 连接 WebSocket（仅登录后）
  const token = localStorage.getItem('token')
  useWebSocket(handleWebSocketMessage, !!token)

  const handleNotificationClick = async (n: any) => {
    if (!n.isRead) { await markNotificationRead(n.id); fetchNotifications() }
    if (n.taskId) {
      try {
        const tasks: any = await getTasks()
        const task = (Array.isArray(tasks) ? tasks : []).find((t: any) => t.id === n.taskId)
        if (task) { setTaskDetail(task); setTaskDetailVisible(true) }
      } catch (e) { /* ignore */ }
    }
  }

  const handleTaskAction = async (status: string) => {
    if (!taskDetail) return
    try {
      await updateTask(taskDetail.id, { status })
      message.success(status === 'COMPLETED' ? '任务已完成 🎉' : '任务已更新')
      setTaskDetail({ ...taskDetail, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null })
      fetchNotifications()
    } catch (e) { message.error('操作失败') }
  }

  // 将数据库菜单转换为 Ant Design Menu 格式（若依动态菜单）
  const buildMenuItems = (menuList: MenuItem[]): MenuProps['items'] => {
    return menuList
      .filter(menu => {
        // 按钮类型不显示在菜单中
        if (menu.menuType === 'BUTTON') return false
        // 合同模块已合并到项目中，不再独立显示
        if (menu.key === 'contracts') return false
        return menu.isVisible
      })
      .sort((a, b) => a.order - b.order)
      .map(menu => {
        const menuItem: any = {
          key: menu.parentId ? `/${menu.key}` : (menu.key === 'dashboard' ? '/' : `/${menu.key}`),
          icon: renderIcon(menu.icon),
          label: menu.label
        }
        if (menu.children && menu.children.length > 0) {
          menuItem.children = buildMenuItems(menu.children)
        }
        return menuItem
      })
  }

  const menuItems = buildMenuItems(menus.filter(m => m.parentId === null).map(m => ({
    ...m,
    children: menus.filter(child => child.parentId === m.id)
  })))

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('menus')
    localStorage.removeItem('permissions')
    message.success('已退出登录')
    navigate('/login')
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <Spin size="large" />
      </div>
    )
  }

  // 用户下拉菜单
  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', icon: <UserOutlined />, label: user.name || user.username || '用户' },
    { key: 'role', icon: <SafetyOutlined />, label: user.role || '普通用户' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true }
  ]

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') handleLogout()
  }

  return (
    <AntLayout style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* 左侧导航栏 */}
      <Sider
        theme="light"
        width={220}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          overflow: 'auto',
          zIndex: 100,
          boxShadow: '2px 0 8px rgba(0,0,0,0.06)'
        }}
      >
        {/* Logo区域 */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: 1,
        }}>
          <BarChartOutlined style={{ marginRight: 8, fontSize: 22 }} />
          CRM 管理系统
        </div>

        {/* 导航菜单 */}
        <Menu
          mode="inline"
          items={menuItems}
          onClick={handleMenuClick}
          selectedKeys={[location.pathname]}
          style={{ borderRight: 0, marginTop: 8, fontSize: 14 }}
        />
      </Sider>

      {/* 右侧内容区域 */}
      <AntLayout style={{ marginLeft: 220, background: '#f1f5f9' }}>
        {/* 顶部状态栏 */}
        <Header
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            left: 220,
            height: 56,
            lineHeight: '56px',
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            zIndex: 99,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            borderBottom: '1px solid #f1f5f9'
          }}
        >
          {/* 通知铃铛 */}
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => (
              <div style={{ width: 360, maxHeight: 420, overflow: 'auto', background: '#fff', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.12)', padding: '8px 0' }}>
                <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    通知
                    {unreadCount > 0 && <Badge count={unreadCount} size="small" style={{ marginLeft: 0 }} />}
                  </span>
                  {unreadCount > 0 && (
                    <a onClick={async () => { await markAllNotificationsRead(); fetchNotifications(); message.success('全部已读') }} style={{ fontSize: 12 }}>全部已读</a>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <Empty description="暂无通知" style={{ padding: '30px 0' }} />
                ) : (
                  notifications.slice(0, 10).map((n: any) => (
                    <div key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      style={{ padding: '10px 16px', cursor: 'pointer', background: n.isRead ? '#fff' : '#f6f8ff', borderBottom: '1px solid #f5f5f5', transition: 'background 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = n.isRead ? '#fff' : '#f6f8ff')}
                    >
                      <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>
                        {!n.isRead && <Badge status="processing" style={{ marginRight: 6 }} />}
                        {n.message}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                        {n.type === 'TASK_ASSIGNED' ? '📋 新任务' : n.type === 'TASK_COMPLETED' ? '✅ 已完成' : n.type}
                        {' · '}{dayjs(n.createdAt).format('MM-DD HH:mm')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          >
            <Badge count={unreadCount} size="small" offset={[-15, 0]}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: 16, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <BellOutlined style={{ fontSize: 18 }} />
              </div>
            </Badge>
          </Dropdown>

          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" style={{ backgroundColor: '#4f46e5' }} icon={<UserOutlined />} />
              <span style={{ fontSize: 14, color: '#374151' }}>{user.name || user.username}</span>
            </Space>
          </Dropdown>
        </Header>

        {/* 内容区域 */}
        <Content
          style={{
            marginTop: 56,
            margin: '56px 20px 20px',
            padding: 24,
            background: '#fff',
            borderRadius: 12,
            minHeight: 'calc(100vh - 96px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>

      {/* 任务详情弹窗 */}
      <Modal
        title={taskDetail ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>任务详情</span>
            <Tag color={(priorityMap[taskDetail.priority] || priorityMap.MEDIUM).color}>
              {(priorityMap[taskDetail.priority] || priorityMap.MEDIUM).text}
            </Tag>
            <Tag color={(statusMap[taskDetail.status] || statusMap.PENDING).color}>
              {(statusMap[taskDetail.status] || statusMap.PENDING).text}
            </Tag>
          </div>
        ) : '任务详情'}
        open={taskDetailVisible}
        onCancel={() => { setTaskDetailVisible(false); setTaskDetail(null) }}
        footer={taskDetail && taskDetail.status !== 'COMPLETED' && taskDetail.status !== 'CANCELLED' ? (() => {
          // 判断当前用户是指派人还是执行人
          const isAssigner = taskDetail.assignerId === user.id
          const isAssignee = taskDetail.assignees?.some((a: any) => a.id === user.id)

          return (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {/* 执行人：可以提交完成或取消 */}
              {isAssignee && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Button type="primary" icon={<CheckOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleTaskAction('SUBMITTED')}>提交完成</Button>
              )}
              {isAssignee && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Popconfirm title="确定取消此任务？" onConfirm={() => handleTaskAction('CANCELLED')}>
                  <Button danger icon={<StopOutlined />}>取消任务</Button>
                </Popconfirm>
              )}

              {/* 指派人：可以确认完成或驳回 */}
              {isAssigner && taskDetail.status === 'SUBMITTED' && (
                <>
                  <Button type="primary" icon={<CheckOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleTaskAction('COMPLETED')}>确认完成</Button>
                  <Button danger icon={<StopOutlined />} onClick={() => handleTaskAction('IN_PROGRESS')}>驳回</Button>
                </>
              )}

              {/* 指派人：可以取消任务 */}
              {isAssigner && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Popconfirm title="确定取消此任务？" onConfirm={() => handleTaskAction('CANCELLED')}>
                  <Button danger icon={<StopOutlined />}>取消任务</Button>
                </Popconfirm>
              )}

              {/* 执行人：已提交时显示等待状态 */}
              {isAssignee && taskDetail.status === 'SUBMITTED' && (
                <span style={{ fontSize: 13, color: '#faad14', padding: '4px 12px' }}>
                  <ClockCircleOutlined style={{ marginRight: 6 }} />等待指派人确认
                </span>
              )}
            </div>
          )
        })() : null}
        width={520}
      >
        {taskDetail && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, textDecoration: taskDetail.status === 'COMPLETED' ? 'line-through' : 'none' }}>
              {taskDetail.title}
            </div>
            {taskDetail.description && (
              <div style={{ color: '#555', marginBottom: 16, padding: '12px', background: '#fafafa', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
                {taskDetail.description}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#666' }}>
              <div><UserOutlined style={{ marginRight: 8, color: '#1890ff' }} />委派人：<strong>{taskDetail.assigner?.name || '-'}</strong></div>
              <div><TeamOutlined style={{ marginRight: 8, color: '#722ed1' }} />执行人：<strong>{(taskDetail.assignees || []).map((a: any) => a.name).join('、') || '-'}</strong></div>
              {taskDetail.dueDate && (
                <div>
                  <ClockCircleOutlined style={{ marginRight: 8, color: taskDetail.status !== 'COMPLETED' && dayjs(taskDetail.dueDate).isBefore(dayjs(), 'day') ? '#f5222d' : '#faad14' }} />
                  截止日期：<strong style={{ color: taskDetail.status !== 'COMPLETED' && dayjs(taskDetail.dueDate).isBefore(dayjs(), 'day') ? '#f5222d' : 'inherit' }}>
                    {dayjs(taskDetail.dueDate).format('YYYY-MM-DD')}
                    {taskDetail.status !== 'COMPLETED' && dayjs(taskDetail.dueDate).isBefore(dayjs(), 'day') && ' (已逾期)'}
                  </strong>
                </div>
              )}
              {taskDetail.status === 'COMPLETED' && taskDetail.completedAt && (
                <div><CheckCircleOutlined style={{ marginRight: 8, color: '#52c41a' }} />完成于：<strong style={{ color: '#52c41a' }}>{dayjs(taskDetail.completedAt).format('YYYY-MM-DD HH:mm')}</strong></div>
              )}
              {taskDetail.status === 'CANCELLED' && (
                <div><ExclamationCircleOutlined style={{ marginRight: 8, color: '#faad14' }} /><strong style={{ color: '#faad14' }}>已取消</strong></div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AntLayout>
  )
}

export default Layout
