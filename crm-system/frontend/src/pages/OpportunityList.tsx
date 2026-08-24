import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Card, Row, Col, Statistic, Dropdown, Empty, Popconfirm, Upload } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, MoreOutlined, ThunderboltOutlined, DownloadOutlined, ImportOutlined, InboxOutlined, StopOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, getOpportunityStats, getOrganizationsSimple, convertOpportunity, exportOpportunitiesCsv, exportOpportunitiesExcel, importOpportunities } from '../services/api'
import { OrgContactSelector } from '../components/OrgContactSelector'
import dayjs from 'dayjs'
import { usePermission } from '../hooks/usePermission'

function OpportunityList() {
  const { checkPermission } = usePermission()
  const navigate = useNavigate()
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
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
  const [importModalVisible, setImportModalVisible] = useState(false)
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
    } catch (error: any) {
      message.error(error?.error || '获取售前列表失败')
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

  const fetchStats = async () => {
    try {
      const data = await getOpportunityStats()
      setStats(data)
    } catch (error) {
      console.error('获取统计失败:', error)
    }
  }

  useEffect(() => {
    fetchOrganizations()
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
    } catch (error: any) {
      message.error(error?.error || '删除失败')
    }
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportOpportunitiesCsv() : await exportOpportunitiesExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `售前数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importOpportunities(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchOpportunities(pagination.current, pagination.pageSize)
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
          await Promise.all(selectedRowKeys.map(id => deleteOpportunity(id as number)))
          message.success('批量删除成功')
          setSelectedRowKeys([])
          fetchOpportunities(pagination.current, pagination.pageSize)
          fetchStats()
        } catch (error: any) {
          message.error(error?.error || '批量删除失败')
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
    } catch (error: any) {
      message.error(error?.error || '转化失败')
    }
  }

  const handleClose = async (id: number) => {
    try {
      await updateOpportunity(id, { status: 'CLOSED' })
      message.success('已关闭')
      fetchOpportunities(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '关闭失败')
    }
  }

  const handleLost = async (id: number) => {
    try {
      await updateOpportunity(id, { status: 'LOST' })
      message.success('已标记为丢单')
      fetchOpportunities(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }

  const confirmConvert = (record: any) => {
    Modal.confirm({
      title: '确认转化',
      content: `确定将「${record.name}」转化为项目吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => handleConvert(record.id)
    })
  }

  const confirmClose = (record: any) => {
    Modal.confirm({
      title: '确认关闭',
      content: `确定关闭「${record.name}」吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => handleClose(record.id)
    })
  }

  const confirmLost = (record: any) => {
    Modal.confirm({
      title: '确认丢单',
      content: `确定将「${record.name}」标记为丢单吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => handleLost(record.id)
    })
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
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }

  const getOrganizationName = (organizationId: number) => {
    const organization = organizations.find(c => c.id === organizationId)
    return organization ? organization.name : '-'
  }

  const columns = [
    {
      title: '项目编码',
      dataIndex: 'opportunityNo',
      key: 'opportunityNo',
      width: 120,
      render: (text: string) => text || '-'
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <a onClick={() => navigate(`/opportunities/${record.id}`)}>{text}</a>
      )
    },
    {
      title: '客户',
      dataIndex: 'organizationId',
      key: 'organizationId',
      render: (_: any, r: any) => {
        const org = r.organization?.name || getOrganizationName(r.organizationId) || '-'
        const contact = r.contact ? `${r.contact.name}${r.contact.title ? ` (${r.contact.title})` : ''}` : ''
        return contact ? `${org} - ${contact}` : org
      }
    },
    { title: '联系人', key: 'contact', render: (_: any, r: any) => r.contact ? `${r.contact.name}${r.contact.title ? ` (${r.contact.title})` : ''}` : r.decisionMaker || '-' },
    { title: '应用领域', dataIndex: 'application', key: 'application', render: (v: string) => v || '-' },
    { title: '预算', dataIndex: 'budget', key: 'budget', render: (v: number) => v ? `${v}元` : '-' },
    { title: '签订率', dataIndex: 'winRate', key: 'winRate', render: (v: number) => v !== null && v !== undefined ? `${v}%` : '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          OPEN: { text: '开放', color: 'default' },
          FOLLOWING: { text: '跟进中', color: 'blue' },
          WON: { text: '已赢单', color: 'green' },
          LOST: { text: '已丢单', color: 'red' },
          CLOSED: { text: '已关闭', color: 'orange' }
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
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)} disabled={!checkPermission('crm:opportunity:edit')}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!checkPermission('crm:opportunity:edit')}>删除</Button>
          </Popconfirm>
          {!['WON', 'LOST', 'CLOSED'].includes(record.status) && (
            <Dropdown menu={{
              items: [
                { key: 'convert', icon: <ThunderboltOutlined />, label: '转化为项目', onClick: () => confirmConvert(record) },
                { key: 'close', icon: <StopOutlined />, label: '关闭', onClick: () => confirmClose(record) },
                { key: 'lost', icon: <CloseCircleOutlined />, label: '标记丢单', onClick: () => confirmLost(record) },
              ]
            }}>
              <Button type="link" size="small" icon={<MoreOutlined />}>更多</Button>
            </Dropdown>
          )}
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
            <Statistic title="项目机会" value={stats?.total || 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="开放中" value={stats?.open || 0} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="已签订" value={stats?.won || 0} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="签订比例" value={stats?.winRate || 0} suffix="%" />
          </Col>
        </Row>
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchOpportunities(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!checkPermission('crm:opportunity:add') && !checkPermission('crm:opportunity:edit')}>新增项目机会</Button>
          {selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete} disabled={!checkPermission('crm:opportunity:edit')}>
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
        title={editingOpportunity ? '编辑项目机会' : '新增项目机会'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { form.resetFields(); setModalVisible(false) }}
        width={640}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="opportunityNo" label="项目编码">
            <Input placeholder="可选，如：OPP-2024-001" />
          </Form.Item>
          <Form.Item
            name="contactId"
            label="客户"
            rules={[{ required: true, message: '请选择客户联系人' }]}
          >
            <OrgContactSelector
              placeholder="请选择客户联系人"
              onContactSelect={(contactId, orgId) => {
                form.setFieldValue('contactId', contactId)
                form.setFieldValue('organizationId', orgId)
              }}
            />
          </Form.Item>
          <Form.Item name="organizationId" hidden><Input /></Form.Item>
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
          <Form.Item name="winRate" label="签订率">
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
              <Select.Option value="FOLLOWING">跟进中</Select.Option>
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

export default OpportunityList
