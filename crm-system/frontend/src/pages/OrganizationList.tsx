import { useEffect, useState, useMemo } from 'react'
import {
  Card, Tree, Button, Modal, Form, Input, Select, message, Space,
  Tag, Table, Descriptions, Empty, Popconfirm, Row, Col, Dropdown
} from 'antd'
import type { MenuProps } from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined,
  ExpandAltOutlined, ShrinkOutlined, UserOutlined, HomeOutlined,
  MoreOutlined
} from '@ant-design/icons'
import {
  getOrganizationTree, getOrganizationContacts,
  createOrganization, updateOrganization, deleteOrganization,
  createOrganizationContact, updateOrganizationContact, deleteOrganizationContact
} from '../services/api'

// ───────────────────────── Types ─────────────────────────

interface Organization {
  id: number
  name: string
  type: 'GROUP' | 'COMPANY' | 'BRANCH'
  parentId: number | null
  address?: string
  phone?: string
  email?: string
  taxNo?: string
  website?: string
  legalPerson?: string
  children?: Organization[]
  createdAt?: string
  updatedAt?: string
}

interface Contact {
  id: number
  organizationId: number
  name: string
  title?: string
  phone?: string
  email?: string
  isPrimary?: boolean
  notes?: string
}

interface TreeNodeData {
  key: number
  title: string
  type?: string
  children?: TreeNodeData[]
  [k: string]: any
}

// ───────────────────────── Helpers ─────────────────────────

/** 将组织树数据转换为 Tree 组件所需的格式 */
const convertToTreeData = (orgs: Organization[]): TreeNodeData[] => {
  return orgs.map((org) => ({
    key: org.id,
    title: org.name,
    type: org.type,
    children: org.children ? convertToTreeData(org.children) : undefined,
  }))
}

/** 递归查找组织节点 */
const findOrgById = (orgs: Organization[], id: number): Organization | null => {
  for (const org of orgs) {
    if (org.id === id) return org
    if (org.children) {
      const found = findOrgById(org.children, id)
      if (found) return found
    }
  }
  return null
}

/** 递归收集所有 key */
const collectAllKeys = (orgs: Organization[]): number[] => {
  const keys: number[] = []
  const walk = (list: Organization[]) => {
    for (const org of list) {
      keys.push(org.id)
      if (org.children) walk(org.children)
    }
  }
  walk(orgs)
  return keys
}

/** 根据组织类型返回图标 */
const typeIcon = (type?: string) => {
  switch (type) {
    case 'GROUP': return '🏢'
    case 'COMPANY': return '🏬'
    case 'BRANCH': return '🏪'
    default: return '🏢'
  }
}

/** 根据组织类型返回中文标签 */
const typeLabel = (type?: string) => {
  switch (type) {
    case 'GROUP': return '集团'
    case 'COMPANY': return '公司'
    case 'BRANCH': return '分支'
    default: return type || '-'
  }
}

/** 根据组织类型返回 Tag 颜色 */
const typeColor = (type?: string) => {
  switch (type) {
    case 'GROUP': return 'purple'
    case 'COMPANY': return 'blue'
    case 'BRANCH': return 'green'
    default: return 'default'
  }
}

// ───────────────────────── Component ─────────────────────────

