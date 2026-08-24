import React, { useEffect, useState } from 'react'
import { Card, Descriptions, Tag, Button, Tabs, Table, Upload, message, Spin, Row, Col, Space, Popconfirm, Modal, Input } from 'antd'
import { ArrowLeftOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { getQuotationDetail, uploadQuotationFiles, deleteQuotationFile, downloadQuotationFile, downloadFile, previewQuotationFileUrl, openFilePreview, isPreviewableFile, submitQuotation, approveQuotation, rejectQuotation, safeJsonParse } from '../services/api'
import { usePermission } from '../hooks/usePermission'
import { isAdmin } from '../utils/permission'

const statusConfig: Record<string, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' }, SUBMITTED: { text: '已提交', color: 'processing' },
  APPROVED: { text: '已批准', color: 'success' }, REJECTED: { text: '已拒绝', color: 'error' },
  WON: { text: '中标', color: 'blue' }, LOST: { text: '未中标', color: 'orange' }
}

const QuotationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { checkPermission } = usePermission()
  const user = safeJsonParse(localStorage.getItem('user'), {})
  const admin = isAdmin()
  const canApprove = checkPermission('crm:quotation:approve')
  const [quotation, setQuotation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [rejectModalVisible, setRejectModalVisible] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => { fetchDetail() }, [id])

  const fetchDetail = async () => {
    try { const data: any = await getQuotationDetail(parseInt(id!)); setQuotation(data) }
    catch (e: any) { message.error(e?.error || '获取报价单详情失败') }
    setLoading(false)
  }

  const handleFileUpload = async (file: File) => {
    try {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      await uploadQuotationFiles(parseInt(id!), dataTransfer.files)
      message.success('上传成功'); fetchDetail()
    } catch (e: any) { message.error(e?.error || '上传失败') }
    return false
  }

  // 删除：外层按钮已包 Popconfirm 确认（见附件列表），直接执行，不叠加双重确认
  const handleDeleteFile = async (fileId: number) => {
    try {
      await deleteQuotationFile(parseInt(id!), fileId)
      message.success('删除成功')
      fetchDetail()
    } catch (e: any) {
      message.error(e?.error || '删除失败')
    }
  }

  const handleDownload = async (file: any) => {
    try {
      await downloadFile(downloadQuotationFile, file.id, file.fileName)
    } catch {
      message.error('下载失败')
    }
  }

  // 提交审批：DRAFT → SUBMITTED
  const handleSubmit = async () => {
    try {
      await submitQuotation(parseInt(id!))
      message.success('已提交审批')
      fetchDetail()
    } catch (e: any) {
      message.error(e?.error || '提交失败')
    }
  }

  // 批准（明细已在页面上，直接确认即可）
  const handleApprove = async () => {
    try {
      await approveQuotation(parseInt(id!))
      message.success('已批准')
      fetchDetail()
    } catch (e: any) {
      message.error(e?.error || '审批失败')
    }
  }

  // 驳回需填原因
  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      message.error('请填写驳回原因')
      return
    }
    try {
      await rejectQuotation(parseInt(id!), rejectReason.trim())
      message.success('已驳回')
      setRejectModalVisible(false)
      setRejectReason('')
      fetchDetail()
    } catch (e: any) {
      message.error(e?.error || '驳回失败')
    }
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
    { title: '操作', key: 'action', width: 280, render: (_: any, r: any) => (
      <Space size={0}>
        {isPreviewableFile(r.fileName) && (
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openFilePreview(previewQuotationFileUrl, r.id)}>查看</Button>
        )}
        <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(r)}>下载</Button>
        <Popconfirm title="确定要删除吗?" onConfirm={() => handleDeleteFile(r.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </Space>
    )}
  ]

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/quotations')} style={{ marginBottom: 16 }}>返回列表</Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" wrap={false}>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{quotation.name}</h3>
              <Tag>v{quotation.version}</Tag>
              <Tag color={sc.color}>{sc.text}</Tag>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>|</span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>报价总额: <strong style={{ color: '#cf1322' }}>{quotation.totalAmount === null ? '—' : `¥${Number(quotation.totalAmount).toLocaleString()}`}</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>有效期: <strong style={{ color: '#2563eb' }}>{quotation.validUntil ? dayjs(quotation.validUntil).format('YYYY-MM-DD') : '未设置'}</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>明细: <strong style={{ color: '#7c3aed' }}>{quotation.items?.length || 0}项</strong></span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>售前: {quotation.opportunity?.name || '-'} · 客户: {(() => { const org = quotation.organization?.name || '-'; const contact = quotation.contact ? `${quotation.contact.name}${quotation.contact.title ? ` (${quotation.contact.title})` : ''}` : ''; return contact ? `${org} - ${contact}` : org })()}</div>
          </Col>
          <Col flex="none">
            {quotation.status === 'DRAFT' && (quotation.ownerId === user.id || admin) && (
              <Popconfirm title="提交后报价单内容将锁定，确定提交审批吗?" onConfirm={handleSubmit}>
                <Button type="primary" icon={<SendOutlined />}>提交审批</Button>
              </Popconfirm>
            )}
            {quotation.status === 'SUBMITTED' && canApprove && (quotation.ownerId !== user.id || admin) && (
              <>
                <Popconfirm title="确定批准这份报价单吗?" onConfirm={handleApprove}>
                  <Button type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} icon={<CheckOutlined />}>批准</Button>
                </Popconfirm>
                <Button danger icon={<CloseOutlined />} style={{ marginLeft: 8 }} onClick={() => { setRejectReason(''); setRejectModalVisible(true) }}>驳回</Button>
              </>
            )}
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs defaultActiveKey="items" items={[
          { key: 'info', label: '基本信息', children: (
            <Descriptions bordered column={2}>
              <Descriptions.Item label="报价单名称">{quotation.name}</Descriptions.Item>
              <Descriptions.Item label="版本号">v{quotation.version}</Descriptions.Item>
              <Descriptions.Item label="关联售前">{quotation.opportunity?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="客户">{(() => { const org = quotation.organization?.name || '-'; const contact = quotation.contact ? `${quotation.contact.name}${quotation.contact.title ? ` (${quotation.contact.title})` : ''}` : ''; return contact ? `${org} - ${contact}` : org })()}</Descriptions.Item>
              <Descriptions.Item label="创建人">{quotation.owner?.name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(quotation.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="审批人">{quotation.approver?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="审批时间">{quotation.approvedAt ? dayjs(quotation.approvedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
              <Descriptions.Item label="审批意见" span={2}>
                {quotation.approvalNote
                  ? <span style={quotation.status === 'REJECTED' ? { color: '#cf1322' } : undefined}>{quotation.approvalNote}</span>
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{quotation.notes || '-'}</Descriptions.Item>
            </Descriptions>
          )},
          { key: 'items', label: `报价明细 (${quotation.items?.length || 0})`, children: (
            <Table columns={itemColumns} dataSource={quotation.items || []} rowKey="id" pagination={false}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5} align="right"><strong>合计</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1}><strong>{quotation.totalAmount === null ? '—' : `¥${Number(quotation.totalAmount).toLocaleString()}`}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                </Table.Summary.Row>
              )}
            />
          )},
          { key: 'files', label: `附件 (${quotation.files?.length || 0})`, children: (
            <div>
              <Upload beforeUpload={handleFileUpload} showUploadList={false}>
                <Button icon={<UploadOutlined />} type="primary" style={{ marginBottom: 16 }}>上传附件（报价单/方案书等）</Button>
              </Upload>
              <Table columns={fileColumns} dataSource={quotation.files || []} rowKey="id" pagination={false} />
            </div>
          )}
        ]} />
      </Card>

      <Modal
        title="驳回报价单"
        open={rejectModalVisible}
        onOk={handleConfirmReject}
        onCancel={() => setRejectModalVisible(false)}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          <div><strong>{quotation.name}</strong> <Tag>v{quotation.version}</Tag></div>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            售前: {quotation.opportunity?.name || '-'} · 报价总额: <strong style={{ color: '#cf1322' }}>¥{Number(quotation.totalAmount || 0).toLocaleString()}</strong>
          </div>
        </div>
        <Input.TextArea rows={3} placeholder="请填写驳回原因（必填）" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
      </Modal>
    </div>
  )
}

export default QuotationDetail
