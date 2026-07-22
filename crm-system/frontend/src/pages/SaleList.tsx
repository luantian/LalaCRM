import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tabs, Button, message, Space, Tag, Card, Input, Row, Col, Statistic, Empty, Popconfirm, Dropdown, Upload, Modal } from 'antd'
import { ReloadOutlined, SearchOutlined, InboxOutlined, EyeOutlined, ProjectOutlined, ClockCircleOutlined, CheckCircleOutlined, FundOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, ImportOutlined } from '@ant-design/icons'
import { getOpportunities, getProjects, getOpportunityStats, deleteOpportunity, deleteProject, exportSales, exportSalesExcel, importSales } from '../services/api'
import dayjs from 'dayjs'

const oppStatusMap: Record<string, { label: string; color: string }> = {
  OPEN: { label: '开放', color: 'default' },
  QUALIFIED: { label: '已确认', color: 'processing' },
  PROPOSAL: { label: '方案阶段', color: 'blue' },
  NEGOTIATION: { label: '谈判中', color: 'orange' },
  WON: { label: '赢单', color: 'green' },
  LOST: { label: '丢单', color: 'red' },
  CLOSED: { label: '已关闭', color: 'default' },
}

function ProjectArchive() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<string>('pending')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [oppStats, setOppStats] = useState<any>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [importModalVisible, setImportModalVisible] = useState(false)

  const fetchData = async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = {
        page,
        pageSize,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      }
      if (search) params.search = search

      let response: any
      if (activeTab === 'pending') {
        params.converted = 'false'
        response = await getOpportunities(params)
      } else {
        params.fullyPaid = 'true'
        response = await getProjects(params)
      }

      setItems(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error) {
      message.error(activeTab === 'pending' ? '获取商机列表失败' : '获取项目列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await getOpportunityStats()
      setOppStats(data)
    } catch (error) {
      console.error('获取统计失败:', error)
    }
  }

  useEffect(() => {
    fetchData()
    fetchStats()
  }, [activeTab])

  const handleSearch = () => {
    fetchData(1, pagination.pageSize)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchData(page, pageSize)
  }

  const handleEdit = (record: any) => {
    if (activeTab === 'pending') {
      navigate(`/opportunities/${record.id}`)
    } else {
      navigate(`/projects/${record.id}`)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      if (activeTab === 'pending') {
        await deleteOpportunity(id)
      } else {
        await deleteProject(id)
      }
      message.success('删除成功')
      fetchData(pagination.current, pagination.pageSize)
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的记录')
      return
    }
    try {
      for (const id of selectedRowKeys) {
        if (activeTab === 'pending') {
          await deleteOpportunity(id as number)
        } else {
          await deleteProject(id as number)
        }
      }
      message.success(`批量删除 ${selectedRowKeys.length} 条记录成功`)
      setSelectedRowKeys([])
      fetchData(pagination.current, pagination.pageSize)
    } catch (error) {
      message.error('批量删除失败')
    }
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportSales() : await exportSalesExcel()
      if (!blob) { message.error('导出失败：无数据'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `销售数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importSales(file)
      message.success(result?.message || '导入成功')
      setImportModalVisible(false)
      fetchData()
    } catch (e: any) { message.error(e?.error || '导入失败') }
    return false
  }

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  // 未完成商机列
  const pendingColumns = [
    {
      title: '商机名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <a onClick={() => navigate(`/opportunities/${record.id}`)} style={{ fontWeight: 500 }}>{text}</a>
      )
    },
    {
      title: '客户',
      dataIndex: ['customer', 'name'],
      key: 'customer',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const s = oppStatusMap[status] || { label: status, color: 'default' }
        return <Tag color={s.color}>{s.label}</Tag>
      }
    },
    {
      title: '预算',
      dataIndex: 'budget',
      key: 'budget',
      render: (val: any) => val ? `${Number(val).toLocaleString()} 元` : '-'
    },
    {
      title: '赢单率',
      dataIndex: 'winRate',
      key: 'winRate',
      render: (val: number) => `${val || 0}%`
    },
    {
      title: '负责人',
      dataIndex: ['owner', 'name'],
      key: 'owner',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/opportunities/${record.id}`)}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  // 已归档项目列
  const archivedColumns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <a onClick={() => navigate(`/projects/${record.id}`)} style={{ fontWeight: 500 }}>{text}</a>
      )
    },
    {
      title: '客户',
      dataIndex: ['customer', 'name'],
      key: 'customer',
    },
    {
      title: '预算',
      dataIndex: 'budget',
      key: 'budget',
      render: (val: any) => val ? `${Number(val).toLocaleString()} 元` : '-'
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (val: number) => <Tag color="green">{val || 0}%</Tag>
    },
    {
      title: '负责人',
      dataIndex: ['owner', 'name'],
      key: 'owner',
    },
    {
      title: '完成时间',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${record.id}`)}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const columns = activeTab === 'pending' ? pendingColumns : archivedColumns

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          <ProjectOutlined style={{ marginRight: 8 }} />
          项目归档
        </h2>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <Statistic title="待转化商机" value={oppStats?.open || 0} valueStyle={{ color: '#1890ff' }} prefix={<FundOutlined />} suffix="个" />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <Statistic title="赢单" value={oppStats?.won || 0} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} suffix="个" />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <Statistic title="丢单" value={oppStats?.lost || 0} valueStyle={{ color: '#f5222d' }} prefix={<ClockCircleOutlined />} suffix="个" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '0' } }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setSearch(''); setSelectedRowKeys([]); setPagination(prev => ({ ...prev, current: 1 })) }}
          style={{ padding: '0 16px' }}
          items={[
            {
              key: 'pending',
              label: <span><ClockCircleOutlined /> 未完成</span>,
            },
            {
              key: 'archived',
              label: <span><InboxOutlined /> 归档</span>,
            }
          ]}
          tabBarExtraContent={
            <Space style={{ padding: '4px 0' }}>
              {selectedRowKeys.length > 0 && (
                <Popconfirm title={`确定要删除选中的 ${selectedRowKeys.length} 条记录吗?`} onConfirm={handleBatchDelete}>
                  <Button danger size="small" icon={<DeleteOutlined />}>批量删除 ({selectedRowKeys.length})</Button>
                </Popconfirm>
              )}
              <Input
                placeholder={activeTab === 'pending' ? '搜索商机名称' : '搜索项目名称'}
                prefix={<SearchOutlined />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 200 }}
                allowClear
              />
              <Button icon={<ReloadOutlined />} onClick={() => fetchData(pagination.current, pagination.pageSize)}>刷新</Button>
              <Dropdown menu={{ items: [
                { key: 'csv', icon: <DownloadOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
                { key: 'excel', icon: <DownloadOutlined />, label: '导出 Excel', onClick: () => handleExport('excel') },
                { type: 'divider' },
                { key: 'import', icon: <ImportOutlined />, label: '导入数据', onClick: () => setImportModalVisible(true) },
              ]}}>
                <Button icon={<DownloadOutlined />}>导入导出</Button>
              </Dropdown>
            </Space>
          }
        />
        <div style={{ padding: '0 16px 16px' }}>
          <Table
            columns={columns}
            dataSource={items}
            loading={loading}
            rowKey="id"
            rowSelection={rowSelection}
            locale={{ emptyText: <Empty description={activeTab === 'pending' ? '没有未转化的商机' : '没有已归档的项目'} /> }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: handleTableChange
            }}
          />
        </div>
      </Card>

      <Modal title="导入数据" open={importModalVisible} onCancel={() => setImportModalVisible(false)} footer={null}>
        <Upload.Dragger accept=".csv,.xlsx,.xls" beforeUpload={(file) => { handleImport(file); return false }} showUploadList={false}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-tip">支持 CSV、Excel 格式</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default ProjectArchive
