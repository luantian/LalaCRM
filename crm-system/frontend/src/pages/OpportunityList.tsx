import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Card, Row, Col, Statistic, Dropdown, Empty, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, MoreOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, getOpportunityStats, getCustomers, convertOpportunity } from '../services/api'
import dayjs from 'dayjs'

function OpportunityList() {
  const navigate = useNavigate()
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingOpportunity, setEditingOpportunity] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [stats, setStats] = useState<any>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const searchTextRef = useRef(searchText)
  useEffect(() => { searchTextRef.current = searchText }, [searchText])

  const fetchOpportunities = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize, sortBy: 'createdAt', sortOrder: 'desc', converted: 'false' }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      const response: any = await getOpportunities(params)
      setOpportunities(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error('获取商机列表失败')
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

  const fetchStats = async () => {
    try {
      const data = await getOpportunityStats()
      setStats(data)
    } catch (error) {
      console.error('获取统计失败:', error)
    }
  }

  useEffect(() => {
    fetchCustomers()
    fetchStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchOpportunities()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchOpportunities(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setRefreshTrigger(prev => prev + 1)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchOpportunities(page, pageSize)
  }

  const handleAdd = () => {
    setEditingOpportunity(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (opportunity: any) => {
    setEditingOpportunity(opportunity)
    form.setFieldsValue({
      ...opportunity,
      expectedStart: opportunity.expectedStart ? dayjs(opportunity.expectedStart) : null,
      expectedEnd: opportunity.expectedEnd ? dayjs(opportunity.expectedEnd) : null
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteOpportunity(id)
      message.success('删除成功')
      fetchOpportunities(pagination.current, pagination.pageSize)
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
            await deleteOpportunity(id as number)
          }
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchOpportunities(pagination.current, pagination.pageSize)
          fetchStats()
        } catch (error) {
          message.error('批量删除失败')
        }
      }
    })
  }

  const handleConvert = async (id: number) => {
    try {
      await convertOpportunity(id)
      message.success('转化为项目成功')
      fetchOpportunities(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error) {
      message.error('转化失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        expectedStart: values.expectedStart ? values.expectedStart.toDate() : null,
        expectedEnd: values.expectedEnd ? values.expectedEnd.toDate() : null
      }
      if (editingOpportunity) {
        await updateOpportunity(editingOpportunity.id, data)
        message.success('更新成功')
      } else {
        await createOpportunity(data)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchOpportunities(pagination.current, pagination.pageSize)
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
    {
      title: '商机名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <a onClick={() => navigate(`/opportunities/${record.id}`)}>{text}</a>
      )
    },
    {
      title: '客户',
      dataIndex: 'customerId',
      key: 'customerId',
      render: (customerId: number, record: any) => record.customer?.name || getCustomerName(customerId)
    },
    { title: '应用领域', dataIndex: 'application', key: 'application', render: (v: string) => v || '-' },
    { title: '预算', dataIndex: 'budget', key: 'budget', render: (v: number) => v ? `${v}元` : '-' },
    { title: '成单率', dataIndex: 'winRate', key: 'winRate', render: (v: number) => v !== null && v !== undefined ? `${v}%` : '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          OPEN: { text: '开放', color: 'default' },
          QUALIFIED: { text: '已确认', color: 'blue' },
          PROPOSAL: { text: '方案阶段', color: 'orange' },
          NEGOTIATION: { text: '谈判中', color: 'purple' },
          WON: { text: '已赢单', color: 'green' },
          LOST: { text: '已丢单', color: 'red' },
          CLOSED: { text: '已关闭', color: 'default' }
        }
        const s = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    {
      title: '负责人',
      dataIndex: 'ownerId',
      key: 'ownerId',
      render: (_: any, record: any) => record.owner?.name || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/opportunities/${record.id}`)}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
          <Dropdown menu={{
            items: [
              { key: 'convert', icon: <ThunderboltOutlined />, label: '转化为项目', onClick: () => handleConvert(record.id) },
            ]
          }}>
            <Button type="link" size="small" icon={<MoreOutlined />}>更多</Button>
          </Dropdown>
        </Space>
      )
    }
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys)
  }

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>售前管理</h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <Row gutter={16}>
          <Col xs={12} sm={6}>
            <Statistic title="商机总数" value={stats?.total || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="开放中" value={stats?.open || 0} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="已赢单" value={stats?.won || 0} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="赢单率" value={stats?.winRate || 0} suffix="%" />
          </Col>
        </Row>
      </Card>

      {/* 搜索 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={16}>
            <Input
              placeholder="搜索商机名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchOpportunities(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增商机</Button>
          {selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
              批量删除 ({selectedRowKeys.length})
            </Button>
          )}
        </Space>
      </div>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={opportunities}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: handleTableChange
          }}
          scroll={{ x: 1200 }}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingOpportunity ? '编辑商机' : '新增商机'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { form.resetFields(); setModalVisible(false) }}
        width={640}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="商机名称" rules={[{ required: true, message: '请输入商机名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="customerId"
            label="客户"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              placeholder="请选择客户"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())
              }
            >
              {customers.map(customer => (
                <Select.Option key={customer.id} value={customer.id}>
                  {customer.name} {customer.companyName ? `- ${customer.companyName}` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="application" label="应用领域">
            <Input />
          </Form.Item>
          <Form.Item name="budget" label="预算">
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="decisionMaker" label="客户决策人">
            <Input />
          </Form.Item>
          <Form.Item name="technicalDetail" label="技术细节">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="configSelection" label="配置方案选品">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="competitors" label="竞争对手">
            <Input />
          </Form.Item>
          <Form.Item name="winRate" label="成单率">
            <InputNumber style={{ width: '100%' }} min={0} max={100} />
          </Form.Item>
          <Form.Item name="expectedStart" label="预计开始日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expectedEnd" label="预计结束日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="OPEN">
            <Select>
              <Select.Option value="OPEN">开放</Select.Option>
              <Select.Option value="QUALIFIED">已确认</Select.Option>
              <Select.Option value="PROPOSAL">方案阶段</Select.Option>
              <Select.Option value="NEGOTIATION">谈判中</Select.Option>
              <Select.Option value="WON">已赢单</Select.Option>
              <Select.Option value="LOST">已丢单</Select.Option>
              <Select.Option value="CLOSED">已关闭</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OpportunityList
