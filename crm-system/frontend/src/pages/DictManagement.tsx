import { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, message, Space, Tag, Row, Col, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, BookOutlined, AppstoreOutlined } from '@ant-design/icons'
import api from '../services/api'

interface DictType {
  id: number
  name: string
  code: string
  remark: string
  status: string
  items?: DictItem[]
  createdAt: string
  updatedAt: string
}

interface DictItem {
  id: number
  typeId: number
  label: string
  value: string
  sort: number
  cssClass: string
  remark: string
  status: string
}

const statusColor = (s: string) => (s === 'ENABLED' ? 'green' : 'default')
const statusText = (s: string) => (s === 'ENABLED' ? '启用' : '停用')

function DictManagement() {
  const [types, setTypes] = useState<DictType[]>([])
  const [items, setItems] = useState<DictItem[]>([])
  const [selectedType, setSelectedType] = useState<DictType | null>(null)
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [typeModalVisible, setTypeModalVisible] = useState(false)
  const [itemModalVisible, setItemModalVisible] = useState(false)
  const [editingType, setEditingType] = useState<DictType | null>(null)
  const [editingItem, setEditingItem] = useState<DictItem | null>(null)
  const [typeForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  // 获取字典类型列表
  const fetchTypes = async () => {
    setLoadingTypes(true)
    try {
      const response = await api.get('/dicts/types') as any
      setTypes(response || [])
    } catch (error: any) {
      message.error(error?.error || '获取字典类型列表失败')
    } finally {
      setLoadingTypes(false)
    }
  }

  // 获取字典项列表
  const fetchItems = async (typeId: number) => {
    setLoadingItems(true)
    try {
      const response = await api.get('/dicts/types/' + typeId + '/data') as any
      setItems(response || [])
    } catch (error: any) {
      message.error(error?.error || '获取字典项列表失败')
    } finally {
      setLoadingItems(false)
    }
  }

  useEffect(() => {
    fetchTypes()
  }, [])

  // 点击字典类型
  const handleTypeClick = (type: DictType) => {
    setSelectedType(type)
    fetchItems(type.id)
  }

  // ========== 字典类型操作 ==========
  const handleAddType = () => {
    setEditingType(null)
    typeForm.resetFields()
    typeForm.setFieldsValue({ status: 'ENABLED' })
    setTypeModalVisible(true)
  }

  const handleEditType = (type: DictType) => {
    setEditingType(type)
    typeForm.setFieldsValue({
      name: type.name,
      code: type.code,
      remark: type.remark,
    })
    setTypeModalVisible(true)
  }

  const handleDeleteType = async (id: number) => {
    try {
      await api.delete('/dicts/types/' + id)
      message.success('字典类型删除成功')
      if (selectedType && selectedType.id === id) {
        setSelectedType(null)
        setItems([])
      }
      fetchTypes()
    } catch (error: any) {
      message.error(error?.error || '删除字典类型失败')
    }
  }

  const handleSubmitType = async () => {
    try {
      const values = await typeForm.validateFields()
      if (editingType) {
        // 后端未提供 PUT /dicts/types/:id，此处使用重建策略：仅允许编辑名称/备注
        // 如需更新 code 等，可调整接口
        // 注意：此处按需求仅提供 POST 与 DELETE
        message.info('当前仅支持新增/删除字典类型')
        setTypeModalVisible(false)
        return
      } else {
        await api.post('/dicts/types', values)
        message.success('字典类型创建成功')
      }
      setTypeModalVisible(false)
      fetchTypes()
    } catch (error: any) {
      if (error?.error) {
        message.error(error?.error)
      } else if (error.errorFields) {
        // 表单校验失败
      } else {
        message.error('操作失败')
      }
    }
  }

  // ========== 字典项操作 ==========
  const handleAddItem = () => {
    if (!selectedType) {
      message.warning('请先选择一个字典类型')
      return
    }
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({ status: 'ENABLED', sort: 0 })
    setItemModalVisible(true)
  }

  const handleEditItem = (item: DictItem) => {
    setEditingItem(item)
    itemForm.setFieldsValue({
      label: item.label,
      value: item.value,
      sort: item.sort,
      cssClass: item.cssClass,
      remark: item.remark,
      status: item.status,
    })
    setItemModalVisible(true)
  }

  const handleDeleteItem = async (id: number) => {
    try {
      await api.delete('/dicts/data/' + id)
      message.success('字典项删除成功')
      if (selectedType) fetchItems(selectedType.id)
    } catch (error: any) {
      message.error(error?.error || '删除字典项失败')
    }
  }

  const handleSubmitItem = async () => {
    if (!selectedType) return
    try {
      const values = await itemForm.validateFields()
      if (editingItem) {
        await api.put('/dicts/data/' + editingItem.id, values)
        message.success('字典项更新成功')
      } else {
        await api.post('/dicts/types/' + selectedType.id + '/data', values)
        message.success('字典项创建成功')
      }
      setItemModalVisible(false)
      fetchItems(selectedType.id)
      fetchTypes()
    } catch (error: any) {
      if (error?.error) {
        message.error(error?.error)
      } else if (error.errorFields) {
        // 表单校验失败
      } else {
        message.error('操作失败')
      }
    }
  }

  // 字典类型表格列
  const typeColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '编码',
      dataIndex: 'code',
      key: 'code',
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColor(s)}>{statusText(s)}</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: DictType) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditType(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除字典类型会同时删除其下所有字典项，确定继续？"
            onConfirm={() => handleDeleteType(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 字典项表格列
  const itemColumns = [
    {
      title: '标签',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '排序',
      dataIndex: 'sort',
      key: 'sort',
      width: 80,
    },
    {
      title: 'CSS Class',
      dataIndex: 'cssClass',
      key: 'cssClass',
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => <Tag color={statusColor(s)}>{statusText(s)}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: DictItem) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditItem(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除该字典项吗？"
            onConfirm={() => handleDeleteItem(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Row gutter={16}>
      {/* 左侧：字典类型 */}
      <Col span={10}>
        <Card
          title={<><BookOutlined style={{ marginRight: 8 }} />字典类型</>}
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddType}>
              新增类型
            </Button>
          }
        >
          <Table
            columns={typeColumns}
            dataSource={types}
            loading={loadingTypes}
            rowKey="id"
            size="small"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 个类型`,
            }}
            onRow={(record) => ({
              onClick: () => handleTypeClick(record),
              style: {
                cursor: 'pointer',
                background: selectedType && selectedType.id === record.id ? '#e6f4ff' : undefined,
              },
            })}
          />
        </Card>
      </Col>

      {/* 右侧：字典项 */}
      <Col span={14}>
        <Card
          title={
            <span>
              <AppstoreOutlined style={{ marginRight: 8 }} />
              字典项
              {selectedType && (
                <Tag color="blue" style={{ marginLeft: 12 }}>
                  {selectedType.name}（{selectedType.code}）
                </Tag>
              )}
            </span>
          }
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddItem}
              disabled={!selectedType}
            >
              新增字典项
            </Button>
          }
        >
          {selectedType ? (
            <Table
              columns={itemColumns}
              dataSource={items}
              loading={loadingItems}
              rowKey="id"
              size="small"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个字典项`,
              }}
            />
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: 48 }}>
              请在左侧选择一个字典类型查看其字典项
            </div>
          )}
        </Card>
      </Col>

      {/* 字典类型弹窗 */}
      <Modal
        title={editingType ? '编辑字典类型' : '新增字典类型'}
        open={typeModalVisible}
        onOk={handleSubmitType}
        onCancel={() => setTypeModalVisible(false)}
        width={500}
      >
        <Form form={typeForm} layout="vertical">
          <Form.Item
            name="name"
            label="类型名称"
            rules={[{ required: true, message: '请输入类型名称' }]}
          >
            <Input placeholder="例如：用户状态" />
          </Form.Item>

          <Form.Item
            name="code"
            label="类型编码"
            rules={[
              { required: true, message: '请输入类型编码' },
              { pattern: /^[A-Za-z0-9_]+$/, message: '编码仅允许字母、数字、下划线' },
            ]}
          >
            <Input placeholder="例如：user_status" disabled={!!editingType} />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 字典项弹窗 */}
      <Modal
        title={editingItem ? '编辑字典项' : '新增字典项'}
        open={itemModalVisible}
        onOk={handleSubmitItem}
        onCancel={() => setItemModalVisible(false)}
        width={500}
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item
            name="label"
            label="标签"
            rules={[{ required: true, message: '请输入标签' }]}
          >
            <Input placeholder="显示文本，例如：启用" />
          </Form.Item>

          <Form.Item
            name="value"
            label="值"
            rules={[{ required: true, message: '请输入值' }]}
          >
            <Input placeholder="实际存储值，例如：ENABLED" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="sort" label="排序">
                <Input type="number" placeholder="数字越小越靠前" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="cssClass" label="CSS Class">
                <Input placeholder="样式类名" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'ENABLED', label: '启用' },
                { value: 'DISABLED', label: '停用' },
              ]}
            />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  )
}

export default DictManagement
