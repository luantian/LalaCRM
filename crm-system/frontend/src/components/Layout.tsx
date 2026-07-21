import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout as AntLayout, Menu, Button, Spin, Avatar, Dropdown, Badge, Empty, Modal, Tag, Popconfirm, App as AntApp } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  SafetyOutlined,
  TeamOutlined,
  BarChartOutlined,
  BellOutlined,
  CheckOutlined,
  StopOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MailOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import * as Icons from '@ant-design/icons'
import { useWebSocket } from '../hooks/useWebSocket'
import { getNotifications, markNotificationRead, markAllNotificationsRead, getTasks, updateTask, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

const { Header, Sider, Content } = AntLayout

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
  const user = safeJsonParse(localStorage.getItem('user'), {})
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

  const fetchMenus = async () => {
    try {
      setLoading(true)
      const cached = localStorage.getItem('menus')
      if (cached) {
        setMenus(JSON.parse(cached))
        setLoading(false)
      }
      const response: any = await api.get('/auth/menus')
      const menuList = response.menus || response || []
      setMenus(menuList)
      localStorage.setItem('menus', JSON.stringify(menuList))
    } catch (error: any) {
      console.error('获取菜单失败:', error)
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

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    fetchMenus()
    fetchNotifications()
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

  const handleWebSocketMessage = useCallback((data: any) => {
    if (['TASK_ASSIGNED', 'TASK_SUBMITTED', 'TASK_COMPLETED', 'TASK_REJECTED'].includes(data.type)) {
      fetchNotifications()
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

  const buildMenuItems = (menuList: MenuItem[]): MenuProps['items'] => {
    return menuList
      .filter(menu => {
        if (menu.menuType === 'BUTTON') return false
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
        height: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#94a3b8', fontSize: 14 }}>加载中...</div>
        </div>
      </div>
    )
  }

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
      {/* ====== Sidebar ====== */}
      <Sider
        theme="light"
        width={220}
        className="ly-sidebar"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          overflow: 'auto',
          overflowX: 'hidden',
          zIndex: 100,
          boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
          paddingBottom: 80,
        }}
      >
        {/* Logo Area */}
        <div className="ly-logo-area">
          <BarChartOutlined style={{ marginRight: 10, fontSize: 20 }} />
          <span style={{ position: 'relative', zIndex: 1 }}>CRM 管理系统</span>
        </div>

        {/* Navigation Menu */}
        <Menu
          mode="inline"
          items={menuItems}
          onClick={handleMenuClick}
          selectedKeys={[location.pathname]}
          style={{
            borderRight: 0,
            marginTop: 8,
            fontSize: 14,
            background: 'transparent',
          }}
        />
      </Sider>

      {/* ====== Right Content Area ====== */}
      <AntLayout style={{ marginLeft: 220, background: '#f1f5f9' }}>
        {/* ====== Header ====== */}
        <Header
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            left: 220,
            height: 56,
            lineHeight: '56px',
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(8px)',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            zIndex: 99,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            borderBottom: '1px solid rgba(241,245,249,0.8)',
          }}
        >
          {/* Notification Bell */}
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => (
              <div
                className="ly-notif-dropdown"
                style={{ width: 380, maxHeight: 440, overflow: 'auto', background: '#fff', borderRadius: 12, padding: '0' }}
              >
                {/* Header */}
                <div style={{
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid #f1f5f9',
                  background: 'linear-gradient(to bottom, #fafbff, #fff)',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <BellOutlined style={{ color: '#4f46e5' }} />
                    通知中心
                    {unreadCount > 0 && (
                      <span style={{
                        fontSize: 11,
                        padding: '1px 8px',
                        borderRadius: 10,
                        background: '#eef2ff',
                        color: '#4f46e5',
                        fontWeight: 600,
                      }}>
                        {unreadCount} 条未读
                      </span>
                    )}
                  </span>
                  {unreadCount > 0 && (
                    <a
                      onClick={async () => { await markAllNotificationsRead(); fetchNotifications(); message.success('全部已读') }}
                      style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500 }}
                    >
                      全部已读
                    </a>
                  )}
                </div>
                {/* Notification List */}
                {notifications.length === 0 ? (
                  <div style={{ padding: '40px 0' }}>
                    <Empty
                      description={
                        <span style={{ color: '#94a3b8' }}>暂无通知</span>
                      }
                      image={<MailOutlined style={{ fontSize: 48, color: '#c7d2fe' }} />}
                    />
                  </div>
                ) : (
                  <div>
                    {notifications.slice(0, 10).map((n: any) => (
                      <div
                        key={n.id}
                        className={`ly-notif-item${!n.isRead ? ' unread' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                        style={{
                          padding: `12px 18px 12px ${!n.isRead ? '24px' : '18px'}`,
                          cursor: 'pointer',
                          background: !n.isRead ? '#fafbff' : '#fff',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8f9ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = !n.isRead ? '#fafbff' : '#fff')}
                      >
                        <div style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.5, fontWeight: !n.isRead ? 500 : 400 }}>
                          {n.message}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          marginTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: n.type === 'TASK_ASSIGNED' ? '#eef2ff' : n.type === 'TASK_COMPLETED' ? '#ecfdf5' : '#f5f3ff',
                            color: n.type === 'TASK_ASSIGNED' ? '#4f46e5' : n.type === 'TASK_COMPLETED' ? '#059669' : '#7c3aed',
                            fontSize: 10,
                            fontWeight: 500,
                          }}>
                            {n.type === 'TASK_ASSIGNED' ? '📋 新任务' : n.type === 'TASK_SUBMITTED' ? '✅ 已提交' : n.type === 'TASK_COMPLETED' ? '🎉 已完成' : n.type === 'TASK_REJECTED' ? '↩️ 驳回' : n.type}
                          </span>
                          <ClockCircleOutlined style={{ fontSize: 10 }} />
                          {dayjs(n.createdAt).format('MM-DD HH:mm')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          >
            <div
              className="ly-notif-badge"
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                marginRight: 16,
                transition: 'all 0.25s ease',
                background: unreadCount > 0 ? '#eef2ff' : 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f0ff'; e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = unreadCount > 0 ? '#eef2ff' : 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}
            >
              <Badge count={unreadCount} size="small" offset={[-8, 4]}>
                <BellOutlined style={{ fontSize: 18, color: unreadCount > 0 ? '#4f46e5' : '#64748b' }} />
              </Badge>
            </div>
          </Dropdown>

          {/* User Avatar with Status Indicator */}
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '4px 10px 4px 4px',
                borderRadius: 24,
                transition: 'all 0.2s ease',
                border: '1px solid transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
            >
              <div className="ly-avatar-wrapper">
                <Avatar
                  size={32}
                  style={{
                    backgroundColor: '#4f46e5',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                  icon={<UserOutlined />}
                >
                  {(user.name || user.username || 'U')[0]}
                </Avatar>
                <div className="ly-avatar-status" />
              </div>
              <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{user.name || user.username}</span>
            </div>
          </Dropdown>
        </Header>

        {/* ====== Content Area ====== */}
        <Content
          className="ly-content-area"
          style={{
            marginTop: 56,
            margin: '56px 20px 20px',
            padding: 24,
            background: '#fff',
            borderRadius: 16,
            minHeight: 'calc(100vh - 96px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 0 0 1px rgba(241,245,249,0.8)',
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>

      {/* ====== Task Detail Modal ====== */}
      <Modal
        title={taskDetail ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>任务详情</span>
            <Tag color={(priorityMap[taskDetail.priority] || priorityMap.MEDIUM).color} style={{ borderRadius: 4 }}>
              {(priorityMap[taskDetail.priority] || priorityMap.MEDIUM).text}
            </Tag>
            <Tag color={(statusMap[taskDetail.status] || statusMap.PENDING).color} style={{ borderRadius: 4 }}>
              {(statusMap[taskDetail.status] || statusMap.PENDING).text}
            </Tag>
          </div>
        ) : '任务详情'}
        open={taskDetailVisible}
        onCancel={() => { setTaskDetailVisible(false); setTaskDetail(null) }}
        footer={taskDetail && taskDetail.status !== 'COMPLETED' && taskDetail.status !== 'CANCELLED' ? (() => {
          const isAssigner = taskDetail.assignerId === user.id
          const isAssignee = taskDetail.assignees?.some((a: any) => a.id === user.id)

          return (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {isAssignee && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Button type="primary" icon={<CheckOutlined />} style={{ background: '#059669', borderColor: '#059669', borderRadius: 8 }} onClick={() => handleTaskAction('SUBMITTED')}>提交完成</Button>
              )}
              {isAssignee && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Popconfirm title="确定取消此任务？" onConfirm={() => handleTaskAction('CANCELLED')}>
                  <Button danger icon={<StopOutlined />} style={{ borderRadius: 8 }}>取消任务</Button>
                </Popconfirm>
              )}

              {isAssigner && taskDetail.status === 'SUBMITTED' && (
                <>
                  <Button type="primary" icon={<CheckOutlined />} style={{ background: '#059669', borderColor: '#059669', borderRadius: 8 }} onClick={() => handleTaskAction('COMPLETED')}>确认完成</Button>
                  <Button danger icon={<StopOutlined />} style={{ borderRadius: 8 }} onClick={() => handleTaskAction('IN_PROGRESS')}>驳回</Button>
                </>
              )}

              {isAssigner && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Popconfirm title="确定取消此任务？" onConfirm={() => handleTaskAction('CANCELLED')}>
                  <Button danger icon={<StopOutlined />} style={{ borderRadius: 8 }}>取消任务</Button>
                </Popconfirm>
              )}

              {isAssignee && taskDetail.status === 'SUBMITTED' && (
                <span style={{ fontSize: 13, color: '#d97706', padding: '4px 12px', background: '#fffbeb', borderRadius: 6 }}>
                  <ClockCircleOutlined style={{ marginRight: 6 }} />等待指派人确认
                </span>
              )}
            </div>
          )
        })() : null}
        width={540}
        styles={{ body: { paddingTop: 16 } }}
      >
        {taskDetail && (
          <div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 16,
              color: '#1e293b',
              textDecoration: taskDetail.status === 'COMPLETED' ? 'line-through' : 'none',
              lineHeight: 1.4,
            }}>
              {taskDetail.title}
            </div>
            {taskDetail.description && (
              <div style={{
                color: '#475569',
                marginBottom: 20,
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: 10,
                whiteSpace: 'pre-wrap',
                border: '1px solid #f1f5f9',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                {taskDetail.description}
              </div>
            )}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 13,
              color: '#64748b',
              padding: '16px',
              background: '#fafbff',
              borderRadius: 10,
              border: '1px solid #f1f5f9',
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <UserOutlined style={{ marginRight: 10, color: '#4f46e5', fontSize: 14 }} />
                <span>委派人：</span>
                <strong style={{ color: '#1e293b', marginLeft: 4 }}>{taskDetail.assigner?.name || '-'}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <TeamOutlined style={{ marginRight: 10, color: '#7c3aed', fontSize: 14 }} />
                <span>执行人：</span>
                <strong style={{ color: '#1e293b', marginLeft: 4 }}>{(taskDetail.assignees || []).map((a: any) => a.name).join('、') || '-'}</strong>
              </div>
              {taskDetail.dueDate && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ClockCircleOutlined style={{
                    marginRight: 10,
                    fontSize: 14,
                    color: taskDetail.status !== 'COMPLETED' && dayjs(taskDetail.dueDate).isBefore(dayjs(), 'day') ? '#ef4444' : '#d97706'
                  }} />
                  <span>截止日期：</span>
                  <strong style={{
                    color: taskDetail.status !== 'COMPLETED' && dayjs(taskDetail.dueDate).isBefore(dayjs(), 'day') ? '#ef4444' : '#1e293b',
                    marginLeft: 4,
                  }}>
                    {dayjs(taskDetail.dueDate).format('YYYY-MM-DD')}
                    {taskDetail.status !== 'COMPLETED' && dayjs(taskDetail.dueDate).isBefore(dayjs(), 'day') && ' (已逾期)'}
                  </strong>
                </div>
              )}
              {taskDetail.status === 'COMPLETED' && taskDetail.completedAt && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircleOutlined style={{ marginRight: 10, color: '#059669', fontSize: 14 }} />
                  <span>完成于：</span>
                  <strong style={{ color: '#059669', marginLeft: 4 }}>{dayjs(taskDetail.completedAt).format('YYYY-MM-DD HH:mm')}</strong>
                </div>
              )}
              {taskDetail.status === 'CANCELLED' && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ExclamationCircleOutlined style={{ marginRight: 10, color: '#d97706', fontSize: 14 }} />
                  <strong style={{ color: '#d97706' }}>已取消</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AntLayout>
  )
}

export default Layout
