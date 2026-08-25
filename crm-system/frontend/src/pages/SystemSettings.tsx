import { useEffect, useState } from 'react'
import { Card, Form, Input, Button, App, Tag, Space, Typography } from 'antd'
import { SaveOutlined, SendOutlined, RobotOutlined, MobileOutlined } from '@ant-design/icons'
import api from '../services/api'

const { Paragraph, Text } = Typography

function SystemSettings() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [scForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [scSaving, setScSaving] = useState(false)
  const [scTesting, setScTesting] = useState(false)
  const [scEnabled, setScEnabled] = useState(false)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const [wecomRes, scRes]: any[] = await Promise.all([
        api.get('/settings/wecom-webhook'),
        api.get('/settings/serverchan'),
      ])
      form.setFieldsValue({ webhook: wecomRes.webhook || '' })
      setEnabled(!!wecomRes.enabled)
      scForm.setFieldsValue({ sendKey: scRes.sendKey || '' })
      setScEnabled(!!scRes.enabled)
    } catch (e: any) {
      message.error(e?.error || '获取配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchConfig() }, [])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await api.put('/settings/wecom-webhook', { webhook: values.webhook || '' })
      message.success(values.webhook ? '已保存' : '已清空，企微提醒停用')
      fetchConfig()
    } catch (e: any) {
      message.error(e?.error || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    // 先保存当前输入再测试，避免"改了地址没保存"的困惑
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    setTesting(true)
    try {
      await api.put('/settings/wecom-webhook', { webhook: values.webhook || '' })
      await api.post('/settings/wecom-webhook/test')
      message.success('测试消息已发送，请到企业微信群查看')
      fetchConfig()
    } catch (e: any) {
      message.error(e?.error || '测试失败，请检查 webhook 地址')
    } finally {
      setTesting(false)
    }
  }

  const handleScSave = async () => {
    const values = await scForm.validateFields()
    setScSaving(true)
    try {
      await api.put('/settings/serverchan', { sendKey: values.sendKey || '' })
      message.success(values.sendKey ? '已保存' : '已清空，Server酱提醒停用')
      fetchConfig()
    } catch (e: any) {
      message.error(e?.error || '保存失败')
    } finally {
      setScSaving(false)
    }
  }

  const handleScTest = async () => {
    const values = await scForm.validateFields().catch(() => null)
    if (!values) return
    setScTesting(true)
    try {
      await api.put('/settings/serverchan', { sendKey: values.sendKey || '' })
      await api.post('/settings/serverchan/test')
      message.success('测试消息已发送，请到绑定的微信查看')
      fetchConfig()
    } catch (e: any) {
      message.error(e?.error || '测试失败，请检查 SendKey')
    } finally {
      setScTesting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>系统设置</h2>
      </div>

      <Card
        title={<Space><RobotOutlined style={{ color: '#1890ff' }} />企业微信群机器人提醒</Space>}
        loading={loading}
        style={{ maxWidth: 760, borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        extra={enabled ? <Tag color="green">已启用</Tag> : <Tag>未配置</Tag>}
      >
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          配置后，以下事件会自动推送到企业微信群：<Text strong>报销</Text>（提交/通过/驳回/打款）、<Text strong>出差</Text>（提交/重新提交/通过/驳回）、<Text strong>报价单</Text>（提交/通过/驳回）、<Text strong>合同</Text>（提交/生效/取消）、<Text strong>采购</Text>（下单/发运/到货/取消）、<Text strong>任务</Text>（分配/提交待确认/确认完成/退回重做，带任务标题并 @ 相关人）。日报与考勤不推送。
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          💡 任务提醒要 @ 到本人，需在「系统管理 → 用户管理」里给成员填写手机号（须与其企业微信绑定的手机号一致）。
        </Paragraph>
        <Paragraph style={{ fontSize: 13, background: '#fafafa', padding: '10px 12px', borderRadius: 8 }}>
          <Text strong>获取 webhook：</Text>
          企业微信群里点右上角 <Text code>···</Text> → 群机器人 → 添加机器人（如"CRM提醒"）→ 复制 Webhook 地址粘贴到下面。
          建议单独建一个"CRM提醒"群，把需要收提醒的同事拉进来。
        </Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item
            name="webhook"
            label="机器人 Webhook 地址"
            rules={[{
              validator: (_, v) => {
                if (!v) return Promise.resolve()
                if (/^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=/.test(v)) return Promise.resolve()
                return Promise.reject(new Error('地址应以 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key= 开头'))
              }
            }]}
          >
            <Input.Password placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx" visibilityToggle />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存</Button>
            <Button icon={<SendOutlined />} loading={testing} onClick={handleTest}>保存并发送测试</Button>
          </Space>
        </Form>
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          提醒不配置也不影响系统内使用（站内通知照常）；推送失败只记日志，不会阻塞报销流程。
        </Paragraph>
      </Card>

      <Card
        title={<Space><MobileOutlined style={{ color: '#52c41a' }} />Server酱 · 个人微信提醒</Space>}
        style={{ maxWidth: 760, borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 16 }}
        extra={scEnabled ? <Tag color="green">已启用</Tag> : <Tag>未配置</Tag>}
      >
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          消息直接推到一个人的微信（通常配总经理的）：报销提交/通过/驳回/打款时，他的微信会收到提醒。与企微群机器人互不冲突，配了哪个走哪个，都配则都发。
        </Paragraph>
        <Paragraph style={{ fontSize: 13, background: '#fafafa', padding: '10px 12px', borderRadius: 8 }}>
          <Text strong>获取 SendKey：</Text>
          需要收提醒的人用微信扫码登录 <Text code>ftqq.com</Text>（Server酱官网）→ 绑定微信 → 复制 SendKey 粘贴到下面。免费版每人每天限 5 条，审批提醒足够。
        </Paragraph>
        <Form form={scForm} layout="vertical">
          <Form.Item
            name="sendKey"
            label="SendKey"
            rules={[{
              validator: (_, v) => {
                if (!v) return Promise.resolve()
                if (/^[A-Za-z0-9]{10,}$/.test(v)) return Promise.resolve()
                return Promise.reject(new Error('SendKey 应为一串字母数字（在 ftqq.com 登录后复制）'))
              }
            }]}
          >
            <Input.Password placeholder="SCTxxxxxxxxxxxxxxxx" visibilityToggle />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={scSaving} onClick={handleScSave}>保存</Button>
            <Button icon={<SendOutlined />} loading={scTesting} onClick={handleScTest}>保存并发送测试</Button>
          </Space>
        </Form>
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          注意：Server酱消息经第三方服务器转发，系统只发送笼统提醒文案（不含金额等业务数据）。
        </Paragraph>
      </Card>
    </div>
  )
}

export default SystemSettings
