import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Popconfirm, Tag, Card, Row, Col, Statistic, Dropdown, List, Upload } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, SearchOutlined, MoreOutlined, FileOutlined, UploadOutlined, DownloadOutlined, SendOutlined, DollarOutlined, UndoOutlined, EyeOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons'
import { getExpenses, createExpense, updateExpense, deleteExpense, approveExpense, submitExpense, rejectExpense, resubmitExpense, payExpense, getExpenseStats, getOrganizationsSimple, getProjects, getBusinessTrips, uploadExpenseFiles, getExpenseFiles, deleteExpenseFile, downloadExpenseFileUrl, downloadFile, safeJsonParse, exportExpensesCsv, exportExpensesExcel, importExpenses, previewExpenseFileUrl, openFilePreview, isPreviewableFile } from '../services/api'
import dayjs from 'dayjs'
import { OrgContactSelector } from '../components/OrgContactSelector'
import { usePermission } from '../hooks/usePermission'

function ExpenseList() {
  const navigate = useNavigate()
  const location = useLocation()
  const { checkPermission } = usePermission()
  const [expenses, setExpenses] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
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
  const [importModalVisible, setImportModalVisible] = useState(false)

  const user = safeJsonParse(localStorage.getItem('user'), {})
  const canApprove = checkPermission('finance:expense:approve')

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
    } catch (error: any) {
      message.error(error?.error || '获取费用报销记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOrganizations = async () => {
    try {
      const response: any = await getOrganizationsSimple()
      setOrganizations(response || [])
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

  const fetchStats = async () => {
    try {
      const data = await getExpenseStats()
      setStats(data)
    } catch (error) {
      console.error('获取统计失败:', error)
    }
  }

  useEffect(() => {
    fetchOrganizations()
    fetchProjects()
    fetchTrips()
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
    } catch (error: any) {
      message.error(error?.error || '文件删除失败')
    }
  }

  const handleDownload = async (fileId: number, fileName: string) => {
    try {
      await downloadFile(downloadExpenseFileUrl, fileId, fileName)
    } catch {
      message.error('下载失败')
    }
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
    // Check if we're coming from a business trip detail page
    const state = location.state as any
    if (state?.tripId) {
      form.setFieldsValue({ 
        tripId: state.tripId,
        items: [] // 初始化空的 items 数组
      })
    }
    setModalVisible(true)
  }

  // 从出差详情页面跳转过来时，自动打开新增弹窗
  useEffect(() => {
    const state = location.state as any
    if (state?.openAddModal && state?.tripId) {
      handleAdd()
      // 清除 state，防止刷新时重复打开
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const handleEdit = (expense: any) => {
    const isOwner = expense.ownerId === user.id
    const canEdit = (expense.status === 'DRAFT' || expense.status === 'REJECTED') && (isOwner || checkPermission('finance:expense:edit'))
    if (!canEdit) {
      message.warning('当前状态不允许编辑')
      return
    }
    setEditingExpense(expense)
    form.setFieldsValue({
      title: expense.title,
      organizationId: expense.organizationId,
      contactId: expense.contactId,
      projectId: expense.projectId,
      tripId: expense.tripId || undefined,
      description: expense.description,
      items: (expense.items || []).map((item: any) => ({
        ...item,
        expenseDate: dayjs(item.expenseDate)
      }))
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    const expense = expenses.find(e => e.id === id)
    const isOwner = expense?.ownerId === user.id
    if (!(isOwner || checkPermission('finance:expense:edit'))) {
      message.warning('没有权限删除')
      return
    }
    try {
      await deleteExpense(id)
      message.success('删除成功')
      fetchExpenses(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '删除失败')
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
          await Promise.all(selectedRowKeys.map(id => deleteExpense(id as number)))
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchExpenses(pagination.current, pagination.pageSize)
          fetchStats()
        } catch (error: any) {
          message.error(error?.error || '批量删除失败')
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
      // 处理 items 中的日期
      const items = values.items.map((item: any) => ({
        ...item,
        expenseDate: item.expenseDate.toDate()
      }))
      const data = {
        ...values,
        items
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
    } catch (error: any) {
      if (error?.errorFields?.length) {
        message.error('请检查表单填写是否完整')
      } else {
        message.error(error?.error || '操作失败')
      }
    }
  }

  const getOrganizationName = (organizationId: number) => {
    const organization = organizations.find(c => c.id === organizationId)
    return organization ? organization.name : '-'
  }

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return '-'
    const project = projects.find(p => p.id === projectId)
    return project ? project.name : '-'
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportExpensesCsv() : await exportExpensesExcel()
      if (!blob) { message.error('导出失败：无数据'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `报销数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importExpenses(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchExpenses()
    } catch (e: any) { message.error(e?.error || '导入失败') }
    return false
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
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount: number) => `${amount}元`,
      sorter: (a: any, b: any) => a.totalAmount - b.totalAmount
    },
    {
      title: '明细数',
      key: 'itemCount',
      render: (_: any, record: any) => `${record.items?.length || 0} 条`
    },
    {
      title: '客户',
      dataIndex: 'organizationId',
      key: 'organizationId',
      render: (_: any, r: any) => {
        const org = getOrganizationName(r.organizationId) || '-'
        const contact = r.contact ? `${r.contact.name}${r.contact.title ? ` (${r.contact.title})` : ''}` : ''
        return contact ? `${org} - ${contact}` : org
      }
    },
    {
      title: '项目',
      dataIndex: 'projectId',
      key: 'projectId',
      render: (projectId: number | null) => getProjectName(projectId)
    },
    {
      title: '关联出差',
      dataIndex: 'trip',
      key: 'trip',
      render: (trip: any) => trip ? (
        <a onClick={() => navigate(`/business-trips/${trip.id}`)} style={{ color: '#1890ff' }}>
          {trip.title}
        </a>
      ) : '-'
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
      width: 300,
      fixed: 'right' as const,
      render: (_: any, record: any) => {
        const isOwner = record.ownerId === user.id

        const moreItems: any[] = []
        moreItems.push({ key: 'files', icon: <FileOutlined />, label: '管理发票', onClick: () => handleManageFiles(record) })

        if (record.status === 'DRAFT' && (isOwner || checkPermission('finance:expense:edit'))) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'submit', icon: <SendOutlined />, label: '提交申请', onClick: () => handleSubmitExpense(record.id) })
        }

        if (record.status === 'SUBMITTED' && canApprove) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'approve', icon: <CheckOutlined />, label: '批准', onClick: () => handleOpenApproveModal(record, 'approve') })
          moreItems.push({ key: 'reject', icon: <CloseOutlined />, label: '驳回', danger: true, onClick: () => handleOpenApproveModal(record, 'reject') })
        }

        if (record.status === 'REJECTED' && (isOwner || checkPermission('finance:expense:edit'))) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'resubmit', icon: <UndoOutlined />, label: '重新提交', onClick: () => handleResubmit(record.id) })
        }

        if (record.status === 'APPROVED' && canApprove) {
          moreItems.push({ type: 'divider' })
          moreItems.push({ key: 'pay', icon: <DollarOutlined />, label: '标记已支付', onClick: () => handlePay(record.id) })
        }

        const canEdit = (record.status === 'DRAFT' || record.status === 'REJECTED') && (isOwner || checkPermission('finance:expense:edit'))
        const canDelete = (record.status === 'DRAFT' || record.status === 'REJECTED') && (isOwner || checkPermission('finance:expense:edit'))

        return (
          <Space size={0}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/expenses/${record.id}`)}>查看</Button>
            {canEdit && (
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
            )}
            {canDelete && (
              <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            )}
            {moreItems.length > 0 && (
              <Dropdown menu={{ items: moreItems }}>
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

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={expenses}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1400 }}
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
        onCancel={() => { form.resetFields(); setModalVisible(false) }}
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
              <Form.Item name="description" label="备注">
                <Input.TextArea rows={1} />
              </Form.Item>
            </Col>
          </Row>

          {/* 费用明细 */}
          <div style={{ marginBottom: 8, fontWeight: 500 }}>费用明细</div>
          <Form.List name="items" rules={[{
            validator: async (_, items) => {
              if (!items || items.length === 0) {
                return Promise.reject(new Error('至少添加一条费用明细'))
              }
            }
          }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row gutter={12} key={key} align="middle" style={{ marginBottom: 12 }}>
                    <Col span={5}>
                      <Form.Item
                        {...restField}
                        name={[name, 'category']}
                        rules={[{ required: true, message: '请选择类别' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select placeholder="费用类别" style={{ width: '100%' }}>
                          {expenseCategories.map(cat => (
                            <Select.Option key={cat} value={cat}>{cat}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item
                        {...restField}
                        name={[name, 'amount']}
                        rules={[{ required: true, message: '请输入金额' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber style={{ width: '100%' }} precision={2} placeholder="金额（元）" suffix="元" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item
                        {...restField}
                        name={[name, 'expenseDate']}
                        rules={[{ required: true, message: '请选择日期' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <DatePicker style={{ width: '100%' }} placeholder="费用日期" />
                      </Form.Item>
                    </Col>
                    <Col span={7}>
                      <Form.Item
                        {...restField}
                        name={[name, 'description']}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="费用说明（可选）" />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        style={{ width: '100%' }}
                      />
                    </Col>
                  </Row>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    添加费用明细
                  </Button>
                  <Form.ErrorList errors={errors} />
                </Form.Item>
              </>
            )}
          </Form.List>
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
            <p><strong style={{ fontSize: 16 }}>{approveTarget.title}</strong></p>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <p style={{ margin: '6px 0' }}>
                <strong>总金额：</strong><span style={{ color: '#f5222d', fontWeight: 600 }}>{approveTarget.totalAmount}元</span>
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>客户：</strong>{getOrganizationName(approveTarget.organizationId) || '-'}
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>项目：</strong>{getProjectName(approveTarget.projectId) || '-'}
              </p>
              {approveTarget.trip && (
                <p style={{ margin: '6px 0' }}>
                  <strong>关联出差：</strong>{approveTarget.trip.title}
                </p>
              )}
              <p style={{ margin: '6px 0' }}>
                <strong>申请人：</strong>{approveTarget.owner?.name || '-'}
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>申请日期：</strong>{approveTarget.createdAt ? new Date(approveTarget.createdAt).toLocaleDateString('zh-CN') : '-'}
              </p>
              {approveTarget.description && (
                <p style={{ margin: '6px 0' }}>
                  <strong>备注：</strong>{approveTarget.description}
                </p>
              )}
            </div>

            {/* 费用明细列表 */}
            {approveTarget.items && approveTarget.items.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>费用明细</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #e8e8e8' }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>类别</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>金额</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center' }}>日期</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approveTarget.items.map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 6px' }}>{item.category}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#f5222d', fontWeight: 500 }}>{item.amount}元</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.expenseDate ? new Date(item.expenseDate).toLocaleDateString('zh-CN') : '-'}</td>
                        <td style={{ padding: '8px 6px' }}>{item.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fafafa', fontWeight: 600 }}>
                      <td style={{ padding: '8px 6px' }}>合计</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#f5222d' }}>
                        {approveTarget.items.reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0).toFixed(2)}元
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
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
                ...(isPreviewableFile(file.fileName) ? [
                  <Button
                    key="preview"
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => openFilePreview(previewExpenseFileUrl, file.id)}
                  >
                    查看
                  </Button>
                ] : []),
                <Button
                  key="download"
                  type="link"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownload(file.id, file.fileName)}
                >
                  下载
                </Button>,
                <Popconfirm
                  key="delete"
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

      <Modal title="导入数据" open={importModalVisible} onCancel={() => setImportModalVisible(false)} footer={null}>
        <Upload.Dragger accept=".csv,.xlsx,.xls" beforeUpload={(file) => { handleImport(file); return false }} showUploadList={false}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-tip">支持 CSV、Excel 格式</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default ExpenseList
