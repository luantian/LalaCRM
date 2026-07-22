import React, { useCallback, useEffect, useState } from 'react'
import { Table, Card, Button, Modal, Form, Input, Select, InputNumber, DatePicker, message, Tag, Row, Col, Statistic, Space, Popconfirm, Dropdown, Upload } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getQuotations, createQuotation, updateQuotation, deleteQuotation, getQuotationStats, getOpportunities, getCustomers, getQuotationDetail, exportQuotationsCsv, exportQuotationsExcel, importQuotations } from '../services/api'

const { Option } = Select

const statusConfig: Record<string, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' },
  SUBMITTED: { text: '已提交', color: 'processing' },
  APPROVED: { text: '已批准', color: 'success' },
  REJECTED: { text: '已拒绝', color: 'error' },
  WON: { text: '中标', color: 'blue' },
  LOST: { text: '未中标', color: 'orange' }
}

const QuotationList: React.FC = () => {
  const navigate = useNavigate()
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [filters, setFilters] = useState<any>({})
  const [stats, setStats] = useState<any>({})
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [importModalVisible, setImportModalVisible] = useState(false)

  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const response: any = await getQuotations({ page: pagination.current, pageSize: pagination.pageSize, ...filters })
      setQuotations(response.data || [])
      setPagination(prev => ({ ...prev, total: response.pagination?.total || 0 }))
    } catch { message.error('获取报价单列表失败') }
    setLoading(false)
  }, [pagination.current, pagination.pageSize, filters])

  const fetchStats = useCallback(async () => {
    try { const res: any = await getQuotationStats(); setStats(res) } catch (e) { console.error(e) }
  }, [])

  const fetchOpportunities = async () => {
    try {
      const res: any = await getOpportunities({ pageSize: 1000 })
      setOpportunities(res.data || [])
    } catch (e) { console.error(e) }
  }

  const fetchCustomers = async () => {
    try {
      const res: any = await getCustomers({ pageSize: 1000 })
      setCustomers(res.data || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    fetchQuotations()
    fetchStats()
    fetchOpportunities()
    fetchCustomers()
  }, [fetchQuotations, fetchStats]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportQuotationsCsv() : await exportQuotationsExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `报价单数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch { message.error('导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importQuotations(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchQuotations()
    } catch (e: any) { message.error(e?.error || '导入失败') }
    return false
  }

  const handleCreate = () => {
    setEditingQuotation(null)
    form.resetFields()
    setItems([])
    setModalVisible(true)
  }

  const handleEdit = async (record: any) => {
    if (record.status !== 'DRAFT') {
      message.warning('只有草稿状态可以编辑')
      return
    }
    setEditingQuotation(record)
    form.setFieldsValue({ ...record, validUntil: record.validUntil ? dayjs(record.validUntil) : null })
    // Load items
    try {
      const detail: any = await getQuotationDetail(record.id)
      setItems(detail.items || [])
    } catch (e: any) { message.error(e?.error || '操作失败') }
    setModalVisible(true)
  }

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除', content: '确定要删除这条报价单吗？',
      onOk: async () => {
        try { await deleteQuotation(id); message.success('删除成功'); fetchQuotations(); fetchStats() }
        catch (e: any) { message.error(e?.error || '删除失败') }
      }
    })
  }

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, unit: '套', unitPrice: 0 }])
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields()
      const totalAmount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
      const data = {
        ...values,
        validUntil: values.validUntil ? values.validUntil.toDate() : null,
        items,
        totalAmount
      }
      if (editingQuotation) {
        await updateQuotation(editingQuotation.id, data)
        message.success('更新成功')
      } else {
        await createQuotation(data)
        message.success('创建成功')
      }
      setModalVisible(false)
      form.resetFields()
      setItems([])
      fetchQuotations()
      fetchStats()
    } catch (e: any) { message.error(e?.error || '操作失败') }
  }

  const columns = [
    { title: '报价单', dataIndex: 'name', key: 'name', render: (text: string, r: any) => <a onClick={() => navigate(`/quotations/${r.id}`)}>{text} <Tag>v{r.version}</Tag></a> },
    { title: '关联商机', key: 'opportunity', render: (_: any, r: any) => r.opportunity?.name || '-' },
    { title: '客户', key: 'customer', render: (_: any, r: any) => r.customer?.name || '-' },
    { title: '报价总额', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: number) => <strong>¥{Number(v).toLocaleString()}</strong> },
    { title: '有效期', dataIndex: 'validUntil', key: 'validUntil', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => { const c = statusConfig[s]; return c ? <Tag color={c.color}>{c.text}</Tag> : s }
    },
    { title: '创建人', key: 'owner', render: (_: any, r: any) => r.owner?.name || '-' },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/quotations/${record.id}`)}>查看</Button>
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
      <h2>报价单管理</h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="报价总额" value={stats.totalAmount || 0} prefix="¥" precision={2} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="总数" value={stats.total || 0} suffix="份" /></Card></Col>
        <Col span={6}><Card><Statistic title="草稿" value={stats.draft || 0} suffix="份" /></Card></Col>
        <Col span={6}><Card><Statistic title="中标" value={stats.won || 0} suffix="份" valueStyle={{ color: '#722ed1' }} /></Card></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="状态" allowClear style={{ width: 120 }} onChange={v => { setFilters((f: any) => ({ ...f, status: v || undefined })); setPagination(prev => ({ ...prev, current: 1 })) }}>
            {Object.entries(statusConfig).map(([k, v]) => <Option key={k} value={k}>{v.text}</Option>)}
          </Select>
          <Input.Search placeholder="搜索报价单" allowClear style={{ width: 200 }} onSearch={v => { setFilters((f: any) => ({ ...f, search: v || undefined })); setPagination(prev => ({ ...prev, current: 1 })) }} />
        </Space>
      </Card>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建报价单</Button>
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
        <Table columns={columns} dataSource={quotations} rowKey="id" loading={loading}
          scroll={{ x: 1200 }}
          pagination={{ ...pagination, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          onChange={(pag) => setPagination(prev => ({ ...prev, current: pag.current || 1, pageSize: pag.pageSize || 10 }))}
        />
      </Card>

      <Modal title={editingQuotation ? '编辑报价单' : '新建报价单'} open={modalVisible} onOk={handleFormSubmit} onCancel={() => { form.resetFields(); setItems([]); setModalVisible(false) }} width={800}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="name" label="报价单名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="opportunityId" label="关联商机" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {opportunities.map(o => <Option key={o.id} value={o.id}>{o.name}</Option>)}
              </Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="customerId" label="客户" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {customers.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
              </Select>
            </Form.Item></Col>
            <Col span={12}><Form.Item name="validUntil" label="报价有效期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <strong>报价明细</strong>
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addItem}>添加行</Button>
          </div>
          <Table
            size="small" pagination={false} dataSource={items} rowKey={(_, i) => String(i)}
            columns={[
              { title: '产品/服务', dataIndex: 'name', render: (v: string, _: any, i: number) => <Input size="small" value={v} onChange={e => updateItem(i, 'name', e.target.value)} /> },
              { title: '数量', dataIndex: 'quantity', width: 80, render: (v: number, _: any, i: number) => <InputNumber size="small" min={1} value={v} onChange={v => updateItem(i, 'quantity', v)} /> },
              { title: '单位', dataIndex: 'unit', width: 80, render: (v: string, _: any, i: number) => <Input size="small" value={v} onChange={e => updateItem(i, 'unit', e.target.value)} /> },
              { title: '单价', dataIndex: 'unitPrice', width: 120, render: (v: number, _: any, i: number) => <InputNumber size="small" min={0} precision={2} value={v} onChange={v => updateItem(i, 'unitPrice', v)} /> },
              { title: '小计', width: 120, render: (_: any, r: any) => `¥${((Number(r.quantity) || 0) * (Number(r.unitPrice) || 0)).toLocaleString()}` },
              { title: '', width: 40, render: (_: any, __: any, i: number) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeItem(i)} /> },
            ]}
            summary={() => <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4} align="right"><strong>合计</strong></Table.Summary.Cell><Table.Summary.Cell index={1}><strong>¥{items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0).toLocaleString()}</strong></Table.Summary.Cell><Table.Summary.Cell index={2} /></Table.Summary.Row>}
          />
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

export default QuotationList
