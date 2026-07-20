import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取角色的所有菜单（树形结构）
router.get('/:roleId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId as string)

    // 查询角色是否存在
    const role = await prisma.roleModel.findUnique({
      where: { id: roleId }
    })
    if (!role) {
      return res.status(404).json({ error: '角色不存在' })
    }

    // 查询该角色关联的所有菜单
    const roleMenus = await prisma.roleMenu.findMany({
      where: { roleId },
      include: {
        menu: {
          include: {
            children: true
          }
        }
      }
    })

    // 提取菜单并构建树形结构（只取顶级菜单，children已包含子菜单）
    const menuMap = new Map<number, any>()
    const topMenus: any[] = []

    for (const rm of roleMenus) {
      const menu = rm.menu
      if (!menuMap.has(menu.id)) {
        menuMap.set(menu.id, menu)
      }
    }

    // 过滤出属于该角色的顶级菜单，并只保留属于该角色的children
    for (const rm of roleMenus) {
      const menu = rm.menu
      if (!menuMap.has(menu.id)) continue

      // 构建树：只返回顶级菜单（parentId为null的），children已在include中加载
      if (menu.parentId === null || menu.parentId === undefined) {
        if (!topMenus.find(m => m.id === menu.id)) {
          topMenus.push(menu)
        }
      }
    }

    // 对菜单树按order排序
    const sortMenus = (menus: any[]): any[] => {
      return menus
        .sort((a, b) => a.order - b.order)
        .map(m => ({
          ...m,
          children: m.children ? sortMenus(m.children) : []
        }))
    }

    res.json(sortMenus(topMenus))
  } catch (error) {
    logger.error('Get role menus error:', error)
    res.status(500).json({ error: '获取角色菜单失败' })
  }
})

// 为角色分配菜单（全量替换）
router.post('/:roleId', authenticateToken, logOperation('角色菜单', 'UPDATE'), async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId as string)
    const { menuIds } = req.body

    // 验证角色是否存在
    const role = await prisma.roleModel.findUnique({
      where: { id: roleId }
    })
    if (!role) {
      return res.status(404).json({ error: '角色不存在' })
    }

    // 验证menuIds格式
    if (!Array.isArray(menuIds)) {
      return res.status(400).json({ error: 'menuIds必须是数组' })
    }

    // 全量替换：先删除该角色的所有菜单关联
    await prisma.roleMenu.deleteMany({
      where: { roleId }
    })

    // 创建新的角色-菜单关联
    if (menuIds.length > 0) {
      await prisma.roleMenu.createMany({
        data: menuIds.map((menuId: number) => ({
          roleId,
          menuId
        }))
      })
    }

    // 返回更新后的菜单列表
    const roleMenus = await prisma.roleMenu.findMany({
      where: { roleId },
      include: {
        menu: {
          include: {
            children: true
          }
        }
      }
    })

    const menuMap = new Map<number, any>()
    const topMenus: any[] = []

    for (const rm of roleMenus) {
      const menu = rm.menu
      if (!menuMap.has(menu.id)) {
        menuMap.set(menu.id, menu)
      }
    }

    for (const rm of roleMenus) {
      const menu = rm.menu
      if (menu.parentId === null || menu.parentId === undefined) {
        if (!topMenus.find(m => m.id === menu.id)) {
          topMenus.push(menu)
        }
      }
    }

    const sortMenus = (menus: any[]): any[] => {
      return menus
        .sort((a, b) => a.order - b.order)
        .map(m => ({
          ...m,
          children: m.children ? sortMenus(m.children) : []
        }))
    }

    res.json(sortMenus(topMenus))
  } catch (error) {
    logger.error('Assign role menus error:', error)
    res.status(500).json({ error: '分配角色菜单失败' })
  }
})

// 获取角色的所有权限字符串
router.get('/:roleId/perms', authenticateToken, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId as string)

    // 查询角色是否存在
    const role = await prisma.roleModel.findUnique({
      where: { id: roleId }
    })
    if (!role) {
      return res.status(404).json({ error: '角色不存在' })
    }

    // 查询该角色关联的所有菜单的权限标识
    const roleMenus = await prisma.roleMenu.findMany({
      where: { roleId },
      include: {
        menu: true
      }
    })

    // 提取非空的perm字段，去重
    const perms = [
      ...new Set(
        roleMenus
          .map(rm => rm.menu.perm)
          .filter((perm): perm is string => !!perm && perm.trim() !== '')
      )
    ]

    res.json(perms)
  } catch (error) {
    logger.error('Get role perms error:', error)
    res.status(500).json({ error: '获取角色权限失败' })
  }
})

// 获取用户的所有菜单（根据用户角色）
router.get('/user/:userId/menus', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId as string)

    // 查询用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: true
      }
    })
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 获取用户的所有角色ID
    let roleIds: number[] = []

    if (user.userRoles.length > 0) {
      // 优先从UserRole表获取多角色
      roleIds = user.userRoles.map(ur => ur.roleId)
    } else if (user.roleId) {
      // 回退到User.roleId
      roleIds = [user.roleId]
    }

    if (roleIds.length === 0) {
      return res.json([])
    }

    // 查询这些角色关联的所有菜单
    const roleMenus = await prisma.roleMenu.findMany({
      where: {
        roleId: { in: roleIds }
      },
      include: {
        menu: {
          include: {
            children: true
          }
        }
      }
    })

    // 去重（同一菜单可能被多个角色分配）
    const menuMap = new Map<number, any>()
    for (const rm of roleMenus) {
      if (!menuMap.has(rm.menu.id)) {
        menuMap.set(rm.menu.id, rm.menu)
      }
    }

    // 构建树形结构：只取顶级菜单
    const topMenus: any[] = []
    for (const menu of menuMap.values()) {
      if (menu.parentId === null || menu.parentId === undefined) {
        topMenus.push(menu)
      }
    }

    // 按order排序
    const sortMenus = (menus: any[]): any[] => {
      return menus
        .sort((a, b) => a.order - b.order)
        .map(m => ({
          ...m,
          children: m.children ? sortMenus(m.children) : []
        }))
    }

    res.json(sortMenus(topMenus))
  } catch (error) {
    logger.error('Get user menus error:', error)
    res.status(500).json({ error: '获取用户菜单失败' })
  }
})

export default router
