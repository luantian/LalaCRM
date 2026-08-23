import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Form, Input, Select, message, Space, Tag, Card, Row, Col, Empty, Dropdown } from 'antd'
import { ReloadOutlined, SearchOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons'
import { getProjects, getOrganizationsSimple, exportProjectsCsv, exportProjectsExcel } from '../services/api'
import dayjs from 'dayjs'
import { OrgContactSelector } from '../components/OrgContactSelector'

function ProjectArchive() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterContactId, setFilterContactId] = useState<number | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const searchTextRef = useRef(searchText)
  const lastRefreshTriggerRef = useRef<number | null>(null)
  useEffect(() => { searchTextRef.current = searchText }, [searchText])

  const filterStatusRef = useRef(filterStatus)
  const filterContactIdRef = useRef(filterContactId)
  useEffect(() => { filterStatusRef.current = filterStatus }, [filterStatus])
  useEffect(() => { filterContactIdRef.current = filterContactId }, [filterContactId])

  const fetchProjects = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = { 
        page, 
        pageSize, 
        sortBy: 'archivedAt', 
        sortOrder: 'desc',
        isArchived: 'true'
      }
      if (searchTextRef.current.trim()) {
        params.search = searchTextRef.current.trim()
      }
      if (filterStatusRef.current) {
        params.status = filterStatusRef.current
      }
      if (filterContactIdRef.current) params.contactId = String(filterContactIdRef.current)
      
      const response: any = await getProjects(params)
      setProjects(response.data || [])
      setPagination({
        current: response.pagination?.page || 1,
        pageSize: response.pagination?.pageSize || 10,
        total: response.pagination?.total || 0
      })
    } catch (error: any) {
      message.error(error?.error || '获取归档项目列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOrganizations = async () => {
    try {
      const response: any = await getOrganizationsSimple()
      setOrganizations(response || [])
    } catch (error) {
      console.error('获取组织列表失败:', error)
    }
  }

  const initTriggeredRef = useRef(false)
  useEffect(() => {
    if (initTriggeredRef.current) return
    initTriggeredRef.current = true
    fetchOrganizations()
  }, [])

  useEffect(() => {
    if (lastRefreshTriggerRef.current === refreshTrigger) {
      return
    }
    lastRefreshTriggerRef.current = refreshTrigger
    fetchProjects()
  }, [refreshTrigger, fetchProjects])

  const handleSearch = () => {
    fetchProjects(1, pagination.pageSize)
  }

  const handleReset = () => {
    setSearchText('')
    setFilterStatus('')
    setFilterContactId(null)
    form.resetFields()
    setRefreshTrigger(prev => prev + 1)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchProjects(page, pageSize)
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportProjectsCsv() : await exportProjectsExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `归档项目数据.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
  }

  const getOrganizationName = (organizationId: number) => {
    const organization = organizations.find(c => c.id === organizationId)
    return organization ? organization.name : '-'
  }

  const columns = [
    { title: '项目编号', dataIndex: 'projectNo', key: 'projectNo', width: 120, render: (v: string) => v || '-' },
    { title: '项目名称', dataIndex: 'name', key: 'name', render: (name: string, record: any) => <a onClick={() => navigate(`/projects/${record.id}`)} style={{ color: '#1890ff' }}>{name}</a> },
    {
      title: '客户',
      dataIndex: 'organizationId',
      key: 'organizationId',
      render: (_: any, r: any) => {
        const org = getOrganizationName(r.organizationId) || '-'
        const contact = r.contact ? `${r.contact.name}${r.contact.title ? ` (${r.contact.title})` : ''}` : ''
        return contact ? `${org} - ${contact}` : org
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          IN_PROGRESS: { text: '进行中', color: 'processing' },
          COMPLETED: { text: '已完成', color: 'success' },
          CANCELLED: { text: '已取消', color: 'error' }
        }
        const s = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    { title: '预算', dataIndex: 'budget', key: 'budget', render: (v: number) => v ? `${v}元` : '-' },
    {
      title: '归档时间',
      dataIndex: 'archivedAt',
      key: 'archivedAt',
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${record.id}`)}>查看</Button>
      )
    }
  ]

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>项目归档</h2>
      </div>

      {/* 搜索 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: 'none', background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索项目名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="项目状态"
              value={filterStatus || undefined}
              onChange={(v) => setFilterStatus(v || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="IN_PROGRESS">进行中</Select.Option>
              <Select.Option value="COMPLETED">已完成</Select.Option>
              <Select.Option value="CANCELLED">已取消</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <OrgContactSelector
              placeholder="客户（联系人）"
              value={filterContactId}
              onChange={(v) => setFilterContactId(v)}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
        <Row gutter={[16, 16]} align="middle" style={{ marginTop: 12 }}>
          <Col>
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchProjects(pagination.current, pagination.pageSize)}>刷新</Button>
          <Dropdown menu={{ items: [
            { key: 'csv', icon: <DownloadOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
            { key: 'excel', icon: <DownloadOutlined />, label: '导出 Excel', onClick: () => handleExport('excel') },
          ]}}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
        </Space>
      </div>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={projects}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: handleTableChange
          }}
          locale={{ emptyText: <Empty description="暂无归档项目" /> }}
        />
      </Card>
    </div>
  )
}

export default ProjectArchive
