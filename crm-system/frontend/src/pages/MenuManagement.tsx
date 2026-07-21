import { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Card, Space, Switch, Tooltip, Descriptions } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, DownOutlined, RightOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'
import api from '../services/api'
import * as Icons from '@ant-design/icons'

interface MenuItem {
  id: number
  key: string
  icon: string
  label: string
  parentId: number | null
  order: number
  isVisible: boolean
  requiredRole: string
  createdAt: string
  updatedAt: string
  children?: MenuItem[]
}

// 可用图标列表
const iconList = [
  'DashboardOutlined', 'HomeOutlined', 'AppstoreOutlined', 'SettingOutlined',
  'UserOutlined', 'TeamOutlined', 'SafetyOutlined', 'AuditOutlined',
  'DollarOutlined', 'AccountBookOutlined', 'ShopOutlined', 'ShoppingCartOutlined',
  'ProjectOutlined', 'ContainerOutlined', 'ScheduleOutlined', 'FileTextOutlined',
  'CarOutlined', 'FundOutlined', 'BarChartOutlined', 'PieChartOutlined',
  'MailOutlined', 'PhoneOutlined', 'MessageOutlined', 'SendOutlined',
  'EnvironmentOutlined', 'GlobalOutlined', 'CloudOutlined', 'DatabaseOutlined',
  'ToolOutlined', 'BuildOutlined', 'CodeOutlined', 'BugOutlined',
  'BellOutlined', 'InboxOutlined', 'SearchOutlined', 'FilterOutlined',
  'LockOutlined', 'KeyOutlined', 'SecurityScanOutlined', 'CheckCircleOutlined',
  'ClockCircleOutlined', 'StarOutlined', 'HeartOutlined', 'FireOutlined',
  'RocketOutlined', 'ThunderboltOutlined', 'CrownOutlined', 'TrophyOutlined',
  'CameraOutlined', 'VideoCameraOutlined', 'PrinterOutlined', 'RobotOutlined',
  'FlagOutlined', 'LabelOutlined', 'BookmarkOutlined', 'GiftOutlined',
  'BankOutlined', 'InsuranceOutlined', 'SoundOutlined', 'WifiOutlined',
  'SwapOutlined', 'UploadOutlined', 'DownloadOutlined', 'DesktopOutlined',
]

const IconCell = ({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) => {
  const IconComp = (Icons as any)[name]
  if (!IconComp) return null
  return (
    <Tooltip title={name} key={name}>
      <div
        onClick={onClick}
        style={{
          width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, cursor: 'pointer', margin: 3,
          border: selected ? '2px solid #1890ff' : '1px solid #e8e8e8',
          background: selected ? '#e6f7ff' : '#fff',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { if (!selected) (e.currentTarget.style.background = '#f5f5f5') }}
        onMouseLeave={e => { if (!selected) (e.currentTarget.style.background = '#fff') }}
      >
        <IconComp style={{ fontSize: 20, color: selected ? '#1890ff' : '#595959' }} />
      </div>
    </Tooltip>
  )
}

const IconPicker = ({ value, onChange }: { value?: string; onChange?: (val: string) => void }) => {
  const [search, setSearch] = useState('')
  const filtered = iconList.filter(n => n.toLowerCase().includes(search.toLowerCase()))
  return (
    <div>
      <Input
        placeholder="搜索图标..."
        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 10 }}
      />
      {value && (
        <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
          已选择：<span style={{ color: '#1890ff', fontWeight: 500 }}>{value}</span>
          <a onClick={() => onChange?.('')} style={{ marginLeft: 8, fontSize: 12 }}>清除</a>
        </div>
      )}
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 8, padding: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>没有匹配的图标</div>
        ) : (
          filtered.map(name => (
            <IconCell key={name} name={name} selected={value === name} onClick={() => onChange?.(name)} />
          ))
        )}
      </div>
    </div>
  )
}

