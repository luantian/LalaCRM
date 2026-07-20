import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Modal, Form, Input, Select, message, Space,
  Popconfirm, Card, Row, Col, Tag, Dropdown, Empty
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  DownloadOutlined, ReloadOutlined, EyeOutlined, MoreOutlined
} from '@ant-design/icons'
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  batchDeleteCustomers, exportCustomers
} from '../services/api'

function CustomerList() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const fetchCustomers = async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = {
        page,
        pageSize,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      }
      if (searchText) params.search = searchText

      const response: any = await getCustomers(params)
      setCustomers(response.data)
      setPagination({
        current: response.pagination.page,
        pageSize: response.pagination.pageSize,
        total: response.pagination.total
      })
    } catch (error) {
      message.error('获取客户列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const handleSearch = () => {
    fetchCustomers(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    fetchCustomers(1, pagination.pageSize)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchCustomers(page, pageSize)
  }

  const handleAdd = () => {
    setEditingCustomer(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer)
    form.setFieldsValue(customer)
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteCustomer(id)
      message.success('删除成功')
      fetchCustomers(pagination.current, pagination.pageSize)
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的客户')
      return
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个客户吗？`,
      onOk: async () => {
        try {
          await batchDeleteCustomers(selectedRowKeys as number[])
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchCustomers(pagination.current, pagination.pageSize)
        } catch (error) {
          message.error('批量删除失败')
        }
      }
    })
  }

  const handleExport = async () => {
    try {
      const response = await exportCustomers()
      const blob = new Blob([response as any], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `客户列表_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      window.URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (error) {
      message.error('导出失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, values)
        message.success('更新成功')
      } else {
        await createCustomer(values)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchCustomers(pagination.current, pagination.pageSize)
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '客户名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <a onClick={() => navigate(`/customers/${record.id}`)}>{text}</a>
      )
    },
    { title: '公司名称', dataIndex: 'companyName', key: 'companyName' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          ACTIVE: { text: '活跃', color: 'green' },
          INACTIVE: { text: '不活跃', color: 'default' },
          POTENTIAL: { text: '潜在', color: 'orange' }
        }
        const s = statusMap[status] || { text: status || '活跃', color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '负责人',
      dataIndex: 'owner',
      key: 'owner',
      render: (owner: any) => owner?.name || '-'
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 80,
      render: (_: any, record: any) => (
        <Dropdown menu={{
          items: [
            { key: 'view', icon: <EyeOutlined />, label: '查看', onClick: () => navigate(`/customers/${record.id}`) },
            { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => handleEdit(record) },
            { type: 'divider' },
            { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDelete(record.id) },
          ]
        }}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
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
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>客户管理</h2>
      </div>

      {/* 搜索和筛选 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={16}>
            <Input
              placeholder="搜索客户名称、公司、电话、邮箱"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 操作按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchCustomers(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增客户
          </Button>
          {selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
              批量删除 ({selectedRowKeys.length})
            </Button>
          )}
        </Space>
      </div>

      {/* 表格 */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: 0 } }}>
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={customers}
          loading={loading}
          rowKey="id"
          locale={{ emptyText: <Empty description="暂无数据" /> }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: handleTableChange
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingCustomer ? '编辑客户' : '新增客户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="客户名称"
                rules={[{ required: true, message: '请输入客户名称' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="companyName" label="公司名称">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CustomerList
