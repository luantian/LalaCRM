import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Modal, Form, Input, Select, DatePicker, message, Space, Tag, Card, Row, Col, Statistic, Table, Popconfirm, InputNumber, Upload, Dropdown, Empty, Pagination } from 'antd'
import { EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, DownloadOutlined, ImportOutlined, InboxOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { getDailyReports, createDailyReport, updateDailyReport, deleteDailyReport, getDailyReportStats, getProjects, getOrganizationsSimple, exportDailyReports, exportDailyReportsExcel, importDailyReports, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'
import { usePermission } from '../hooks/usePermission'

const { RangePicker } = DatePicker

// 自动来源类型 → 展示标签
const sourceTypeConfig: Record<string, { label: string; color: string }> = {
  INVOICE: { label: '发票', color: 'purple' },
  RECEIPT: { label: '回款', color: 'green' },
  CONTRACT: { label: '合同', color: 'blue' },
  SHIPMENT: { label: '发货', color: 'cyan' },
  PROCUREMENT: { label: '采购', color: 'orange' },
  PROCUREMENT_PAYMENT: { label: '采购付款', color: 'orange' },
  TASK: { label: '任务', color: 'geekblue' },
  NOTE: { label: '项目备注', color: 'default' },
  OPPORTUNITY: { label: '售前', color: 'gold' },
  QUOTATION: { label: '报价', color: 'gold' },
  EXPENSE: { label: '报销', color: 'magenta' },
  BUSINESS_TRIP: { label: '出差', color: 'volcano' },
  PROJECT: { label: '项目', color: 'blue' },
  ORGANIZATION: { label: '客户', color: 'geekblue' },
}

function DailyReportList() {
  const { checkPermission } = usePermission()
  const user = safeJsonParse(localStorage.getItem('user'), {})
  const [reports, setReports] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingReport, setEditingReport] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [stats, setStats] = useState<any>(null)
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>(undefined)
  const [filterOrgId, setFilterOrgId] = useState<number | undefined>(undefined)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const searchTextRef = useRef(searchText)
  const dateRangeRef = useRef(dateRange)
  const filterProjectIdRef = useRef(filterProjectId)
  const filterOrgIdRef = useRef(filterOrgId)
  useEffect(() => { searchTextRef.current = searchText }, [searchText])
  useEffect(() => { dateRangeRef.current = dateRange }, [dateRange])
  useEffect(() => { filterProjectIdRef.current = filterProjectId }, [filterProjectId])
  useEffect(() => { filterOrgIdRef.current = filterOrgId }, [filterOrgId])

  const fetchReports = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (searchTextRef.current.trim()) params.search = searchTextRef.current.trim()
      const range = dateRangeRef.current
      if (range && range[0] && range[1]) {
        params.startDate = range[0].format('YYYY-MM-DD')
        params.endDate = range[1].format('YYYY-MM-DD')
      }
      if (filterProjectIdRef.current) params.projectId = filterProjectIdRef.current
      if (filterOrgIdRef.current) params.organizationId = filterOrgIdRef.current
      const response: any = await getDailyReports(params)
      setReports(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error: any) {
      message.error(error?.error || '获取工作日报失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProjects = async () => {
    try {
      const response: any = await getProjects({ pageSize: 1000 })
      setProjects(response.data || [])
    } catch (error) {
      console.error('获取项目列表失败:', error)
    }
  }

  const fetchOrganizations = async () => {
    try {
      const response: any = await getOrganizationsSimple()
      setOrganizations(Array.isArray(response) ? response : (response?.data || []))
    } catch (error) {
      console.error('获取客户列表失败:', error)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await getDailyReportStats()
      setStats(data)
    } catch (error) {
      console.error('获取统计失败:', error)
    }
  }

  useEffect(() => {
    fetchProjects()
    fetchOrganizations()
    fetchStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchReports()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => fetchReports(1, pagination.pageSize)

  const handleReset = () => {
    setSearchText('')
    setDateRange(null)
    setFilterProjectId(undefined)
    setFilterOrgId(undefined)
    setRefreshTrigger(prev => prev + 1)
  }

  const handleAdd = () => {
    setEditingReport(null)
    form.resetFields()
    form.setFieldsValue({ reportDate: dayjs(), entries: [{ organizationId: undefined, projectId: undefined, content: '' }], todos: [''] })
    setModalVisible(true)
  }

  const handleEdit = (report: any) => {
    setEditingReport(report)
    // 只编辑手动条目；自动条目由系统各操作生成，在卡片中展示
    const manualEntries = (report.entries || []).filter((e: any) => e.source === 'MANUAL')
    form.setFieldsValue({
      reportDate: dayjs(report.reportDate),
      plan: report.plan || '',
      todos: Array.isArray(report.todos) && report.todos.length > 0 ? report.todos : [''],
      entries: manualEntries.length > 0
        ? manualEntries.map((e: any) => ({ id: e.id, organizationId: e.organizationId ?? undefined, projectId: e.projectId ?? undefined, title: e.title || undefined, content: e.content || '', hours: e.hours != null ? Number(e.hours) : undefined }))
        : [{ organizationId: undefined, projectId: undefined, content: '' }]
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteDailyReport(id)
      message.success('删除成功')
      fetchReports(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const entries = (values.entries || [])
        .map((e: any) => ({ ...e, content: (e?.content || '').trim() }))
        .filter((e: any) => e.content)
      const todos = (values.todos || []).map((t: string) => (t || '').trim()).filter(Boolean)
      const data = {
        reportDate: values.reportDate.toDate(),
        entries,
        plan: values.plan || null,
        todos
      }

      if (editingReport) {
        await updateDailyReport(editingReport.id, data)
        message.success('更新成功')
      } else {
        await createDailyReport(data)
        message.success('创建成功')
      }

      setModalVisible(false)
      fetchReports(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error: any) {
      message.error(error?.error || '操作失败')
    }
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      // 与列表查询同条件导出：搜索词 + 日期范围 + 项目 + 客户
      const params: any = {}
      if (searchTextRef.current.trim()) params.search = searchTextRef.current.trim()
      const range = dateRangeRef.current
      if (range && range[0] && range[1]) {
        params.startDate = range[0].format('YYYY-MM-DD')
        params.endDate = range[1].format('YYYY-MM-DD')
      }
      if (filterProjectIdRef.current) params.projectId = filterProjectIdRef.current
      if (filterOrgIdRef.current) params.organizationId = filterOrgIdRef.current
      const blob = type === 'csv' ? await exportDailyReports(params) : await exportDailyReportsExcel(params)
      if (!blob || !(blob instanceof Blob)) {
        message.error('导出失败：响应格式异常')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `日报数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) {
      console.error('[导出] 失败:', e)
      message.error(e?.error || '导出失败')
    }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importDailyReports(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchReports()
    } catch (e: any) { message.error(e?.error || '导入失败') }
    return false
  }

  // 条目内选择项目后自动带出客户（该条目客户为空时）
  const handleEntryProjectChange = (index: number, projectId: number | undefined) => {
    if (!projectId) return
    const project = projects.find(p => p.id === projectId)
    const currentOrg = form.getFieldValue(['entries', index, 'organizationId'])
    if (project?.organization?.id && !currentOrg) {
      form.setFieldValue(['entries', index, 'organizationId'], project.organization.id)
    }
  }

  // 展平：一条事情=一行；同一天多行通过 daySpan 合并天级列
  const tableRows: any[] = []
  reports.forEach((report) => {
    // 兜底：无条目但 content 有值（如导入未迁移的旧数据）按单条展示
    const rawEntries = report.entries || []
    const entries = rawEntries.length === 0 && report.content
      ? [{ id: undefined, title: null, content: report.content, organization: report.organization, project: report.project, source: 'MANUAL', sourceType: null }]
      : rawEntries
    const list = entries.length > 0 ? entries : [{ id: undefined, title: null, content: '', organization: null, project: null, source: 'MANUAL', sourceType: null }]
    list.forEach((entry: any, idx: number) => {
      tableRows.push({
        key: `${report.id}-${entry.id ?? idx}`,
        daySpan: idx === 0 ? list.length : 0,
        report,
        entry
      })
    })
  })

  const columns = [
    {
      title: '日期',
      key: 'date',
      width: 125,
      onCell: (r: any) => ({ rowSpan: r.daySpan }),
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{dayjs(r.report.reportDate).format('YYYY-MM-DD')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>{dayjs(r.report.reportDate).format('dddd')}</div>
          {Number(r.report.hours) > 0 && (
            <div style={{ color: '#722ed1', fontSize: 12, fontWeight: 600 }}>共 {Number(r.report.hours)}h</div>
          )}
        </div>
      )
    },
    {
      title: '姓名',
      key: 'user',
      width: 100,
      onCell: (r: any) => ({ rowSpan: r.daySpan }),
      render: (_: any, r: any) => <span style={{ fontWeight: 500 }}>{r.report.user?.name || '-'}</span>
    },
    {
      title: '客户',
      key: 'org',
      width: 160,
      render: (_: any, r: any) => r.entry.organization?.name || <span style={{ color: '#bbb' }}>—</span>
    },
    {
      title: '项目',
      key: 'proj',
      width: 160,
      render: (_: any, r: any) => r.entry.project?.name || <span style={{ color: '#bbb' }}>—</span>
    },
    {
      title: '来源',
      key: 'source',
      width: 85,
      render: (_: any, r: any) => {
        const st = r.entry.sourceType ? sourceTypeConfig[r.entry.sourceType] : null
        if (st) return <Tag color={st.color} style={{ margin: 0 }}>{st.label}</Tag>
        if (r.entry.source === 'AUTO') return <Tag style={{ margin: 0 }}>自动</Tag>
        return <span style={{ color: '#bbb', fontSize: 12 }}>手动</span>
      }
    },
    {
      title: '工作内容 (Notes)',
      key: 'content',
      render: (_: any, r: any) => (
        <div style={{ minWidth: 260, color: '#595959', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {r.entry.content || r.entry.title || ''}
        </div>
      )
    },
    {
      title: '工时',
      key: 'hours',
      width: 65,
      align: 'center' as const,
      render: (_: any, r: any) => r.entry.hours != null
        ? <span style={{ fontWeight: 600, color: '#595959' }}>{Number(r.entry.hours)}h</span>
        : <span style={{ color: '#bbb' }}>—</span>
    },
    {
      title: '后续计划',
      key: 'plan',
      width: 150,
      onCell: (r: any) => ({ rowSpan: r.daySpan }),
      render: (_: any, r: any) => r.report.plan
        ? <span style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{r.report.plan}</span>
        : <span style={{ color: '#bbb' }}>—</span>
    },
    {
      title: '待办事项',
      key: 'todos',
      width: 165,
      onCell: (r: any) => ({ rowSpan: r.daySpan }),
      render: (_: any, r: any) => {
        const todos = Array.isArray(r.report.todos) ? r.report.todos : []
        if (todos.length === 0) return <span style={{ color: '#bbb' }}>—</span>
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {todos.map((t: string, i: number) => (
              <span key={i} style={{ fontSize: 13, color: '#595959', lineHeight: 1.6 }}>{i + 1}. {t}</span>
            ))}
          </div>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 125,
      onCell: (r: any) => ({ rowSpan: r.daySpan }),
      render: (_: any, r: any) => {
        const isOwner = r.report.userId === user?.id
        if (!isOwner) return <span style={{ color: '#bbb', fontSize: 12 }}>-</span>
        return (
          <Space size={0}>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r.report)}>编辑</Button>
            {/* 后端 DELETE /:id 实际用 office:dailyreport:add 鉴权（无独立 delete 权限点），前端保持一致 */}
            <Popconfirm title="确定要删除这天的日报吗?" onConfirm={() => handleDelete(r.report.id)} disabled={!checkPermission('office:dailyreport:add')}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!checkPermission('office:dailyreport:add')}>删除</Button>
            </Popconfirm>
          </Space>
        )
      }
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>工作日报</h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}><Statistic title="本月日报数" value={stats?.totalReports || 0} suffix="条" /></Col>
          <Col span={6}><Statistic title="本月记录条数" value={stats?.totalEntries || 0} suffix="条" valueStyle={{ color: '#1890ff' }} /></Col>
          <Col span={6}><Statistic title="本月待办事项" value={stats?.totalTodos || 0} suffix="项" valueStyle={{ color: '#fa8c16' }} /></Col>
          <Col span={6}><Statistic title="本月总工时" value={Number((stats?.totalHours || 0).toFixed(1))} precision={1} suffix="小时" /></Col>
        </Row>
      </Card>

      {/* 搜索与筛选 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} sm={6}>
            <Input
              placeholder="搜索工作内容(Notes)"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              placeholder={['开始日期', '结束日期']}
            />
          </Col>
          <Col xs={24} sm={4}>
            <Select style={{ width: '100%' }} placeholder="选择客户" allowClear value={filterOrgId} onChange={(val) => setFilterOrgId(val)} showSearch optionFilterProp="children">
              {organizations.map((org: any) => <Select.Option key={org.id} value={org.id}>{org.name}</Select.Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={4}>
            <Select style={{ width: '100%' }} placeholder="选择项目" allowClear value={filterProjectId} onChange={(val) => setFilterProjectId(val)} showSearch optionFilterProp="children">
              {projects.map(project => <Select.Option key={project.id} value={project.id}>{project.name}</Select.Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={4}>
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchReports(pagination.current, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!checkPermission('office:dailyreport:add')}>新增日报</Button>
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

      {/* 日报列表：一行=一条事情，同一天多行合并天级列 */}
      <Table
        columns={columns}
        dataSource={tableRows}
        loading={loading}
        rowKey={(r: any) => r.key}
        bordered
        size="middle"
        pagination={false}
        locale={{ emptyText: <Empty description="暂无日报" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      {/* 分页按"日报份数"走服务端；表格行是展开后的"事件条目"，行数远大于份数，
          若用 Table 内置分页会把 dataSource 按行截断（曾导致每页只显示前 10 行、后面的日报"消失"） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Pagination
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showSizeChanger
          showTotal={(total) => `共 ${total} 份日报`}
          onChange={(page, pageSize) => fetchReports(page, pageSize)}
        />
      </div>

      {/* 新增/编辑 Modal：一天多条事情 */}
      <Modal
        title={editingReport ? '编辑日报' : '新增日报'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { form.resetFields(); setModalVisible(false) }}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="reportDate" label="日期" rules={[{ required: true, message: '请选择日期' }]} style={{ marginBottom: 12 }}>
            <DatePicker style={{ width: 240 }} />
          </Form.Item>

          {editingReport && (editingReport.entries || []).some((e: any) => e.source === 'AUTO') && (
            <div style={{ marginBottom: 12, padding: '6px 12px', background: '#f6ffed', borderRadius: 6, fontSize: 12, color: '#52c41a' }}>
              当天有 {(editingReport.entries || []).filter((e: any) => e.source === 'AUTO').length} 条系统自动记录（开票/回款等操作自动生成），下方只需维护手动记录
            </div>
          )}

          <div style={{ fontWeight: 600, marginBottom: 8 }}>今日事情（可多条）</div>
          <Form.List name="entries">
            {(fields, { add, remove }) => (
              <>
                {fields.map(field => (
                  <div key={field.key} style={{ padding: 12, marginBottom: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                    <Row gutter={12}>
                      <Col span={9}>
                        <Form.Item name={[field.name, 'organizationId']} label="关联客户（可选）" style={{ marginBottom: 8 }}>
                          <Select placeholder="选择客户" allowClear showSearch optionFilterProp="children">
                            {organizations.map((org: any) => <Select.Option key={org.id} value={org.id}>{org.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={9}>
                        <Form.Item name={[field.name, 'projectId']} label="关联项目（可选）" style={{ marginBottom: 8 }}>
                          <Select placeholder="选择项目" allowClear showSearch optionFilterProp="children" onChange={(val) => handleEntryProjectChange(field.name, val)}>
                            {projects.map(project => <Select.Option key={project.id} value={project.id}>{project.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item name={[field.name, 'hours']} label="工时(h)" style={{ marginBottom: 8 }}>
                          <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.5} placeholder="0.5" />
                        </Form.Item>
                      </Col>
                      <Col span={2} style={{ textAlign: 'right', paddingTop: 30 }}>
                        <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: '#999', cursor: 'pointer', fontSize: 16 }} />
                      </Col>
                    </Row>
                    <Form.Item
                      name={[field.name, 'content']}
                      label="Notes 信息"
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: '请填写Notes信息' }]}
                    >
                      <Input.TextArea rows={3} placeholder="这件事做了什么" />
                    </Form.Item>
                    {/* 编辑时保留原条目ID与标题，后端据此做差量更新且不丢标题 */}
                    <Form.Item name={[field.name, 'id']} hidden><Input /></Form.Item>
                    <Form.Item name={[field.name, 'title']} hidden><Input /></Form.Item>
                  </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ organizationId: undefined, projectId: undefined, content: '' })} style={{ width: '100%', marginBottom: 16 }}>
                  添加一条
                </Button>
              </>
            )}
          </Form.List>

          <Form.Item name="plan" label="后续计划">
            <Input.TextArea rows={2} placeholder="填写后续工作计划（可选）" />
          </Form.Item>
          <Form.Item label="待办事项" style={{ marginBottom: 0 }}>
            <Form.List name="todos">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(field => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item name={field.name} noStyle>
                        <Input placeholder={`待办事项 ${field.name + 1}`} style={{ width: 540 }} />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: '#999', cursor: 'pointer' }} />
                    </Space>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} style={{ width: 580 }}>
                    添加待办事项
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="导入数据" open={importModalVisible} onCancel={() => setImportModalVisible(false)} footer={null}>
        <Upload.Dragger accept=".csv,.xlsx,.xls" beforeUpload={(file) => { handleImport(file); return false }} showUploadList={false}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-tip">支持 CSV、Excel 格式；旧版日报(列:日期/客户名/详细信息/待办事项)会自动识别</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default DailyReportList
