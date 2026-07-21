import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, App as AntApp } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { login } from '../services/api'

function Login() {
  const { message } = AntApp.useApp()
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const response: any = await login(values)
      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.user))
      // 存储用户有权限的菜单（若依动态菜单）
      if (response.menus) {
        localStorage.setItem('menus', JSON.stringify(response.menus))
      }
      // 存储权限列表
      if (response.user?.permissions) {
        localStorage.setItem('permissions', JSON.stringify(response.user.permissions))
      }
      message.success('登录成功')
      navigate('/')
    } catch (error: any) {
      message.error(error?.error || error?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Left panel - branding */}
      <div className="login-left-panel">
        <div className="login-shapes">
          <div className="login-shape login-shape-1"></div>
          <div className="login-shape login-shape-2"></div>
          <div className="login-shape login-shape-3"></div>
          <div className="login-shape login-shape-4"></div>
          <div className="login-shape login-shape-5"></div>
        </div>
        <div className="login-branding">
          <div className="login-logo-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="white" strokeWidth="2" opacity="0.3" />
              <circle cx="24" cy="24" r="12" fill="white" opacity="0.2" />
              <path d="M16 20C16 17.79 17.79 16 20 16H28C30.21 16 32 17.79 32 20V28C32 30.21 30.21 32 28 32H20C17.79 32 16 30.21 16 28V20Z" fill="white" opacity="0.9" />
              <path d="M22 22H26V26H22V22Z" fill="#4f46e5" />
            </svg>
          </div>
          <h1 className="login-title">CRM客户管理系统</h1>
          <p className="login-tagline">高效管理客户关系，驱动业务增长</p>
          <div className="login-features">
            <div className="login-feature-item">
              <span className="login-feature-dot"></span>
              <span>智能客户分析</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-dot"></span>
              <span>全流程销售管理</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-dot"></span>
              <span>数据驱动决策</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="login-right-panel">
        <div className="login-form-container">
          <div className="login-form-header">
            <h2 className="login-form-title">欢迎回来</h2>
            <p className="login-form-subtitle">请登录您的账户以继续</p>
          </div>

          <Form onFinish={onFinish} size="large" className="login-form">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                placeholder="用户名"
                className="login-input"
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="密码"
                className="login-input"
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                className="login-submit-btn"
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <div className="login-footer">
            <span>© 2026 CRM客户管理系统</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