function MenuManagement() {
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null)
  const [viewingMenu, setViewingMenu] = useState<MenuItem | null>(null)
  const [form] = Form.useForm()

  // 构建菜单树结构
  const buildMenuTree = (menuList: MenuItem[]): MenuItem[] => {
    const menuMap: Record<number, MenuItem> = {}
    const roots: MenuItem[] = []

    // 先将所有菜单放入 map 中
    menuList.forEach(menu => {
      menuMap[menu.id] = { ...menu, children: [] }
    })

    // 构建树结构
    menuList.forEach(menu => {
      if (menu.parentId === null) {
        roots.push(menuMap[menu.id])
      } else {
        const parent = menuMap[menu.parentId]
        if (parent) {
          parent.children!.push(menuMap[menu.id])
        }
      }
    })

    // 按 order 排序
    const sortMenus = (menus: MenuItem[]) => {
      menus.sort((a, b) => a.order - b.order)
      menus.forEach(menu => {
        if (menu.children && menu.children.length > 0) {
          sortMenus(menu.children)
        }
      })
    }

    sortMenus(roots)
    return roots
  }

  // 获取角色列表
  const fetchRoles = async () => {
    try {
      const response = await api.get('/roles') as any
      setRoles(response)
    } catch (error: any) {
      console.error('获取角色列表失败:', error)
    }
  }

  // 获取菜单列表
  const fetchMenus = async () => {
    setLoading(true)
    try {
      const response = await api.get('/menus') as any
      const menuTree = buildMenuTree(response)
      setMenus(menuTree)
    } catch (error: any) {
      message.error(error?.error || '获取菜单列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMenus()
    fetchRoles()
  }, [])

  // 打开创建菜单弹窗
  const handleAdd = () => {
    setEditingMenu(null)
    form.resetFields()
    setModalVisible(true)
  }

  // 查看菜单详情
  const handleViewMenu = (menu: MenuItem) => {
    setViewingMenu(menu)
  }

  // 打开编辑菜单弹窗
  const handleEdit = (menu: MenuItem) => {
    setEditingMenu(menu)
    form.setFieldsValue(menu)
    setModalVisible(true)
  }

  // 删除菜单
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/menus/${id}`)
      message.success('菜单删除成功')
      fetchMenus()
    } catch (error: any) {
      message.error(error?.error || '删除菜单失败')
    }
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (editingMenu) {
        // 编辑菜单
        await api.put(`/menus/${editingMenu.id}`, values)
        message.success('菜单更新成功')
      } else {
        // 创建菜单
        await api.post('/menus', values)
        message.success('菜单创建成功')
      }

      setModalVisible(false)
      fetchMenus()
    } catch (error: any) {
      if (error?.error) {
        message.error(error?.error)
      } else {
        message.error('操作失败')
      }
    }
  }

  // 获取父菜单选项
  const getParentMenuOptions = () => {
    return menus
      .filter(m => m.parentId === null) // 只显示顶级菜单作为父菜单
      .filter(m => editingMenu ? m.id !== editingMenu.id : true) // 编辑时排除自己
      .map(m => ({ value: m.id, label: m.label }))
  }

  const columns = [
    {
      title: '菜单名称',
      dataIndex: 'label',
      key: 'label',
      width: 200,
      render: (label: string, record: MenuItem) => {
        const IconComp = (Icons as any)[record.icon]
        return (
          <span>
            {IconComp ? <IconComp style={{ marginRight: 8, color: '#1890ff' }} /> : null}
            {label}
          </span>
        )
      }
    },
    {
      title: '菜单标识',
      dataIndex: 'key',
      key: 'key',
      width: 150
    },
    {
      title: '排序',
      dataIndex: 'order',
      key: 'order',
      width: 80
    },
    {
      title: '是否显示',
      dataIndex: 'isVisible',
      key: 'isVisible',
      width: 100,
      render: (isVisible: boolean) => (
        <span>{isVisible ? '是' : '否'}</span>
      )
    },
    {
      title: '所需角色',
      dataIndex: 'requiredRoles',
      key: 'requiredRoles',
      width: 150,
      render: (roles: string[]) => {
        if (!roles || roles.length === 0) {
          return '所有用户'
        }
        return roles.join(', ')
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: MenuItem) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewMenu(record)}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm
            title="确定要删除吗?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <Card
        title="菜单管理"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              创建菜单
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={menus}
          loading={loading}
          rowKey="id"
          pagination={false}
          expandable={{
            defaultExpandAllRows: true,
            expandIcon: ({ expanded, onExpand, record }) => {
              // 如果没有子菜单，不显示展开图标
              if (!record.children || record.children.length === 0) {
                return null
              }
              // 否则显示正常的展开/折叠图标
              return (
                <span
                  onClick={e => onExpand(record, e)}
                  style={{ cursor: 'pointer', marginRight: 8, color: '#1890ff' }}
                >
                  {expanded ? <DownOutlined /> : <RightOutlined />}
                </span>
              )
            }
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={editingMenu ? '编辑菜单' : '创建菜单'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="key"
            label="菜单标识"
            rules={[
              { required: true, message: '请输入菜单标识' },
              { pattern: /^[a-z0-9-]+$/, message: '菜单标识只能包含小写字母、数字和横线' }
            ]}
          >
            <Input placeholder="例如：dashboard、user-management" />
          </Form.Item>

          <Form.Item
            name="label"
            label="菜单名称"
            rules={[{ required: true, message: '请输入菜单名称' }]}
          >
            <Input placeholder="例如：仪表盘、用户管理" />
          </Form.Item>

          <Form.Item
            name="icon"
            label="图标"
            rules={[{ required: true, message: '请选择图标' }]}
          >
            <IconPicker />
          </Form.Item>

          <Form.Item
            name="parentId"
            label="父菜单"
          >
            <Select placeholder="选择父菜单（留空为顶级菜单）" allowClear>
              {getParentMenuOptions().map(option => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="order"
            label="排序"
            rules={[{ required: true, message: '请输入排序号' }]}
            initialValue={0}
          >
            <Input type="number" placeholder="数字越小越靠前" />
          </Form.Item>

          <Form.Item
            name="isVisible"
            label="是否显示"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="requiredRoles"
            label="所需角色"
            rules={[{ required: true, message: '请选择所需角色' }]}
            initialValue={[]}
          >
            <Select
              mode="multiple"
              placeholder="请选择所需角色（可多选）"
              style={{ width: '100%' }}
            >
              {roles.map(role => (
                <Select.Option key={role.id} value={role.name}>
                  {role.displayName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 查看菜单详情弹窗 */}
      <Modal
        title="菜单详情"
        open={!!viewingMenu}
        onCancel={() => setViewingMenu(null)}
        footer={null}
        width={500}
      >
        {viewingMenu && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="菜单名称">{viewingMenu.label}</Descriptions.Item>
            <Descriptions.Item label="菜单标识"><code>{viewingMenu.key}</code></Descriptions.Item>
            <Descriptions.Item label="图标">{viewingMenu.icon || '-'}</Descriptions.Item>
            <Descriptions.Item label="排序">{viewingMenu.order}</Descriptions.Item>
            <Descriptions.Item label="是否显示">{viewingMenu.isVisible ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="所需角色">{viewingMenu.requiredRole || '所有用户'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default MenuManagement
