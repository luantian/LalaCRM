import { useEffect, useState, type FC } from 'react'
import { Card, Table, Tag, App, Button, Modal, Tree, Space, Form, Input, Select, Checkbox, Empty, Tabs, Descriptions, Popconfirm, Spin } from 'antd'
import { SettingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, BarChartOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import api from '../services/api'
import { getRoleMenus, assignRoleMenus } from '../services/api'
import { usePermission } from '../hooks/usePermission'

// ===== 权限对照表组件（矩阵打勾式） =====

interface PermRow {
  label: string   // 操作名称，如"创建客户"
  perm: string    // 权限标识，如"crm:organization:add"
}

interface PermGroup {
  groupLabel: string   // 分组名，如"客户管理"
  rows: PermRow[]      // 该分组下的所有操作
}

// 从菜单树构建权限对照表数据（扁平化所有操作按钮）
function buildPermGroups(menusTree: MenuItem[]): PermGroup[] {
  const result: PermGroup[] = []

  const processTopMenu = (topMenu: MenuItem) => {
    const rows: PermRow[] = []

    // 收集顶级菜单直接的按钮
    const collectButtons = (menu: MenuItem) => {
      ;(menu.children || []).forEach(child => {
        if (child.menuType === 'BUTTON' && child.perm) {
          rows.push({ label: child.label, perm: child.perm })
        }
      })
    }

    const hasSubPages = (topMenu.children || []).some(c => c.menuType === 'PAGE')

    if (hasSubPages) {
      // 有子页面：每个子页面的按钮按"子页面名/操作名"展示
      ;(topMenu.children || []).forEach(child => {
        if (child.menuType === 'PAGE') {
          // 子页面自身的按钮
          ;(child.children || []).forEach(btn => {
            if (btn.menuType === 'BUTTON' && btn.perm) {
              rows.push({ label: `${child.label} - ${btn.label}`, perm: btn.perm })
            }
          })
        }
      })
      // 顶级菜单直接的按钮
      collectButtons(topMenu)
    } else {
      // 无子页面：直接收集按钮
      collectButtons(topMenu)
    }

    if (rows.length > 0) {
      result.push({ groupLabel: topMenu.label, rows })
    }
  }

  menusTree.forEach(topMenu => processTopMenu(topMenu))
  return result
}

interface PermissionMatrixProps {
  roles: Role[]
  permGroups: PermGroup[]
}

const PermissionMatrix: FC<PermissionMatrixProps> = ({ roles, permGroups }) => {
  const hasPerm = (role: Role, perm: string) => {
    // 管理员通配符权限
    if (role.permissions?.includes('*')) return true
    return role.permissions?.includes(perm) || false
  }

  // 统计角色在某分组中拥有的权限数
  const countPerms = (role: Role, group: PermGroup) =>
    group.rows.filter(r => hasPerm(role, r.perm)).length

  // 角色颜色
  const roleColors: Record<string, string> = {
    ADMIN: '#f5222d', PROJECT_DIRECTOR: '#722ed1',
    PROJECT_MANAGER: '#1890ff', USER: '#52c41a', VIEWER: '#999'
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      {/* 图例 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12, color: '#64748b', alignItems: 'center' }}>
        <span>图例：</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#52c41a', fontWeight: 700, fontSize: 14 }}>✓</span> 有权限
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#d9d9d9', fontWeight: 700, fontSize: 14 }}>✗</span> 无权限
        </span>
        <span style={{ marginLeft: 12, color: '#94a3b8' }}>
          表头数字 = 该角色在此模块拥有的权限数/总权限数
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        {permGroups.map((group, gi) => (
          <tbody key={gi}>
            {/* 分组标题行 */}
            <tr>
              <td colSpan={roles.length + 1} style={{
                padding: '8px 12px',
                background: '#f8fafc',
                fontWeight: 600,
                fontSize: 13,
                color: '#1e293b',
                borderBottom: '2px solid #e2e8f0',
                borderTop: gi > 0 ? '2px solid #e2e8f0' : 'none'
              }}>
                {group.groupLabel}
              </td>
            </tr>
            {/* 表头行 */}
            <tr>
              <th style={{
                textAlign: 'left', padding: '6px 12px', width: 160,
                background: '#fafbfc', color: '#64748b', fontWeight: 500, fontSize: 11,
                borderBottom: '1px solid #e2e8f0'
              }}>操作</th>
              {roles.map(role => {
                const count = countPerms(role, group)
                const total = group.rows.length
                return (
                  <th key={role.id} style={{
                    textAlign: 'center', padding: '6px 8px',
                    background: '#fafbfc',
                    color: roleColors[role.name] || '#334155',
                    fontWeight: 600, fontSize: 12,
                    borderBottom: '1px solid #e2e8f0',
                    minWidth: 72
                  }}>
                    <div>{role.displayName}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginTop: 1 }}>
                      {count}/{total}
                    </div>
                  </th>
                )
              })}
            </tr>
            {/* 权限行 */}
            {group.rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{
                  padding: '6px 12px', color: '#475569', fontSize: 12,
                  background: ri % 2 === 0 ? 'transparent' : '#fafbfc'
                }}>
                  {row.label}
                </td>
                {roles.map(role => {
                  const yes = hasPerm(role, row.perm)
                  return (
                    <td key={role.id} style={{
                      textAlign: 'center', padding: '6px 8px',
                      background: yes ? 'rgba(82,196,26,0.06)' : (ri % 2 === 0 ? 'transparent' : '#fafbfc')
                    }}>
                      {yes ? (
                        <span style={{ color: '#52c41a', fontWeight: 700, fontSize: 15 }}>✓</span>
                      ) : (
                        <span style={{ color: '#d9d9d9', fontSize: 15 }}>✗</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

interface Role {
  id: number
  name: string
  displayName: string
  description: string
  permissions: string[]
  dataScope?: string
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
  const { checkPermission } = usePermission()
  const { message } = App.useApp()
  const [roles, setRoles] = useState<Role[]>([])
  const [allMenus, setAllMenus] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  // 编辑弹窗内的菜单权限状态
  const [checkedMenuIds, setCheckedMenuIds] = useState<number[]>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [editActiveTab, setEditActiveTab] = useState('info')

  // 角色编辑弹窗状态
  const [roleModalVisible, setRoleModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleForm] = Form.useForm()
  const [viewingRole, setViewingRole] = useState<Role | null>(null)

  // 权限对照表弹窗状态
  const [permMatrixModalVisible, setPermMatrixModalVisible] = useState(false)

  // 敏感数据权限配置弹窗状态（联系方式 / 项目金额 两个标签页，一次保存）
  const [sensitiveModalVisible, setSensitiveModalVisible] = useState(false)
  const [contactInfoRoleIds, setContactInfoRoleIds] = useState<number[]>([])
  const [projectAmountRoleIds, setProjectAmountRoleIds] = useState<number[]>([])
  const [sensitiveLoading, setSensitiveLoading] = useState(false)
  const [sensitiveSaving, setSensitiveSaving] = useState(false)
  const [sensitiveTab, setSensitiveTab] = useState('contact')

  const roleColors: Record<string, string> = {
    ADMIN: 'red', PROJECT_DIRECTOR: 'purple', PROJECT_MANAGER: 'blue',
    USER: 'green', VIEWER: 'default'
  }

  // 数据范围选项（本系统不使用部门，仅保留三种范围）
  const dataScopeOptions = [
    { value: 'ALL', label: '全部数据' },
    { value: 'TEAM', label: '团队成员数据' },
    { value: 'SELF', label: '仅本人数据' },
  ]
  const dataScopeLabel: Record<string, string> = {
    ALL: '全部数据', TEAM: '团队成员数据', SELF: '仅本人数据'
  }

  const fetchRoles = async () => {
    setLoading(true)
    try {
      const response = await api.get('/roles') as any
      setRoles(response)
    } catch (error: any) {
      message.error(error?.error || '获取角色列表失败')
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

  // 加载角色的菜单权限数据
  const loadRoleMenus = async (role: Role) => {
    setMenuLoading(true)
    try {
      const response: any = await getRoleMenus(role.id)
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
      message.error(error?.error || '获取角色菜单失败')
    } finally {
      setMenuLoading(false)
    }
  }

  // 保存菜单分配
  const handleSaveMenus = async () => {
    if (!editingRole) return
    try {
      await assignRoleMenus(editingRole.id, checkedMenuIds)
      message.success('菜单分配成功')
      fetchRoles()
      setRoleModalVisible(false)
    } catch (error: any) {
      message.error(error?.error || '保存失败')
    }
  }

  // 将菜单列表转换为Tree数据（包含 BUTTON 类型）
  const buildTreeData = (menus: MenuItem[]): DataNode[] => {
    return menus
      .sort((a, b) => a.order - b.order)
      .map(menu => ({
        key: menu.id,
        title: (
          <span style={{ color: menu.menuType === 'BUTTON' ? '#888' : undefined, fontSize: menu.menuType === 'BUTTON' ? 12 : undefined }}>
            {menu.menuType === 'BUTTON' && '🔘 '}
            {menu.label}
            {menu.perm && <span style={{ color: '#999', fontSize: 11, marginLeft: 8 }}>({menu.perm})</span>}
          </span>
        ),
        children: menu.children?.length ? buildTreeData(menu.children) : undefined
      }))
  }

  // 从扁平列表构建完整的树形结构（支持任意层级）
  const buildMenuTree = (items: MenuItem[]): MenuItem[] => {
    const map = new Map<number, MenuItem & { children: MenuItem[] }>()
    const roots: MenuItem[] = []
    items.forEach(item => map.set(item.id, { ...item, children: [] }))
    items.forEach(item => {
      const node = map.get(item.id)!
      if (item.parentId == null) {
        roots.push(node)
      } else {
        const parent = map.get(item.parentId)
        if (parent) parent.children.push(node)
      }
    })
    // 排序
    const sortTree = (nodes: MenuItem[]): MenuItem[] =>
      nodes.sort((a, b) => a.order - b.order).map(n => ({ ...n, children: sortTree((n as any).children || []) }))
    return sortTree(roots)
  }

  const menusWithChildren: MenuItem[] = buildMenuTree(allMenus)

  // ===== 角色 CRUD =====
  const handleCreateRole = () => {
    setEditingRole(null)
    roleForm.resetFields()
    setRoleModalVisible(true)
  }

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    roleForm.setFieldsValue(role)
    setEditActiveTab('info')
    setRoleModalVisible(true)
    loadRoleMenus(role)
  }

  const handleRoleSubmit = async () => {
    try {
      const values = await roleForm.validateFields()
      const data = { ...values }
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

  // ===== 敏感数据权限配置（联系方式 / 项目金额） =====
  const handleOpenSensitiveModal = async () => {
    setSensitiveModalVisible(true)
    setSensitiveLoading(true)
    try {
      const [contactRes, amountRes]: any[] = await Promise.all([
        api.get('/settings/contact-info-permission'),
        api.get('/settings/project-amount-permission'),
      ])
      setContactInfoRoleIds(contactRes.roleIds || [])
      setProjectAmountRoleIds(amountRes.roleIds || [])
    } catch (error: any) {
      message.error(error?.error || '获取配置失败')
      setContactInfoRoleIds([])
      setProjectAmountRoleIds([])
    } finally {
      setSensitiveLoading(false)
    }
  }

  const handleSaveSensitiveConfig = async () => {
    setSensitiveSaving(true)
    try {
      await api.put('/settings/contact-info-permission', { roleIds: contactInfoRoleIds })
      await api.put('/settings/project-amount-permission', { roleIds: projectAmountRoleIds })
      message.success('配置保存成功')
      setSensitiveModalVisible(false)
    } catch (error: any) {
      message.error(error?.error || '保存失败')
    } finally {
      setSensitiveSaving(false)
    }
  }

  // 角色勾选列表（敏感数据权限弹窗两个标签页共用）
  const renderRoleCheckList = (selectedIds: number[], onChange: (ids: number[]) => void) => (
    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
      {roles.map(role => (
        <div
          key={role.id}
          style={{
            padding: '8px 12px',
            marginBottom: 8,
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: selectedIds.includes(role.id) ? '#f0f5ff' : '#fff'
          }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>{role.displayName}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{role.description}</div>
          </div>
          <Checkbox
            checked={selectedIds.includes(role.id)}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...selectedIds, role.id])
              } else {
                onChange(selectedIds.filter(id => id !== role.id))
              }
            }}
          />
        </div>
      ))}
    </div>
  )

  const sortedRoles = [...roles].sort((a, b) => a.id - b.id)
  const permGroups = buildPermGroups(menusWithChildren)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>角色管理</h2>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Space>
          <Button icon={<BarChartOutlined />} onClick={() => setPermMatrixModalVisible(true)}>权限对照表</Button>
          <Button icon={<SettingOutlined />} onClick={handleOpenSensitiveModal}>敏感数据权限</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateRole} disabled={!checkPermission('system:role:add')}>新建角色</Button>
        </Space>
      </div>
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={sortedRoles}
          rowKey="id"
          loading={loading}
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
              render: (_: any, record: Role) => dataScopeLabel[record.dataScope || 'SELF'] || record.dataScope || '-'
            },
            {
              title: '权限数', key: 'count', width: 70, align: 'center' as const,
              render: (_: any, record: Role) => (
                <span style={{ fontWeight: 'bold', color: '#1890ff' }}>{record.permissions?.length || 0}</span>
              )
            },
            {
              title: '操作', key: 'action', width: 220, fixed: 'right' as const,
              render: (_: any, record: Role) => (
                <Space size={0}>
                  <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewRole(record)}>查看</Button>
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRole(record)} disabled={!checkPermission('system:role:edit')}>编辑</Button>
                  <Popconfirm title="确定要删除吗?" onConfirm={() => handleDeleteRole(record)} disabled={!checkPermission('system:role:delete')}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      {/* 新建/编辑角色弹窗 */}
      <Modal
        title={editingRole ? `编辑角色 - ${editingRole.displayName}` : '新建角色'}
        open={roleModalVisible}
        onOk={() => {
          if (editActiveTab === 'info') {
            handleRoleSubmit()
          } else {
            handleSaveMenus()
          }
        }}
        onCancel={() => setRoleModalVisible(false)}
        okText={editActiveTab === 'info' ? '保存' : '保存菜单权限'}
        width={650}
        style={{ top: 20 }}
      >
        {editingRole ? (
          <Tabs activeKey={editActiveTab} onChange={setEditActiveTab} items={[
            {
              key: 'info',
              label: '基本信息',
              children: (
                <Form form={roleForm} layout="vertical">
                  <Form.Item name="displayName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
                    <Input placeholder="如 销售经理、技术主管" />
                  </Form.Item>
                  <Form.Item name="description" label="角色说明" rules={[{ required: true, message: '请输入角色说明' }]}>
                    <Input.TextArea rows={2} placeholder="描述该角色的职责和权限范围" />
                  </Form.Item>
                  <Form.Item label="角色标识">
                    <Input value={editingRole.name} disabled />
                  </Form.Item>
                  <Form.Item
                    name="dataScope"
                    label="数据范围"
                    initialValue="SELF"
                    extra="团队成员数据 = 自己名下的 + 所在项目团队的数据；全部数据 = 可见系统内所有数据。管理员角色固定拥有全部数据。"
                  >
                    <Select
                      options={dataScopeOptions}
                      disabled={editingRole.name === 'ADMIN'}
                    />
                  </Form.Item>
                </Form>
              )
            },
            {
              key: 'menus',
              label: '菜单权限',
              children: (
                <div>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#666', fontSize: 13 }}>
                      勾选该角色可以看到的菜单页面。取消勾选后，该角色的用户将无法看到对应菜单。
                    </span>
                    <Space size="small">
                      <Button size="small" type="link" onClick={() => {
                        const extractAllIds = (menus: MenuItem[]): number[] => {
                          const ids: number[] = []
                          menus.forEach(m => {
                            ids.push(m.id)
                            if (m.children?.length) ids.push(...extractAllIds(m.children))
                          })
                          return ids
                        }
                        setCheckedMenuIds(extractAllIds(menusWithChildren))
                      }}>全选</Button>
                      <Button size="small" type="link" danger onClick={() => setCheckedMenuIds([])}>清空</Button>
                    </Space>
                  </div>
                  {menuLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>加载中...</div>
                  ) : allMenus.length > 0 ? (
                    <Tree
                      checkable
                      checkStrictly
                      defaultExpandAll
                      checkedKeys={{ checked: checkedMenuIds, halfChecked: [] }}
                      onCheck={(checked: any) => {
                        const ids = Array.isArray(checked) ? checked : checked.checked
                        setCheckedMenuIds(ids)
                      }}
                      treeData={buildTreeData(menusWithChildren)}
                      style={{ maxHeight: 400, overflow: 'auto' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无菜单数据</div>
                  )}
                </div>
              )
            }
          ]} />
        ) : (
          <Form form={roleForm} layout="vertical">
            <Form.Item name="displayName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
              <Input placeholder="如 销售经理、技术主管" />
            </Form.Item>
            <Form.Item name="description" label="角色说明" rules={[{ required: true, message: '请输入角色说明' }]}>
              <Input.TextArea rows={2} placeholder="描述该角色的职责和权限范围" />
            </Form.Item>
            <Form.Item
              name="dataScope"
              label="数据范围"
              initialValue="SELF"
              extra="团队成员数据 = 自己名下的 + 所在项目团队的数据；全部数据 = 可见系统内所有数据。"
            >
              <Select options={dataScopeOptions} />
            </Form.Item>
          </Form>
        )}
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
            <Descriptions.Item label="数据范围">{dataScopeLabel[viewingRole.dataScope || 'SELF'] || viewingRole.dataScope || '-'}</Descriptions.Item>
            <Descriptions.Item label="权限数">{viewingRole.permissions?.length || 0}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 敏感数据权限配置弹窗（联系方式 / 项目金额 合并） */}
      <Modal
        title="敏感数据权限配置"
        open={sensitiveModalVisible}
        onOk={handleSaveSensitiveConfig}
        onCancel={() => setSensitiveModalVisible(false)}
        confirmLoading={sensitiveSaving}
        width={560}
      >
        <Spin spinning={sensitiveLoading}>
        <Tabs
          activeKey={sensitiveTab}
          onChange={setSensitiveTab}
          items={[
            {
              key: 'contact',
              label: '📞 联系方式',
              children: (
                <div>
                  <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
                    勾选可以查看客户完整联系方式（电话、邮箱、微信）的角色
                    <br />
                    <span style={{ fontSize: 12, color: '#999' }}>未选中的角色只能看到脱敏后的信息；管理员始终可见，无需勾选</span>
                  </div>
                  {renderRoleCheckList(contactInfoRoleIds, setContactInfoRoleIds)}
                </div>
              ),
            },
            {
              key: 'amount',
              label: '💰 项目金额',
              children: (
                <div>
                  <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
                    勾选可以查看项目完整金额信息的角色
                    <br />
                    <span style={{ fontSize: 12, color: '#999' }}>未选中的角色将看不到项目金额</span>
                  </div>
                  {renderRoleCheckList(projectAmountRoleIds, setProjectAmountRoleIds)}
                </div>
              ),
            },
          ]}
        />
        </Spin>
        <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
          两个标签页的配置会在点击"确定"时一起保存
        </div>
      </Modal>

      {/* 权限对照表弹窗 */}
      <Modal
        title="权限对照表"
        open={permMatrixModalVisible}
        onCancel={() => setPermMatrixModalVisible(false)}
        footer={null}
        width={1000}
      >
        <div style={{ padding: '16px 0' }}>
          <PermissionMatrix roles={sortedRoles} permGroups={permGroups} />
        </div>
      </Modal>
    </div>
  )
}

export default RoleManagement
