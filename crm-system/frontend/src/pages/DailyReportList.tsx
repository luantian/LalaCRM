import { useCallback, useEffect, useRef, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Card, Row, Col, Statistic, Tooltip, Descriptions, List, Divider, Popconfirm, TimePicker } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, DownloadOutlined, EyeOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { getDailyReports, createDailyReport, updateDailyReport, deleteDailyReport, getDailyReportStats, getProjects, exportDailyReports, getDailyReportItems, createDailyReportItem, updateDailyReportItem, deleteDailyReportItem } from '../services/api'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

function DailyReportList() {
  const [reports, setReports] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [viewingReport, setViewingReport] = useState<any>(null)
  const [editingReport, setEditingReport] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [stats, setStats] = useState<any>(null)
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>(undefined)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const searchTextRef = useRef(searchText)
  const dateRangeRef = useRef(dateRange)
  const filterProjectIdRef = useRef(filterProjectId)
  useEffect(() => { searchTextRef.current = searchText }, [searchText])
  useEffect(() => { dateRangeRef.current = dateRange }, [dateRange])
  useEffect(() => { filterProjectIdRef.current = filterProjectId }, [filterProjectId])

  // 工作条目相关状态
  const [items, setItems] = useState<any[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemFormVisible, setItemFormVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [itemForm] = Form.useForm()

  // 新建日报中的内联工作记录
  const [formItems, setFormItems] = useState<any[]>([])
  const [formItemModalVisible, setFormItemModalVisible] = useState(false)
  const [editingFormItem, setEditingFormItem] = useState<any>(null)
  const [formItemForm] = Form.useForm()

  const typeMap: Record<string, { text: string; color: string }> = {
    WORK: { text: '日常工作', color: 'default' },
    PRE_SALES: { text: '售前支持', color: 'blue' },
    PROJECT: { text: '项目实施', color: 'green' },
    MEETING: { text: '会议', color: 'orange' },
    TRAINING: { text: '培训', color: 'purple' },
    OTHER: { text: '其他', color: 'default' }
  }

  const fetchReports = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      const range = dateRangeRef.current
      if (range && range[0] && range[1]) {
        params.startDate = range[0].format('YYYY-MM-DD')
        params.endDate = range[1].format('YYYY-MM-DD')
      }
      if (filterProjectIdRef.current) {
        params.projectId = filterProjectIdRef.current
      }
      const response: any = await getDailyReports(params)
      setReports(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error('获取工作日报失败')
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
    fetchStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchReports()
  }, [refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchReports(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setDateRange(null)
    setFilterProjectId(undefined)
    setRefreshTrigger(prev => prev + 1)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchReports(page, pageSize)
  }

  const handleAdd = () => {
    setEditingReport(null)
    form.resetFields()
    form.setFieldsValue({ reportDate: dayjs() })
    setFormItems([])
    setModalVisible(true)
  }

  const handleEdit = async (report: any) => {
    setEditingReport(report)
    form.setFieldsValue({
      ...report,
      reportDate: dayjs(report.reportDate)
    })
    // 加载已有的工作记录
    try {
      const response: any = await getDailyReportItems(report.id)
      setFormItems(response || [])
    } catch {
      setFormItems([])
    }
    setModalVisible(true)
  }

  const handleView = (report: any) => {
    setViewingReport(report)
    setViewModalVisible(true)
    fetchItems(report.id)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteDailyReport(id)
      message.success('删除成功')
      fetchReports(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      // 从工作记录汇总时长
      const totalHours = formItems.reduce((sum, item) => sum + (Number(item.hours) || 0), 0)
      const data = {
        ...values,
        reportDate: values.reportDate.toDate(),
        hours: totalHours || null,
        content: formItems.map(i => i.title).join('；') || null
      }

      let reportId: number
      if (editingReport) {
        await updateDailyReport(editingReport.id, data)
        reportId = editingReport.id

        // 删除已移除的工作项
        const existingItemsRes: any = await getDailyReportItems(reportId)
        const existingItems = existingItemsRes || []
        const formItemIds = formItems.filter(i => i.id).map(i => i.id)
        for (const existing of existingItems) {
          if (!formItemIds.includes(existing.id)) {
            await deleteDailyReportItem(reportId, existing.id)
          }
        }

        message.success('更新成功')
      } else {
        const res: any = await createDailyReport(data)
        reportId = res.id
        message.success('创建成功')
      }

      // 保存工作记录
      for (const item of formItems) {
        const itemData = {
          title: item.title,
          content: item.content,
          projectId: item.projectId || null,
          hours: item.hours || null,
          timeType: item.timeType || 'NORMAL',
          priority: item.priority || 'MEDIUM',
          status: item.status || 'COMPLETED',
          result: item.result || null,
          startTime: item.startTime ? (dayjs.isDayjs(item.startTime) ? item.startTime.toDate() : new Date(item.startTime)) : null,
          endTime: item.endTime ? (dayjs.isDayjs(item.endTime) ? item.endTime.toDate() : new Date(item.endTime)) : null
        }
        if (item.id) {
          await updateDailyReportItem(reportId, item.id, itemData)
        } else {
          await createDailyReportItem(reportId, itemData)
        }
      }

      setModalVisible(false)
      setFormItems([])
      fetchReports(pagination.current, pagination.pageSize)
      fetchStats()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleExport = async () => {
    try {
      const response: any = await exportDailyReports({ search: searchText })
      const blob = new Blob([response], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `日报_${dayjs().format('YYYY-MM-DD')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) { message.error('导出失败') }
  }

  // 新建日报中的内联工作记录管理
  const handleAddFormItem = () => {
    setEditingFormItem(null)
    formItemForm.resetFields()
    formItemForm.setFieldsValue({ timeType: 'NORMAL', priority: 'MEDIUM', status: 'COMPLETED' })
    setFormItemModalVisible(true)
  }

  const handleEditFormItem = (item: any) => {
    setEditingFormItem(item)
    formItemForm.setFieldsValue({
      ...item,
      startTime: item.startTime ? dayjs(item.startTime) : null,
      endTime: item.endTime ? dayjs(item.endTime) : null
    })
    setFormItemModalVisible(true)
  }

  const handleSaveFormItem = async () => {
    try {
      const values = await formItemForm.validateFields()
      const itemData = {
        ...values,
        title: values.content ? (values.content.length > 30 ? values.content.slice(0, 30) + '...' : values.content) : '工作记录',
        startTime: values.startTime ? values.startTime.toDate() : null,
        endTime: values.endTime ? values.endTime.toDate() : null
      }
      if (editingFormItem) {
        setFormItems(formItems.map(i => i === editingFormItem ? { ...editingFormItem, ...itemData } : i))
      } else {
        setFormItems([...formItems, itemData])
      }
      setFormItemModalVisible(false)
    } catch { /* validation failed */ }
  }

  const handleDeleteFormItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index))
  }

  // 工作条目相关函数
  const fetchItems = async (reportId: number) => {
    setItemsLoading(true)
    try {
      const response: any = await getDailyReportItems(reportId)
      setItems(response || [])
    } catch (error) {
      console.error('获取工作条目失败:', error)
    } finally {
      setItemsLoading(false)
    }
  }

  const handleViewItem = (item: any) => {
    setEditingItem(item)
    itemForm.setFieldsValue({
      ...item,
      startTime: item.startTime ? dayjs(item.startTime) : null,
      endTime: item.endTime ? dayjs(item.endTime) : null
    })
    setItemFormVisible(true)
  }

  const handleAddItem = () => {
    setEditingItem(null)
    itemForm.resetFields()
    setItemFormVisible(true)
  }

  const handleDeleteItem = async (itemId: number) => {
    if (!viewingReport) return
    try {
      await deleteDailyReportItem(viewingReport.id, itemId)
      message.success('删除成功')
      fetchItems(viewingReport.id)
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmitItem = async () => {
    if (!viewingReport) return
    try {
      const values = await itemForm.validateFields()
      const data = {
        ...values,
        title: values.content ? (values.content.length > 30 ? values.content.slice(0, 30) + '...' : values.content) : '工作记录',
        startTime: values.startTime ? values.startTime.toDate() : null,
        endTime: values.endTime ? values.endTime.toDate() : null
      }

      if (editingItem) {
        await updateDailyReportItem(viewingReport.id, editingItem.id, data)
        message.success('更新成功')
      } else {
        await createDailyReportItem(viewingReport.id, data)
        message.success('创建成功')
      }
      setItemFormVisible(false)
      fetchItems(viewingReport.id)
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '日期',
      dataIndex: 'reportDate',
      key: 'reportDate',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: '姓名',
      key: 'userName',
      render: (_: any, record: any) => record.user?.name || '-'
    },
    {
      title: '项目',
      key: 'project',
      render: (_: any, record: any) => record.project?.name || '-'
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const t = typeMap[type] || { text: type, color: 'default' }
        return <Tag color={t.color}>{t.text}</Tag>
      }
    },
    {
      title: '工作内容',
      dataIndex: 'content',
      key: 'content',
      render: (content: string) => {
        if (!content) return '-'
        const truncated = content.length > 50 ? content.slice(0, 50) + '...' : content
        return (
          <Tooltip title={content}>
            <span>{truncated}</span>
          </Tooltip>
        )
      }
    },
    {
      title: '时长',
      dataIndex: 'hours',
      key: 'hours',
      render: (hours: number) => hours != null ? `${hours}小时` : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 16 }}>
        <h2>工作日报</h2>
      </div>

      {/* 统计信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="本月日报数" value={stats?.monthReportCount || 0} suffix="条" />
          </Col>
          <Col span={8}>
            <Statistic title="本月总工时" value={stats?.monthTotalHours || 0} precision={1} suffix="小时" />
          </Col>
          <Col span={8}>
            <Statistic title="待提交" value={stats?.pending || 0} suffix="条" valueStyle={{ color: '#faad14' }} />
          </Col>
        </Row>
      </Card>

      {/* 搜索与筛选 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索工作内容"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              placeholder={['开始日期', '结束日期']}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择项目"
              allowClear
              value={filterProjectId}
              onChange={(val) => setFilterProjectId(val)}
              showSearch
              optionFilterProp="children"
            >
              {projects.map(project => (
                <Select.Option key={project.id} value={project.id}>
                  {project.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={24}>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增日报</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={reports}
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

      {/* 新增/编辑 Modal */}
      <Modal
        title={editingReport ? '编辑日报' : '新增日报'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { form.resetFields(); setFormItems([]); setModalVisible(false) }}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="reportDate" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="类型" initialValue="WORK">
                <Select>
                  <Select.Option value="WORK">日常工作</Select.Option>
                  <Select.Option value="PRE_SALES">售前支持</Select.Option>
                  <Select.Option value="PROJECT">项目实施</Select.Option>
                  <Select.Option value="MEETING">会议</Select.Option>
                  <Select.Option value="TRAINING">培训</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="plan" label="明日计划">
            <Input.TextArea rows={3} placeholder="请输入明日计划" />
          </Form.Item>
          <Form.Item name="issues" label="问题与困难">
            <Input.TextArea rows={3} placeholder="请输入问题与困难" />
          </Form.Item>
        </Form>

        <Divider orientation="left" plain>
          工作记录 ({formItems.length})
          {formItems.length > 0 && (
            <span style={{ fontWeight: 'normal', color: '#999', fontSize: 12, marginLeft: 8 }}>
              共 {formItems.reduce((s, i) => s + (Number(i.hours) || 0), 0)} 小时
            </span>
          )}
        </Divider>
        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddFormItem} style={{ width: '100%', marginBottom: 12 }}>
          添加工作记录
        </Button>
        {formItems.length > 0 && (
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {formItems.map((item, index) => (
              <div key={index} style={{
                padding: '8px 12px',
                marginBottom: 8,
                background: '#f8fafc',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.content?.length > 30 ? item.content.slice(0, 30) + '...' : item.content}</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {item.hours && <span>{item.hours}小时</span>}
                    {item.timeType && item.timeType !== 'NORMAL' && (
                      <Tag color={item.timeType === 'OVERTIME' ? 'red' : 'orange'} style={{ marginLeft: 4, fontSize: 11 }}>
                        {item.timeType === 'OVERTIME' ? '加班' : '请假'}
                      </Tag>
                    )}
                    <Tag color={item.status === 'COMPLETED' ? 'green' : 'blue'} style={{ marginLeft: 4, fontSize: 11 }}>
                      {item.status === 'COMPLETED' ? '已完成' : '进行中'}
                    </Tag>
                  </div>
                </div>
                <Space size={4}>
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditFormItem(item)} />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteFormItem(index)} />
                </Space>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 查看 Modal */}
      <Modal
        title="日报详情"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={<Button onClick={() => setViewModalVisible(false)}>关闭</Button>}
        width={900}
      >
        {viewingReport && (
          <div>
            {/* 基本信息 */}
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="日期">
                {dayjs(viewingReport.reportDate).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="姓名">
                {viewingReport.user?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="项目" span={2}>
                {viewingReport.project?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {(() => {
                  const t = typeMap[viewingReport.type] || { text: viewingReport.type, color: 'default' }
                  return <Tag color={t.color}>{t.text}</Tag>
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="时长">
                {viewingReport.hours != null ? `${viewingReport.hours}小时` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="工作内容" span={2}>
                {viewingReport.content || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="明日计划" span={2}>
                {viewingReport.plan || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="问题与困难" span={2}>
                {viewingReport.issues || '-'}
              </Descriptions.Item>
            </Descriptions>

            {/* 工作记录 */}
            <Divider orientation="left">
              <Space>
                <CheckCircleOutlined />
                工作记录 ({items.length})
              </Space>
            </Divider>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddItem}
              style={{ marginBottom: 16 }}
            >
              添加工作记录
            </Button>
            <List
              loading={itemsLoading}
              dataSource={items}
              renderItem={(item: any) => (
                <List.Item
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleViewItem(item)}
                    >
                      编辑
                    </Button>,
                    <Popconfirm
                      title="确定删除此工作记录吗？"
                      onConfirm={() => handleDeleteItem(item.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={8}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>优先级</span>
                        <Tag color={item.priority === 'HIGH' ? 'red' : item.priority === 'MEDIUM' ? 'orange' : 'blue'}>
                          {item.priority === 'HIGH' ? '高' : item.priority === 'MEDIUM' ? '中' : '低'}
                        </Tag>
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>状态</span>
                        <Tag color={item.status === 'COMPLETED' ? 'green' : item.status === 'IN_PROGRESS' ? 'blue' : 'red'}>
                          {item.status === 'COMPLETED' ? '已完成' : item.status === 'IN_PROGRESS' ? '进行中' : item.status === 'DELAYED' ? '延期' : '取消'}
                        </Tag>
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>工时</span>
                        <Tag color={item.timeType === 'OVERTIME' ? 'red' : item.timeType === 'LEAVE' ? 'orange' : item.timeType === 'OTHER' ? 'default' : 'cyan'}>
                          {item.timeType === 'OVERTIME' ? '加班' : item.timeType === 'LEAVE' ? '请假' : item.timeType === 'OTHER' ? '其他' : '正常'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <div>{item.content}</div>
                        {item.result && <div style={{ color: '#52c41a', marginTop: 4 }}>成果：{item.result}</div>}
                        <div style={{ marginTop: 4, color: '#999' }}>
                          {item.project && <span>项目：{item.project.name} | </span>}
                          {item.hours != null && <span>工时：{item.hours}小时</span>}
                          {item.startTime && item.endTime && (
                            <span> | {dayjs(item.startTime).format('HH:mm')} - {dayjs(item.endTime).format('HH:mm')}</span>
                          )}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>

      {/* 工作记录表单 Modal */}
      <Modal
        title={editingItem ? '编辑工作记录' : '添加工作记录'}
        open={itemFormVisible}
        onOk={handleSubmitItem}
        onCancel={() => setItemFormVisible(false)}
        width={600}
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item name="projectId" label="关联项目">
            <Select placeholder="请选择项目（可选）" allowClear showSearch optionFilterProp="children">
              {projects.map(project => (
                <Select.Option key={project.id} value={project.id}>
                  {project.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="工作内容" rules={[{ required: true, message: '请输入工作内容' }]}>
            <Input.TextArea rows={3} placeholder="请输入工作内容" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="hours" label="工时（小时）">
                <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.5} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="timeType" label="工时类型" initialValue="NORMAL">
                <Select>
                  <Select.Option value="NORMAL">正常</Select.Option>
                  <Select.Option value="OVERTIME">加班</Select.Option>
                  <Select.Option value="LEAVE">请假</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级" initialValue="MEDIUM">
                <Select>
                  <Select.Option value="LOW">低</Select.Option>
                  <Select.Option value="MEDIUM">中</Select.Option>
                  <Select.Option value="HIGH">高</Select.Option>
                  <Select.Option value="URGENT">紧急</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="status" label="状态" initialValue="COMPLETED">
                <Select>
                  <Select.Option value="COMPLETED">已完成</Select.Option>
                  <Select.Option value="IN_PROGRESS">进行中</Select.Option>
                  <Select.Option value="DELAYED">延期</Select.Option>
                  <Select.Option value="CANCELLED">取消</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="startTime" label="开始时间">
                <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="选择开始时间" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="endTime" label="结束时间">
                <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="选择结束时间" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="result" label="工作成果">
            <Input.TextArea rows={2} placeholder="请输入工作成果（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建日报中的工作记录编辑弹窗 */}
      <Modal
        title={editingFormItem ? '编辑工作记录' : '添加工作记录'}
        open={formItemModalVisible}
        onOk={handleSaveFormItem}
        onCancel={() => setFormItemModalVisible(false)}
        width={550}
        style={{ top: 20 }}
      >
        <Form form={formItemForm} layout="vertical">
          <Form.Item name="projectId" label="关联项目">
            <Select placeholder="可选" allowClear showSearch optionFilterProp="children">
              {projects.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="工作内容" rules={[{ required: true, message: '请输入工作内容' }]}>
            <Input.TextArea rows={2} placeholder="具体做了什么" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="hours" label="工时">
                <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.5} placeholder="小时" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="timeType" label="类型" initialValue="NORMAL">
                <Select>
                  <Select.Option value="NORMAL">正常</Select.Option>
                  <Select.Option value="OVERTIME">加班</Select.Option>
                  <Select.Option value="LEAVE">请假</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="priority" label="优先级" initialValue="MEDIUM">
                <Select>
                  <Select.Option value="LOW">低</Select.Option>
                  <Select.Option value="MEDIUM">中</Select.Option>
                  <Select.Option value="HIGH">高</Select.Option>
                  <Select.Option value="URGENT">紧急</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="status" label="状态" initialValue="COMPLETED">
                <Select>
                  <Select.Option value="COMPLETED">已完成</Select.Option>
                  <Select.Option value="IN_PROGRESS">进行中</Select.Option>
                  <Select.Option value="DELAYED">延期</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="startTime" label="开始时间">
                <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="可选" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endTime" label="结束时间">
                <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="result" label="工作成果">
            <Input.TextArea rows={2} placeholder="产出/成果（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DailyReportList
