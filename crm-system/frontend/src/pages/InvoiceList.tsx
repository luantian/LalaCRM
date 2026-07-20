import React, { useEffect, useState } from 'react'
import { Table, Card, Button, Modal, Form, Input, Select, InputNumber, DatePicker, message, Tag, Row, Col, Statistic, Space, Dropdown } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, FileTextOutlined, DashboardOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getInvoices, createInvoice, updateInvoice, deleteInvoice, getInvoiceStats, getProjects, getCustomers, getProcurements } from '../services/api'

const { Option } = Select

const invoiceTypeConfig: Record<string, { text: string; color: string }> = {
  INCOME: { text: '出项', color: 'blue' },
  EXPENSE: { text: '进项', color: 'green' }
}

const invoiceStatusConfig: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待处理', color: 'default' },
  ISSUED: { text: '已开/已收', color: 'processing' },
  CONFIRMED: { text: '已认证', color: 'success' },
  CANCELLED: { text: '已作废', color: 'error' }
}

const categoryOptions = [
  { value: 'VAT_SPECIAL', label: '增值税专用发票' },
  { value: 'VAT_NORMAL', label: '增值税普通发票' },
  { value: 'VAT_ELECTRONIC', label: '电子发票' },
  { value: 'RECEIPT', label: '收据' },
  { value: 'OTHER', label: '其他' }
]

interface Invoice {
  id: number
  invoiceNo: string
  invoiceType: string
  category: string
  amount: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  invoiceDate: string
  status: string
  partyName: string
  partyTaxNo: string
  remarks: string
  project?: { id: number; name: string }
  contract?: { id: number; name: string }
  procurement?: { id: number; title: string }
  owner: { id: number; name: string }
  createdAt: string
  _count?: { files: number }
}

