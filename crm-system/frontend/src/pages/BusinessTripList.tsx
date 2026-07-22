import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Card, Row, Col, Statistic, Dropdown, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, CheckOutlined, CloseOutlined, MoreOutlined, SendOutlined, UndoOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { getBusinessTrips, createBusinessTrip, updateBusinessTrip, deleteBusinessTrip, submitBusinessTrip, approveBusinessTrip, rejectBusinessTrip, resubmitBusinessTrip, completeBusinessTrip, getBusinessTripStats, getCustomers, getProjects, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

function BusinessTripList() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTrip, setEditingTrip] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [stats, setStats] = useState<any>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const searchTextRef = useRef(searchText)
  const filterStatusRef = useRef(filterStatus)
  useEffect(() => { searchTextRef.current = searchText }, [searchText])
  useEffect(() => { filterStatusRef.current = filterStatus }, [filterStatus])

  // 审批弹窗状态
  const [approveModalVisible, setApproveModalVisible] = useState(false)
  const [approveTarget, setApproveTarget] = useState<any>(null)
  const [approveAction, setApproveAction] = useState<'approve' | 'reject'>('approve')
  const [approveRemark, setApproveRemark] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const fetchTrips = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      if (filterStatusRef.current) {
        params.status = filterStatusRef.current
      }
      const response: any = await getBusinessTrips(params)
      setTrips(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error('获取出差记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

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

  const fetchStats = async () => {
    try {
      const data = await getBusinessTripStats()
      setStats(data)
    } catch (error) {
      console.error('获取统计失败:', error)
    }
  }

  useEffect(() => {
    fetchCustomers()
    fetchProjects()
    fetchStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTrips()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchTrips(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setFilterStatus(undefined)
    setRefreshTrigger(prev => prev + 1)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchTrips(page, pageSize)
  }

  const handleAdd = () => {
    setEditingTrip(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (trip: any) => {
    setEditingTrip(trip)
    form.setFieldsValue({
      ...trip,
      dateRange: [dayjs(trip.startDate), dayjs(trip.endDate)]
    })
    setModalVisible(true)
  }

  // 提交申请
  const handleSubmitTrip = async (id: number) => {
    try {
      await submitBusinessTrip(id)
      message.success('已提交申请')
      fetchTrips(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '提交失败')
    }
  }

  // 打开审批/驳回弹窗
  const handleOpenApproveModal = (trip: any, action: 'approve' | 'reject') => {
    setApproveTarget(trip)
    setApproveAction(action)
    setApproveRemark('')
    setRejectReason('')
    setApproveModalVisible(true)
  }

  // 确认审批
  const handleConfirmApprove = async () => {
    if (!approveTarget) return
    try {
      if (approveAction === 'approve') {
        await approveBusinessTrip(approveTarget.id, approveRemark || undefined)
        message.success('已批准')
      } else {
        if (!rejectReason.trim()) {
          message.error('请填写驳回原因')
          return
        }
        await rejectBusinessTrip(approveTarget.id, rejectReason)
        message.success('已驳回')
      }
      setApproveModalVisible(false)
      fetchTrips(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '审批失败')
    }
  }

  // 重新提交
  const handleResubmit = async (id: number) => {
    try {
      await resubmitBusinessTrip(id)
      message.success('已重新提交')
      fetchTrips(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '重新提交失败')
    }
  }

  // 标记已完成
  const handleComplete = async (id: number) => {
    try {
      await completeBusinessTrip(id)
      message.success('已标记为已完成')
      fetchTrips(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }

  const user = safeJsonParse(localStorage.getItem('user'), {})
  const canApprove = ['ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER'].includes(user.role) || user.permissions?.includes('approve_business_trips')

  const handleDelete = async (id: number) => {
    try {
      await deleteBusinessTrip(id)
      message.success('删除成功')
      fetchTrips(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的记录')
      return
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？`,
      onOk: async () => {
        try {
          for (const id of selectedRowKeys) {
            await deleteBusinessTrip(id as number)
          }
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchTrips(pagination.current, pagination.pageSize)
          fetchStats()
        } catch (error) {
          message.error('批量删除失败')
        }
      }
    })
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

      if (editingTrip) {
        await updateBusinessTrip(editingTrip.id, data)
        message.success('更新成功')
      } else {
        await createBusinessTrip(data)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchTrips(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const getCustomerName = (customerId: number) => {
    const customer = customers.find(c => c.id === customerId)
    return customer ? customer.name : '-'
  }


  const columns = [
    { title: '出差标题', dataIndex: 'title', key: 'title' },
    { title: '目的地', dataIndex: 'destination', key: 'destination' },
    {
      title: '客户',
      dataIndex: 'customerId',
      key: 'customerId',
      render: (customerId: number) => getCustomerName(customerId)
    },
    {
      title: '日期',
      key: 'date',
      render: (_: any, record: any) => (
        <span>{dayjs(record.startDate).format('MM-DD')} 至 {dayjs(record.endDate).format('MM-DD')}</span>
      )
    },
    { title: '天数', dataIndex: 'days', key: 'days', render: (days: number) => `${days}天` },
    {
      title: '总费用',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount: number) => `${amount}元`,
      sorter: (a: any, b: any) => a.totalAmount - b.totalAmount
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          DRAFT: { text: '草稿', color: 'default' },
          SUBMITTED: { text: '待审批', color: 'orange' },
          APPROVED: { text: '已批准', color: 'blue' },
          REJECTED: { text: '已驳回', color: 'red' },
          COMPLETED: { text: '已完成', color: 'green' }
        }
        const s = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      fixed: 'right' as const,
      render: (_: any, record: any) => {
        const isOwner = record.ownerId === user.id
        const workflowItems: any[] = []

        if (record.status === 'DRAFT' && (isOwner || user.role === 'ADMIN')) {
          workflowItems.push({ key: 'submit', icon: <SendOutlined />, label: '提交申请', onClick: () => handleSubmitTrip(record.id) })
        }

        if (record.status === 'SUBMITTED' && canApprove) {
          workflowItems.push({ key: 'approve', icon: <CheckOutlined />, label: '批准', onClick: () => handleOpenApproveModal(record, 'approve') })
          workflowItems.push({ key: 'reject', icon: <CloseOutlined />, label: '驳回', danger: true, onClick: () => handleOpenApproveModal(record, 'reject') })
        }

        if (record.status === 'REJECTED' && (isOwner || user.role === 'ADMIN')) {
          workflowItems.push({ key: 'resubmit', icon: <UndoOutlined />, label: '重新提交', onClick: () => handleResubmit(record.id) })
        }

        if (record.status === 'APPROVED' && (isOwner || user.role === 'ADMIN')) {
          workflowItems.push({ key: 'complete', icon: <CheckCircleOutlined />, label: '标记完成', onClick: () => handleComplete(record.id) })
        }

        return (
          <Space size={0}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/business-trips/${record.id}`)}>查看</Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
            <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
            {workflowItems.length > 0 && (
              <Dropdown menu={{ items: workflowItems }}>
                <Button type="link" size="small" icon={<MoreOutlined />}>更多</Button>
              </Dropdown>
            )}
          </Space>
        )
      }
    }
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys)
  }

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 16 }}>
        <h2>出差管理</h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={5}>
            <Statistic title="出差次数" value={stats?.totalTrips || 0} suffix="次" />
          </Col>
          <Col span={5}>
            <Statistic title="总天数" value={stats?.totalDays || 0} suffix="天" />
          </Col>
          <Col span={5}>
            <Statistic title="总费用" value={stats?.totalAmount || 0} precision={2} suffix="元" valueStyle={{ color: '#f5222d' }} />
          </Col>
          <Col span={5}>
            <Statistic title="待审批" value={stats?.submitted || 0} suffix="次" valueStyle={{ color: '#faad14' }} />
          </Col>
          <Col span={4}>
            <Statistic title="平均每次" value={stats?.averagePerTrip || 0} precision={2} suffix="元" />
          </Col>
        </Row>
      </Card>

      {/* 搜索 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={10}>
            <Input
              placeholder="搜索标题、目的地、事由"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6}>
            <Select
              style={{ width: '100%' }}
              placeholder="按状态筛选"
              allowClear
              value={filterStatus}
              onChange={(val) => setFilterStatus(val)}
            >
              <Select.Option value="DRAFT">草稿</Select.Option>
              <Select.Option value="SUBMITTED">待审批</Select.Option>
              <Select.Option value="APPROVED">已批准</Select.Option>
              <Select.Option value="REJECTED">已驳回</Select.Option>
              <Select.Option value="COMPLETED">已完成</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={8}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 操作按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchTrips(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增出差</Button>
          {selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
              批量删除 ({selectedRowKeys.length})
            </Button>
          )}
        </Space>
      </div>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={trips}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1200 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: handleTableChange
        }}
      />

      <Modal
        title={editingTrip ? '编辑出差' : '新增出差'}
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
                  {customers.map(customer => (
                    <Select.Option key={customer.id} value={customer.id}>
                      {customer.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="projectId" label="项目">
                <Select placeholder="请选择项目（可选）" allowClear showSearch optionFilterProp="children">
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

      {/* 审批/驳回弹窗 */}
      <Modal
        title={approveAction === 'approve' ? '审批通过' : '驳回申请'}
        open={approveModalVisible}
        onOk={handleConfirmApprove}
        onCancel={() => setApproveModalVisible(false)}
        okText={approveAction === 'approve' ? '确认批准' : '确认驳回'}
        okButtonProps={{ danger: approveAction === 'reject' }}
      >
        {approveTarget && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>{approveTarget.title}</strong></p>
            <p>目的地：{approveTarget.destination} | 天数：{approveTarget.days}天</p>
            <p>费用：{approveTarget.totalAmount}元 | 申请人：{approveTarget.owner?.name}</p>
          </div>
        )}
        {approveAction === 'approve' ? (
          <Input.TextArea
            rows={3}
            placeholder="审批备注（可选）"
            value={approveRemark}
            onChange={(e) => setApproveRemark(e.target.value)}
          />
        ) : (
          <Input.TextArea
            rows={3}
            placeholder="请填写驳回原因（必填）"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        )}
      </Modal>
    </div>
  )
}

export default BusinessTripList
