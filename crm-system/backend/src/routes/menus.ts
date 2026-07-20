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

// 获取所有菜单
router.get('/', authenticateToken, checkAdmin, async (req: Request, res: Response) => {
  try {
    const menus = await prisma.menuItem.findMany({
      include: {
        children: true
      },
      orderBy: { order: 'asc' }
    })

    res.json(menus)
  } catch (error) {
    logger.error('Get menus error:', error)
    res.status(500).json({ error: '获取菜单列表失败' })
  }
})

// 创建菜单
router.post('/', authenticateToken, checkAdmin, logOperation('菜单管理', 'CREATE'), async (req: Request, res: Response) => {
  try {
    const { key, icon, label, parentId, order, isVisible, requiredRoles } = req.body

    // 验证必填字段
    if (!key || !icon || !label) {
      return res.status(400).json({ error: '请填写所有必填字段' })
    }

    // 验证菜单标识格式
    if (!/^[a-z0-9-]+$/.test(key)) {
      return res.status(400).json({ error: '菜单标识只能包含小写字母、数字和横线' })
    }

    // 检查菜单标识是否已存在
    const existingMenu = await prisma.menuItem.findUnique({
      where: { key }
    })
    if (existingMenu) {
      return res.status(400).json({ error: '菜单标识已存在' })
    }

    // 如果指定了父菜单，验证父菜单是否存在
    if (parentId) {
      const parentMenu = await prisma.menuItem.findUnique({
        where: { id: parentId }
      })
      if (!parentMenu) {
        return res.status(400).json({ error: '父菜单不存在' })
      }
    }

    // 创建菜单
    const menu = await prisma.menuItem.create({
      data: {
        key,
        icon,
        label,
        parentId: parentId || null,
        order: order || 0,
        isVisible: isVisible !== false,
        requiredRoles: requiredRoles || []
      },
      include: {
        children: true
      }
    })

    res.status(201).json(menu)
  } catch (error) {
    logger.error('Create menu error:', error)
    res.status(500).json({ error: '创建菜单失败' })
  }
})

// 更新菜单
router.put('/:id', authenticateToken, checkAdmin, logOperation('菜单管理', 'UPDATE'), async (req: Request, res: Response) => {
  try {
    const menuId = parseInt(req.params.id as string)
    const { icon, label, parentId, order, isVisible, requiredRoles } = req.body

    // 检查菜单是否存在
    const existingMenu = await prisma.menuItem.findUnique({
      where: { id: menuId }
    })
    if (!existingMenu) {
      return res.status(404).json({ error: '菜单不存在' })
    }

    // 如果指定了父菜单，验证父菜单是否存在
    if (parentId) {
      if (parentId === menuId) {
        return res.status(400).json({ error: '不能将菜单设置为自己的子菜单' })
      }

      const parentMenu = await prisma.menuItem.findUnique({
        where: { id: parentId }
      })
      if (!parentMenu) {
        return res.status(400).json({ error: '父菜单不存在' })
      }
    }

    // 更新菜单
    const menu = await prisma.menuItem.update({
      where: { id: menuId },
      data: {
        icon,
        label,
        parentId: parentId || null,
        order,
        isVisible,
        requiredRoles
      },
      include: {
        children: true
      }
    })

    res.json(menu)
  } catch (error) {
    logger.error('Update menu error:', error)
    res.status(500).json({ error: '更新菜单失败' })
  }
})

// 删除菜单
router.delete('/:id', authenticateToken, checkAdmin, logOperation('菜单管理', 'DELETE'), async (req: Request, res: Response) => {
  try {
    const menuId = parseInt(req.params.id as string)

    // 检查菜单是否存在
    const existingMenu = await prisma.menuItem.findUnique({
      where: { id: menuId },
      include: { children: true }
    })
    if (!existingMenu) {
      return res.status(404).json({ error: '菜单不存在' })
    }

    // 检查是否有子菜单
    if (existingMenu.children && existingMenu.children.length > 0) {
      return res.status(400).json({ error: '该菜单下有子菜单，请先删除子菜单' })
    }

    // 删除菜单
    await prisma.menuItem.delete({
      where: { id: menuId }
    })

    res.json({ message: '菜单删除成功' })
  } catch (error) {
    logger.error('Delete menu error:', error)
    res.status(500).json({ error: '删除菜单失败' })
  }
})

export default router
