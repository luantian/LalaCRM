import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Space, Statistic, Row, Col, Modal, Form, Input, Select, InputNumber, DatePicker, message, Spin, Result, Table } from 'antd'
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { getBusinessTripDetail, updateBusinessTrip, getOrganizations, getProjects } from '../services/api'
import { OrgContactSelector } from '../components/OrgContactSelector'
import dayjs from 'dayjs'
import { OrgTreeSelect } from '../components/OrgTreeSelect'

const { RangePicker } = DatePicker

function BusinessTripDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 编辑状态
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [organizations, setOrganizations] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await getBusinessTripDetail(parseInt(id!))
        setTrip(data)
      } catch (error) {
        console.error('获取出差详情失败:', error)
        setError(true)
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

  const refreshTrip = async () => {
    try {
      const data = await getBusinessTripDetail(parseInt(id!))
      setTrip(data)
    } catch (error) {
      console.error('刷新出差详情失败:', error)
    }
  }

  const handleEdit = () => {
    form.setFieldsValue({
      ...trip,
      dateRange: trip.startDate && trip.endDate ? [dayjs(trip.startDate), dayjs(trip.endDate)] : []
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const [startDate, endDate] = values.dateRange
      const data = {
        ...values,
        startDate: startDate.toDate(),
        endDate: endDate.toDate(),
        days: endDate.diff(startDate, 'day') + 1
      }
      delete data.dateRange
      await updateBusinessTrip(parseInt(id!), data)
      message.success('出差记录更新成功')
      setModalVisible(false)
      refreshTrip()
    } catch (error: any) {
      message.error(error?.error || '更新失败')
    }
  }

  if (loading) {
    return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'60vh'}}><Spin size="large" tip="加载中..." /></div>
  }
  if (error || !trip) {
    return <div style={{textAlign:'center',padding:80}}><Result status="error" title="加载失败" subTitle="请返回重试" extra={<Button type="primary" onClick={() => navigate('/business-trips')}>返回列表</Button>} /></div>
  }

  const statusConfig: Record<string, { text: string; color: string }> = {
    DRAFT: { text: '草稿', color: 'default' },
    SUBMITTED: { text: '待审批', color: 'orange' },
    APPROVED: { text: '已批准', color: 'blue' },
    REJECTED: { text: '已驳回', color: 'red' },
    COMPLETED: { text: '已完成', color: 'green' }
  }

  const status = statusConfig[trip.status] || { text: trip.status, color: 'default' }

  // 从关联费用报销聚合总金额
  const totalExpenseAmount = (trip.expenses || []).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0)

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/business-trips')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" wrap={false}>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{trip.title}</h3>
              <Tag color={status.color}>{status.text}</Tag>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>|</span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>报销金额: <strong style={{ color: '#f5222d' }}>{totalExpenseAmount.toFixed(2)}元</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>天数: <strong style={{ color: '#2563eb' }}>{trip.days || 0}天</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>日期: <strong style={{ color: '#7c3aed' }}>{trip.startDate ? dayjs(trip.startDate).format('MM-DD') : '-'} ~ {trip.endDate ? dayjs(trip.endDate).format('MM-DD') : '-'}</strong></span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{trip.destination}{(() => { const org = trip.organization?.name; const contact = trip.contact ? `${trip.contact.name}${trip.contact.title ? ` (${trip.contact.title})` : ''}` : ''; return org ? ` · ${contact ? `${org} - ${contact}` : org}` : '' })()}</div>
          </Col>
          <Col flex="none">
            <Space>
              <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="出差标题">{trip.title}</Descriptions.Item>
          <Descriptions.Item label="目的地">{trip.destination}</Descriptions.Item>
          <Descriptions.Item label="客户">{(() => { const org = trip.organization?.name || '-'; const contact = trip.contact ? `${trip.contact.name}${trip.contact.title ? ` (${trip.contact.title})` : ''}` : ''; return contact ? `${org} - ${contact}` : org })()}</Descriptions.Item>
          <Descriptions.Item label="项目">{trip.project?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="出差目的" span={2}>{trip.purpose || '-'}</Descriptions.Item>
          <Descriptions.Item label="开始日期">
            {trip.startDate ? dayjs(trip.startDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="结束日期">
            {trip.endDate ? dayjs(trip.endDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="天数">{trip.days ? `${trip.days}天` : '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={status.color}>{status.text}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="负责人">{trip.owner?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(trip.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{trip.notes || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={
          <Space>
            <span>关联费用报销</span>
            <Tag color="blue">{trip.expenses?.length || 0} 条</Tag>
            <span style={{ color: '#f5222d', fontSize: 16, fontWeight: 600 }}>
              合计: ¥{totalExpenseAmount.toFixed(2)}
            </span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/expenses', { state: { tripId: trip.id, tripTitle: trip.title, openAddModal: true } })}
          >
            添加费用
          </Button>
        }
      >
        {trip.expenses && trip.expenses.length > 0 ? (
          <Table
            dataSource={trip.expenses}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              {
                title: '费用标题',
                dataIndex: 'title',
                key: 'title',
                width: 200,
              },
              {
                title: '费用类别',
                dataIndex: 'category',
                key: 'category',
                width: 120,
              },
              {
                title: '金额',
                dataIndex: 'amount',
                key: 'amount',
                width: 120,
                render: (amount: any) => <span style={{ color: '#f5222d', fontWeight: 600 }}>{Number(amount).toFixed(2)} 元</span>,
              },
              {
                title: '费用日期',
                dataIndex: 'expenseDate',
                key: 'expenseDate',
                width: 120,
                render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: 100,
                render: (status: string) => {
                  const statusConfig: Record<string, { text: string; color: string }> = {
                    DRAFT: { text: '草稿', color: 'default' },
                    SUBMITTED: { text: '待审批', color: 'orange' },
                    APPROVED: { text: '已批准', color: 'blue' },
                    REJECTED: { text: '已驳回', color: 'red' },
                    PAID: { text: '已支付', color: 'green' }
                  }
                  const config = statusConfig[status] || { text: status, color: 'default' }
                  return <Tag color={config.color}>{config.text}</Tag>
                },
              },
              {
                title: '操作',
                key: 'action',
                width: 100,
                render: (_: any, record: any) => (
                  <Button type="link" size="small" onClick={() => navigate(`/expenses/${record.id}`)}>
                    查看
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            暂无关联费用报销记录
          </div>
        )}
      </Card>

      {/* 编辑 Modal */}
      <Modal
        title="编辑出差"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="出差标题" rules={[{ required: true, message: '请输入出差标题' }]}>
            <Input />
          </Form.Item>
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
            </Col>
            <Col span={12}>
              <Form.Item name="organizationId" hidden><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="projectId" label="项目">
                <Select placeholder="请选择项目（可选）" allowClear showSearch optionFilterProp="children">
                  {projects.map(p => (
                    <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="destination" label="目的地" rules={[{ required: true, message: '请输入目的地' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="purpose" label="出差目的">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="dateRange" label="出差日期" rules={[{ required: true, message: '请选择出差日期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default BusinessTripDetail
