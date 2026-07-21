import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, App as AntApp } from 'antd'
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
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f0f2f5'
    }}>
      <Card title="CRM客户管理系统" style={{ width: 400 }}>
        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Login