const InvoiceList: React.FC = () => {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [filters, setFilters] = useState<any>({})
  const [stats, setStats] = useState<any>({})
  const [projects, setProjects] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])

  useEffect(() => {
    fetchInvoices()
    fetchStats()
    fetchProjects()
    fetchCustomers()
  }, [pagination.current, pagination.pageSize, filters])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const response: any = await getInvoices({
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...filters
      })
      setInvoices(response.data || [])
      setPagination(prev => ({ ...prev, total: response.pagination?.total || 0 }))
    } catch { message.error('获取发票列表失败') }
    setLoading(false)
  }

  const fetchStats = async () => {
    try {
      const response: any = await getInvoiceStats()
      setStats(response)
    } catch {}
  }

  const fetchProjects = async () => {
    try {
      const response: any = await getProjects({ pageSize: 1000 })
      setProjects(response.data || [])
    } catch {}
  }

  const fetchCustomers = async () => {
    try {
      const response: any = await getCustomers({ pageSize: 1000 })
      setCustomers(response.data || [])
    } catch {}
  }

  const handleCreate = () => {
    setEditingInvoice(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: Invoice) => {
    setEditingInvoice(record)
    form.setFieldsValue({
      ...record,
      invoiceDate: record.invoiceDate ? dayjs(record.invoiceDate) : null
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这条发票记录吗？',
      onOk: async () => {
        try {
          await deleteInvoice(id)
          message.success('删除成功')
          fetchInvoices()
          fetchStats()
        } catch { message.error('删除失败') }
      }
    })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        invoiceDate: values.invoiceDate ? values.invoiceDate.toDate() : null
      }
      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, data)
        message.success('更新成功')
      } else {
        await createInvoice(data)
        message.success('创建成功')
      }
      setModalVisible(false)
      form.resetFields()
      fetchInvoices()
      fetchStats()
    } catch {}
  }

  // Auto-calculate tax
  const amount = Form.useWatch('amount', form) || 0
  const taxRate = Form.useWatch('taxRate', form) || 0
  const calcTax = (Number(amount) * Number(taxRate) / 100).toFixed(2)
  const calcTotal = (Number(amount) + Number(calcTax)).toFixed(2)

  const columns = [
    {
      title: '发票号', dataIndex: 'invoiceNo', key: 'invoiceNo',
      render: (text: string, record: Invoice) => (
        <a onClick={() => navigate(`/invoices/${record.id}`)}>{text}</a>
      )
    },
    {
      title: '类型', dataIndex: 'invoiceType', key: 'invoiceType', width: 80,
      render: (type: string) => {
        const config = invoiceTypeConfig[type]
        return config ? <Tag color={config.color}>{config.text}</Tag> : type
      }
    },
    {
      title: '类别', dataIndex: 'category', key: 'category', width: 120,
      render: (cat: string) => categoryOptions.find(c => c.value === cat)?.label || cat
    },
    { title: '不含税金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${Number(v).toLocaleString()}` },
    { title: '税额', dataIndex: 'taxAmount', key: 'taxAmount', width: 100, render: (v: number) => `¥${Number(v).toLocaleString()}` },
    { title: '价税合计', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: number) => <strong>¥{Number(v).toLocaleString()}</strong> },
    { title: '对方单位', dataIndex: 'partyName', key: 'partyName', ellipsis: true },
    {
      title: '关联项目', key: 'project', width: 120, ellipsis: true,
      render: (_: any, r: Invoice) => r.project?.name || '-'
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => {
        const config = invoiceStatusConfig[s]
        return config ? <Tag color={config.color}>{config.text}</Tag> : s
      }
    },
    { title: '开票日期', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 110, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: Invoice) => (
        <Dropdown menu={{
          items: [
            { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => handleEdit(record) },
            { key: 'files', icon: <FileTextOutlined />, label: '附件管理', onClick: () => navigate(`/invoices/${record.id}`) },
            { type: 'divider' },
            { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDelete(record.id) }
          ]
        }}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      )
    }
  ]

  return (
    <div>
      <h2>发票管理</h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card><Statistic title="出项总额" value={stats.incomeTotal || 0} prefix="¥" precision={2} valueStyle={{ color: '#1890ff' }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="进项总额" value={stats.expenseTotal || 0} prefix="¥" precision={2} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="净税额" value={stats.netTax || 0} prefix="¥" precision={2} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="待处理" value={stats.pendingCount || 0} suffix="张" /></Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="类型" allowClear style={{ width: 100 }} onChange={v => setFilters((f: any) => ({ ...f, invoiceType: v || undefined }))}>
            <Option value="INCOME">出项</Option>
            <Option value="EXPENSE">进项</Option>
          </Select>
          <Select placeholder="状态" allowClear style={{ width: 120 }} onChange={v => setFilters((f: any) => ({ ...f, status: v || undefined }))}>
            <Option value="PENDING">待处理</Option>
            <Option value="ISSUED">已开/已收</Option>
            <Option value="CONFIRMED">已认证</Option>
            <Option value="CANCELLED">已作废</Option>
          </Select>
          <Input.Search placeholder="搜索发票号/单位" allowClear style={{ width: 200 }}
            onSearch={v => setFilters((f: any) => ({ ...f, search: v || undefined }))} />
        </Space>
      </Card>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建发票</Button>
        </div>
        <Table
          columns={columns}
          dataSource={invoices}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }}
          onChange={(pag) => setPagination(prev => ({ ...prev, current: pag.current || 1, pageSize: pag.pageSize || 10 }))}
        />
      </Card>

      <Modal
        title={editingInvoice ? '编辑发票' : '新建发票'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="invoiceNo" label="发票号码" rules={[{ required: true, message: '请输入发票号码' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="invoiceType" label="发票类型" rules={[{ required: true }]}>
                <Select>
                  <Option value="INCOME">出项发票（开给客户）</Option>
                  <Option value="EXPENSE">进项发票（供应商开出）</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="发票类别" initialValue="VAT_SPECIAL">
                <Select options={categoryOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue="PENDING">
                <Select>
                  <Option value="PENDING">待处理</Option>
                  <Option value="ISSUED">已开/已收</Option>
                  <Option value="CONFIRMED">已认证</Option>
                  <Option value="CANCELLED">已作废</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="amount" label="不含税金额" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber style={{ width: '100%' }} precision={2} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxRate" label="税率(%)" initialValue={13}>
                <InputNumber style={{ width: '100%' }} precision={2} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="税额/合计">
                <div style={{ lineHeight: '32px', color: '#666' }}>
                  ¥{calcTax} / <strong>¥{calcTotal}</strong>
                </div>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="partyName" label="对方单位">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="partyTaxNo" label="对方税号">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="invoiceDate" label="开票日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="projectId" label="关联项目">
                <Select allowClear placeholder="选择项目" showSearch optionFilterProp="children">
                  {projects.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contractId" label="关联合同ID">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default InvoiceList
