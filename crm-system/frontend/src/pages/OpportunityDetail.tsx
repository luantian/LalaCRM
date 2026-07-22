import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Tabs, Table, Button, Space, Row, Col, Modal, Form, Input, Select, InputNumber, DatePicker, message, List, Popconfirm, Empty, Avatar, Image, Spin, Result } from 'antd'
import { ArrowLeftOutlined, EditOutlined, PlusOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, FileOutlined, FileTextOutlined, ScheduleOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons'
import { getOpportunityDetail, updateOpportunity, convertOpportunity, addOpportunityTeamMember, removeOpportunityTeamMember, getOpportunityFiles, getCustomers, getUsers, getOpportunityRecords, createOpportunityRecord, updateOpportunityRecord, deleteOpportunityRecord, uploadOpportunityRecordFiles, deleteOpportunityRecordFile, downloadOpportunityRecordFileUrl, previewOpportunityRecordFileUrl, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

const { TextArea } = Input

// 判断文件是否可预览
const isPreviewableFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf'].includes(ext || '')
}

function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [opportunity, setOpportunity] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 当前用户与权限
  const currentUser = safeJsonParse(localStorage.getItem('user'), {})
  const canEditOpportunity = currentUser.role === 'ADMIN' || currentUser.permissions?.includes('edit_opportunities')
  const defaultTeamRole = useMemo(() => {
    if (canEditOpportunity) return 'BUSINESS'
    if (currentUser.role === 'PROJECT_MANAGER') return 'TECHNICAL'
    return 'SALES'
  }, [canEditOpportunity, currentUser.role])

  // 编辑状态
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [customers, setCustomers] = useState<any[]>([])

  // 团队成员状态
  const [users, setUsers] = useState<any[]>([])
  const [teamMemberUserId, setTeamMemberUserId] = useState<number | null>(null)
  const [teamMemberRole, setTeamMemberRole] = useState<string>(defaultTeamRole)

  // 选择成员时自动设置默认角色
  const handleTeamMemberUserIdChange = (userId: number | null) => {
    setTeamMemberUserId(userId)
    if (userId) {
      setTeamMemberRole(defaultTeamRole)
    }
  }

  // 文件管理状态
  const [, setFiles] = useState<any[]>([])

  // 信息记录状态
  const [records, setRecords] = useState<any[]>([])
  const [recordModalVisible, setRecordModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [recordForm] = Form.useForm()
  const [recordFiles, setRecordFiles] = useState<File[]>([])

  // 文件预览状态
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null)

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await getOpportunityDetail(parseInt(id!))
        setOpportunity(data)
      } catch (error) {
        console.error('获取商机详情失败:', error)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  useEffect(() => {
    if (id) {
      fetchFiles()
      fetchCustomers()
      fetchUsers()
      fetchRecords()
    }
  }, [id])

  const fetchCustomers = async () => {
    try {
      const response: any = await getCustomers({ pageSize: 1000 })
      setCustomers(response.data || [])
    } catch (error) { console.error('获取客户列表失败:', error) }
  }

  const fetchUsers = async () => {
    try {
      const data: any = await getUsers()
      setUsers(data || [])
    } catch (error) { console.error('获取用户列表失败:', error) }
  }

  const fetchFiles = async () => {
    try {
      const data: any = await getOpportunityFiles(parseInt(id!))
      setFiles(data || [])
    } catch (error) { console.error('获取文件列表失败:', error) }
  }

  const fetchRecords = async () => {
    try {
      const data: any = await getOpportunityRecords(parseInt(id!))
      setRecords(data || [])
    } catch (error) { console.error('获取信息记录失败:', error) }
  }

  const refreshDetail = async () => {
    try {
      const data = await getOpportunityDetail(parseInt(id!))
      setOpportunity(data)
    } catch (error) { console.error('刷新商机详情失败:', error) }
  }

  // ===== 编辑 =====
  const handleEdit = () => {
    form.setFieldsValue({
      name: opportunity.name,
      customerId: opportunity.customerId,
      application: opportunity.application || '',
      budget: opportunity.budget ? Number(opportunity.budget) : null,
      decisionMaker: opportunity.decisionMaker || '',
      technicalDetail: opportunity.technicalDetail || '',
      configSelection: opportunity.configSelection || '',
      expectedStart: opportunity.expectedStart ? dayjs(opportunity.expectedStart) : null,
      expectedEnd: opportunity.expectedEnd ? dayjs(opportunity.expectedEnd) : null,
      competitors: opportunity.competitors || '',
      winRate: opportunity.winRate || 0,
      status: opportunity.status || 'OPEN',
      notes: opportunity.notes || ''
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await updateOpportunity(parseInt(id!), {
        ...values,
        expectedStart: values.expectedStart ? values.expectedStart.toDate() : null,
        expectedEnd: values.expectedEnd ? values.expectedEnd.toDate() : null
      })
      message.success('商机信息更新成功')
      setModalVisible(false)
      refreshDetail()
    } catch (error) {
      message.error('更新失败')
    }
  }

  // ===== 团队成员 =====
  const handleAddTeamMember = async () => {
    if (!teamMemberUserId) {
      message.warning('请选择成员')
      return
    }
    try {
      await addOpportunityTeamMember(parseInt(id!), { userId: teamMemberUserId, teamRole: teamMemberRole })
      message.success('添加团队成员成功')
      setTeamMemberUserId(null)
      setTeamMemberRole(defaultTeamRole)
      refreshDetail()
    } catch (error: any) {
      message.error(error?.error || '添加失败')
    }
  }

  const handleRemoveTeamMember = async (memberId: number) => {
    try {
      await removeOpportunityTeamMember(parseInt(id!), memberId)
      message.success('移除成功')
      refreshDetail()
    } catch (error) {
      message.error('移除失败')
    }
  }

  // ===== 信息记录 =====
  const handleAddRecord = () => {
    setEditingRecord(null)
    recordForm.resetFields()
    recordForm.setFieldsValue({ type: 'note' }) // 设置默认类型
    setRecordFiles([])
    setRecordModalVisible(true)
  }

  const handleEditRecord = (record: any) => {
    setEditingRecord(record)
    recordForm.setFieldsValue({
      type: record.type,
      content: record.content,
      nextPlan: record.nextPlan,
      nextDate: record.nextDate ? dayjs(record.nextDate) : null
    })
    setRecordModalVisible(true)
  }

  const handleRecordSubmit = async () => {
    try {
      const values = await recordForm.validateFields()
      const data = {
        ...values,
        nextDate: values.nextDate ? values.nextDate.toDate() : null
      }

      if (editingRecord) {
        // 编辑模式
        await updateOpportunityRecord(parseInt(id!), editingRecord.id, data)
        // 上传新选择的附件
        if (recordFiles.length > 0) {
          await uploadOpportunityRecordFiles(parseInt(id!), editingRecord.id, recordFiles as any)
        }
        message.success('记录更新成功')
      } else {
        // 新增模式
        const res: any = await createOpportunityRecord(parseInt(id!), data)
        const recordId = res.id
        if (recordFiles.length > 0) {
          await uploadOpportunityRecordFiles(parseInt(id!), recordId, recordFiles as any)
        }
        message.success('记录添加成功')
      }

      setRecordModalVisible(false)
      recordForm.resetFields()
      setRecordFiles([])
      setEditingRecord(null)
      fetchRecords()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDeleteRecord = async (recordId: number) => {
    try {
      await deleteOpportunityRecord(parseInt(id!), recordId)
      message.success('记录删除成功')
      fetchRecords()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handlePreviewRecordFile = (fileId: number, fileName: string) => {
    const token = localStorage.getItem('token')
    const url = previewOpportunityRecordFileUrl(fileId)
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('预览失败')
        return r.blob()
      })
      .then(blob => {
        const previewUrl = window.URL.createObjectURL(blob)
        const ext = fileName.split('.').pop()?.toLowerCase()
        // 释放旧的预览 URL
        if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url)
        setPreviewFile({ url: previewUrl, name: fileName, type: ext || '' })
        setPreviewVisible(true)
      })
      .catch(() => message.error('预览失败'))
  }

  // ===== 转化项目 =====
  const handleConvert = async () => {
    try {
      const res: any = await convertOpportunity(parseInt(id!))
      message.success(res?.message || '商机已成功转化为项目')
      refreshDetail()
    } catch (error: any) {
      message.error(error?.error || '转化失败')
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" tip="加载中..." /></div>
  }
  if (error || !opportunity) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Result status="error" title="加载失败" subTitle="请返回重试" extra={<Button type="primary" onClick={() => navigate('/opportunities')}>返回列表</Button>} /></div>
  }

  const statusConfig: Record<string, { text: string; color: string }> = {
    OPEN: { text: '开放', color: 'blue' },
    QUALIFIED: { text: '已确认', color: 'cyan' },
    PROPOSAL: { text: '方案阶段', color: 'processing' },
    NEGOTIATION: { text: '谈判中', color: 'orange' },
    WON: { text: '赢单', color: 'success' },
    LOST: { text: '丢单', color: 'error' },
    CLOSED: { text: '已关闭', color: 'default' }
  }

  const teamRoleConfig: Record<string, { text: string; color: string }> = {
    SALES: { text: '销售', color: 'blue' },
    TECHNICAL: { text: '技术', color: 'green' },
    BUSINESS: { text: '商务', color: 'orange' }
  }

  const status = statusConfig[opportunity.status] || { text: opportunity.status, color: 'default' }

  // 团队成员表格列
  const teamColumns = [
    {
      title: '成员',
      dataIndex: 'user',
      key: 'user',
      render: (user: any) => user?.name || '-'
    },
    {
      title: '角色',
      dataIndex: 'teamRole',
      key: 'teamRole',
      render: (role: string) => {
        const r = teamRoleConfig[role] || { text: role, color: 'default' }
        return <Tag color={r.color}>{r.text}</Tag>
      }
    },
    {
      title: '加入时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Popconfirm title="确定要删除吗?" onConfirm={() => handleRemoveTeamMember(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button>
        </Popconfirm>
      )
    }
  ]

  // Tab 项
  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <div>
          <Card title="商机详情">
            <Descriptions column={2} bordered>
              <Descriptions.Item label="商机名称">{opportunity.name}</Descriptions.Item>
              <Descriptions.Item label="客户">{opportunity.customer?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="应用领域">{opportunity.application || '-'}</Descriptions.Item>
              <Descriptions.Item label="预算金额">{opportunity.budget ? `${Number(opportunity.budget)}元` : '-'}</Descriptions.Item>
              <Descriptions.Item label="客户决策人">{opportunity.decisionMaker || '-'}</Descriptions.Item>
              <Descriptions.Item label="技术详细信息">{opportunity.technicalDetail || '-'}</Descriptions.Item>
              <Descriptions.Item label="配置方案选品" span={2}>{opportunity.configSelection || '-'}</Descriptions.Item>
              <Descriptions.Item label="预计开始日期">{opportunity.expectedStart ? dayjs(opportunity.expectedStart).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="预计结束日期">{opportunity.expectedEnd ? dayjs(opportunity.expectedEnd).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="竞争对手" span={2}>{opportunity.competitors || '-'}</Descriptions.Item>
              <Descriptions.Item label="成单率">{opportunity.winRate ?? 0}%</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={status.color}>{status.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="负责人">{opportunity.owner?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(opportunity.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{opportunity.notes || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="信息记录" style={{ marginTop: 16 }} extra={
            <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAddRecord}>添加记录</Button>
          }>
            {records.length === 0 ? (
              <Empty description="暂无信息记录" />
            ) : (
              <List
                dataSource={records}
                renderItem={(record: any) => {
                  return (
                    <List.Item
                      actions={[
                        <Button key="edit" type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditRecord(record)}>编辑</Button>,
                        <Popconfirm key="del" title="确定删除此记录？" onConfirm={() => handleDeleteRecord(record.id)}>
                          <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                        </Popconfirm>
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar style={{ backgroundColor: '#1890ff' }}>{record.user?.name?.[0] || '?'}</Avatar>}
                        title={
                          <div>
                            <span style={{ fontWeight: 600 }}>{record.user?.name || '未知'}</span>
                            <span style={{ color: '#888', fontWeight: 'normal', marginLeft: 12, fontSize: 12 }}>{dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}</span>
                          </div>
                        }
                        description={
                          <div>
                            <div style={{ whiteSpace: 'pre-wrap', color: '#333', marginBottom: 4 }}>{record.content || ''}</div>
                            {record.nextPlan && (
                              <div style={{ fontSize: 12, color: '#666', marginTop: 8, padding: '8px', background: '#f9f9f9', borderRadius: 4 }}>
                                <ScheduleOutlined style={{ marginRight: 4 }} />
                                <strong>下次计划：</strong>{record.nextPlan}
                                {record.nextDate && <span style={{ marginLeft: 8 }}>（{dayjs(record.nextDate).format('YYYY-MM-DD')}）</span>}
                              </div>
                            )}
                            {record.files && record.files.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>附件：</div>
                                {record.files.map((file: any) => (
                                  <span key={file.id} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 12, padding: '2px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 12, marginBottom: 4 }}>
                                    <FileOutlined style={{ marginRight: 4 }} />
                                    {isPreviewableFile(file.fileName) ? (
                                      <a onClick={() => handlePreviewRecordFile(file.id, file.fileName)} style={{ cursor: 'pointer', color: '#1890ff' }}>
                                        {file.fileName}
                                        <EyeOutlined style={{ marginLeft: 4 }} />
                                      </a>
                                    ) : (
                                      <a href={downloadOpportunityRecordFileUrl(file.id)} download={file.fileName} style={{ color: '#1890ff' }}>
                                        {file.fileName}
                                        <DownloadOutlined style={{ marginLeft: 4 }} />
                                      </a>
                                    )}
                                    <span style={{ color: '#999', marginLeft: 4 }}>({(file.fileSize / 1024).toFixed(1)}KB)</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </div>
      )
    },
    {
      key: 'team',
      label: `团队成员 (${opportunity.teamMembers?.length || 0})`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Select
                style={{ width: 200 }}
                placeholder="选择成员"
                value={teamMemberUserId}
                onChange={handleTeamMemberUserIdChange}
                showSearch
                optionFilterProp="children"
                allowClear
              >
                {users.map((u: any) => (
                  <Select.Option key={u.id} value={u.id}>{u.name || u.username}</Select.Option>
                ))}
              </Select>
              <Select
                style={{ width: 120 }}
                value={teamMemberRole}
                onChange={setTeamMemberRole}
              >
                <Select.Option value="SALES">销售</Select.Option>
                <Select.Option value="TECHNICAL">技术</Select.Option>
                <Select.Option value="BUSINESS">商务</Select.Option>
              </Select>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTeamMember}>添加成员</Button>
            </Space>
          </div>
          <Table
            columns={teamColumns}
            dataSource={opportunity.teamMembers || []}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: '暂无团队成员' }}
          />
        </div>
      )
    }
  ]

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/opportunities')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" wrap={false}>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{opportunity.name}</h3>
              <Tag color={status.color}>{status.text}</Tag>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>|</span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>预算: <strong style={{ color: '#2563eb' }}>{opportunity.budget ? Number(opportunity.budget).toFixed(2) : '0.00'}元</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>成单率: <strong style={{ color: '#059669' }}>{opportunity.winRate ?? 0}%</strong></span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>团队: <strong style={{ color: '#7c3aed' }}>{opportunity.teamMembers?.length || 0}人</strong></span>
              {opportunity.owner?.name && (
                <>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>|</span>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>负责人: <strong style={{ color: '#374151' }}>{opportunity.owner.name}</strong></span>
                </>
              )}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
              {opportunity.customer?.name || '暂无客户'}
              {opportunity.expectedStart && <> · 预计开始: {dayjs(opportunity.expectedStart).format('YYYY-MM-DD')}</>}
              {opportunity.expectedEnd && <> · 预计结束: {dayjs(opportunity.expectedEnd).format('YYYY-MM-DD')}</>}
            </div>
          </Col>
          <Col flex="none">
            <Space>
              {opportunity.project ? (
                <Button
                  icon={<FileTextOutlined />}
                  onClick={() => navigate(`/projects/${opportunity.project.id}`)}
                >
                  查看项目
                </Button>
              ) : (
                <Popconfirm
                  title="确定将此商机转化为项目？"
                  onConfirm={handleConvert}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  >
                    转化为项目
                  </Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={handleEdit}
              >
                编辑
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs items={tabItems} />
      </Card>

      {/* 编辑 Modal */}
      <Modal
        title="编辑商机"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="商机名称" rules={[{ required: true, message: '请输入商机名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select showSearch optionFilterProp="children">
              {customers.map((c: any) => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="application" label="应用领域">
            <Input />
          </Form.Item>
          <Form.Item name="budget" label="预算金额">
            <InputNumber style={{ width: '100%' }} precision={2} min={0} />
          </Form.Item>
          <Form.Item name="decisionMaker" label="客户决策人">
            <Input />
          </Form.Item>
          <Form.Item name="technicalDetail" label="技术详细信息">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="configSelection" label="配置方案选品">
            <TextArea rows={3} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="expectedStart" label="预计开始日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expectedEnd" label="预计结束日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="competitors" label="竞争对手">
            <Input />
          </Form.Item>
          <Form.Item name="winRate" label="成单率 (%)">
            <InputNumber style={{ width: '100%' }} min={0} max={100} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select>
              <Select.Option value="OPEN">开放</Select.Option>
              <Select.Option value="QUALIFIED">已确认</Select.Option>
              <Select.Option value="PROPOSAL">方案阶段</Select.Option>
              <Select.Option value="NEGOTIATION">谈判中</Select.Option>
              <Select.Option value="WON">赢单</Select.Option>
              <Select.Option value="LOST">丢单</Select.Option>
              <Select.Option value="CLOSED">已关闭</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 信息记录 Modal */}
      <Modal
        title={editingRecord ? '编辑信息记录' : '添加信息记录'}
        open={recordModalVisible}
        onOk={handleRecordSubmit}
        onCancel={() => {
          setRecordModalVisible(false)
          recordForm.resetFields()
          setRecordFiles([])
          setEditingRecord(null)
        }}
        width={600}
      >
        <Form form={recordForm} layout="vertical">
          <Form.Item name="content" label="记录内容" rules={[{ required: true, message: '请输入记录内容' }]}>
            <TextArea rows={4} placeholder="请详细记录本次沟通/跟进的内容" />
          </Form.Item>
          <Form.Item name="nextPlan" label="下次计划">
            <TextArea rows={2} placeholder="记录下次需要跟进的事项" />
          </Form.Item>
          <Form.Item name="nextDate" label="下次跟进日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="附件">
            {/* 显示已上传的附件 */}
            {editingRecord && editingRecord.files && editingRecord.files.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>已上传附件：</div>
                {editingRecord.files.map((file: any) => (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                    <FileOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                    {isPreviewableFile(file.fileName) ? (
                      <a onClick={() => handlePreviewRecordFile(file.id, file.fileName)} style={{ cursor: 'pointer', color: '#1890ff', flex: 1 }}>
                        {file.fileName}
                        <EyeOutlined style={{ marginLeft: 4 }} />
                      </a>
                    ) : (
                      <a href={downloadOpportunityRecordFileUrl(file.id)} download={file.fileName} style={{ color: '#1890ff', flex: 1 }}>
                        {file.fileName}
                        <DownloadOutlined style={{ marginLeft: 4 }} />
                      </a>
                    )}
                    <span style={{ color: '#999', marginRight: 8 }}>{(file.fileSize / 1024).toFixed(1)}KB</span>
                    <Popconfirm title="确定删除此附件？" onConfirm={async () => {
                      try {
                        await deleteOpportunityRecordFile(parseInt(id!), editingRecord.id, file.id)
                        message.success('删除成功')
                        // 立即更新本地状态
                        setEditingRecord((prev: any) => ({
                          ...prev,
                          files: prev.files.filter((f: any) => f.id !== file.id)
                        }))
                        fetchRecords()
                      } catch (e) { message.error('删除失败') }
                    }}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
            {/* 上传新附件 */}
            <input type="file" multiple id="record-file-input" style={{ display: 'none' }} onChange={e => {
              if (e.target.files) {
                setRecordFiles(prev => [...prev, ...Array.from(e.target.files!)])
                e.target.value = ''
              }
            }} />
            <Button icon={<UploadOutlined />} onClick={() => document.getElementById('record-file-input')?.click()}>选择附件（可多选）</Button>
            {recordFiles.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>待上传附件：</div>
                {recordFiles.map((file, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                    <FileOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                    <span style={{ flex: 1 }}>{file.name}</span>
                    <span style={{ color: '#999', marginRight: 8 }}>{(file.size / 1024).toFixed(1)}KB</span>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setRecordFiles(prev => prev.filter((_, i) => i !== idx))} />
                  </div>
                ))}
              </div>
            )}
          </Form.Item>
        </Form>
      </Modal>
      {/* 文件预览 Modal */}
      <Modal
        title={previewFile?.name || '文件预览'}
        open={previewVisible}
        onCancel={() => { if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url); setPreviewVisible(false); setPreviewFile(null) }}
        footer={[
          <Button key="close" onClick={() => { if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url); setPreviewVisible(false); setPreviewFile(null) }}>关闭</Button>
        ]}
        width="80%"
        style={{ top: 20 }}
      >
        {previewFile && (
          <div style={{ textAlign: 'center', minHeight: 400 }}>
            {['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(previewFile.type) ? (
              <Image
                src={previewFile.url}
                alt={previewFile.name}
                style={{ maxWidth: '100%', maxHeight: '70vh' }}
                preview={false}
              />
            ) : previewFile.type === 'pdf' ? (
              <iframe
                src={previewFile.url}
                style={{ width: '100%', height: '70vh', border: 'none' }}
                title={previewFile.name}
              />
            ) : (
              <div style={{ padding: 40, color: '#999' }}>不支持预览此文件格式</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default OpportunityDetail
