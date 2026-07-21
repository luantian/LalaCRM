import { useEffect, useState } from 'react'
import { Card, Table, Tag, message, Button, Modal, Tree, Space, Form, Input, Checkbox, Divider, Empty, Dropdown, Descriptions } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, SettingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, MoreOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import api from '../services/api'
import { getRoleMenus, assignRoleMenus } from '../services/api'

interface Role {
  id: number
  name: string
  displayName: string
  description: string
  permissions: string[]
}

interface MenuItem {
  id: number
  key: string
  label: string
  icon: string
  parentId: number | null
  order: number
  isVisible: boolean
  menuType: string
  perm: string | null
  children?: MenuItem[]
}

function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [allMenus, setAllMenus] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(false)

  // 菜单分配弹窗状态
  const [menuModalVisible, setMenuModalVisible] = useState(false)
  const [currentRole, setCurrentRole] = useState<Role | null>(null)
  const [checkedMenuIds, setCheckedMenuIds] = useState<number[]>([])
  const [menuLoading, setMenuLoading] = useState(false)

  // 角色编辑弹窗状态
  const [roleModalVisible, setRoleModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleForm] = Form.useForm()
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [viewingRole, setViewingRole] = useState<Role | null>(null)

  // 权限定义（对照表用）
  const permissionDefs = [
    // 系统
    { key: 'manage_system', label: '系统管理', group: '系统' },
    // 客户
    { key: 'view_customers', label: '查看客户', group: '客户' },
    { key: 'edit_customers', label: '编辑客户', group: '客户' },
    // 项目
    { key: 'view_projects', label: '查看项目', group: '项目' },
    { key: 'edit_projects', label: '编辑项目', group: '项目' },
    { key: 'create_projects', label: '创建项目', group: '项目' },
    // 商机
    { key: 'view_opportunities', label: '查看商机', group: '商机' },
    { key: 'edit_opportunities', label: '管理商机', group: '商机' },
    // 报价单
    { key: 'view_quotations', label: '查看报价', group: '报价' },
    { key: 'edit_quotations', label: '管理报价', group: '报价' },
    { key: 'approve_quotations', label: '审批报价', group: '报价' },
    // 合同
    { key: 'view_contracts', label: '查看合同', group: '合同' },
    { key: 'edit_contracts', label: '管理合同', group: '合同' },
    { key: 'approve_contracts', label: '审批合同', group: '合同' },
    // 采购
    { key: 'view_procurements', label: '查看采购', group: '采购' },
    { key: 'edit_procurements', label: '管理采购', group: '采购' },
    { key: 'approve_procurements', label: '审批采购', group: '采购' },
    // 出差
    { key: 'view_business_trips', label: '查看出差', group: '出差' },
    { key: 'submit_trips', label: '提交出差', group: '出差' },
    { key: 'approve_business_trips', label: '审批出差', group: '出差' },
    // 报销
    { key: 'view_expenses', label: '查看报销', group: '报销' },
    { key: 'submit_expenses', label: '提交报销', group: '报销' },
    { key: 'approve_expenses', label: '审批报销', group: '报销' },
    // 发票
    { key: 'view_invoices', label: '查看发票', group: '发票' },
    { key: 'edit_invoices', label: '管理发票', group: '发票' },
    // 日报
    { key: 'view_reports', label: '查看日报', group: '日报' },
    { key: 'create_reports', label: '填写日报', group: '日报' },
  ]

  const roleColors: Record<string, string> = {
    ADMIN: 'red', PROJECT_DIRECTOR: 'purple', PROJECT_MANAGER: 'blue',
    USER: 'green', VIEWER: 'default'
  }

  const scopeMap: Record<string, string> = {
    ADMIN: '全部数据', PROJECT_DIRECTOR: '全部数据',
    PROJECT_MANAGER: '自己负责的项目', USER: '自己参与的项目',
    VIEWER: '自己相关的数据'
  }

  const fetchRoles = async () => {
    setLoading(true)
    try {
      const response = await api.get('/roles') as any
      setRoles(response)
    } catch (error: any) {
      message.error('获取角色列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllMenus = async () => {
    try {
      const response = await api.get('/menus') as any
      setAllMenus(response)
    } catch (error: any) {
      console.error('获取菜单列表失败:', error)
    }
  }

  useEffect(() => {
    fetchRoles()
    fetchAllMenus()
  }, [])

  // 打开菜单分配弹窗
  const handleAssignMenus = async (role: Role) => {
    setCurrentRole(role)
    setMenuLoading(true)
    setMenuModalVisible(true)
    try {
      const response: any = await getRoleMenus(role.id)
      // 提取所有菜单ID（包括子菜单）
      const extractIds = (menus: any[]): number[] => {
        const ids: number[] = []
        menus.forEach((m: any) => {
          ids.push(m.id)
          if (m.children?.length) ids.push(...extractIds(m.children))
        })
        return ids
      }
      setCheckedMenuIds(extractIds(Array.isArray(response) ? response : []))
    } catch (error: any) {
      message.error('获取角色菜单失败')
    } finally {
      setMenuLoading(false)
    }
  }

  // 保存菜单分配
  const handleSaveMenus = async () => {
    if (!currentRole) return
    try {
      await assignRoleMenus(currentRole.id, checkedMenuIds)
      message.success('菜单分配成功')
      setMenuModalVisible(false)
      fetchRoles() // 刷新角色列表以更新对照表
    } catch (error: any) {
      message.error('保存失败')
    }
  }

  // 将菜单列表转换为Tree数据
  const buildTreeData = (menus: MenuItem[]): DataNode[] => {
    return menus
      .filter(m => m.menuType !== 'BUTTON') // 按钮类型不显示在树中
      .sort((a, b) => a.order - b.order)
      .map(menu => ({
        key: menu.id,
        title: (
          <span>
            {menu.label}
            {menu.perm && <span style={{ color: '#999', fontSize: 11, marginLeft: 8 }}>({menu.perm})</span>}
          </span>
        ),
        children: menu.children?.length ? buildTreeData(menu.children) : undefined
      }))
  }

  // 构建带子菜单的完整列表
  const menusWithChildren: MenuItem[] = allMenus
    .filter(m => m.parentId === null)
    .map(m => ({
      ...m,
      children: allMenus.filter(c => c.parentId === m.id)
    }))

  // ===== 角色 CRUD =====
  const handleCreateRole = () => {
    setEditingRole(null)
    roleForm.resetFields()
    setSelectedPermissions([])
    setRoleModalVisible(true)
  }

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    roleForm.setFieldsValue(role)
    // ADMIN 自动拥有所有权限
    setSelectedPermissions(role.name === 'ADMIN' ? permissionDefs.map(p => p.key) : (role.permissions || []))
    setRoleModalVisible(true)
  }

  const handleRoleSubmit = async () => {
    try {
      const values = await roleForm.validateFields()
      const name = editingRole ? editingRole.name : 'ROLE_' + Date.now().toString(36).toUpperCase()
      const data = editingRole ? { ...values, permissions: selectedPermissions } : { ...values, name, permissions: selectedPermissions }
      if (editingRole) {
        await api.put(`/roles/${editingRole.id}`, data)
        message.success('更新成功')
      } else {
        await api.post('/roles', data)
        message.success('创建成功')
      }
      setRoleModalVisible(false)
      fetchRoles()
    } catch (e: any) {
      message.error(e?.error || '操作失败')
    }
  }

  // 查看角色详情
  const handleViewRole = (role: Role) => {
    setViewingRole(role)
  }

  const handleDeleteRole = async (role: Role) => {
    try {
      await api.delete(`/roles/${role.id}`)
      message.success('删除成功')
      fetchRoles()
    } catch (e: any) {
      message.error(e?.error || '删除失败')
    }
  }

  // ===== 对照表 =====
  const sortedRoles = [...roles].sort((a, b) => (b.permissions?.length || 0) - (a.permissions?.length || 0))

  const matrixData = permissionDefs.map((perm, index) => {
    const row: any = { key: index, permission: perm.label, group: perm.group }
    sortedRoles.forEach(role => {
      // ADMIN 自动拥有所有权限
      row[role.name] = role.name === 'ADMIN' || role.permissions.includes(perm.key)
    })
    return row
  })

  const matrixColumns: any[] = [
    {
      title: '分组', dataIndex: 'group', key: 'group', width: 80,
      onCell: (_: any, index: any) => {
        const currentGroup = _.group
        const prevRow = index > 0 ? matrixData[index - 1] : null
        const rowSpan = matrixData.filter(r => r.group === currentGroup).length
        const isFirst = !prevRow || prevRow.group !== currentGroup
        return { rowSpan: isFirst ? rowSpan : 0 }
      },
      render: (group: string) => <Tag>{group}</Tag>
    },
    { title: '功能', dataIndex: 'permission', key: 'permission', width: 120 }
  ]

  sortedRoles.forEach(role => {
    matrixColumns.push({
      title: () => (
        <div style={{ textAlign: 'center' }}>
          <Tag color={roleColors[role.name] || 'default'} style={{ fontSize: 13, padding: '2px 10px' }}>
            {role.displayName}
          </Tag>
        </div>
      ),
      dataIndex: role.name, key: role.name, width: 100, align: 'center' as const,
      render: (hasPerm: boolean) => hasPerm
        ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 20 }} />
        : <CloseCircleFilled style={{ color: '#d9d9d9', fontSize: 20 }} />
    })
  })

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>角色管理</h2>
      </div>

      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b', margin: 0 }}>权限对照表</h2>
        <span style={{ color: '#999', fontSize: 13 }}>点击角色说明中的"分配菜单"按钮调整各角色可访问的菜单</span>
      </div>
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={matrixColumns}
          dataSource={matrixData}
          loading={loading}
          pagination={false}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
          rowKey="key"
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      <div style={{ marginTop: 24, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b', margin: 0 }}>角色说明</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateRole}>新建角色</Button>
      </div>
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={sortedRoles}
          rowKey="id"
          pagination={false}
          columns={[
            {
              title: '角色', dataIndex: 'displayName', key: 'displayName', width: 120,
              render: (name: string, record: Role) => (
                <Tag color={roleColors[record.name] || 'default'} style={{ fontSize: 13 }}>{name}</Tag>
              )
            },
            { title: '标识', dataIndex: 'name', key: 'name', width: 140, render: (v: string) => <code>{v}</code> },
            { title: '说明', dataIndex: 'description', key: 'description' },
            {
              title: '数据范围', key: 'scope', width: 130,
              render: (_: any, record: Role) => scopeMap[record.name] || '-'
            },
            {
              title: '权限数', key: 'count', width: 70, align: 'center' as const,
              render: (_: any, record: Role) => (
                <span style={{ fontWeight: 'bold', color: '#1890ff' }}>{record.permissions?.length || 0}</span>
              )
            },
            {
              title: '操作', key: 'action', width: 300,
              render: (_: any, record: Role) => (
                <Space size={0}>
                  <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewRole(record)}>查看</Button>
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRole(record)}>编辑</Button>
                  <Dropdown menu={{ items: [
                    { key: 'menu', icon: <SettingOutlined />, label: '分配菜单', onClick: () => handleAssignMenus(record) }
                  ]}}>
                    <Button type="link" size="small" icon={<MoreOutlined />}>更多</Button>
                  </Dropdown>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: '确认删除', content: `确定删除角色"${record.displayName}"？如果该角色下有用户将无法删除。`, onOk: () => handleDeleteRole(record) })}>删除</Button>
                </Space>
              )
            }
          ]}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      {/* 菜单分配弹窗 */}
      <Modal
        title={`分配菜单 - ${currentRole?.displayName || ''}`}
        open={menuModalVisible}
        onOk={handleSaveMenus}
        onCancel={() => setMenuModalVisible(false)}
        width={500}
        confirmLoading={menuLoading}
        style={{ top: 20 }}
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          勾选该角色可以看到的菜单页面。取消勾选后，该角色的用户将无法看到对应菜单。
        </div>
        {allMenus.length > 0 ? (
          <Tree
            checkable
            defaultExpandAll
            checkedKeys={checkedMenuIds}
            onCheck={(checked: any) => setCheckedMenuIds(Array.isArray(checked) ? checked : checked.checked)}
            treeData={buildTreeData(menusWithChildren)}
            style={{ maxHeight: 400, overflow: 'auto' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>加载中...</div>
        )}
      </Modal>

      {/* 新建/编辑角色弹窗 */}
      <Modal
        title={editingRole ? '编辑角色' : '新建角色'}
        open={roleModalVisible}
        onOk={handleRoleSubmit}
        onCancel={() => setRoleModalVisible(false)}
        width={600}
        style={{ top: 20 }}
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="displayName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="如 销售经理、技术主管" />
          </Form.Item>
          <Form.Item name="description" label="角色说明" rules={[{ required: true, message: '请输入角色说明' }]}>
            <Input.TextArea rows={2} placeholder="描述该角色的职责和权限范围" />
          </Form.Item>
          {editingRole && (
            <Form.Item label="角色标识">
              <Input value={editingRole.name} disabled />
            </Form.Item>
          )}
        </Form>

        <Divider orientation="left" plain>功能权限{editingRole?.name === 'ADMIN' && <span style={{ color: '#f5222d', fontWeight: 'normal', fontSize: 12, marginLeft: 8 }}>（管理员默认拥有全部权限）</span>}</Divider>
        <div style={{ maxHeight: 320, overflow: 'auto', padding: '0 8px' }}>
          {Array.from(new Set(permissionDefs.map(p => p.group))).map(group => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#1890ff' }}>{group}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 0' }}>
                {permissionDefs.filter(p => p.group === group).map(perm => (
                  <Checkbox
                    key={perm.key}
                    checked={selectedPermissions.includes(perm.key)}
                    disabled={editingRole?.name === 'ADMIN'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPermissions([...selectedPermissions, perm.key])
                      } else {
                        setSelectedPermissions(selectedPermissions.filter(k => k !== perm.key))
                      }
                    }}
                    style={{ marginLeft: 0 }}
                  >
                    {perm.label}
                  </Checkbox>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* 查看角色详情弹窗 */}
      <Modal
        title="角色详情"
        open={!!viewingRole}
        onCancel={() => setViewingRole(null)}
        footer={null}
        width={500}
      >
        {viewingRole && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="角色名称">{viewingRole.displayName}</Descriptions.Item>
            <Descriptions.Item label="角色标识"><code>{viewingRole.name}</code></Descriptions.Item>
            <Descriptions.Item label="说明">{viewingRole.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="数据范围">{scopeMap[viewingRole.name] || '-'}</Descriptions.Item>
            <Descriptions.Item label="权限数">{viewingRole.permissions?.length || 0}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default RoleManagement
