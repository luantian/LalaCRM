import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Card, Row, Col, Empty, Popconfirm, Dropdown, Upload } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, DownloadOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons'
import { getProjects, createProject, updateProject, deleteProject, getProjectStats, getOrganizationsSimple, exportProjectsCsv, exportProjectsExcel, importProjects } from '../services/api'
import dayjs from 'dayjs'
import { OrgTreeSelect } from '../components/OrgTreeSelect'
import { OrgContactSelector } from '../components/OrgContactSelector'

function ProjectList() {
  const navigate = useNavigate()
  const location = useLocation()
  const isArchivePage = location.pathname === '/projects/archived'
  const [projects, setProjects] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [form] = Form.useForm()
  const watchedOrgId = Form.useWatch('organizationId', form)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [stats, setStats] = useState<any>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterOrgId, setFilterOrgId] = useState<number | null>(null)
  const [filterArchived, setFilterArchived] = useState<string>(isArchivePage ? 'true' : 'false')
  const [filterFullyPaid, setFilterFullyPaid] = useState<string>('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const searchTextRef = useRef(searchText)
  const lastRefreshTriggerRef = useRef<number | null>(null) // 防止 StrictMode 下重复请求，同时允许 refreshTrigger 变化时刷新
  useEffect(() => { searchTextRef.current = searchText }, [searchText])

  // 用 ref 存储筛选条件，避免 fetchProjects 引用频繁变化导致 useEffect 重复触发
  const filterStatusRef = useRef(filterStatus)
  const filterOrgIdRef = useRef(filterOrgId)
  const filterArchivedRef = useRef(filterArchived)
  const filterFullyPaidRef = useRef(filterFullyPaid)
  useEffect(() => { filterStatusRef.current = filterStatus }, [filterStatus])
  useEffect(() => { filterOrgIdRef.current = filterOrgId }, [filterOrgId])
  useEffect(() => { filterArchivedRef.current = filterArchived }, [filterArchived])
  useEffect(() => { filterFullyPaidRef.current = filterFullyPaid }, [filterFullyPaid])

  const fetchProjects = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { 
        page, 
        pageSize, 
        sortBy: 'createdAt', 
        sortOrder: 'desc',
      }
      // 归档页面：显示所有已归档项目（包含已完成）；普通页面：默认排除已完成
      if (isArchivePage) {
        params.isArchived = 'true'
      } else {
        params.statusNot = 'COMPLETED'
      }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      if (filterStatusRef.current) {
        params.status = filterStatusRef.current
        delete params.statusNot // 用户手动选择了状态，取消默认排除
      }
      if (filterOrgIdRef.current) params.organizationId = String(filterOrgIdRef.current)
      if (!isArchivePage && filterArchivedRef.current) params.isArchived = filterArchivedRef.current
      if (filterFullyPaidRef.current) params.fullyPaid = filterFullyPaidRef.current
      const response: any = await getProjects(params)
      setProjects(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error: any) {
      message.error(error?.error || '获取项目列表失败')
    } finally {
      setLoading(false)
    }
  }, []) // 空依赖：fetchProjects 引用稳定，不会触发重复请求

  const fetchOrganizations = async () => {
    try {
      const response: any = await getOrganizationsSimple()
      setOrganizations(response || [])
    } catch (error) {
      console.error('获取组织列表失败:', error)
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

  const initTriggeredRef = useRef(false) // 防止初始化和统计请求重复
  useEffect(() => {
    if (initTriggeredRef.current) return
    initTriggeredRef.current = true
    fetchOrganizations()
    fetchStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 防止 StrictMode 导致的重复请求，同时允许 refreshTrigger 变化时刷新
    if (lastRefreshTriggerRef.current === refreshTrigger) {
      return
    }
    lastRefreshTriggerRef.current = refreshTrigger
    fetchProjects()
  }, [refreshTrigger, fetchProjects]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchProjects(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setFilterStatus('')
    setFilterOrgId(null)
    setFilterArchived(isArchivePage ? 'true' : 'false')
    setFilterFullyPaid('')
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
    } catch (error: any) {
      message.error(error?.error || '删除失败')
    }
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportProjectsCsv() : await exportProjectsExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `项目数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importProjects(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchProjects(pagination.current, pagination.pageSize)
    } catch (e: any) { message.error(e?.error || '导入失败') }
    return false
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
        } catch (error: any) {
          message.error(error?.error || '批量删除失败')
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
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }

  const getOrganizationName = (organizationId: number) => {
    const organization = organizations.find(c => c.id === organizationId)
    return organization ? organization.name : '-'
  }

  const columns = [
    { title: '项目编号', dataIndex: 'projectNo', key: 'projectNo', width: 120, render: (v: string) => v || '-' },
    { title: '项目名称', dataIndex: 'name', key: 'name', render: (name: string, record: any) => <a onClick={() => navigate(`/projects/${record.id}`)} style={{ color: '#1890ff' }}>{name}</a> },
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
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
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          {isArchivePage ? '项目归档' : '项目管理'}
        </h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <Space size="large">
          <span>项目总数: <strong>{stats?.total || 0}</strong></span>
          <span>进行中: <strong style={{ color: '#1890ff' }}>{stats?.inProgress || 0}</strong></span>
          <span>已完成: <strong style={{ color: '#52c41a' }}>{stats?.completed || 0}</strong></span>
          <span>已取消: <strong style={{ color: '#ff4d4f' }}>{stats?.cancelled || 0}</strong></span>
          <span>完成率: <strong>{stats?.completionRate || 0}%</strong></span>
        </Space>
      </Card>

      {/* 搜索 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索项目名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="项目状态"
              value={filterStatus || undefined}
              onChange={(v) => setFilterStatus(v || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="IN_PROGRESS">进行中</Select.Option>
              <Select.Option value="COMPLETED">已完成</Select.Option>
              <Select.Option value="CANCELLED">已取消</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <OrgTreeSelect
              placeholder="客户"
              value={filterOrgId}
              onChange={(v) => setFilterOrgId(v)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="收款状态"
              value={filterFullyPaid || undefined}
              onChange={(v) => setFilterFullyPaid(v || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="true">已全额收款</Select.Option>
              <Select.Option value="false">未全额收款</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="归档状态"
              value={filterArchived || undefined}
              onChange={(v) => setFilterArchived(v || 'false')}
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="false">未归档</Select.Option>
              <Select.Option value="true">已归档</Select.Option>
            </Select>
          </Col>
        </Row>
        <Row gutter={[16, 16]} align="middle" style={{ marginTop: 12 }}>
          <Col>
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
          <Form.Item name="projectNo" label="项目编号">
            <Input placeholder="请输入项目编号" />
          </Form.Item>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="contactId"
            label="客户"
            rules={[{ required: true, message: '请选择客户联系人' }]}
          >
            <OrgContactSelector
              organizationId={watchedOrgId}
              placeholder="请选择客户联系人"
              onContactSelect={(contactId, orgId) => {
                form.setFieldValue('contactId', contactId)
                form.setFieldValue('organizationId', orgId)
              }}
            />
          </Form.Item>
          <Form.Item name="organizationId" hidden><Input /></Form.Item>
          <Form.Item name="status" label="状态" initialValue="IN_PROGRESS">
            <Select>
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

export default ProjectList
