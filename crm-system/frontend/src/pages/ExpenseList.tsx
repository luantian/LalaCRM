import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Popconfirm, Tag, Card, Row, Col, Statistic, Dropdown, List } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, SearchOutlined, MoreOutlined, FileOutlined, UploadOutlined, DownloadOutlined, SendOutlined, DollarOutlined, UndoOutlined } from '@ant-design/icons'
import { getExpenses, createExpense, updateExpense, deleteExpense, approveExpense, submitExpense, rejectExpense, resubmitExpense, payExpense, getExpenseStats, getCustomers, getProjects, uploadExpenseFiles, getExpenseFiles, deleteExpenseFile, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

function ExpenseList() {
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any>(null)
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

  // 文件管理状态
  const [fileModalVisible, setFileModalVisible] = useState(false)
  const [currentExpense, setCurrentExpense] = useState<any>(null)
  const [expenseFiles, setExpenseFiles] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  const user = safeJsonParse(localStorage.getItem('user'), {})
  const canApprove = ['ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER'].includes(user.role) || user.permissions?.includes('approve_expenses')

  const expenseCategories = [
    '办公用品', '差旅费', '招待费', '交通费', '通讯费', '培训费', '其他'
  ]

  const fetchExpenses = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      if (filterStatusRef.current) {
        params.status = filterStatusRef.current
      }
      const response: any = await getExpenses(params)
      setExpenses(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error('获取费用报销记录失败')
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
      const data = await getExpenseStats()
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
    fetchExpenses()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchExpenses(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setFilterStatus(undefined)
    setRefreshTrigger(prev => prev + 1)
  }

  // ===== 文件管理 =====
  const handleManageFiles = async (expense: any) => {
    setCurrentExpense(expense)
    setFileModalVisible(true)
    await fetchExpenseFiles(expense.id)
  }

  const fetchExpenseFiles = async (expenseId: number) => {
    try {
      const data: any = await getExpenseFiles(expenseId)
      setExpenseFiles(data || [])
    } catch (error) {
      console.error('获取文件列表失败:', error)
    }
  }

  const handleUpload = async (fileList: FileList) => {
    if (!currentExpense) return
    setUploading(true)
    try {
      await uploadExpenseFiles(currentExpense.id, fileList)
      message.success('文件上传成功')
      fetchExpenseFiles(currentExpense.id)
    } catch (error: any) {
      message.error(error?.error || error?.message || '文件上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteFile = async (fileId: number) => {
    if (!currentExpense) return
    try {
      await deleteExpenseFile(currentExpense.id, fileId)
      message.success('文件删除成功')
      fetchExpenseFiles(currentExpense.id)
    } catch (error) {
      message.error('文件删除失败')
    }
  }

  const handleDownload = (fileId: number, fileName: string) => {
    const token = localStorage.getItem('token')
    fetch(`${import.meta.env.VITE_API_URL || '/api'}/expense-files/files/${fileId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      })
      .catch(() => message.error('下载失败'))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / 1048576).toFixed(2) + ' MB'
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchExpenses(page, pageSize)
  }

  const handleAdd = () => {
    setEditingExpense(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (expense: any) => {
    setEditingExpense(expense)
    form.setFieldsValue({
      ...expense,
      expenseDate: dayjs(expense.expenseDate)
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteExpense(id)
      message.success('删除成功')
      fetchExpenses(pagination.current, pagination.pageSize)
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
            await deleteExpense(id as number)
          }
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchExpenses(pagination.current, pagination.pageSize)
          fetchStats()
        } catch (error) {
          message.error('批量删除失败')
        }
      }
    })
  }

  // 提交申请
  const handleSubmitExpense = async (id: number) => {
    try {
      await submitExpense(id)
      message.success('已提交申请')
      fetchExpenses(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '提交失败')
    }
  }

  // 打开审批/驳回弹窗
  const handleOpenApproveModal = (expense: any, action: 'approve' | 'reject') => {
    setApproveTarget(expense)
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
        await approveExpense(approveTarget.id, approveRemark || undefined)
        message.success('已批准')
      } else {
        if (!rejectReason.trim()) {
          message.error('请填写驳回原因')
          return
        }
        await rejectExpense(approveTarget.id, rejectReason)
        message.success('已驳回')
      }
      setApproveModalVisible(false)
      fetchExpenses(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '审批失败')
    }
  }

  // 重新提交
  const handleResubmit = async (id: number) => {
    try {
      await resubmitExpense(id)
      message.success('已重新提交')
      fetchExpenses(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '重新提交失败')
    }
  }

  // 标记已支付
  const handlePay = async (id: number) => {
    try {
      await payExpense(id)
      message.success('已标记为已支付')
      fetchExpenses(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        expenseDate: values.expenseDate.toDate()
      }

      if (editingExpense) {
        await updateExpense(editingExpense.id, data)
        message.success('更新成功')
      } else {
        await createExpense(data)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchExpenses(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const getCustomerName = (customerId: number) => {
    const customer = customers.find(c => c.id === customerId)
    return customer ? customer.name : '-'
  }

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return '-'
    const project = projects.find(p => p.id === projectId)
    return project ? project.name : '-'
  }

  const columns = [
    {
      title: '报销标题',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: any) => (
        <a onClick={() => navigate(`/expenses/${record.id}`)}>{title}</a>
      )
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => <Tag>{category}</Tag>
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `${amount}元`,
      sorter: (a: any, b: any) => a.amount - b.amount
    },
    {
      title: '客户',
      dataIndex: 'customerId',
      key: 'customerId',
      render: (customerId: number) => getCustomerName(customerId)
    },
    {
      title: '项目',
      dataIndex: 'projectId',
      key: 'projectId',
      render: (projectId: number | null) => getProjectName(projectId)
    },
    {
      title: '费用日期',
      dataIndex: 'expenseDate',
      key: 'expenseDate',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
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
          PAID: { text: '已支付', color: 'green' }
        }
        const s = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    {
      title: '审批人',
      key: 'approver',
      render: (_: any, record: any) => record.approver?.name || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: any, record: any) => {
        const isOwner = record.ownerId === user.id
        const canEdit = (record.status === 'DRAFT' || record.status === 'REJECTED') && (isOwner || user.role === 'ADMIN')

        const moreItems: any[] = []
        moreItems.push({ key: 'files', icon: <FileOutlined />, label: '管理发票', onClick: () => handleManageFiles(record) })

        if (record.status === 'DRAFT' && (isOwner || user.role === 'ADMIN')) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'submit', icon: <SendOutlined />, label: '提交申请', onClick: () => handleSubmitExpense(record.id) })
        }

        if (record.status === 'SUBMITTED' && canApprove) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'approve', icon: <CheckOutlined />, label: '批准', onClick: () => handleOpenApproveModal(record, 'approve') })
          moreItems.push({ key: 'reject', icon: <CloseOutlined />, label: '驳回', danger: true, onClick: () => handleOpenApproveModal(record, 'reject') })
        }

        if (record.status === 'REJECTED' && (isOwner || user.role === 'ADMIN')) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'resubmit', icon: <UndoOutlined />, label: '重新提交', onClick: () => handleResubmit(record.id) })
        }

        if (record.status === 'APPROVED' && canApprove) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'pay', icon: <DollarOutlined />, label: '标记已支付', onClick: () => handlePay(record.id) })
        }

        return (
          <Space>
            {canEdit && (
              <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            )}
            {canEdit && (
              <Popconfirm title="确定要删除这条报销记录吗?" onConfirm={() => handleDelete(record.id)}>
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
            <Dropdown menu={{ items: moreItems }}>
              <Button type="text" icon={<MoreOutlined />} />
            </Dropdown>
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
        <h2>费用报销</h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={5}>
            <Statistic title="报销单数" value={stats?.totalExpenses || 0} suffix="单" />
          </Col>
          <Col span={5}>
            <Statistic title="总金额" value={stats?.totalAmount || 0} precision={2} suffix="元" valueStyle={{ color: '#f5222d' }} />
          </Col>
          <Col span={5}>
            <Statistic title="待审批" value={stats?.submitted || 0} suffix="单" valueStyle={{ color: '#faad14' }} />
          </Col>
          <Col span={5}>
            <Statistic title="已驳回" value={stats?.rejected || 0} suffix="单" valueStyle={{ color: '#ff4d4f' }} />
          </Col>
          <Col span={4}>
            <Statistic title="平均每单" value={stats?.averagePerExpense || 0} precision={2} suffix="元" />
          </Col>
        </Row>
      </Card>

      {/* 搜索 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={10}>
            <Input
              placeholder="搜索报销标题、描述"
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
              <Select.Option value="PAID">已支付</Select.Option>
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchExpenses(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增报销</Button>
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
        dataSource={expenses}
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
      />

      <Modal
        title={editingExpense ? '编辑报销' : '新增报销'}
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
            <p>金额：{approveTarget.amount}元 | 类别：{approveTarget.category}</p>
            <p>申请人：{approveTarget.owner?.name}</p>
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

      {/* 发票/附件管理 Modal */}
      <Modal
        title={`发票/附件 - ${currentExpense?.title || ''}`}
        open={fileModalVisible}
        onCancel={() => setFileModalVisible(false)}
        footer={null}
        width={650}
      >
        <div style={{ marginBottom: 16 }}>
          <input
            type="file"
            multiple
            id="expense-file-upload"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUpload(e.target.files)
                e.target.value = ''
              }
            }}
          />
          <Button
            icon={<UploadOutlined />}
            loading={uploading}
            type="primary"
            onClick={() => document.getElementById('expense-file-upload')?.click()}
          >
            上传发票/凭证（支持多个）
          </Button>
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
            支持 PDF、Word、Excel、图片等格式，单个文件最大 10MB
          </div>
        </div>

        <List
          bordered
          dataSource={expenseFiles}
          locale={{ emptyText: '暂无附件，请上传发票或凭证' }}
          renderItem={(file: any) => (
            <List.Item
              actions={[
                <Button
                  type="link"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownload(file.id, file.fileName)}
                >
                  下载
                </Button>,
                <Popconfirm
                  title="确定要删除这个文件吗?"
                  onConfirm={() => handleDeleteFile(file.id)}
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                avatar={<FileOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                title={file.fileName}
                description={
                  <Space size="large">
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span>{dayjs(file.uploadedAt).format('YYYY-MM-DD HH:mm')}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  )
}

export default ExpenseList
