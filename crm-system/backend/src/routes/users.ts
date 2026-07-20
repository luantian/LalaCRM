import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
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

// 获取所有用户（仅admin）
router.get('/', authenticateToken, checkAdmin, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        roleRef: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(users)
  } catch (error) {
    logger.error('Get users error:', error)
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

// 获取用户下拉列表（所有认证用户可用，仅返回基本信息）
router.get('/dropdown', authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {},
      select: { id: true, username: true, name: true, email: true },
      orderBy: { name: 'asc' }
    })
    res.json(users)
  } catch (error) {
    logger.error('Get users dropdown error:', error)
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

// 创建用户（仅admin）
router.post('/', authenticateToken, checkAdmin, logOperation('用户管理', 'CREATE'), async (req: Request, res: Response) => {
  try {
    const { username, password, email, name, roleId } = req.body

    // 验证必填字段
    if (!username || !password || !email || !name) {
      return res.status(400).json({ error: '请填写所有必填字段' })
    }

    // 验证角色是否存在
    if (roleId) {
      const roleExists = await prisma.roleModel.findUnique({
        where: { id: roleId }
      })
      if (!roleExists) {
        return res.status(400).json({ error: '角色不存在' })
      }
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    })
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' })
    }

    // 检查邮箱是否已存在
    const existingEmail = await prisma.user.findUnique({
      where: { email }
    })
    if (existingEmail) {
      return res.status(400).json({ error: '邮箱已被使用' })
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10)

    // 获取角色的名称作为默认role枚举值
    let defaultRole: 'ADMIN' | 'PROJECT_DIRECTOR' | 'PROJECT_MANAGER' | 'USER' = 'USER'
    if (roleId) {
      const roleModel = await prisma.roleModel.findUnique({
        where: { id: roleId }
      })
      if (roleModel && ['ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER', 'USER'].includes(roleModel.name)) {
        defaultRole = roleModel.name as 'ADMIN' | 'PROJECT_DIRECTOR' | 'PROJECT_MANAGER' | 'USER'
      }
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        name,
        role: defaultRole,
        roleId: roleId || null
      },
      include: {
        roleRef: {
          select: {
            id: true,
            name: true,
            displayName: true
          }
        }
      }
    })

    res.status(201).json(user)
  } catch (error) {
    logger.error('Create user error:', error)
    res.status(500).json({ error: '创建用户失败' })
  }
})

// 更新用户（仅admin）
router.put('/:id', authenticateToken, checkAdmin, logOperation('用户管理', 'UPDATE'), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string)
    const { email, name, roleId, password } = req.body

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    })
    if (!existingUser) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 验证角色是否存在
    if (roleId) {
      const roleExists = await prisma.roleModel.findUnique({
        where: { id: roleId }
      })
      if (!roleExists) {
        return res.status(400).json({ error: '角色不存在' })
      }
    }

    // 准备更新数据
    const updateData: any = { email, name }

    // 如果提供了角色ID，更新角色
    if (roleId !== undefined) {
      updateData.roleId = roleId
      // 同时更新role枚举值
      if (roleId) {
        const roleModel = await prisma.roleModel.findUnique({
          where: { id: roleId }
        })
        if (roleModel && ['ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER', 'USER'].includes(roleModel.name)) {
          updateData.role = roleModel.name as 'ADMIN' | 'PROJECT_DIRECTOR' | 'PROJECT_MANAGER' | 'USER'
        }
      }
    }

    // 如果提供了新密码，则加密
    if (password) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    // 更新用户
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        roleRef: {
          select: {
            id: true,
            name: true,
            displayName: true
          }
        }
      }
    })

    res.json(user)
  } catch (error) {
    logger.error('Update user error:', error)
    res.status(500).json({ error: '更新用户失败' })
  }
})

// 删除用户（仅admin）
router.delete('/:id', authenticateToken, checkAdmin, logOperation('用户管理', 'DELETE'), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string)

    // 不能删除自己
    const currentUserId = (req as any).user?.id
    if (currentUserId === userId) {
      return res.status(400).json({ error: '不能删除自己的账户' })
    }

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    })
    if (!existingUser) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 删除用户
    await prisma.user.delete({
      where: { id: userId }
    })

    res.json({ message: '用户删除成功' })
  } catch (error) {
    logger.error('Delete user error:', error)
    res.status(500).json({ error: '删除用户失败' })
  }
})

// 获取角色列表
router.get('/roles', authenticateToken, async (req: Request, res: Response) => {
  try {
    const roles = [
      { value: 'ADMIN', label: '管理员', description: '拥有所有权限' },
      { value: 'PROJECT_DIRECTOR', label: '项目总监', description: '可以查看所有项目' },
      { value: 'PROJECT_MANAGER', label: '项目经理', description: '只能管理自己负责的项目' },
      { value: 'USER', label: '普通用户', description: '只能查看项目，不能修改' }
    ]

    res.json(roles)
  } catch (error) {
    logger.error('Get roles error:', error)
    res.status(500).json({ error: '获取角色列表失败' })
  }
})

export default router
