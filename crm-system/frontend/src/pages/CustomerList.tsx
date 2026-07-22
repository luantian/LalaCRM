import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Modal, Form, Input, message, Space,
  Card, Row, Col, Tag, Empty, Popconfirm, Dropdown, Upload
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  ReloadOutlined, EyeOutlined, DownloadOutlined, ImportOutlined, InboxOutlined
} from '@ant-design/icons'
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  batchDeleteCustomers, exportCustomers, exportCustomersExcel, importCustomers
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
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const searchTextRef = useRef(searchText)
  useEffect(() => { searchTextRef.current = searchText }, [searchText])

  const fetchCustomers = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = {
        page,
        pageSize,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      }
      if (searchTextRef.current) params.search = searchTextRef.current

      const response: any = await getCustomers(params)
      setCustomers(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error('获取客户列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchCustomers(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setRefreshTrigger(prev => prev + 1)
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

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportCustomers() : await exportCustomersExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `客户数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch { message.error('导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importCustomers(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchCustomers(pagination.current, pagination.pageSize)
    } catch (e: any) { message.error(e?.error || '导入失败') }
    return false
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
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/customers/${record.id}`)}>查看</Button>
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
          <Dropdown menu={{ items: [
            { key: 'csv', icon: <DownloadOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
            { key: 'excel', icon: <DownloadOutlined />, label: '导出 Excel', onClick: () => handleExport('excel') },
            { type: 'divider' },
            { key: 'import', icon: <ImportOutlined />, label: '导入数据', onClick: () => setImportModalVisible(true) },
          ]}}>
            <Button icon={<DownloadOutlined />}>导入导出</Button>
          </Dropdown>
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
        onCancel={() => { form.resetFields(); setModalVisible(false) }}
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

      <Modal title="导入数据" open={importModalVisible} onCancel={() => setImportModalVisible(false)} footer={null}>
        <Upload.Dragger
          accept=".csv,.xlsx,.xls"
          beforeUpload={(file) => { handleImport(file); return false }}
          showUploadList={false}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-tip">支持 CSV、Excel 格式（.csv / .xlsx / .xls）</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default CustomerList
