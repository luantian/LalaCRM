import { useEffect, useState, useMemo } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, message, Space, Tag, Tree, Row, Col, Descriptions, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined, UserOutlined, ExpandAltOutlined, ShrinkOutlined } from '@ant-design/icons'
import api from '../services/api'

interface Department {
  id: number
  name: string
  parentId: number | null
  order: number
  leader: string
  phone: string
  email: string
  status: string
  createdAt: string
  updatedAt: string
  children?: Department[]
}

interface FlatDepartment {
  id: number
  name: string
}

interface TreeNode {
  key: number
  title: string
  children?: TreeNode[]
}

// 将树形数据转换为 Tree 组件所需的格式
const convertToTreeData = (depts: Department[]): TreeNode[] => {
  return depts.map((dept) => ({
    key: dept.id,
    title: dept.name,
    children: dept.children ? convertToTreeData(dept.children) : undefined,
  }))
}

// 递归查找部门节点
const findDeptById = (depts: Department[], id: number): Department | null => {
  for (const dept of depts) {
    if (dept.id === id) return dept
    if (dept.children) {
      const found = findDeptById(dept.children, id)
      if (found) return found
    }
  }
  return null
}

// 递归收集所有 key
const collectAllKeys = (depts: Department[]): number[] => {
  const keys: number[] = []
  const walk = (list: Department[]) => {
    for (const d of list) {
      keys.push(d.id)
      if (d.children) walk(d.children)
    }
  }
  walk(depts)
  return keys
}

// 递归展平部门列表
const flattenDepts = (depts: Department[]): FlatDepartment[] => {
  const result: FlatDepartment[] = []
  const walk = (list: Department[]) => {
    for (const d of list) {
      result.push({ id: d.id, name: d.name })
      if (d.children) walk(d.children)
    }
  }
  walk(depts)
  return result
}

// 递归统计子部门下用户数（后端未提供，此处仅展示子部门数量）
const countChildren = (dept: Department): number => {
  if (!dept.children) return 0
  let count = dept.children.length
  for (const child of dept.children) {
    count += countChildren(child)
  }
  return count
}

