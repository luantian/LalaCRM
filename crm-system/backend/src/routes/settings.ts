import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { isAdmin } from '../utils/permission'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

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
router.put('/contact-info-permission', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // 检查管理员权限
    if (!req.user?.id || !(await isAdmin(req.user.id))) {
      return res.status(403).json({ error: '仅管理员可配置' })
    }
    
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
    
    logger.info(`User ${req.user.id} updated contact info permission config:`, roleIds)
    
    res.json({ success: true, roleIds })
  } catch (error) {
    logger.error('Update contact info permission config error:', error)
    res.status(500).json({ error: '更新配置失败' })
  }
})

export default router
