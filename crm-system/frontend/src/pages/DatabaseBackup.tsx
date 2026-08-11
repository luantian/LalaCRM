import React, { useEffect, useState } from 'react'
import { Table, Button, Space, Card, message, Tag, Popconfirm, Switch, TimePicker, Select, Row, Col, Statistic, Descriptions } from 'antd'
import { DownloadOutlined, DeleteOutlined, ReloadOutlined, DatabaseOutlined, CloudDownloadOutlined, SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../services/api'
import { HasPermission } from '../components/Permission'

interface BackupRecord {
  id: number
  fileName: string
  filePath: string
  fileSize: number
  status: 'SUCCESS' | 'FAILED'
  remark: string | null
  errorMessage: string | null
  createdAt: string
}

interface BackupSchedule {
  enabled: boolean
  time: string
  retentionDays: number
}

const DatabaseBackup: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule>({
    enabled: false,
    time: '02:00:00',
    retentionDays: 30
  })
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleTime, setScheduleTime] = useState(dayjs('02:00:00', 'HH:mm:ss'))
  const [retentionDays, setRetentionDays] = useState(30)
  const [backupStats, setBackupStats] = useState({
    totalBackups: 0,
    totalSize: 0,
    lastBackupAt: null as string | null,
    lastBackupSize: 0
  })

  useEffect(() => {
    loadBackups()
    loadBackupSchedule()
    loadBackupStats()
  }, [])

  const loadBackups = async () => {
    setLoading(true)
    try {
      const res = await api.get('/database/backups')
      setBackups(res)
    } catch (error) {
      message.error('加载备份记录失败')
    } finally {
      setLoading(false)
    }
  }

  const loadBackupSchedule = async () => {
    try {
      const res = await api.get('/database/backup-schedule')
      if (res) {
        setBackupSchedule(res)
        setScheduleEnabled(res.enabled)
        setScheduleTime(dayjs(res.time, 'HH:mm:ss'))
        setRetentionDays(res.retentionDays)
      }
    } catch (error) {
      console.error('加载定时备份配置失败', error)
    }
  }

  const loadBackupStats = async () => {
    try {
      const res = await api.get('/database/backup-stats')
      setBackupStats(res)
    } catch (error) {
      console.error('加载备份统计失败', error)
    }
  }

  const handleBackupNow = async () => {
    setLoading(true)
    try {
      const res = await api.post('/database/backup', {
        remark: '手动备份'
      })
      message.success(res.message || '备份成功')
      loadBackups()
      loadBackupStats()
    } catch (error: any) {
      message.error(error?.error || '备份失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (id: number, fileName: string) => {
    try {
      const res: any = await api.get(`/database/backups/${id}/download`, {
        responseType: 'blob'
      })
      // 响应拦截器已经返回了 response.data（即 Blob），所以直接用 res
      const url = window.URL.createObjectURL(new Blob([res]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      message.success('下载成功')
    } catch (error: any) {
      message.error('下载失败')
    }
  }

  const handleRestore = async (id: number, fileName: string) => {
    setLoading(true)
    try {
      const res = await api.post(`/database/backups/${id}/restore`) as any
      message.success(res.message || '恢复成功')
    } catch (error: any) {
      message.error(error?.error || '恢复失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await api.delete(`/database/backups/${id}`) as any
      message.success(res.message || '删除成功')
      loadBackups()
      loadBackupStats()
    } catch (error: any) {
      message.error(error?.error || '删除失败')
    }
  }

  const handleSaveSchedule = async () => {
    try {
      const res = await api.put('/database/backup-schedule', {
        enabled: scheduleEnabled,
        time: scheduleTime.format('HH:mm:ss'),
        retentionDays
      }) as any
      message.success(res.message || '保存成功')
      loadBackupSchedule()
    } catch (error: any) {
      message.error(error?.error || '保存失败')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 250
    },
    {
      title: '保存路径',
      dataIndex: 'filePath',
      key: 'filePath',
      width: 400,
      render: (path: string) => (
        <span style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>{path}</span>
      )
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (size: number) => formatFileSize(size)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'SUCCESS' ? 'green' : 'red'}>
          {status === 'SUCCESS' ? '成功' : '失败'}
        </Tag>
      )
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150
    },
    {
      title: '备份时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: BackupRecord) => (
        <Space size="small">
          <HasPermission permission="system:backup:download">
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record.id, record.fileName)}
              disabled={record.status !== 'SUCCESS'}
            >
              下载
            </Button>
          </HasPermission>
          <HasPermission permission="system:backup:restore">
            <Popconfirm
              title="确认恢复"
              description="恢复数据库将覆盖当前数据，确定要恢复吗？"
              onConfirm={() => handleRestore(record.id, record.fileName)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                icon={<ReloadOutlined />}
                disabled={record.status !== 'SUCCESS'}
              >
                恢复
              </Button>
            </Popconfirm>
          </HasPermission>
          <HasPermission permission="system:backup:delete">
            <Popconfirm
              title="确认删除"
              description="确定要删除这个备份文件吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Popconfirm>
          </HasPermission>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="备份总数"
              value={backupStats.totalBackups}
              prefix={<DatabaseOutlined />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="备份占用空间"
              value={formatFileSize(backupStats.totalSize)}
              prefix={<CloudDownloadOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="最近备份时间"
              value={backupStats.lastBackupAt ? dayjs(backupStats.lastBackupAt).format('YYYY-MM-DD HH:mm') : '无'}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="最近备份大小"
              value={formatFileSize(backupStats.lastBackupSize)}
              prefix={<CloudDownloadOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="手动备份"
        style={{ marginBottom: 24 }}
      >
        <Space>
          <HasPermission permission="system:backup:create">
            <Button
              type="primary"
              size="large"
              icon={<DatabaseOutlined />}
              onClick={handleBackupNow}
              loading={loading}
            >
              立即备份
            </Button>
          </HasPermission>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadBackups}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </Card>

      <Card
        title="定时备份配置"
        style={{ marginBottom: 24 }}
      >
        <Descriptions bordered column={1}>
          <Descriptions.Item label="启用定时备份">
            <Switch
              checked={scheduleEnabled}
              onChange={setScheduleEnabled}
            />
          </Descriptions.Item>
          <Descriptions.Item label="备份时间">
            <TimePicker
              value={scheduleTime}
              onChange={(time) => time && setScheduleTime(time)}
              format="HH:mm:ss"
              disabled={!scheduleEnabled}
            />
          </Descriptions.Item>
          <Descriptions.Item label="备份保留天数">
            <Select
              value={retentionDays}
              onChange={setRetentionDays}
              disabled={!scheduleEnabled}
              style={{ width: 120 }}
            >
              <Select.Option value={7}>7 天</Select.Option>
              <Select.Option value={15}>15 天</Select.Option>
              <Select.Option value={30}>30 天</Select.Option>
              <Select.Option value={60}>60 天</Select.Option>
              <Select.Option value={90}>90 天</Select.Option>
            </Select>
          </Descriptions.Item>
        </Descriptions>
        <Button
          type="primary"
          icon={<SettingOutlined />}
          onClick={handleSaveSchedule}
          style={{ marginTop: 16 }}
        >
          保存配置
        </Button>
      </Card>

      <Card title="备份记录">
        <Table
          columns={columns}
          dataSource={backups}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>
    </div>
  )
}

export default DatabaseBackup
