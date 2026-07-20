import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Space, Statistic, Row, Col, Modal, Form, Input, Select, InputNumber, DatePicker, message } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { getBusinessTripDetail, updateBusinessTrip, getCustomers, getProjects } from '../services/api'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

function BusinessTripDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // 编辑状态
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [customers, setCustomers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await getBusinessTripDetail(parseInt(id!))
        setTrip(data)
      } catch (error) {
        console.error('获取出差详情失败:', error)
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
      accommodation: trip.accommodation ? Number(trip.accommodation) : null,
      transportation: trip.transportation ? Number(trip.transportation) : null,
      meals: trip.meals ? Number(trip.meals) : null,
      otherExpenses: trip.otherExpenses ? Number(trip.otherExpenses) : null,
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
    } catch (error) {
      message.error('更新失败')
    }
  }

  if (loading || !trip) {
    return <div>加载中...</div>
  }

  const statusConfig: Record<string, { text: string; color: string }> = {
    DRAFT: { text: '草稿', color: 'default' },
    SUBMITTED: { text: '待审批', color: 'orange' },
    APPROVED: { text: '已批准', color: 'blue' },
    REJECTED: { text: '已驳回', color: 'red' },
    COMPLETED: { text: '已完成', color: 'green' }
  }

  const status = statusConfig[trip.status] || { text: trip.status, color: 'default' }

  const totalAmount = Number(trip.totalAmount) || 0
  const accommodation = Number(trip.accommodation) || 0
  const transportation = Number(trip.transportation) || 0
  const meals = Number(trip.meals) || 0
  const otherExpenses = Number(trip.otherExpenses) || 0

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
        <Row justify="space-between" align="middle">
          <Col>
            <h2 style={{ margin: 0 }}>{trip.title}</h2>
            <p style={{ margin: '8px 0 0', color: '#666' }}>
              {trip.destination}
              {trip.customer?.name ? ` - ${trip.customer.name}` : ''}
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
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="总费用"
              value={totalAmount}
              precision={2}
              valueStyle={{ color: '#f5222d' }}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="出差天数"
              value={trip.days || 0}
              suffix="天"
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="开始日期"
              value={trip.startDate ? dayjs(trip.startDate).format('MM-DD') : '-'}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="结束日期"
              value={trip.endDate ? dayjs(trip.endDate).format('MM-DD') : '-'}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="出差标题">{trip.title}</Descriptions.Item>
          <Descriptions.Item label="目的地">{trip.destination}</Descriptions.Item>
          <Descriptions.Item label="客户">{trip.customer?.name || '-'}</Descriptions.Item>
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

      <Card title="费用明细">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={6}>
            <Statistic
              title="住宿费"
              value={accommodation}
              precision={2}
              suffix="元"
            />
          </Col>
          <Col xs={24} sm={6}>
            <Statistic
              title="交通费"
              value={transportation}
              precision={2}
              suffix="元"
            />
          </Col>
          <Col xs={24} sm={6}>
            <Statistic
              title="餐饮费"
              value={meals}
              precision={2}
              suffix="元"
            />
          </Col>
          <Col xs={24} sm={6}>
            <Statistic
              title="其他费用"
              value={otherExpenses}
              precision={2}
              suffix="元"
            />
          </Col>
        </Row>
        <Row style={{ marginTop: 16 }}>
          <Col span={24}>
            <Statistic
              title="合计"
              value={totalAmount}
              precision={2}
              valueStyle={{ color: '#f5222d', fontSize: 28 }}
              suffix="元"
            />
          </Col>
        </Row>
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
              <Form.Item name="customerId" label="客户">
                <Select placeholder="请选择客户（可选）" allowClear showSearch optionFilterProp="children">
                  {customers.map(c => (
                    <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="accommodation" label="住宿费">
                <InputNumber style={{ width: '100%' }} precision={2} addonAfter="元" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="transportation" label="交通费">
                <InputNumber style={{ width: '100%' }} precision={2} addonAfter="元" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="meals" label="餐饮费">
                <InputNumber style={{ width: '100%' }} precision={2} addonAfter="元" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="otherExpenses" label="其他费用">
                <InputNumber style={{ width: '100%' }} precision={2} addonAfter="元" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default BusinessTripDetail
