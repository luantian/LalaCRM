import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 构建部门树（递归）
const buildTree = (departments: any[], parentId: number | null = null): any[] => {
  return departments
    .filter(d => d.parentId === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(d => ({
      ...d,
      children: buildTree(departments, d.id)
    }))
}

// 获取部门树
router.get('/tree', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { order: 'asc' }
    })

    const tree = buildTree(departments, null)
    res.json(tree)
  } catch (error) {
    logger.error('Get department tree error:', error)
    res.status(500).json({ error: '获取部门树失败' })
  }
})

// 获取所有部门（扁平列表，用于下拉选择）
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { order: 'asc' }
    })

    res.json(departments)
  } catch (error) {
    logger.error('Get departments error:', error)
    res.status(500).json({ error: '获取部门列表失败' })
  }
})

// 获取部门详情（包含用户数）
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true }
        }
      }
    })

    if (!department) {
      return res.status(404).json({ error: '部门不存在' })
    }

    res.json(department)
  } catch (error) {
    logger.error('Get department detail error:', error)
    res.status(500).json({ error: '获取部门详情失败' })
  }
})

// 创建部门
router.post('/', authenticateToken, logOperation('部门管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { name, parentId, order, leader, phone, email, status } = req.body

    if (!name) {
      return res.status(400).json({ error: '部门名称不能为空' })
    }

    // 如果指定了父部门，验证父部门是否存在
    if (parentId) {
      const parent = await prisma.department.findUnique({
        where: { id: parentId }
      })
      if (!parent) {
        return res.status(400).json({ error: '父部门不存在' })
      }
    }

    const department = await prisma.department.create({
      data: {
        name,
        parentId: parentId || null,
        order: order ?? 0,
        leader,
        phone,
        email,
        status: status || 'ENABLED'
      }
    })

    res.status(201).json(department)
  } catch (error) {
    logger.error('Create department error:', error)
    res.status(500).json({ error: '创建部门失败' })
  }
})

// 更新部门
router.put('/:id', authenticateToken, logOperation('部门管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { name, parentId, order, leader, phone, email, status } = req.body

    // 检查部门是否存在
    const existing = await prisma.department.findUnique({
      where: { id }
    })
    if (!existing) {
      return res.status(404).json({ error: '部门不存在' })
    }

    // 不能将部门设置为自己的子部门
    if (parentId === id) {
      return res.status(400).json({ error: '不能将部门设置为自己的子部门' })
    }

    // 如果指定了父部门，验证父部门是否存在
    if (parentId) {
      const parent = await prisma.department.findUnique({
        where: { id: parentId }
      })
      if (!parent) {
        return res.status(400).json({ error: '父部门不存在' })
      }
    }

    const department = await prisma.department.update({
      where: { id },
      data: { name, parentId: parentId || null, order, leader, phone, email, status }
    })

    res.json(department)
  } catch (error) {
    logger.error('Update department error:', error)
    res.status(500).json({ error: '更新部门失败' })
  }
})

// 删除部门
router.delete('/:id', authenticateToken, logOperation('部门管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    // 检查部门是否存在
    const existing = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '部门不存在' })
    }

    // 检查是否有子部门
    if (existing._count.children > 0) {
      return res.status(400).json({ error: '该部门下有子部门，请先删除子部门' })
    }

    await prisma.department.delete({
      where: { id }
    })

    res.json({ message: '部门删除成功' })
  } catch (error) {
    logger.error('Delete department error:', error)
    res.status(500).json({ error: '删除部门失败' })
  }
})

export default router
