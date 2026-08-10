import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取所有角色
router.get('/', authenticateToken, checkPermission('system:role:list'), async (req: Request, res: Response) => {
  try {
    const roles = await prisma.roleModel.findMany({
      orderBy: { createdAt: 'desc' }
    })

    // 为每个角色从 RoleMenu -> MenuItem 动态获取三段式权限
    const rolesWithPerms = await Promise.all(roles.map(async (role: any) => {
      // 管理员特殊处理：返回通配符
      if (role.name === 'ADMIN') {
        return { ...role, permissions: ['*'] }
      }

      // 从 RoleMenu -> MenuItem.perm 获取三段式权限标识
      const roleMenus = await prisma.roleMenu.findMany({
        where: { roleId: role.id },
        include: { menu: { select: { perm: true } } }
      })

      const perms = roleMenus
        .map((rm: any) => rm.menu?.perm)
        .filter((perm: any): perm is string => !!perm)

      return { ...role, permissions: [...new Set(perms)] }
    }))

    res.json(rolesWithPerms)
  } catch (error) {
    logger.error('Get roles error:', error)
    res.status(500).json({ error: '获取角色列表失败' })
  }
})

// 创建角色（仅admin）
router.post('/', authenticateToken, checkPermission('system:role:add'), logOperation('角色管理', 'CREATE'), async (req: Request, res: Response) => {
  try {
    const { name, displayName, description } = req.body

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
        roleKey: name, // 使用角色名称作为 roleKey
        description,
        dataScope: req.body.dataScope || 'ALL'
      }
    })

    res.status(201).json(role)
  } catch (error) {
    logger.error('Create role error:', error)
    res.status(500).json({ error: '创建角色失败' })
  }
})

// 更新角色（仅admin）
router.put('/:id', authenticateToken, checkPermission('system:role:edit'), logOperation('角色管理', 'UPDATE'), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string)
    const { displayName, description } = req.body

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
        ...(req.body.dataScope && { dataScope: req.body.dataScope })
      }
    })

    res.json(role)
  } catch (error) {
    logger.error('Update role error:', error)
    res.status(500).json({ error: '更新角色失败' })
  }
})

// 删除角色（仅admin）
router.delete('/:id', authenticateToken, checkPermission('system:role:delete'), logOperation('角色管理', 'DELETE'), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string)

    // 检查角色是否存在
    const existingRole = await prisma.roleModel.findUnique({
      where: { id: roleId }
    })
    if (!existingRole) {
      return res.status(404).json({ error: '角色不存在' })
    }

    // 检查是否有用户通过 UserRole 关联表使用此角色
    const userRoleCount = await prisma.userRole.count({
      where: { roleId }
    })
    if (userRoleCount > 0) {
      return res.status(400).json({ error: `有 ${userRoleCount} 个用户正在使用此角色，无法删除` })
    }

    // 检查是否有用户通过旧的 roleId 字段使用此角色
    const userCount = await prisma.user.count({
      where: { roleId }
    })
    if (userCount > 0) {
      return res.status(400).json({ error: `有 ${userCount} 个用户正在使用此角色，无法删除` })
    }

    // 先删除角色-菜单关联（避免外键约束错误）
    await prisma.roleMenu.deleteMany({
      where: { roleId }
    })

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