function OrganizationList() {
  const [treeData, setTreeData] = useState<Organization[]>([])
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])
  const [autoExpandParent, setAutoExpandParent] = useState(true)
  const [loading, setLoading] = useState(false)

  // 组织表单弹窗
  const [orgModalVisible, setOrgModalVisible] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [orgForm] = Form.useForm()

  // 联系人管理
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactModalVisible, setContactModalVisible] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [contactForm] = Form.useForm()

  // 新增时记录父节点 ID，null 表示顶级组织
  const [addingParentId, setAddingParentId] = useState<number | null>(null)

  // ───── 数据加载 ─────

  const fetchTree = async () => {
    setLoading(true)
    try {
      const data = (await getOrganizationTree()) as any
      setTreeData(data || [])
    } catch (error: any) {
      message.error(error?.error || '获取组织树失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchContacts = async (orgId: number) => {
    try {
      const data = (await getOrganizationContacts(orgId)) as any
      setContacts(data || [])
    } catch (error: any) {
      message.error(error?.error || '获取联系人列表失败')
    }
  }

  useEffect(() => {
    fetchTree()
  }, [])

  const treeNodes = useMemo(() => convertToTreeData(treeData), [treeData])

  // ───── 树操作 ─────

  const handleExpandAll = () => {
    setExpandedKeys(collectAllKeys(treeData))
    setAutoExpandParent(false)
  }

  const handleCollapseAll = () => {
    setExpandedKeys([])
    setAutoExpandParent(false)
  }

  const handleTreeSelect = (keys: React.Key[]) => {
    const id = keys[0] as number | undefined
    if (id === undefined) {
      setSelectedOrg(null)
      setContacts([])
      return
    }
    const org = findOrgById(treeData, id)
    setSelectedOrg(org)
    if (org) fetchContacts(org.id)
  }

  // ───── 组织操作 ─────

  /** 新增根组织 或 在选中节点下新增子组织 */
  const handleAddOrg = (parentId?: number) => {
    setEditingOrg(null)
    orgForm.resetFields()
    setAddingParentId(parentId ?? null)
    orgForm.setFieldsValue({ type: parentId ? 'BRANCH' : 'GROUP' })
    setOrgModalVisible(true)
  }

  /** 编辑组织 */
  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org)
    setAddingParentId(org.parentId ?? null)
    orgForm.setFieldsValue({
      name: org.name,
      type: org.type,
      address: org.address || '',
      phone: org.phone || '',
      email: org.email || '',
      taxNo: org.taxNo || '',
      website: org.website || '',
      legalPerson: org.legalPerson || '',
    })
    setOrgModalVisible(true)
  }

  /** 删除组织 */
  const handleDeleteOrg = async (id: number) => {
    try {
      await deleteOrganization(id)
      message.success('组织删除成功')
      if (selectedOrg?.id === id) {
        setSelectedOrg(null)
        setContacts([])
      }
      fetchTree()
    } catch (error: any) {
      message.error(error?.error || '删除组织失败')
    }
  }

  /** 提交组织表单 */
  const handleOrgSubmit = async () => {
    try {
      const values = await orgForm.validateFields()
      const payload = { ...values, parentId: addingParentId }

      if (editingOrg) {
        await updateOrganization(editingOrg.id, payload)
        message.success('组织更新成功')
      } else {
        await createOrganization(payload)
        message.success('组织创建成功')
      }
      setOrgModalVisible(false)
      fetchTree()
      // 如果当前选中的组织被更新，刷新详情
      if (editingOrg && selectedOrg?.id === editingOrg.id) {
        const updated = findOrgById(treeData, editingOrg.id)
        if (updated) setSelectedOrg(updated)
      }
    } catch (error: any) {
      if (error?.error) {
        message.error(error.error)
      } else if (error?.errorFields) {
        // 表单校验失败，不提示
      } else {
        message.error('操作失败')
      }
    }
  }

  // ───── 联系人操作 ─────

  const handleAddContact = () => {
    setEditingContact(null)
    contactForm.resetFields()
    setContactModalVisible(true)
  }

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact)
    contactForm.setFieldsValue({
      name: contact.name,
      title: contact.title || '',
      phone: contact.phone || '',
      email: contact.email || '',
      isPrimary: contact.isPrimary || false,
      notes: contact.notes || '',
    })
    setContactModalVisible(true)
  }

  const handleContactSubmit = async () => {
    if (!selectedOrg) return
    try {
      const values = await contactForm.validateFields()
      if (editingContact) {
        await updateOrganizationContact(selectedOrg.id, editingContact.id, values)
        message.success('联系人更新成功')
      } else {
        await createOrganizationContact(selectedOrg.id, values)
        message.success('联系人添加成功')
      }
      setContactModalVisible(false)
      fetchContacts(selectedOrg.id)
    } catch (error: any) {
      if (error?.error) {
        message.error(error.error)
      } else if (error?.errorFields) {
        // 表单校验失败
      } else {
        message.error('操作失败')
      }
    }
  }

  const handleDeleteContact = async (contactId: number) => {
    if (!selectedOrg) return
    try {
      await deleteOrganizationContact(selectedOrg.id, contactId)
      message.success('联系人删除成功')
      fetchContacts(selectedOrg.id)
    } catch (error: any) {
      message.error(error?.error || '删除联系人失败')
    }
  }

  // ───── 树节点右键菜单 ─────

  const getNodeMenuItems = (org: Organization): MenuProps['items'] => [
    {
      key: 'addChild',
      label: '新增子组织',
      icon: <PlusOutlined />,
      onClick: () => handleAddOrg(org.id),
    },
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => handleEditOrg(org),
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认删除',
          content: `确定要删除"${org.name}"吗？其下级组织也会被一并删除。`,
          okText: '确定',
          cancelText: '取消',
          onOk: () => handleDeleteOrg(org.id),
        })
      },
    },
  ]

  // ───── 联系人表格列 ─────

  const contactColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Contact) => (
        <span>
          {record.isPrimary && (
            <span style={{ color: '#faad14', marginRight: 4, fontSize: 12 }}>★</span>
          )}
          {name}
        </span>
      ),
    },
    { title: '职务', dataIndex: 'title', key: 'title', render: (v: string) => v || '-' },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    {
      title: '主要联系人',
      dataIndex: 'isPrimary',
      key: 'isPrimary',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="gold">主要</Tag> : <Tag>普通</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: Contact) => (
        <Space size={0}>
          <Button
            type="link" size="small" icon={<EditOutlined />}
            onClick={() => handleEditContact(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该联系人吗?"
            onConfirm={() => handleDeleteContact(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // ───── Render ─────

  return (
    <Row gutter={16} wrap={false}>
      {/* ───── 左侧：组织树 ───── */}
      <Col flex="0 0 320px" style={{ minWidth: 0 }}>
        <Card
          title={
            <span>
              <BankOutlined style={{ marginRight: 8 }} />
              组织树
            </span>
          }
          extra={
            <Space size={4}>
              <Button size="small" icon={<ExpandAltOutlined />} onClick={handleExpandAll}>
                展开
              </Button>
              <Button size="small" icon={<ShrinkOutlined />} onClick={handleCollapseAll}>
                收起
              </Button>
            </Space>
          }
          styles={{ body: { padding: '12px 16px' } }}
          style={{ background: '#f8fafc', borderRight: '1px solid #e5e7eb', height: '100%' }}
        >
          {treeNodes.length > 0 ? (
            <Tree
              showLine
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              onExpand={(keys) => {
                setExpandedKeys(keys as number[])
                setAutoExpandParent(false)
              }}
              onSelect={handleTreeSelect}
              selectedKeys={selectedOrg ? [selectedOrg.id] : []}
              treeData={treeNodes}
              titleRender={(nodeData: any) => {
                if (!nodeData) return null
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span>
                      <span style={{ marginRight: 6 }}>{typeIcon(nodeData.type)}</span>
                      <span>{nodeData.title as string}</span>
                    </span>
                    <Dropdown
                      menu={{ items: getNodeMenuItems(nodeData as Organization) }}
                      trigger={['click']}
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        style={{ marginLeft: 8, cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreOutlined />
                      </span>
                    </Dropdown>
                  </div>
                )
              }}
              style={{ width: '100%' }}
            />
          ) : (
            <Empty
              description={loading ? '加载中...' : '暂无组织数据'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: 24 }}
            />
          )}

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => handleAddOrg()}
            block
            style={{ marginTop: 12 }}
          >
            新增根组织
          </Button>
        </Card>
      </Col>

      {/* ───── 右侧：组织详情 + 联系人 ───── */}
      <Col flex="1" style={{ minWidth: 0 }}>
        <Card
          title={selectedOrg ? `${typeIcon(selectedOrg.type)} ${selectedOrg.name}` : '组织详情'}
          extra={
            selectedOrg && (
              <Space>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => handleAddOrg(selectedOrg.id)}
                >
                  新增子组织
                </Button>
                <Button icon={<EditOutlined />} onClick={() => handleEditOrg(selectedOrg)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除"
                  description="确定要删除该组织吗？其下级组织也会被一并删除。"
                  onConfirm={() => handleDeleteOrg(selectedOrg.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            )
          }
          style={{ height: '100%' }}
          styles={{ body: { padding: 24 } }}
        >
          {selectedOrg ? (
            <>
              {/* ── 基本信息 ── */}
              <Descriptions bordered size="small" column={2} style={{ marginBottom: 24 }}>
                <Descriptions.Item label="名称">{selectedOrg.name}</Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Tag color={typeColor(selectedOrg.type)}>{typeLabel(selectedOrg.type)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="地址" span={2}>{selectedOrg.address || '-'}</Descriptions.Item>
                <Descriptions.Item label="电话">{selectedOrg.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{selectedOrg.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="税号">{selectedOrg.taxNo || '-'}</Descriptions.Item>
                <Descriptions.Item label="网站">
                  {selectedOrg.website ? (
                    <a href={selectedOrg.website} target="_blank" rel="noopener noreferrer">
                      {selectedOrg.website}
                    </a>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="法定代表人">{selectedOrg.legalPerson || '-'}</Descriptions.Item>
                <Descriptions.Item label="下级组织数">
                  {selectedOrg.children ? selectedOrg.children.length : 0}
                </Descriptions.Item>
              </Descriptions>

              {/* ── 联系人列表 ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  <UserOutlined style={{ marginRight: 6 }} />
                  联系人列表
                </div>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddContact}>
                  添加联系人
                </Button>
              </div>
              <Table
                columns={contactColumns}
                dataSource={contacts}
                rowKey="id"
                pagination={false}
                size="small"
                locale={{ emptyText: <Empty description="暂无联系人" /> }}
              />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>
              <HomeOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
              <div style={{ fontSize: 16 }}>请选择组织</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>在左侧组织树中选择一个节点查看详情</div>
            </div>
          )}
        </Card>
      </Col>

      {/* ───── 新增 / 编辑组织弹窗 ───── */}
      <Modal
        title={editingOrg ? '编辑组织' : '新增组织'}
        open={orgModalVisible}
        onOk={handleOrgSubmit}
        onCancel={() => setOrgModalVisible(false)}
        width={600}
        okText="确定"
        cancelText="取消"
      >
        <Form form={orgForm} layout="vertical">
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="name"
                label="组织名称"
                rules={[{ required: true, message: '请输入组织名称' }]}
              >
                <Input placeholder="请输入组织名称" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="type"
                label="组织类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select
                  options={[
                    { value: 'GROUP', label: '🏢 集团' },
                    { value: 'COMPANY', label: '🏬 公司' },
                    { value: 'BRANCH', label: '🏪 分支' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="地址">
            <Input placeholder="请输入地址" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input placeholder="请输入电话" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}>
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="taxNo" label="税号">
                <Input placeholder="请输入税号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="legalPerson" label="法定代表人">
                <Input placeholder="请输入法定代表人" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="website" label="网站">
            <Input placeholder="请输入网站地址" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ───── 新增 / 编辑联系人弹窗 ───── */}
      <Modal
        title={editingContact ? '编辑联系人' : '添加联系人'}
        open={contactModalVisible}
        onOk={handleContactSubmit}
        onCancel={() => setContactModalVisible(false)}
        width={500}
        okText="确定"
        cancelText="取消"
      >
        <Form form={contactForm} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入联系人姓名' }]}
          >
            <Input placeholder="请输入联系人姓名" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="title" label="职务">
                <Input placeholder="请输入职务" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input placeholder="请输入电话" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}>
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item name="isPrimary" label="主要联系人" valuePropName="checked">
            <Select
              options={[
                { value: true, label: '是' },
                { value: false, label: '否' },
              ]}
            />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  )
}

export default OrganizationList
