import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Space, Row, Col, Modal, Form, Input, Select, InputNumber, DatePicker, Table, Divider, message } from 'antd'
import { ArrowLeftOutlined, EditOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { getExpenseDetail, updateExpense, getOrganizations, getProjects, getBusinessTrips } from '../services/api'
import dayjs from 'dayjs'
import { OrgTreeSelect } from '../components/OrgTreeSelect'
import { OrgContactSelector } from '../components/OrgContactSelector'

function ExpenseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [expense, setExpense] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // 编辑状态
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [organizations, setOrganizations] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])

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
      fetchOrganizations()
      fetchProjects()
      fetchTrips()
    }
  }, [id])

  const fetchOrganizations = async () => {
    try {
      const response: any = await getOrganizations({ pageSize: 1000 })
      setOrganizations(response.data || [])
    } catch (error) {
      console.error('获取组织列表失败:', error)
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

  const fetchTrips = async () => {
    try {
      const response: any = await getBusinessTrips({ pageSize: 1000 })
      setTrips(response.data || [])
    } catch (error) {
      console.error('获取出差列表失败:', error)
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
      title: expense.title,
      projectId: expense.projectId || undefined,
      tripId: expense.tripId || undefined,
      contactId: expense.contactId || undefined,
      organizationId: expense.organizationId || undefined,
      description: expense.description,
      items: (expense.items || []).map((item: any) => ({
        ...item,
        expenseDate: item.expenseDate ? dayjs(item.expenseDate) : undefined
      }))
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        items: values.items.map((item: any) => ({
          ...item,
          expenseDate: item.expenseDate ? item.expenseDate.toDate() : new Date()
        }))
      }
      await updateExpense(parseInt(id!), data)
      message.success('报销记录更新成功')
      setModalVisible(false)
      refreshDetail()
    } catch (error: any) {
      message.error(error?.error || '更新失败')
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
              <span style={{ color: '#6b7280', fontSize: 13 }}>总金额: <strong style={{ color: '#dc2626' }}>{Number(expense.totalAmount || 0).toFixed(2)}元</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>明细数: <strong style={{ color: '#374151' }}>{expense.items?.length || 0}条</strong></span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
              {(() => { const org = expense.organization?.name || '暂无客户'; const contact = expense.contact ? `${expense.contact.name}${expense.contact.title ? ` (${expense.contact.title})` : ''}` : ''; return contact ? `${org} - ${contact}` : org })()} | {expense.project?.name || '暂无项目'}
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
          <Descriptions.Item label="总金额">{expense.totalAmount}元</Descriptions.Item>
          <Descriptions.Item label="客户">{(() => { const org = expense.organization?.name || '-'; const contact = expense.contact ? `${expense.contact.name}${expense.contact.title ? ` (${expense.contact.title})` : ''}` : ''; return contact ? `${org} - ${contact}` : org })()}</Descriptions.Item>
          <Descriptions.Item label="项目">{expense.project?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联出差" span={2}>
            {expense.trip ? (
              <Button
                type="link"
                style={{ padding: 0, height: 'auto' }}
                onClick={() => navigate(`/business-trips/${expense.trip.id}`)}
              >
                {expense.trip.title} - {expense.trip.destination} ({dayjs(expense.trip.startDate).format('YYYY-MM-DD')} ~ {dayjs(expense.trip.endDate).format('YYYY-MM-DD')})
              </Button>
            ) : '-'}
          </Descriptions.Item>
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

      <Card title="费用明细" style={{ marginTop: 16 }}>
        <Table
          dataSource={expense.items || []}
          rowKey="id"
          pagination={false}
          summary={() => {
            const total = (expense.items || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right">
                  <strong>合计：</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">
                  <strong style={{ color: '#dc2626' }}>{total.toFixed(2)}元</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }}
          columns={[
            {
              title: '费用类别',
              dataIndex: 'category',
              key: 'category',
              render: (category: string) => <Tag>{category}</Tag>
            },
            {
              title: '金额',
              dataIndex: 'amount',
              key: 'amount',
              render: (amount: number) => `${amount}元`
            },
            {
              title: '费用日期',
              dataIndex: 'expenseDate',
              key: 'expenseDate',
              render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
            },
            {
              title: '描述',
              dataIndex: 'description',
              key: 'description',
              render: (desc: string) => desc || '-'
            }
          ]}
        />
      </Card>

      {/* 编辑 Modal */}
      <Modal
        title="编辑报销"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
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
            <Col span={24}>
              <Form.Item name="tripId" label="关联出差">
                <Select placeholder="请选择关联出差（可选）" allowClear showSearch optionFilterProp="children">
                  {trips.map(trip => (
                    <Select.Option key={trip.id} value={trip.id}>
                      {trip.title} - {trip.destination} ({dayjs(trip.startDate).format('YYYY-MM-DD')} ~ {dayjs(trip.endDate).format('YYYY-MM-DD')})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactId" label="客户">
                <OrgContactSelector
                  placeholder="请选择客户联系人"
                  onContactSelect={(contactId, orgId) => {
                    form.setFieldValue('contactId', contactId)
                    form.setFieldValue('organizationId', orgId)
                  }}
                />
              </Form.Item>
              <Form.Item name="organizationId" hidden><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>费用明细</Divider>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'category']}
                      rules={[{ required: true, message: '请选择类别' }]}
                    >
                      <Select placeholder="费用类别" style={{ width: 120 }}>
                        {expenseCategories.map(cat => (
                          <Select.Option key={cat} value={cat}>{cat}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'amount']}
                      rules={[{ required: true, message: '请输入金额' }]}
                    >
                      <InputNumber placeholder="金额" precision={2} addonAfter="元" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'expenseDate']}
                      rules={[{ required: true, message: '请选择日期' }]}
                    >
                      <DatePicker placeholder="费用日期" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'description']}
                    >
                      <Input placeholder="描述" style={{ width: 150 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    添加费用明细
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}

export default ExpenseDetail
