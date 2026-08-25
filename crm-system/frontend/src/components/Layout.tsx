import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout as AntLayout, Menu, Button, Spin, Avatar, Dropdown, Badge, Empty, Modal, Tag, Popconfirm, App as AntApp, Input, Form, Tabs } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  SafetyOutlined,
  TeamOutlined,
  BellOutlined,
  CheckOutlined,
  StopOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MailOutlined,
  LockOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import { getIcon } from '../utils/iconRegistry'
import { useWebSocket } from '../hooks/useWebSocket'
import { getNotifications, markNotificationRead, markAllNotificationsRead, getTaskById, updateTask, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

const { Header, Sider, Content } = AntLayout

const renderIcon = (iconName: string) => {
  const IconComp = getIcon(iconName)
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
  const { message, notification } = AntApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const user = safeJsonParse(localStorage.getItem('user'), {})
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [taskDetailVisible, setTaskDetailVisible] = useState(false)
  const [taskDetail, setTaskDetail] = useState<any>(null)
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [completionModalVisible, setCompletionModalVisible] = useState(false)
  const [completionNote, setCompletionNote] = useState('')
  const [submitNote, setSubmitNote] = useState('')
  // 个人信息弹窗(基本信息 + 修改密码)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [profileTab, setProfileTab] = useState('info')
  const [profileForm] = Form.useForm()
  const [profileMeta, setProfileMeta] = useState<{ username: string; roleName: string }>({ username: '', roleName: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [, setProfileVersion] = useState(0)
  const [passwordForm] = Form.useForm()

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
      // 通知 App.tsx 重新构建路由
      window.dispatchEvent(new CustomEvent('menus-updated'))
    } catch (error: any) {
      console.error('获取菜单失败:', error)
      const cached = localStorage.getItem('menus')
      if (cached) {
        setMenus(JSON.parse(cached))
      } else {
        message.error(error?.error || '获取菜单失败')
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
    // 广播给页面组件（Dashboard 监听后自动刷新任务列表）
    window.dispatchEvent(new CustomEvent('crm:ws-message', { detail: data }))
    if (['TASK_ASSIGNED', 'TASK_SUBMITTED', 'TASK_COMPLETED', 'TASK_REJECTED', 'EXPENSE_SUBMITTED'].includes(data.type)) {
      fetchNotifications()
      // 在线时外部群消息会被抑制,站内提示必须显眼:
      // 顶部通知卡片,停留 8 秒,点击直接跳转处理
      const msgMap: Record<string, { icon: string; text: string; to: string }> = {
        TASK_ASSIGNED: { icon: '📋', text: '新任务', to: '/' },
        TASK_SUBMITTED: { icon: '✅', text: '任务已提交,待你确认', to: '/' },
        TASK_COMPLETED: { icon: '🎉', text: '任务已确认完成', to: '/' },
        TASK_REJECTED: { icon: '↩️', text: '任务被退回重做', to: '/' },
        EXPENSE_SUBMITTED: { icon: '🧾', text: '新的报销待审批', to: '/expenses' },
      }
      const info = msgMap[data.type]
      if (info) {
        notification.open({
          message: `${info.icon} ${info.text}`,
          description: data.title,
          placement: 'top',
          duration: 8,
          onClick: () => navigate(info.to),
        })
      }
    }
  }, [])

  const token = localStorage.getItem('token')
  useWebSocket(handleWebSocketMessage, !!token)

  const handleNotificationClick = async (n: any) => {
    if (!n.isRead) { await markNotificationRead(n.id); fetchNotifications() }
    if (n.taskId) {
      try {
        // 直接查单个任务（委派人和被指派人都能查到），避免列表查询漏掉自己委派的任务
        const task: any = await getTaskById(n.taskId)
        if (task?.id) { setTaskDetail(task); setTaskDetailVisible(true) }
      } catch (e) { /* ignore */ }
    } else if (String(n.type || '').startsWith('EXPENSE_')) {
      // 报销类通知：跳转到报销列表（审批人在待审批里处理）
      navigate('/expenses')
    }
  }

  const handleTaskAction = async (status: string) => {
    if (!taskDetail) return
    try {
      await updateTask(taskDetail.id, { status })
      message.success(status === 'COMPLETED' ? '任务已完成 🎉' : '任务已更新')
      setTaskDetail({ ...taskDetail, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null })
      fetchNotifications()
    } catch (e: any) { message.error(e?.error || '操作失败') }
  }

  const handleRejectClick = () => {
    setRejectionReason('')
    setRejectionModalVisible(true)
  }

  const handleConfirmReject = async () => {
    if (!taskDetail || !rejectionReason.trim()) {
      message.warning('请填写驳回理由')
      return
    }
    try {
      await updateTask(taskDetail.id, { status: 'IN_PROGRESS', rejectionReason })
      message.success('已驳回任务')
      setRejectionModalVisible(false)
      setRejectionReason('')
      setTaskDetail({ ...taskDetail, status: 'IN_PROGRESS', rejectionReason })
      fetchNotifications()
    } catch (e: any) { message.error(e?.error || '驳回失败') }
  }

  const handleCompleteClick = () => {
    setCompletionNote('')
    setCompletionModalVisible(true)
  }

  const handleConfirmComplete = async () => {
    if (!taskDetail || !completionNote.trim()) {
      message.warning('请填写完成内容')
      return
    }
    try {
      await updateTask(taskDetail.id, { status: 'COMPLETED', completionNote })
      message.success('任务已完成 🎉')
      setCompletionModalVisible(false)
      setCompletionNote('')
      setTaskDetail({ ...taskDetail, status: 'COMPLETED', completedAt: new Date().toISOString(), completionNote })
      fetchNotifications()
    } catch (e: any) { message.error(e?.error || '操作失败') }
  }

  const handleConfirmSubmit = async () => {
    if (!taskDetail || !submitNote.trim()) {
      message.warning('请填写完成内容')
      return
    }
    try {
      await updateTask(taskDetail.id, { status: 'SUBMITTED', completionNote: submitNote })
      message.success('任务已提交')
      setSubmitNote('')
      setTaskDetail({ ...taskDetail, status: 'SUBMITTED', completionNote: submitNote })
      fetchNotifications()
    } catch (e: any) { message.error(e?.error || '提交失败') }
  }

  // 统一的菜单过滤规则：隐藏的菜单、按钮类型、contracts（合同作为项目子tab不独立显示）
  const isMenuVisible = (menu: MenuItem): boolean => {
    if (menu.key === 'contracts') return false
    if (menu.menuType === 'BUTTON') return false
    return menu.isVisible
  }

  const buildMenuItems = (menuList: MenuItem[]): MenuProps['items'] => {
    return menuList
      .filter(isMenuVisible)
      .sort((a, b) => a.order - b.order)
      .map(menu => {
        const menuItem: any = {
          key: (menu as any).path || (menu.parentId ? `/${menu.key}` : (menu.key === 'dashboard' ? '/' : `/${menu.key}`)),
          icon: renderIcon(menu.icon),
          label: menu.label
        }
        if (menu.children && menu.children.length > 0) {
          menuItem.children = buildMenuItems(menu.children)
        }
        return menuItem
      })
  }

  const menuItems = buildMenuItems(menus.filter(m => m.parentId === null).map(m => {
    const children = menus.filter(c => c.parentId === m.id && isMenuVisible(c))
    return {
      ...m,
      // 只有真正有子菜单时才设置 children，否则不显示展开箭头
      children: children.length > 0 ? children : undefined
    }
  }))

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('menus')
    // 通知权限 Hook 清空
    window.dispatchEvent(new Event('user-permissions-changed'))
    message.success('已退出登录')
    navigate('/login')
  }

  // ===== 个人信息 =====
  const openProfileModal = async () => {
    setProfileTab('info')
    setProfileModalVisible(true)
    try {
      const me: any = await api.get('/auth/me')
      setProfileMeta({ username: me.username || '', roleName: me.roleName || '普通用户' })
      profileForm.setFieldsValue({ name: me.name, email: me.email, phone: me.phone || '' })
    } catch (e: any) {
      message.error(e?.error || '获取个人信息失败')
    }
  }

  const handleProfileSave = async () => {
    const values = await profileForm.validateFields()
    setProfileSaving(true)
    try {
      await api.put('/auth/profile', values)
      message.success('个人信息已保存')
      // 同步本地缓存的姓名(顶栏显示)
      const local = safeJsonParse(localStorage.getItem('user'), {})
      localStorage.setItem('user', JSON.stringify({ ...local, name: values.name }))
      setProfileVersion(v => v + 1)
      setProfileModalVisible(false)
    } catch (e: any) {
      message.error(e?.error || '保存失败')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleSubmitPassword = async () => {
    try {
      const values = await passwordForm.validateFields()
      await api.put('/auth/change-password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword
      })
      message.success('密码修改成功')
      setProfileModalVisible(false)
    } catch (error: any) {
      message.error((error as any)?.error || '密码修改失败')
    }
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
    { key: 'role', icon: <SafetyOutlined />, label: profileMeta.roleName || user.role || '普通用户' },
    { type: 'divider' },
    { key: 'profileSettings', icon: <UserOutlined />, label: '个人信息' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true }
  ]

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') handleLogout()
    if (key === 'profileSettings') openProfileModal()
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
          <img src="/logo.png" alt="logo" style={{ width: 24, height: 24, marginRight: 10 }} />
          <span style={{ position: 'relative', zIndex: 1 }}>CRM 管理系统</span>
        </div>

        {/* Navigation Menu */}
        <Menu
          mode="inline"
          items={menuItems}
          onClick={handleMenuClick}
          selectedKeys={[location.pathname === '/' ? '/' : location.pathname]}
          defaultOpenKeys={menus.filter(m => m.parentId === null && menus.some(c => c.parentId === m.id)).map(m => `/${m.key}`)}
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
              <Badge count={unreadCount} size="small">
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
                <Button type="primary" icon={<CheckOutlined />} style={{ background: '#059669', borderColor: '#059669', borderRadius: 8 }} onClick={handleConfirmSubmit}>提交完成</Button>
              )}
              {isAssignee && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS') && (
                <Popconfirm title="确定取消此任务？" onConfirm={() => handleTaskAction('CANCELLED')}>
                  <Button danger icon={<StopOutlined />} style={{ borderRadius: 8 }}>取消任务</Button>
                </Popconfirm>
              )}

              {isAssigner && taskDetail.status === 'SUBMITTED' && (
                <>
                  <Button type="primary" icon={<CheckOutlined />} style={{ background: '#059669', borderColor: '#059669', borderRadius: 8 }} onClick={handleCompleteClick}>确认完成</Button>
                  <Button danger icon={<StopOutlined />} style={{ borderRadius: 8 }} onClick={handleRejectClick}>驳回</Button>
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
              {taskDetail.rejectionReason && (
                <div style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  background: '#fef2f2',
                  borderRadius: 10,
                  border: '1px solid #fecaca',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <ExclamationCircleOutlined style={{ marginRight: 8, color: '#ef4444', fontSize: 14 }} />
                    <strong style={{ color: '#ef4444', fontSize: 14 }}>驳回理由</strong>
                  </div>
                  <div style={{ color: '#7f1d1d', fontSize: 13, lineHeight: 1.6 }}>
                    {taskDetail.rejectionReason}
                  </div>
                </div>
              )}
            </div>
            {(() => {
              const isAssignee = taskDetail.assignees?.some((a: any) => a.id === user.id)
              const canSubmit = isAssignee && (taskDetail.status === 'PENDING' || taskDetail.status === 'IN_PROGRESS')

              if (!canSubmit) return null

              return (
                <div style={{
                  marginTop: 20,
                  padding: '16px',
                  background: '#f0fdf4',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                }}>
                  <div style={{ marginBottom: 10, color: '#166534', fontSize: 14, fontWeight: 600 }}>
                    <CheckOutlined style={{ marginRight: 6 }} />
                    填写完成内容：
                  </div>
                  <Input.TextArea
                    rows={4}
                    value={submitNote}
                    onChange={(e) => setSubmitNote(e.target.value)}
                    placeholder="请描述你完成的工作内容、成果或备注信息..."
                    style={{ borderRadius: 8 }}
                  />
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      {/* Rejection Modal */}
      <Modal
        title="驳回任务"
        open={rejectionModalVisible}
        onOk={handleConfirmReject}
        onCancel={() => setRejectionModalVisible(false)}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: '#64748b', fontSize: 13 }}>请填写驳回理由：</div>
          <Input.TextArea
            rows={4}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="请说明驳回原因，帮助执行人改进..."
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>

      {/* Completion Modal */}
      <Modal
        title="确认完成任务"
        open={completionModalVisible}
        onOk={handleConfirmComplete}
        onCancel={() => setCompletionModalVisible(false)}
        okText="确认完成"
        cancelText="取消"
        okButtonProps={{ style: { background: '#059669', borderColor: '#059669' } }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: '#64748b', fontSize: 13 }}>请填写完成内容：</div>
          <Input.TextArea
            rows={4}
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            placeholder="请描述完成的工作内容、成果或备注信息..."
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>

      {/* 个人信息弹窗(基本信息 + 修改密码) */}
      <Modal
        title="个人信息"
        open={profileModalVisible}
        onCancel={() => setProfileModalVisible(false)}
        confirmLoading={profileTab === 'info' ? profileSaving : false}
        onOk={() => (profileTab === 'info' ? handleProfileSave() : handleSubmitPassword())}
        okText={profileTab === 'info' ? '保存' : '确认修改'}
        cancelText="取消"
        width={520}
      >
        <Tabs
          activeKey={profileTab}
          onChange={setProfileTab}
          items={[
            {
              key: 'info',
              label: '👤 基本信息',
              children: (
                <Form form={profileForm} layout="vertical">
                  <Form.Item label="用户名">
                    <Input value={profileMeta.username} disabled />
                  </Form.Item>
                  <Form.Item label="角色">
                    <Input value={profileMeta.roleName} disabled />
                  </Form.Item>
                  <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                    <Input placeholder="请输入姓名" />
                  </Form.Item>
                  <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
                    <Input placeholder="请输入邮箱" />
                  </Form.Item>
                  <Form.Item
                    name="phone"
                    label="手机号（选填）"
                    extra="用于企业微信提醒中 @ 到你本人，需与企业微信绑定的手机号一致"
                    rules={[{ pattern: /^1\d{10}$/, message: '请输入11位手机号' }]}
                  >
                    <Input placeholder="选填，如 13800138000" maxLength={11} />
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'password',
              label: '🔒 修改密码',
              children: (
                <Form form={passwordForm} layout="vertical" autoComplete="off">
                  <Form.Item label="当前密码" name="oldPassword" rules={[{ required: true, message: '请输入当前密码' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="请输入当前密码" />
                  </Form.Item>
                  <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码长度至少6位' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码（至少6位）" />
                  </Form.Item>
                  <Form.Item
                    label="确认新密码"
                    name="confirmPassword"
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: '请确认新密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                          return Promise.reject(new Error('两次输入的密码不一致'))
                        },
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Modal>
    </AntLayout>
  )
}

export default Layout