function DepartmentManagement() {
  const [treeData, setTreeData] = useState<Department[]>([])
  const [flatList, setFlatList] = useState<FlatDepartment[]>([])
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])
  const [autoExpandParent, setAutoExpandParent] = useState(true)
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [form] = Form.useForm()

  const fetchDepartments = async () => {
    setLoading(true)
    try {
      const [treeRes, flatRes] = await Promise.all([
        api.get('/departments/tree'),
        api.get('/departments'),
      ])
      setTreeData(treeRes || [])
      const flat = (flatRes || []).map((d: any) => ({ id: d.id, name: d.name }))
      setFlatList(flat)
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取部门列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDepartments()
  }, [])

  const treeNodes = useMemo(() => convertToTreeData(treeData), [treeData])

  // 子部门列表（选中部门的直接子节点）
  const subDepartments = useMemo(() => {
    if (!selectedDept || !selectedDept.children) return []
    return selectedDept.children.map((c) => ({
      ...c,
      childCount: c.children ? c.children.length : 0,
    }))
  }, [selectedDept])

  // 展开全部
  const handleExpandAll = () => {
    const allKeys = collectAllKeys(treeData)
    setExpandedKeys(allKeys)
    setAutoExpandParent(false)
  }

  // 收起全部
  const handleCollapseAll = () => {
    setExpandedKeys([])
    setAutoExpandParent(false)
  }

  // 树节点选择
  const handleTreeSelect = (keys: any, info: any) => {
    const id = keys[0]
    if (id === undefined) {
      setSelectedDept(null)
      return
    }
    const dept = findDeptById(treeData, id)
    setSelectedDept(dept)
  }

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingDept(null)
    form.resetFields()
    // 默认父部门为当前选中部门
    if (selectedDept) {
      form.setFieldsValue({ parentId: selectedDept.id, status: 'ENABLED', order: 0 })
    } else {
      form.setFieldsValue({ status: 'ENABLED', order: 0 })
    }
    setModalVisible(true)
  }

  // 打开编辑弹窗
  const handleEdit = (dept: any) => {
    setEditingDept(dept)
    form.setFieldsValue({
      name: dept.name,
      parentId: dept.parentId ?? undefined,
      order: dept.order,
      leader: dept.leader,
      phone: dept.phone,
      email: dept.email,
      status: dept.status,
    })
    setModalVisible(true)
  }

  // 删除部门
  const handleDelete = async (id: number) => {
    try {
      await api.delete('/departments/' + id)
      message.success('部门删除成功')
      if (selectedDept && selectedDept.id === id) {
        setSelectedDept(null)
      }
      fetchDepartments()
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除部门失败')
    }
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        parentId: values.parentId ?? null,
      }

      if (editingDept) {
        await api.put('/departments/' + editingDept.id, payload)
        message.success('部门更新成功')
      } else {
        await api.post('/departments', payload)
        message.success('部门创建成功')
      }
      setModalVisible(false)
      fetchDepartments()
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error)
      } else if (error.errorFields) {
        // 表单校验失败
      } else {
        message.error('操作失败')
      }
    }
  }

  const statusColor = (s: string) => (s === 'ENABLED' ? 'green' : 'default')
  const statusText = (s: string) => (s === 'ENABLED' ? '正常' : '停用')

  const subColumns = [
    {
      title: '部门名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '负责人',
      dataIndex: 'leader',
      key: 'leader',
      render: (v: string) => v || '-',
    },
    {
      title: '排序',
      dataIndex: 'order',
      key: 'order',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColor(s)}>{statusText(s)}</Tag>,
    },
    {
      title: '下级数量',
      dataIndex: 'childCount',
      key: 'childCount',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除该部门吗？子部门也会被一并删除。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Row gutter={16}>
      {/* 左侧：部门树 */}
      <Col span={7}>
        <Card
          title={<><ApartmentOutlined style={{ marginRight: 8 }} />部门结构</>}
          extra={
            <Space>
              <Button size="small" icon={<ExpandAltOutlined />} onClick={handleExpandAll}>
                展开
              </Button>
              <Button size="small" icon={<ShrinkOutlined />} onClick={handleCollapseAll}>
                收起
              </Button>
            </Space>
          }
          style={{ height: '100%' }}
        >
          {treeNodes.length > 0 ? (
            <Tree
              showLine
              treeData={treeNodes}
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              onExpand={(keys) => {
                setExpandedKeys(keys as number[])
                setAutoExpandParent(false)
              }}
              onSelect={handleTreeSelect}
              selectedKeys={selectedDept ? [selectedDept.id] : []}
              style={{ width: '100%' }}
            />
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>
              {loading ? '加载中...' : '暂无部门数据'}
            </div>
          )}
        </Card>
      </Col>

      {/* 右侧：详情 + 子部门列表 */}
      <Col span={17}>
        <Card
          title="部门详情"
          extra={
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                新增部门
              </Button>
              {selectedDept && (
                <>
                  <Button icon={<EditOutlined />} onClick={() => handleEdit(selectedDept)}>
                    编辑当前
                  </Button>
                  <Popconfirm
                    title="确认删除"
                    description="确定要删除该部门吗？子部门也会被一并删除。"
                    onConfirm={() => handleDelete(selectedDept.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      删除当前
                    </Button>
                  </Popconfirm>
                </>
              )}
            </Space>
          }
        >
          {selectedDept ? (
            <>
              <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="部门名称">{selectedDept.name}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColor(selectedDept.status)}>{statusText(selectedDept.status)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="负责人">{selectedDept.leader || '-'}</Descriptions.Item>
                <Descriptions.Item label="排序">{selectedDept.order ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="联系电话">{selectedDept.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{selectedDept.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="直接子部门数">{selectedDept.children ? selectedDept.children.length : 0}</Descriptions.Item>
                <Descriptions.Item label="全部子孙部门数">{countChildren(selectedDept)}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginBottom: 12, fontWeight: 500 }}>
                <UserOutlined style={{ marginRight: 6 }} />
                子部门列表
              </div>
              <Table
                columns={subColumns}
                dataSource={subDepartments}
                rowKey="id"
                pagination={false}
                size="small"
              />
            </>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: 48 }}>
              请在左侧部门树中选择一个部门查看详情
            </div>
          )}
        </Card>
      </Col>

      {/* 新增 / 编辑弹窗 */}
      <Modal
        title={editingDept ? '编辑部门' : '新增部门'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="部门名称"
            rules={[{ required: true, message: '请输入部门名称' }]}
          >
            <Input placeholder="请输入部门名称" />
          </Form.Item>

          <Form.Item name="parentId" label="上级部门">
            <Select
              allowClear
              showSearch
              optionFilterProp="children"
              placeholder="不选则为顶级部门"
              options={flatList.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
            />
          </Form.Item>

          <Form.Item name="order" label="排序">
            <Input type="number" placeholder="数字越小越靠前" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="leader" label="负责人">
                <Input placeholder="请输入负责人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ENABLED', label: '正常' },
                { value: 'DISABLED', label: '停用' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  )
}

export default DepartmentManagement
