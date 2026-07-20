import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Tabs, Table, Button, Space, Statistic, Row, Col, Modal, Form, Input, Select, message, Dropdown, Checkbox } from 'antd'
import { ArrowLeftOutlined, EditOutlined, StarOutlined, PlusOutlined, MoreOutlined, DeleteOutlined } from '@ant-design/icons'
import { getCustomerDetail, updateCustomer, getCustomerContacts, createCustomerContact, updateCustomerContact, deleteCustomerContact, setPrimaryContact } from '../services/api'
import dayjs from 'dayjs'

function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
        const data = await getCustomerDetail(parseInt(id!))
        setCustomer(data)
      } catch (error) {
        console.error('获取客户详情失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  const fetchContacts = async () => {
    try {
      const data = await getCustomerContacts(parseInt(id!))
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
        await createCustomerContact(parseInt(id!), values)
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

  if (loading || !customer) {
    return <div>加载中...</div>
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
      render: (_: any, record: any) => (
        <Dropdown
          menu={{
            items: [
              ...(!record.isPrimary ? [{ key: 'primary', label: '设为主要联系人' }] : []),
              { key: 'edit', label: '编辑' },
              { key: 'delete', label: '删除', danger: true }
            ],
            onClick: ({ key }) => {
              if (key === 'primary') handleSetPrimary(record.id)
              else if (key === 'edit') handleEditContact(record)
              else if (key === 'delete') handleDeleteContact(record.id)
            }
          }}
        >
          <Button type="link" icon={<MoreOutlined />} />
        </Dropdown>
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
        <Row justify="space-between" align="middle">
          <Col>
            <h2 style={{ margin: 0 }}>{customer.name}</h2>
            <p style={{ margin: '8px 0 0', color: '#666' }}>
              {customer.companyName || '暂无公司'}
            </p>
          </Col>
          <Col>
            <Space>
              <Tag color={status.color} style={{ fontSize: 14, padding: '4px 12px' }}>
                {status.text}
              </Tag>
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

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="总收入"
              value={totalIncome}
              precision={2}
              valueStyle={{ color: '#52c41a' }}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="总支出"
              value={totalExpense}
              precision={2}
              valueStyle={{ color: '#f5222d' }}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="合同总额"
              value={totalContractAmount}
              precision={2}
              valueStyle={{ color: '#1890ff' }}
              suffix="元"
            />
          </Card>
        </Col>
      </Row>

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
