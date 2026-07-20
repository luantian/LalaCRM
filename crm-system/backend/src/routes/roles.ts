import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 中间件：检查是否是admin
const checkAdmin = async (req: Request, res: Response, next: Function) => {
  try {
    const userId = (req as any).user?.id
    if (!userId) {
      return res.status(401).json({ error: '未授权访问' })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    })

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能访问此功能' })
    }

    next()
  } catch (error) {
    logger.error('Admin check error:', error)
    res.status(500).json({ error: '服务器错误' })
  }
}

// 获取所有角色
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const roles = await prisma.roleModel.findMany({
      orderBy: { createdAt: 'desc' }
    })

    res.json(roles)
  } catch (error) {
    logger.error('Get roles error:', error)
    res.status(500).json({ error: '获取角色列表失败' })
  }
})

// 创建角色（仅admin）
router.post('/', authenticateToken, checkAdmin, logOperation('角色管理', 'CREATE'), async (req: Request, res: Response) => {
  try {
    const { name, displayName, description, permissions } = req.body

    // 验证必填字段
    if (!name || !displayName || !description) {
      return res.status(400).json({ error: '请填写所有必填字段' })
    }

    // 验证角色名称格式
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      return res.status(400).json({ error: '角色名称只能包含大写字母、数字和下划线，且必须以大写字母开头' })
    }

    // 检查角色名称是否已存在
    const existingRole = await prisma.roleModel.findUnique({
      where: { name }
    })
    if (existingRole) {
      return res.status(400).json({ error: '角色名称已存在' })
    }

    // 创建角色
    const role = await prisma.roleModel.create({
      data: {
        name,
        displayName,
        description,
        permissions: permissions || []
      }
    })

    res.status(201).json(role)
  } catch (error) {
    logger.error('Create role error:', error)
    res.status(500).json({ error: '创建角色失败' })
  }
})

// 更新角色（仅admin）
router.put('/:id', authenticateToken, checkAdmin, logOperation('角色管理', 'UPDATE'), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string)
    const { displayName, description, permissions } = req.body

    // 检查角色是否存在
    const existingRole = await prisma.roleModel.findUnique({
      where: { id: roleId }
    })
    if (!existingRole) {
      return res.status(404).json({ error: '角色不存在' })
    }

    // 更新角色
    const role = await prisma.roleModel.update({
      where: { id: roleId },
      data: {
        displayName,
        description,
        permissions
      }
    })

    res.json(role)
  } catch (error) {
    logger.error('Update role error:', error)
    res.status(500).json({ error: '更新角色失败' })
  }
})

// 删除角色（仅admin）
router.delete('/:id', authenticateToken, checkAdmin, logOperation('角色管理', 'DELETE'), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string)

    // 检查角色是否存在
    const existingRole = await prisma.roleModel.findUnique({
      where: { id: roleId }
    })
    if (!existingRole) {
      return res.status(404).json({ error: '角色不存在' })
    }

    // 检查是否有用户使用此角色
    const userCount = await prisma.user.count({
      where: { roleId }
    })
    if (userCount > 0) {
      return res.status(400).json({ error: `有 ${userCount} 个用户正在使用此角色，无法删除` })
    }

    // 删除角色
    await prisma.roleModel.delete({
      where: { id: roleId }
    })

    res.json({ message: '角色删除成功' })
  } catch (error) {
    logger.error('Delete role error:', error)
    res.status(500).json({ error: '删除角色失败' })
  }
})

export default router
