import React, { useEffect, useState } from 'react'
import { Card, Descriptions, Tag, Button, Tabs, Table, Upload, message, Spin, Row, Col, Statistic, Modal, Form, Input, InputNumber, Select, DatePicker } from 'antd'
import { ArrowLeftOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { getInvoiceDetail, updateInvoice, uploadInvoiceFiles, deleteInvoiceFile } from '../services/api'

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
const categoryMap: Record<string, string> = {
  VAT_SPECIAL: '增值税专用发票', VAT_NORMAL: '增值税普通发票',
  VAT_ELECTRONIC: '电子发票', RECEIPT: '收据', OTHER: '其他'
}

interface InvoiceFile {
  id: number; fileName: string; fileSize: number; fileType: string; uploadedAt: string
}

interface InvoiceDetail {
  id: number; invoiceNo: string; invoiceType: string; category: string
  amount: number; taxRate: number; taxAmount: number; totalAmount: number
  invoiceDate: string; status: string; partyName: string; partyTaxNo: string
  remarks: string; createdAt: string
  project?: { id: number; name: string }
  contract?: { id: number; name: string }
  procurement?: { id: number; title: string }
  owner: { id: number; name: string }
  files: InvoiceFile[]
}

const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editVisible, setEditVisible] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => { fetchDetail() }, [id])

  const fetchDetail = async () => {
    try {
      const data: any = await getInvoiceDetail(parseInt(id!))
      setInvoice(data)
    } catch { message.error('获取发票详情失败') }
    setLoading(false)
  }

  const handleFileUpload = async (file: File) => {
    try {
      const fileList = { length: 1, 0: file } as unknown as FileList
      await uploadInvoiceFiles(parseInt(id!), fileList)
      message.success('上传成功')
      fetchDetail()
    } catch { message.error('上传失败') }
    return false
  }

  const handleDeleteFile = async (fileId: number) => {
    Modal.confirm({
      title: '确认删除', content: '确定删除该文件？',
      onOk: async () => {
        try {
          await deleteInvoiceFile(parseInt(id!), fileId)
          message.success('删除成功')
          fetchDetail()
        } catch { message.error('删除失败') }
      }
    })
  }

  const handleDownload = (file: InvoiceFile) => {
    const token = localStorage.getItem('token')
    const url = `/api/invoices/files/${file.id}/download`
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
  }

  const handleEdit = () => {
    if (!invoice) return
    form.setFieldsValue({
      ...invoice,
      invoiceDate: invoice.invoiceDate ? dayjs(invoice.invoiceDate) : null
    })
    setEditVisible(true)
  }

  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields()
      await updateInvoice(parseInt(id!), {
        ...values,
        invoiceDate: values.invoiceDate ? values.invoiceDate.toDate() : null
      })
      message.success('更新成功')
      setEditVisible(false)
      fetchDetail()
    } catch {}
  }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
  if (!invoice) return <div>发票不存在</div>

  const typeConfig = invoiceTypeConfig[invoice.invoiceType] || { text: invoice.invoiceType, color: 'default' }
  const statusConfig = invoiceStatusConfig[invoice.status] || { text: invoice.status, color: 'default' }

  const fileColumns = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    { title: '大小', dataIndex: 'fileSize', key: 'fileSize', width: 100, render: (s: number) => `${(s / 1024).toFixed(1)} KB` },
    { title: '上传时间', dataIndex: 'uploadedAt', key: 'uploadedAt', width: 160, render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: InvoiceFile) => (
        <span>
          <Button type="link" icon={<DownloadOutlined />} onClick={() => handleDownload(record)} />
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteFile(record.id)} />
        </span>
      )
    }
  ]

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/invoices')} style={{ marginBottom: 16 }}>返回列表</Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <h2 style={{ margin: 0 }}>
              {invoice.invoiceNo}
              <Tag color={typeConfig.color} style={{ marginLeft: 12 }}>{typeConfig.text}</Tag>
              <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
            </h2>
          </Col>
          <Col>
            <Button icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="不含税金额" value={Number(invoice.amount)} prefix="¥" precision={2} /></Card></Col>
        <Col span={6}><Card><Statistic title="税额" value={Number(invoice.taxAmount)} prefix="¥" precision={2} /></Card></Col>
        <Col span={6}><Card><Statistic title="价税合计" value={Number(invoice.totalAmount)} prefix="¥" precision={2} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="税率" value={Number(invoice.taxRate)} suffix="%" precision={2} /></Card></Col>
      </Row>

      <Card>
        <Tabs defaultActiveKey="info" items={[
          {
            key: 'info', label: '基本信息',
            children: (
              <Descriptions bordered column={2}>
                <Descriptions.Item label="发票号码">{invoice.invoiceNo}</Descriptions.Item>
                <Descriptions.Item label="发票类别">{categoryMap[invoice.category] || invoice.category}</Descriptions.Item>
                <Descriptions.Item label="对方单位">{invoice.partyName || '-'}</Descriptions.Item>
                <Descriptions.Item label="对方税号">{invoice.partyTaxNo || '-'}</Descriptions.Item>
                <Descriptions.Item label="开票日期">{invoice.invoiceDate ? dayjs(invoice.invoiceDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
                <Descriptions.Item label="创建人">{invoice.owner?.name}</Descriptions.Item>
                <Descriptions.Item label="创建时间" span={2}>{dayjs(invoice.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                <Descriptions.Item label="备注" span={2}>{invoice.remarks || '-'}</Descriptions.Item>
              </Descriptions>
            )
          },
          {
            key: 'relation', label: '关联信息',
            children: (
              <Descriptions bordered column={1}>
                <Descriptions.Item label="关联项目">
                  {invoice.project ? <a onClick={() => navigate(`/projects/${invoice.project!.id}`)}>{invoice.project.name}</a> : '未关联'}
                </Descriptions.Item>
                <Descriptions.Item label="关联合同">
                  {invoice.contract ? <span>{invoice.contract.name}</span> : '未关联'}
                </Descriptions.Item>
                <Descriptions.Item label="关联采购">
                  {invoice.procurement ? <span>{invoice.procurement.title}</span> : '未关联'}
                </Descriptions.Item>
              </Descriptions>
            )
          },
          {
            key: 'files', label: `附件 (${invoice.files?.length || 0})`,
            children: (
              <div>
                <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx">
                  <Button icon={<UploadOutlined />} type="primary" style={{ marginBottom: 16 }}>上传发票扫描件</Button>
                </Upload>
                <Table columns={fileColumns} dataSource={invoice.files || []} rowKey="id" pagination={false} />
              </div>
            )
          }
        ]} />
      </Card>

      <Modal title="编辑发票" open={editVisible} onOk={handleEditSubmit} onCancel={() => setEditVisible(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="invoiceNo" label="发票号码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="status" label="状态">
            <Select>
              <Select.Option value="PENDING">待处理</Select.Option>
              <Select.Option value="ISSUED">已开/已收</Select.Option>
              <Select.Option value="CONFIRMED">已认证</Select.Option>
              <Select.Option value="CANCELLED">已作废</Select.Option>
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="amount" label="不含税金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="taxRate" label="税率(%)"><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="invoiceDate" label="开票日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="partyName" label="对方单位"><Input /></Form.Item>
          <Form.Item name="partyTaxNo" label="对方税号"><Input /></Form.Item>
          <Form.Item name="remarks" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default InvoiceDetailPage
