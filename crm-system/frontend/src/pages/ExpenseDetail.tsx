import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Space, Row, Col, Modal, Form, Input, Select, InputNumber, DatePicker, message } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { getExpenseDetail, updateExpense, getCustomers, getProjects } from '../services/api'
import dayjs from 'dayjs'

function ExpenseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [expense, setExpense] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // 编辑状态
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [customers, setCustomers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])

  const expenseCategories = [
    '办公用品', '差旅费', '招待费', '交通费', '通讯费', '培训费', '其他'
  ]

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await getExpenseDetail(parseInt(id!))
        setExpense(data)
      } catch (error) {
        console.error('获取费用报销详情失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  useEffect(() => {
    if (id) {
      fetchCustomers()
      fetchProjects()
    }
  }, [id])

  const fetchCustomers = async () => {
    try {
      const response: any = await getCustomers({ pageSize: 1000 })
      setCustomers(response.data || [])
    } catch (error) {
      console.error('获取客户列表失败:', error)
    }
  }

  const fetchProjects = async () => {
    try {
      const response: any = await getProjects({ pageSize: 1000 })
      setProjects(response.data || [])
    } catch (error) {
      console.error('获取项目列表失败:', error)
    }
  }

  const refreshDetail = async () => {
    try {
      const data = await getExpenseDetail(parseInt(id!))
      setExpense(data)
    } catch (error) {
      console.error('刷新详情失败:', error)
    }
  }

  const handleEdit = () => {
    form.setFieldsValue({
      ...expense,
      expenseDate: dayjs(expense.expenseDate)
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        expenseDate: values.expenseDate.toDate()
      }
      await updateExpense(parseInt(id!), data)
      message.success('报销记录更新成功')
      setModalVisible(false)
      refreshDetail()
    } catch (error) {
      message.error('更新失败')
    }
  }

  if (loading || !expense) {
    return <div>加载中...</div>
  }

  const statusConfig: Record<string, { text: string; color: string }> = {
    DRAFT: { text: '草稿', color: 'default' },
    SUBMITTED: { text: '待审批', color: 'orange' },
    APPROVED: { text: '已批准', color: 'blue' },
    REJECTED: { text: '已驳回', color: 'red' },
    PAID: { text: '已支付', color: 'green' }
  }

  const status = statusConfig[expense.status] || { text: expense.status, color: 'default' }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/expenses')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" wrap={false}>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{expense.title}</h3>
              <Tag color={status.color}>{status.text}</Tag>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>|</span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>金额: <strong style={{ color: '#dc2626' }}>{Number(expense.amount || 0).toFixed(2)}元</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>类别: <strong style={{ color: '#374151' }}>{expense.category || '-'}</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>费用日期: <strong style={{ color: '#2563eb' }}>{expense.expenseDate ? dayjs(expense.expenseDate).format('YYYY-MM-DD') : '-'}</strong></span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
              {expense.customer?.name || '暂无客户'} | {expense.project?.name || '暂无项目'}
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

      <Card title="基本信息">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="报销标题">{expense.title}</Descriptions.Item>
          <Descriptions.Item label="费用类别">
            <Tag>{expense.category}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="金额">{expense.amount}元</Descriptions.Item>
          <Descriptions.Item label="费用日期">
            {expense.expenseDate ? dayjs(expense.expenseDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="客户">{expense.customer?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="项目">{expense.project?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={status.color}>{status.text}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="审批人">{expense.approver?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="负责人">{expense.owner?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(expense.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>{expense.description || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 编辑 Modal */}
      <Modal
        title="编辑报销"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="title" label="报销标题" rules={[{ required: true, message: '请输入报销标题' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="projectId" label="关联项目" rules={[{ required: true, message: '请选择关联项目' }]}>
                <Select placeholder="请选择关联项目" showSearch optionFilterProp="children">
                  {projects.map(project => (
                    <Select.Option key={project.id} value={project.id}>
                      {project.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="费用类别" rules={[{ required: true, message: '请选择费用类别' }]}>
                <Select placeholder="请选择费用类别">
                  {expenseCategories.map(cat => (
                    <Select.Option key={cat} value={cat}>{cat}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber style={{ width: '100%' }} precision={2} addonAfter="元" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerId" label="客户">
                <Select placeholder="请选择客户（可选）" allowClear showSearch optionFilterProp="children">
                  {customers.map(customer => (
                    <Select.Option key={customer.id} value={customer.id}>
                      {customer.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expenseDate" label="费用日期" rules={[{ required: true, message: '请选择费用日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ExpenseDetail
