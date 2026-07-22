import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Card, Row, Col, Empty, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'
import { getProjects, createProject, updateProject, deleteProject, getProjectStats, getCustomers } from '../services/api'
import dayjs from 'dayjs'

function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
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

  const fetchProjects = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize, sortBy: 'createdAt', sortOrder: 'desc' }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      const response: any = await getProjects(params)
      setProjects(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error('获取项目列表失败')
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
      const data = await getProjectStats()
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
    fetchProjects()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchProjects(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setRefreshTrigger(prev => prev + 1)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchProjects(page, pageSize)
  }

  const handleAdd = () => {
    setEditingProject(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (project: any) => {
    setEditingProject(project)
    form.setFieldsValue({
      ...project,
      startDate: project.startDate ? dayjs(project.startDate) : null,
      endDate: project.endDate ? dayjs(project.endDate) : null
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id)
      message.success('删除成功')
      fetchProjects(pagination.current, pagination.pageSize)
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
            await deleteProject(id as number)
          }
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchProjects(pagination.current, pagination.pageSize)
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
      const data = {
        ...values,
        startDate: values.startDate ? values.startDate.toDate() : null,
        endDate: values.endDate ? values.endDate.toDate() : null
      }
      if (editingProject) {
        await updateProject(editingProject.id, data)
        message.success('更新成功')
      } else {
        await createProject(data)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchProjects(pagination.current, pagination.pageSize)
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
    { title: '项目名称', dataIndex: 'name', key: 'name', render: (name: string, record: any) => <a onClick={() => navigate(`/projects/${record.id}`)} style={{ color: '#1890ff' }}>{name}</a> },
    {
      title: '客户',
      dataIndex: 'customerId',
      key: 'customerId',
      render: (customerId: number) => getCustomerName(customerId)
    },
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
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${record.id}`)}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
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
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>项目管理</h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <Space size="large">
          <span>项目总数: <strong>{stats?.total || 0}</strong></span>
          <span>进行中: <strong style={{ color: '#1890ff' }}>{stats?.inProgress || 0}</strong></span>
          <span>已完成: <strong style={{ color: '#52c41a' }}>{stats?.completed || 0}</strong></span>
          <span>完成率: <strong>{stats?.completionRate || 0}%</strong></span>
        </Space>
      </Card>

      {/* 搜索 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={16}>
            <Input
              placeholder="搜索项目名称"
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchProjects(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增项目</Button>
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
          dataSource={projects}
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
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>
      <Modal
        title={editingProject ? '编辑项目' : '新增项目'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { form.resetFields(); setModalVisible(false) }}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
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
          <Form.Item name="status" label="状态" initialValue="PENDING">
            <Select>
              <Select.Option value="PENDING">待开始</Select.Option>
              <Select.Option value="IN_PROGRESS">进行中</Select.Option>
              <Select.Option value="COMPLETED">已完成</Select.Option>
              <Select.Option value="CANCELLED">已取消</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="budget" label="预算">
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="startDate" label="开始日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="endDate" label="结束日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ProjectList
