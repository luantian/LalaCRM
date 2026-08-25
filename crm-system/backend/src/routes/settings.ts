import prisma from '../lib/prisma'
import { Router, Request, Response } from 'express'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { isAdmin } from '../utils/permission'
import { hasAmountPermission } from '../utils/amountPermission'
import logger from '../utils/logger'

const router = Router()

// 获取联系方式可见性配置
router.get('/contact-info-permission', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'contact_info_viewable_roles' }
    })
    
    // 默认无配置时，只有管理员和销售经理可见
    const roleIds = config ? JSON.parse(config.value) : []
    
    // 返回角色 ID 列表和角色详情
    const roles = await prisma.roleModel.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true, displayName: true }
    })
    
    res.json({ roleIds, roles })
  } catch (error) {
    logger.error('Get contact info permission config error:', error)
    res.status(500).json({ error: '获取配置失败' })
  }
})

// 更新联系方式可见性配置（仅管理员）
router.put('/contact-info-permission', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { roleIds } = req.body
    
    if (!Array.isArray(roleIds)) {
      return res.status(400).json({ error: 'roleIds 必须是数组' })
    }
    
    // 验证角色 ID 是否存在
    const validRoles = await prisma.roleModel.findMany({
      where: { id: { in: roleIds } },
      select: { id: true }
    })
    
    if (validRoles.length !== roleIds.length) {
      return res.status(400).json({ error: '部分角色 ID 无效' })
    }
    
    // 保存或更新配置
    await prisma.systemConfig.upsert({
      where: { key: 'contact_info_viewable_roles' },
      update: { value: JSON.stringify(roleIds) },
      create: { key: 'contact_info_viewable_roles', value: JSON.stringify(roleIds) }
    })
    
    logger.info(`User ${req.user!.id} updated contact info permission config:`, roleIds)
    
    res.json({ success: true, roleIds })
  } catch (error) {
    logger.error('Update contact info permission config error:', error)
    res.status(500).json({ error: '更新配置失败' })
  }
})

// 获取项目金额可见性配置
router.get('/project-amount-permission', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'project_amount_viewable_roles' }
    })
    
    // 默认无配置时，只有管理员和财务可见
    const roleIds = config ? JSON.parse(config.value) : []
    
    // 返回角色 ID 列表和角色详情
    const roles = await prisma.roleModel.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true, displayName: true }
    })
    
    res.json({ roleIds, roles })
  } catch (error) {
    logger.error('Get project amount permission config error:', error)
    res.status(500).json({ error: '获取配置失败' })
  }
})

// 更新项目金额可见性配置（仅管理员）
router.put('/project-amount-permission', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { roleIds } = req.body
    
    if (!Array.isArray(roleIds)) {
      return res.status(400).json({ error: 'roleIds 必须是数组' })
    }
    
    // 验证角色 ID 是否存在
    const validRoles = await prisma.roleModel.findMany({
      where: { id: { in: roleIds } },
      select: { id: true }
    })
    
    if (validRoles.length !== roleIds.length) {
      return res.status(400).json({ error: '部分角色 ID 无效' })
    }
    
    // 保存或更新配置
    await prisma.systemConfig.upsert({
      where: { key: 'project_amount_viewable_roles' },
      update: { value: JSON.stringify(roleIds) },
      create: { key: 'project_amount_viewable_roles', value: JSON.stringify(roleIds) }
    })
    
    logger.info(`User ${req.user!.id} updated project amount permission config:`, roleIds)
    
    res.json({ success: true, roleIds })
  } catch (error) {
    logger.error('Update project amount permission config error:', error)
    res.status(500).json({ error: '更新配置失败' })
  }
})

// 检查当前用户是否有项目金额查看权限
router.get('/check-project-amount-permission', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id

    // 复用统一的金额权限判定（管理员按 roleKey 判定，与实际过滤逻辑一致）
    const hasPermission = await hasAmountPermission(userId)

    res.json({ hasPermission })
  } catch (error) {
    logger.error('Check project amount permission error:', error)
    res.status(500).json({ error: '检查权限失败' })
  }
})

// ==================== 企业微信群机器人 ====================

// 获取企微机器人配置（webhook 地址较敏感，仅可编辑系统设置的人可见）
router.get('/wecom-webhook', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { getWecomWebhook } = await import('../utils/wecomBot')
    const webhook = await getWecomWebhook()
    res.json({ webhook, enabled: !!webhook })
  } catch (error) {
    logger.error('Get wecom webhook error:', error)
    res.status(500).json({ error: '获取配置失败' })
  }
})

// 保存企微机器人 webhook（仅管理员）
router.put('/wecom-webhook', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { webhook } = req.body
    if (webhook && !/^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=/.test(String(webhook))) {
      return res.status(400).json({ error: 'webhook 地址格式不正确，应为 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...' })
    }
    const { setWecomWebhook } = await import('../utils/wecomBot')
    await setWecomWebhook(String(webhook || '').trim())
    logger.info(`User ${req.user!.id} 更新企微机器人 webhook`)
    res.json({ success: true })
  } catch (error) {
    logger.error('Update wecom webhook error:', error)
    res.status(500).json({ error: '保存配置失败' })
  }
})

// 发送测试消息（验证 webhook 是否可用，失败时透出腾讯原始错误）
router.post('/wecom-webhook/test', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { sendWecomMarkdown } = await import('../utils/wecomBot')
    const result = await sendWecomMarkdown(`**✅ CRM 企微提醒已配置**\n\n推送通道工作正常\n<font color=\"comment\">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</font>`)
    if (!result.ok) {
      return res.status(400).json({ error: '发送失败：' + (result.errmsg || '请检查 webhook 地址') })
    }
    res.json({ success: true })
  } catch (error) {
    logger.error('Test wecom webhook error:', error)
    res.status(500).json({ error: '测试发送失败' })
  }
})

// ==================== Server酱(个人微信提醒) ====================

// 获取 Server酱 SendKey 配置
router.get('/serverchan', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { getServerChanKey } = await import('../utils/serverChan')
    const key = await getServerChanKey()
    res.json({ sendKey: key, enabled: !!key })
  } catch (error) {
    logger.error('Get serverchan config error:', error)
    res.status(500).json({ error: '获取配置失败' })
  }
})

// 保存 Server酱 SendKey（仅管理员）
router.put('/serverchan', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { sendKey } = req.body
    const v = String(sendKey || '').trim()
    if (v && !/^[A-Za-z0-9]{10,}$/.test(v)) {
      return res.status(400).json({ error: 'SendKey 格式不正确（应为 ftqq.com 上复制的一串字母数字）' })
    }
    const { setServerChanKey } = await import('../utils/serverChan')
    await setServerChanKey(v)
    logger.info(`User ${req.user!.id} 更新 Server酱 SendKey`)
    res.json({ success: true })
  } catch (error) {
    logger.error('Update serverchan config error:', error)
    res.status(500).json({ error: '保存配置失败' })
  }
})

// 发送测试消息
router.post('/serverchan/test', authenticateToken, checkPermission('system:settings:edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { sendServerChan } = await import('../utils/serverChan')
    const ok = await sendServerChan('CRM 提醒测试成功', `✅ Server酱通道配置成功\n时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    if (!ok) {
      return res.status(400).json({ error: '发送失败：请检查 SendKey 是否正确、微信是否已绑定' })
    }
    res.json({ success: true })
  } catch (error) {
    logger.error('Test serverchan error:', error)
    res.status(500).json({ error: '测试发送失败' })
  }
})

export default router
