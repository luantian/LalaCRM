import { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Card, Space, Tag, Empty } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../services/api'

interface User {
  id: number
  username: string
  email: string
  name: string
  role: string
  createdAt: string
  updatedAt: string
}

interface Role {
  value: number  // 改为number类型，因为是数据库ID
  label: string
  description: string
  name: string
}

function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form] = Form.useForm()

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const response = await api.get('/users')
      setUsers(response)
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  // 获取角色列表（从数据库）
  const fetchRoles = async () => {
    try {
      const response = await api.get('/roles')
      // 转换格式以适配Select组件
      const roleOptions = response.map((role: any) => ({
        value: role.id,
        label: role.displayName,
        description: role.description,
        name: role.name
      }))
      setRoles(roleOptions)
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取角色列表失败')
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])

  // 打开创建用户弹窗
  const handleAdd = () => {
    setEditingUser(null)
    form.resetFields()
    setModalVisible(true)
  }

  // 打开编辑用户弹窗
  const handleEdit = (user: any) => {
    setEditingUser(user)
    form.setFieldsValue({
      ...user,
      role: user.roleId,  // 使用roleId作为角色的值
      password: '' // 编辑时不显示密码
    })
    setModalVisible(true)
  }

  // 删除用户
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`)
      message.success('用户删除成功')
      fetchUsers()
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除用户失败')
    }
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (editingUser) {
        // 编辑用户
        const updateData: any = {
          email: values.email,
          name: values.name,
          roleId: values.role  // 使用roleId而不是role
        }
        if (values.password) {
          updateData.password = values.password
        }
        await api.put(`/users/${editingUser.id}`, updateData)
        message.success('用户更新成功')
      } else {
        // 创建用户
        const userData = {
          ...values,
          roleId: values.role  // 使用roleId而不是role
        }
        delete userData.role
        await api.post('/users', userData)
        message.success('用户创建成功')
      }

      setModalVisible(false)
      fetchUsers()
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error)
      } else {
        message.error('操作失败')
      }
    }
  }

  // 角色标签颜色
  const roleColors: Record<string, string> = {
    ADMIN: 'red',
    PROJECT_DIRECTOR: 'purple',
    PROJECT_MANAGER: 'blue',
    USER: 'green',
    VIEWER: 'default'
  }

  // 获取角色显示名称
  const getRoleName = (role: string) => {
    const roleObj = roles.find(r => r.value === role)
    return roleObj ? roleObj.label : role
  }

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username'
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (_: any, record: any) => {
        if (record.roleRef) {
          return <Tag color={roleColors[record.roleRef.name] || 'default'}>{record.roleRef.displayName}</Tag>
        }
        return record.role || '-'
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个用户吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          创建用户
        </Button>
      </div>
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={users}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个用户`
          }}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '创建用户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          {!editingUser && (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' }
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            name="password"
            label={editingUser ? '新密码（留空则不修改）' : '密码'}
            rules={editingUser ? [] : [
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password placeholder={editingUser ? '留空则不修改密码' : '请输入密码'} />
          </Form.Item>

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              {roles.map(role => (
                <Select.Option key={role.value} value={role.value}>
                  <div>
                    <Tag color={roleColors[role.name] || 'default'} style={{ marginRight: 8 }}>{role.label}</Tag>
                    <span style={{ color: '#999', fontSize: 12 }}>{role.description}</span>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagement
