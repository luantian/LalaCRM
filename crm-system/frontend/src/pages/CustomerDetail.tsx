import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Tabs, Table, Button, Space, Row, Col, Modal, Form, Input, Select, message, Popconfirm, Checkbox, Spin, Result } from 'antd'
import { ArrowLeftOutlined, EditOutlined, StarOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { getCustomerDetail, updateCustomer, getCustomerContacts, createCustomerContact, updateCustomerContact, deleteCustomerContact, setPrimaryContact } from '../services/api'
import dayjs from 'dayjs'

function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 编辑状态
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()

  // 联系人状态
  const [contacts, setContacts] = useState<any[]>([])
  const [contactModalVisible, setContactModalVisible] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)
  const [contactForm] = Form.useForm()

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await getCustomerDetail(parseInt(id!)) as any
        setCustomer(data)
      } catch (error) {
        console.error('获取客户详情失败:', error)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  const fetchContacts = async () => {
    try {
      const data = await getCustomerContacts(parseInt(id!)) as any
      setContacts(data)
    } catch (error) {
      console.error('获取联系人失败:', error)
    }
  }

  const handleEdit = () => {
    form.setFieldsValue({
      name: customer.name,
      companyName: customer.companyName || '',
      status: customer.status || 'ACTIVE',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || ''
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await updateCustomer(parseInt(id!), values)
      message.success('客户信息更新成功')
      setModalVisible(false)
      // 刷新详情
      const data = await getCustomerDetail(parseInt(id!))
      setCustomer(data)
    } catch (error) {
      message.error('更新失败')
    }
  }

  const handleAddContact = () => {
    setEditingContact(null)
    contactForm.resetFields()
    setContactModalVisible(true)
  }

  const handleEditContact = (contact: any) => {
    setEditingContact(contact)
    contactForm.setFieldsValue({
      name: contact.name,
      title: contact.title || '',
      phone: contact.phone || '',
      email: contact.email || '',
      isPrimary: contact.isPrimary || false,
      notes: contact.notes || ''
    })
    setContactModalVisible(true)
  }

  const handleContactSubmit = async () => {
    try {
      const values = await contactForm.validateFields()
      if (editingContact) {
        await updateCustomerContact(editingContact.id, values)
        message.success('联系人更新成功')
      } else {
        await createCustomerContact(values)
        message.success('联系人创建成功')
      }
      setContactModalVisible(false)
      fetchContacts()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDeleteContact = async (contactId: number) => {
    try {
      await deleteCustomerContact(contactId)
      message.success('联系人删除成功')
      fetchContacts()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSetPrimary = async (contactId: number) => {
    try {
      await setPrimaryContact(contactId)
      message.success('已设为主要联系人')
      fetchContacts()
    } catch (error) {
      message.error('操作失败')
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" tip="加载中..." /></div>
  }
  if (error || !customer) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Result status="error" title="加载失败" subTitle="请返回重试" extra={<Button type="primary" onClick={() => navigate('/customers')}>返回列表</Button>} /></div>
  }

  const statusConfig: Record<string, { text: string; color: string }> = {
    ACTIVE: { text: '活跃', color: 'green' },
    INACTIVE: { text: '不活跃', color: 'default' },
    POTENTIAL: { text: '潜在', color: 'orange' }
  }

  const status = statusConfig[customer.status] || { text: customer.status, color: 'default' }

  const salesColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'IN' ? 'green' : 'red'}>
          {type === 'IN' ? '收入' : '支出'}
        </Tag>
      )
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: any) => (
        <span style={{ color: record.type === 'IN' ? '#52c41a' : '#f5222d' }}>
          {record.type === 'IN' ? '+' : '-'}{amount}元
        </span>
      )
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    }
  ]

  const projectColumns = [
    { title: '项目名称', dataIndex: 'name', key: 'name' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          PENDING: { text: '待开始', color: 'default' },
          IN_PROGRESS: { text: '进行中', color: 'processing' },
          COMPLETED: { text: '已完成', color: 'success' },
          CANCELLED: { text: '已取消', color: 'error' }
        }
        const s = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    { title: '预算', dataIndex: 'budget', key: 'budget', render: (v: number) => v ? `${v}元` : '-' },
    {
      title: '开始日期',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    }
  ]

  const contractColumns = [
    { title: '合同名称', dataIndex: 'name', key: 'name' },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `${v}元` },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          DRAFT: { text: '草稿', color: 'default' },
          PENDING: { text: '待审批', color: 'warning' },
          ACTIVE: { text: '生效中', color: 'success' },
          EXPIRED: { text: '已过期', color: 'error' },
          CANCELLED: { text: '已取消', color: 'error' }
        }
        const s = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    {
      title: '签订日期',
      dataIndex: 'signDate',
      key: 'signDate',
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    }
  ]

  const contactColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <span>
          {record.isPrimary && <StarOutlined style={{ color: '#faad14', marginRight: 4 }} />}
          {name}
        </span>
      )
    },
    { title: '职务', dataIndex: 'title', key: 'title' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditContact(record)}>编辑</Button>
          {!record.isPrimary && (
            <Button type="link" size="small" icon={<StarOutlined />} onClick={() => handleSetPrimary(record.id)}>设为主要</Button>
          )}
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDeleteContact(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const tabItems = [
    {
      key: 'sales',
      label: `销售记录 (${customer.sales?.length || 0})`,
      children: (
        <Table
          columns={salesColumns}
          dataSource={customer.sales}
          rowKey="id"
          pagination={false}
        />
      )
    },
    {
      key: 'projects',
      label: `项目 (${customer.projects?.length || 0})`,
      children: (
        <Table
          columns={projectColumns}
          dataSource={customer.projects}
          rowKey="id"
          pagination={false}
        />
      )
    },
    {
      key: 'contracts',
      label: `合同 (${customer.contracts?.length || 0})`,
      children: (
        <Table
          columns={contractColumns}
          dataSource={customer.contracts}
          rowKey="id"
          pagination={false}
        />
      )
    },
    {
      key: 'contacts',
      label: `联系人管理 (${contacts.length})`,
      children: (
        <div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddContact}
            style={{ marginBottom: 16 }}
          >
            添加联系人
          </Button>
          <Table
            columns={contactColumns}
            dataSource={contacts}
            rowKey="id"
            pagination={false}
          />
        </div>
      )
    }
  ]

  // 计算统计
  const totalIncome = customer.sales?.filter((s: any) => s.type === 'IN')
    .reduce((sum: number, s: any) => sum + Number(s.amount), 0) || 0
  const totalExpense = customer.sales?.filter((s: any) => s.type === 'OUT')
    .reduce((sum: number, s: any) => sum + Number(s.amount), 0) || 0
  const totalContractAmount = customer.contracts?.reduce((sum: number, c: any) => sum + Number(c.amount), 0) || 0

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/customers')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" wrap={false}>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{customer.name}</h3>
              <Tag color={status.color}>{status.text}</Tag>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>|</span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>收入: <strong style={{ color: '#059669' }}>{totalIncome.toFixed(2)}元</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>支出: <strong style={{ color: '#dc2626' }}>{totalExpense.toFixed(2)}元</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>合同: <strong style={{ color: '#2563eb' }}>{totalContractAmount.toFixed(2)}元</strong></span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
              {customer.companyName || '暂无公司'}
            </div>
          </Col>
          <Col flex="none">
            <Space>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={handleEdit}
              >
                编辑
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="客户名称">{customer.name}</Descriptions.Item>
          <Descriptions.Item label="公司名称">{customer.companyName || '-'}</Descriptions.Item>
          <Descriptions.Item label="电话">{customer.phone || '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{customer.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>{customer.address || '-'}</Descriptions.Item>
          <Descriptions.Item label="负责人">{customer.owner?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(customer.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{customer.notes || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Tabs
          items={tabItems}
          onChange={(key) => {
            if (key === 'contacts') {
              fetchContacts()
            }
          }}
        />
      </Card>

      {/* 编辑 Modal */}
      <Modal
        title="编辑客户"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="companyName" label="公司名称">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="客户状态">
            <Select>
              <Select.Option value="ACTIVE">活跃</Select.Option>
              <Select.Option value="INACTIVE">不活跃</Select.Option>
              <Select.Option value="POTENTIAL">潜在</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 联系人 Modal */}
      <Modal
        title={editingContact ? '编辑联系人' : '添加联系人'}
        open={contactModalVisible}
        onOk={handleContactSubmit}
        onCancel={() => setContactModalVisible(false)}
      >
        <Form form={contactForm} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="职务">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="isPrimary" label="主要联系人" valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CustomerDetail
