import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, message, Space, Card, Input, Empty, Popconfirm, Upload, Modal } from 'antd'
import { ReloadOutlined, SearchOutlined, InboxOutlined, EyeOutlined, ProjectOutlined, DeleteOutlined, DownloadOutlined, ImportOutlined } from '@ant-design/icons'
import { getProjects, deleteProject, exportProjectsCsv, exportProjectsExcel, importProjects } from '../services/api'
import dayjs from 'dayjs'

function ProjectArchive() {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [importModalVisible, setImportModalVisible] = useState(false)
  const searchRef = useRef(search)
  useEffect(() => { searchRef.current = search }, [search])

  const fetchData = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params: any = {
        page,
        pageSize,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        status: 'COMPLETED'
      }
      if (searchRef.current.trim()) params.search = searchRef.current.trim()

      const response: any = await getProjects(params)
      setItems(response.data || [])
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

  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchData(1, pagination.pageSize)
  }

  const handleTableChange = (page: number, pageSize: number) => {
    fetchData(page, pageSize)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id)
      message.success('删除成功')
      fetchData(pagination.current, pagination.pageSize)
    } catch (error: any) {
      message.error(error?.error || '删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的记录')
      return
    }
    try {
      for (const id of selectedRowKeys) {
        await deleteProject(id as number)
      }
      message.success(`批量删除 ${selectedRowKeys.length} 条记录成功`)
      setSelectedRowKeys([])
      fetchData(pagination.current, pagination.pageSize)
    } catch (error: any) {
      message.error(error?.error || '批量删除失败')
    }
  }

  const handleExport = async (type: 'csv' | 'excel') => {
    try {
      const blob: any = type === 'csv' ? await exportProjectsCsv() : await exportProjectsExcel()
      if (!blob) { message.error('导出失败：无数据'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `归档项目.${type === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e: any) { message.error(e?.error || '导出失败') }
  }

  const handleImport = async (file: File) => {
    try {
      const result: any = await importProjects(file)
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

  const columns = [
    {
      title: '项目编号',
      dataIndex: 'projectNo',
      key: 'projectNo',
      width: 120,
      render: (text: string) => text || '-'
    },
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
      key: 'organization',
      render: (_: any, r: any) => {
        const org = r.organization?.name || '-'
        const contact = r.contact ? `${r.contact.name}${r.contact.title ? ` (${r.contact.title})` : ''}` : ''
        return contact ? `${org} - ${contact}` : org
      }
    },
    {
      title: '预算',
      dataIndex: 'budget',
      key: 'budget',
      render: (val: any) => val ? `${Number(val).toLocaleString()} 元` : '-'
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
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${record.id}`)}>查看</Button>
          <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          <ProjectOutlined style={{ marginRight: 8 }} />
          项目归档
        </h2>
      </div>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '16px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Space>
            {selectedRowKeys.length > 0 && (
              <Popconfirm title={`确定要删除选中的 ${selectedRowKeys.length} 条记录吗?`} onConfirm={handleBatchDelete}>
                <Button danger size="small" icon={<DeleteOutlined />}>批量删除 ({selectedRowKeys.length})</Button>
              </Popconfirm>
            )}
          </Space>
          <Space>
            <Input
              placeholder="搜索项目名称"
              prefix={<SearchOutlined />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchData(pagination.current, pagination.pageSize)}>刷新</Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('excel')}>导出</Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>导入</Button>
          </Space>
        </div>
        <Table
          columns={columns}
          dataSource={items}
          loading={loading}
          rowKey="id"
          rowSelection={rowSelection}
          locale={{ emptyText: <Empty description="没有已归档的项目" /> }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: handleTableChange
          }}
        />
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
