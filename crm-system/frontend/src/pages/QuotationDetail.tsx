import React, { useEffect, useState } from 'react'
import { Card, Descriptions, Tag, Button, Tabs, Table, Upload, message, Spin, Row, Col, Statistic, Modal } from 'antd'
import { ArrowLeftOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined, SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { getQuotationDetail, submitQuotation, approveQuotation, rejectQuotation, uploadQuotationFiles, deleteQuotationFile } from '../services/api'

const statusConfig: Record<string, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' }, SUBMITTED: { text: '已提交', color: 'processing' },
  APPROVED: { text: '已批准', color: 'success' }, REJECTED: { text: '已拒绝', color: 'error' },
  WON: { text: '中标', color: 'blue' }, LOST: { text: '未中标', color: 'orange' }
}

const QuotationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [quotation, setQuotation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDetail() }, [id])

  const fetchDetail = async () => {
    try { const data: any = await getQuotationDetail(parseInt(id!)); setQuotation(data) }
    catch { message.error('获取报价单详情失败') }
    setLoading(false)
  }

  const handleSubmit = async () => {
    try { await submitQuotation(parseInt(id!)); message.success('已提交'); fetchDetail() }
    catch (e: any) { message.error(e?.error || '提交失败') }
  }
  const handleApprove = async () => {
    try { await approveQuotation(parseInt(id!)); message.success('已批准'); fetchDetail() }
    catch (e: any) { message.error(e?.error || '审批失败') }
  }
  const handleReject = async () => {
    try { await rejectQuotation(parseInt(id!)); message.success('已拒绝'); fetchDetail() }
    catch (e: any) { message.error(e?.error || '操作失败') }
  }

  const handleFileUpload = async (file: File) => {
    try {
      const fileList = { length: 1, 0: file } as unknown as FileList
      await uploadQuotationFiles(parseInt(id!), fileList)
      message.success('上传成功'); fetchDetail()
    } catch { message.error('上传失败') }
    return false
  }

  const handleDeleteFile = (fileId: number) => {
    Modal.confirm({ title: '确认删除', content: '确定删除该文件？',
      onOk: async () => {
        try { await deleteQuotationFile(parseInt(id!), fileId); message.success('删除成功'); fetchDetail() }
        catch { message.error('删除失败') }
      }
    })
  }

  const handleDownload = (file: any) => {
    const token = localStorage.getItem('token')
    fetch(`/api/quotations/files/${file.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob()).then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = file.fileName
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(url)
      })
  }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
  if (!quotation) return <div>报价单不存在</div>

  const sc = statusConfig[quotation.status] || { text: quotation.status, color: 'default' }

  const itemColumns = [
    { title: '产品/服务', dataIndex: 'name', key: 'name' },
    { title: '规格描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, render: (v: number) => `¥${Number(v).toLocaleString()}` },
    { title: '小计', dataIndex: 'totalPrice', key: 'totalPrice', width: 120, render: (v: number) => <strong>¥{Number(v).toLocaleString()}</strong> },
    { title: '备注', dataIndex: 'remarks', key: 'remarks', ellipsis: true },
  ]

  const fileColumns = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    { title: '大小', dataIndex: 'fileSize', key: 'fileSize', width: 100, render: (s: number) => `${(s / 1024).toFixed(1)} KB` },
    { title: '上传时间', dataIndex: 'uploadedAt', key: 'uploadedAt', width: 160, render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
    { title: '操作', key: 'action', width: 100, render: (_: any, r: any) => (
      <span>
        <Button type="link" icon={<DownloadOutlined />} onClick={() => handleDownload(r)} />
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteFile(r.id)} />
      </span>
    )}
  ]

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/quotations')} style={{ marginBottom: 16 }}>返回列表</Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <h2 style={{ margin: 0 }}>{quotation.name} <Tag>v{quotation.version}</Tag> <Tag color={sc.color}>{sc.text}</Tag></h2>
            <p style={{ margin: '8px 0 0', color: '#666' }}>商机: {quotation.opportunity?.name || '-'} | 客户: {quotation.customer?.name || '-'}</p>
          </Col>
          <Col>
            {quotation.status === 'DRAFT' && <Button type="primary" icon={<SendOutlined />} onClick={handleSubmit} style={{ marginRight: 8 }}>提交审批</Button>}
            {quotation.status === 'SUBMITTED' && (<>
              <Button type="primary" icon={<CheckOutlined />} onClick={handleApprove} style={{ marginRight: 8 }}>批准</Button>
              <Button danger icon={<CloseOutlined />} onClick={handleReject}>拒绝</Button>
            </>)}
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card><Statistic title="报价总额" value={Number(quotation.totalAmount)} prefix="¥" precision={2} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={8}><Card><Statistic title="报价有效期" value={quotation.validUntil ? dayjs(quotation.validUntil).format('YYYY-MM-DD') : '未设置'} /></Card></Col>
        <Col span={8}><Card><Statistic title="明细数" value={quotation.items?.length || 0} suffix="项" /></Card></Col>
      </Row>

      <Card>
        <Tabs defaultActiveKey="items" items={[
          { key: 'info', label: '基本信息', children: (
            <Descriptions bordered column={2}>
              <Descriptions.Item label="报价单名称">{quotation.name}</Descriptions.Item>
              <Descriptions.Item label="版本号">v{quotation.version}</Descriptions.Item>
              <Descriptions.Item label="关联商机">{quotation.opportunity?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="客户">{quotation.customer?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{quotation.owner?.name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(quotation.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{quotation.notes || '-'}</Descriptions.Item>
            </Descriptions>
          )},
          { key: 'items', label: `报价明细 (${quotation.items?.length || 0})`, children: (
            <Table columns={itemColumns} dataSource={quotation.items || []} rowKey="id" pagination={false}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5} align="right"><strong>合计</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1}><strong>¥{Number(quotation.totalAmount).toLocaleString()}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                </Table.Summary.Row>
              )}
            />
          )},
          { key: 'files', label: `附件 (${quotation.files?.length || 0})`, children: (
            <div>
              <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png">
                <Button icon={<UploadOutlined />} type="primary" style={{ marginBottom: 16 }}>上传附件（报价单/方案书等）</Button>
              </Upload>
              <Table columns={fileColumns} dataSource={quotation.files || []} rowKey="id" pagination={false} />
            </div>
          )}
        ]} />
      </Card>
    </div>
  )
}

export default QuotationDetail
