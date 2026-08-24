import { useEffect, useState } from 'react'
import { Modal, Form, Input, InputNumber, Select, DatePicker, Button, Row, Col, message } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { createExpense, getProjects } from '../services/api'
import { OrgContactSelector } from './OrgContactSelector'

const expenseCategories = [
  '办公用品', '差旅费', '招待费', '交通费', '通讯费', '培训费', '其他'
]

interface ExpenseCreateModalProps {
  open: boolean
  onCancel: () => void
  /** 创建成功回调（如刷新关联数据） */
  onCreated?: (expense: any) => void
  /** 预填的关联出差 ID（如从出差详情页打开时） */
  defaultTripId?: number
}

/**
 * 新增费用报销弹窗（共享组件）
 *
 * 供出差详情页等场景就地打开，替代原先"跳转到费用页再弹窗"的交互。
 * 表单与费用报销页的新增弹窗保持一致（标题/项目必填 + 费用明细行）。
 */
export function ExpenseCreateModal({ open, onCancel, onCreated, defaultTripId }: ExpenseCreateModalProps) {
  const [form] = Form.useForm()
  const [projects, setProjects] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 打开时加载项目下拉并预填
  useEffect(() => {
    if (!open) return
    getProjects({ pageSize: 1000 })
      .then((res: any) => {
        const list = Array.isArray(res?.data) ? res.data : []
        setProjects(list)
      })
      .catch(() => setProjects([]))
    form.resetFields()
    form.setFieldsValue({ tripId: defaultTripId, items: [{}] })
  }, [open, defaultTripId, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const items = values.items.map((item: any) => ({
        ...item,
        expenseDate: item.expenseDate.toDate()
      }))
      setSubmitting(true)
      const created = await createExpense({ ...values, items })
      message.success('创建成功')
      form.resetFields()
      onCreated?.(created)
      onCancel()
    } catch (error: any) {
      if (error?.errorFields?.length) {
        message.error('请检查表单填写是否完整')
      } else {
        message.error(error?.error || '创建失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="新增报销"
      open={open}
      onOk={handleOk}
      confirmLoading={submitting}
      onCancel={() => { form.resetFields(); onCancel() }}
      width={600}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="title" label="报销标题" rules={[{ required: true, message: '请输入报销标题' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="projectId" label="关联项目">
              <Select placeholder="请选择关联项目（可选）" allowClear showSearch optionFilterProp="children">
                {projects.map(project => (
                  <Select.Option key={project.id} value={project.id}>
                    {project.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="tripId" label="关联出差" initialValue={defaultTripId}>
              <Select placeholder="请选择关联出差（可选）" allowClear disabled={!!defaultTripId}>
                {/* 从出差详情打开时锁定为当前出差；此处仅展示占位，值由 defaultTripId 预填 */}
                <Select.Option value={defaultTripId}>当前出差</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="contactId" label="客户">
              <OrgContactSelector
                placeholder="请选择客户联系人"
                onContactSelect={(contactId, orgId) => {
                  form.setFieldValue('contactId', contactId)
                  form.setFieldValue('organizationId', orgId)
                }}
              />
            </Form.Item>
            <Form.Item name="organizationId" hidden><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="description" label="备注">
              <Input.TextArea rows={1} />
            </Form.Item>
          </Col>
        </Row>

        {/* 费用明细 */}
        <div style={{ marginBottom: 8, fontWeight: 500 }}>费用明细</div>
        <Form.List name="items" rules={[{
          validator: async (_, items) => {
            if (!items || items.length === 0) {
              return Promise.reject(new Error('至少添加一条费用明细'))
            }
          }
        }]}>
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <Row gutter={12} key={key} align="middle" style={{ marginBottom: 12 }}>
                  <Col span={5}>
                    <Form.Item
                      {...restField}
                      name={[name, 'category']}
                      rules={[{ required: true, message: '请选择类别' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select placeholder="费用类别" style={{ width: '100%' }}>
                        {expenseCategories.map(cat => (
                          <Select.Option key={cat} value={cat}>{cat}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={5}>
                    <Form.Item
                      {...restField}
                      name={[name, 'amount']}
                      rules={[{ required: true, message: '请输入金额' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber style={{ width: '100%' }} precision={2} placeholder="金额（元）" suffix="元" />
                    </Form.Item>
                  </Col>
                  <Col span={5}>
                    <Form.Item
                      {...restField}
                      name={[name, 'expenseDate']}
                      rules={[{ required: true, message: '请选择日期' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <DatePicker style={{ width: '100%' }} placeholder="费用日期" />
                    </Form.Item>
                  </Col>
                  <Col span={7}>
                    <Form.Item
                      {...restField}
                      name={[name, 'description']}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="费用说明（可选）" />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                      style={{ width: '100%' }}
                    />
                  </Col>
                </Row>
              ))}
              <Form.Item>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  添加费用明细
                </Button>
                <Form.ErrorList errors={errors} />
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  )
}
