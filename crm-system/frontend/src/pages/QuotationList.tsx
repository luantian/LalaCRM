import React, { useCallback, useEffect, useState } from 'react'
import { Table, Card, Button, Modal, Form, Input, Select, InputNumber, DatePicker, message, Tag, Row, Col, Statistic, Space, Popconfirm, Dropdown, Upload } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined, ImportOutlined, InboxOutlined, SendOutlined, CheckOutlined, CloseOutlined, MoreOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { OrgContactSelector } from '../components/OrgContactSelector'
import { getQuotations, createQuotation, updateQuotation, deleteQuotation, getQuotationStats, getOpportunities, getQuotationDetail, exportQuotationsCsv, exportQuotationsExcel, importQuotations, submitQuotation, approveQuotation, rejectQuotation, downloadQuotationImportTemplate, safeJsonParse } from '../services/api'
import { usePermission } from '../hooks/usePermission'
import { isAdmin } from '../utils/permission'

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
  const { checkPermission } = usePermission()
  const navigate = useNavigate()
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState<any>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [filters, setFilters] = useState<any>({})
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [stats, setStats] = useState<any>({})
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [importModalVisible, setImportModalVisible] = useState(false)
  const user = safeJsonParse(localStorage.getItem('user'), {})
  const admin = isAdmin()
  const canApprove = checkPermission('crm:quotation:approve')
  const [approveModalVisible, setApproveModalVisible] = useState(false)
  const [approveTarget, setApproveTarget] = useState<any>(null)
  const [approveDetail, setApproveDetail] = useState<any>(null)
  const [approveAction, setApproveAction] = useState<'approve' | 'reject'>('approve')
  const [approveRemark, setApproveRemark] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const response: any = await getQuotations({ page: pagination.current, pageSize: pagination.pageSize, ...filters })
      setQuotations(response.data || [])
      setPagination(prev => ({ ...prev, total: response.pagination?.total || 0 }))
    } catch (e: any) { message.error(e?.error || '获取报价单列表失败') }
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

  useEffect(() => {
    fetchQuotations()
    fetchStats()
    fetchOpportunities()
  }, [fetchQuotations, fetchStats]) // eslint-disable-line react-hooks/exhaustive-deps

  // 筛选:与其他列表页一致——选好条件后点"搜索"生效
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }))
    setFilters({ status: filterStatus || undefined, search: searchText.trim() || undefined })
  }

  const handleReset = () => {
    setSearchText('')
    setFilterStatus('')
    setPagination(prev => ({ ...prev, current: 1 }))
    setFilters({})
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      // 与列表查询同条件导出:筛选(状态/商机/客户/搜索)
      const blob: any = type === 'csv' ? await exportQuotationsCsv(filters) : await exportQuotationsExcel(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `报价单数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
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

  // 下载报价单导入模板(含填写说明)
  const handleDownloadTemplate = async () => {
    try {
      const blob: any = await downloadQuotationImportTemplate()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = '报价单导入模板.xlsx'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      message.error(e?.error || '模板下载失败')
    }
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

  // 删除：外层按钮已包 Popconfirm 确认（见操作列），此处直接执行，
  // 不再叠加 Modal.confirm 造成双重确认
  const handleDelete = async (id: number) => {
    try {
      await deleteQuotation(id)
      message.success('删除成功')
      fetchQuotations()
      fetchStats()
    } catch (e: any) {
      message.error(e?.error || '删除失败')
    }
  }

  // 提交审批：DRAFT → SUBMITTED
  const handleSubmitQuotation = async (id: number) => {
    try {
      await submitQuotation(id)
      message.success('已提交审批')
      fetchQuotations()
      fetchStats()
    } catch (e: any) {
      message.error(e?.error || '提交失败')
    }
  }

  // 打开审批弹窗（拉取明细供审批人查看）
  const handleOpenApproveModal = async (record: any, action: 'approve' | 'reject') => {
    setApproveTarget(record)
    setApproveAction(action)
    setApproveRemark('')
    setRejectReason('')
    setApproveDetail(null)
    setApproveModalVisible(true)
    try {
      const detail: any = await getQuotationDetail(record.id)
      setApproveDetail(detail)
    } catch (e: any) {
      message.error(e?.error || '获取报价明细失败')
    }
  }

  // 确认批准/驳回
  const handleConfirmApprove = async () => {
    if (!approveTarget) return
    if (approveAction === 'reject' && !rejectReason.trim()) {
      message.error('请填写驳回原因')
      return
    }
    try {
      if (approveAction === 'approve') {
        await approveQuotation(approveTarget.id, approveRemark.trim() || undefined)
        message.success('已批准')
      } else {
        await rejectQuotation(approveTarget.id, rejectReason.trim())
        message.success('已驳回')
      }
      setApproveModalVisible(false)
      fetchQuotations()
      fetchStats()
    } catch (e: any) {
      message.error(e?.error || '审批失败')
    }
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
    { title: '关联售前', key: 'opportunity', render: (_: any, r: any) => r.opportunity?.name || '-' },
    { title: '客户', key: 'organization', render: (_: any, r: any) => {
      const org = r.organization?.name || '-'
      const contact = r.contact ? `${r.contact.name}${r.contact.title ? ` (${r.contact.title})` : ''}` : ''
      return contact ? `${org} - ${contact}` : org
    }},
    { title: '报价总额', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: number | null) => v === null ? '-' : <strong>¥{Number(v).toLocaleString()}</strong> },
    { title: '有效期', dataIndex: 'validUntil', key: 'validUntil', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => { const c = statusConfig[s]; return c ? <Tag color={c.color}>{c.text}</Tag> : s }
    },
    { title: '创建人', key: 'owner', render: (_: any, r: any) => r.owner?.name || '-' },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right' as const,
      render: (_: any, record: any) => {
        const isOwner = record.ownerId === user.id
        // 后端规则：只有 DRAFT 可编辑/删除，且仅限本人（管理员例外）
        const canEdit = record.status === 'DRAFT' && (isOwner || admin)
        const canSubmit = canEdit && checkPermission('crm:quotation:edit')
        const canReview = record.status === 'SUBMITTED' && canApprove && (record.ownerId !== user.id || admin)

        const moreItems: any[] = []
        if (canSubmit) {
          moreItems.push({ key: 'submit', icon: <SendOutlined />, label: '提交审批', onClick: () => handleSubmitQuotation(record.id) })
        }
        if (canReview) {
          if (moreItems.length > 0) moreItems.push({ type: 'divider' })
          moreItems.push(
            { key: 'approve', icon: <CheckOutlined />, label: '批准', onClick: () => handleOpenApproveModal(record, 'approve') },
            { key: 'reject', icon: <CloseOutlined />, label: '驳回', danger: true, onClick: () => handleOpenApproveModal(record, 'reject') }
          )
        }

        return (
          <Space size={0}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/quotations/${record.id}`)}>查看</Button>
            {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>}
            {canEdit && (
              <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)} disabled={!checkPermission('crm:quotation:edit')}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!checkPermission('crm:quotation:edit')}>删除</Button>
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

  return (
    <div>
      <h2>报价单管理</h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="报价总额" value={stats.totalAmount || 0} prefix="¥" precision={2} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="总数" value={stats.total || 0} suffix="份" /></Card></Col>
        <Col span={6}><Card><Statistic title="草稿" value={stats.draft || 0} suffix="份" /></Card></Col>
        <Col span={6}><Card><Statistic title="中标" value={stats.won || 0} suffix="份" valueStyle={{ color: '#722ed1' }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索报价单"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="状态"
              value={filterStatus || undefined}
              onChange={(v) => setFilterStatus(v || '')}
              allowClear
              style={{ width: '100%' }}
            >
              {Object.entries(statusConfig).map(([k, v]) => <Option key={k} value={k}>{v.text}</Option>)}
            </Select>
          </Col>
          <Col>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} disabled={!checkPermission('crm:quotation:add') && !checkPermission('crm:quotation:edit')}>新建报价单</Button>
            <Dropdown menu={{ items: [
              { key: 'csv', icon: <DownloadOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
              { key: 'excel', icon: <DownloadOutlined />, label: '导出 Excel', onClick: () => handleExport('excel') },
              { type: 'divider' },
              { key: 'import', icon: <ImportOutlined />, label: '导入数据', onClick: () => setImportModalVisible(true) },
              { key: 'template', icon: <DownloadOutlined />, label: '下载导入模板', onClick: handleDownloadTemplate },
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
            <Col span={12}><Form.Item name="opportunityId" label="关联售前" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {opportunities.map(o => <Option key={o.id} value={o.id}>{o.name}</Option>)}
              </Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="contactId" label="客户" rules={[{ required: true }]}>
              <OrgContactSelector
                placeholder="请选择客户联系人"
                onContactSelect={(contactId, orgId) => {
                  form.setFieldValue('contactId', contactId)
                  form.setFieldValue('organizationId', orgId)
                }}
              />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="validUntil" label="报价有效期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="organizationId" hidden><Input /></Form.Item>
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
        <div style={{ marginTop: 12 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} block>
            没有现成文件？下载导入模板（含填写说明）
          </Button>
        </div>
      </Modal>

      <Modal
        title={approveAction === 'approve' ? '审批通过' : '驳回报价单'}
        open={approveModalVisible}
        onOk={handleConfirmApprove}
        onCancel={() => setApproveModalVisible(false)}
        okText={approveAction === 'approve' ? '确认批准' : '确认驳回'}
        okButtonProps={{ danger: approveAction === 'reject' }}
        width={720}
      >
        {approveTarget && (
          <>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, marginBottom: 16 }}>
              <div><strong>{approveTarget.name}</strong> <Tag>v{approveTarget.version}</Tag></div>
              <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                售前: {approveTarget.opportunity?.name || '-'} · 客户: {approveTarget.organization?.name || '-'} · 报价总额: <strong style={{ color: '#cf1322' }}>¥{Number(approveTarget.totalAmount || 0).toLocaleString()}</strong>
              </div>
            </div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>报价明细</div>
            <Table
              size="small" pagination={false} dataSource={approveDetail?.items || []} rowKey="id"
              columns={[
                { title: '产品/服务', dataIndex: 'name', key: 'name' },
                { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, render: (v: number, r: any) => `${v}${r.unit || ''}` },
                { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 110, render: (v: number) => `¥${Number(v).toLocaleString()}` },
                { title: '小计', dataIndex: 'totalPrice', key: 'totalPrice', width: 110, render: (v: number) => `¥${Number(v).toLocaleString()}` }
              ]}
            />
            <div style={{ marginTop: 16 }}>
              {approveAction === 'approve' ? (
                <Input.TextArea rows={2} placeholder="审批备注（可选）" value={approveRemark} onChange={e => setApproveRemark(e.target.value)} />
              ) : (
                <Input.TextArea rows={2} placeholder="请填写驳回原因（必填）" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default QuotationList
