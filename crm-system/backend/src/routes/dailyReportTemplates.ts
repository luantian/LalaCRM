import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取日报模板列表
router.get('/', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const { type, isPublic } = req.query

    const where: any = { deletedAt: null }
    if (type) {
      where.type = type as string
    }

    // 公开模板或自己的模板
    if (isPublic !== undefined) {
      where.isPublic = isPublic === 'true'
    } else {
      where.OR = [
        { isPublic: true },
        { userId: req.user!.id }
      ]
    }

    const templates = await prisma.dailyReportTemplate.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } }
      },
      orderBy: { useCount: 'desc' }
    })

    res.json(templates)
  } catch (error) {
    logger.error('Get daily report templates error:', error)
    res.status(500).json({ error: '获取日报模板失败' })
  }
})

// 获取单个模板
router.get('/:id', authenticateToken, checkPermission('view_reports'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const template = await prisma.dailyReportTemplate.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    if (!template) {
      return res.status(404).json({ error: '模板不存在' })
    }

    // 检查权限：公开模板或自己的模板
    if (!template.isPublic && template.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '没有权限查看此模板' })
    }

    res.json(template)
  } catch (error) {
    logger.error('Get daily report template error:', error)
    res.status(500).json({ error: '获取模板失败' })
  }
})

// 创建模板
router.post('/', authenticateToken, checkPermission('create_reports'), logOperation('日报模板', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { name, type, content, isPublic = false } = req.body

    if (!name || !type || !content) {
      return res.status(400).json({ error: '模板名称、类型和内容不能为空' })
    }

    // 只有管理员可以创建公开模板
    if (isPublic && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员可以创建公开模板' })
    }

    const template = await prisma.dailyReportTemplate.create({
      data: {
        name,
        type,
        content: JSON.stringify(content),
        isPublic,
        userId: req.user!.id
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(template)
  } catch (error) {
    logger.error('Create daily report template error:', error)
    res.status(500).json({ error: '创建模板失败' })
  }
})

// 更新模板
router.put('/:id', authenticateToken, checkPermission('create_reports'), logOperation('日报模板', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { name, type, content, isPublic } = req.body

    const template = await prisma.dailyReportTemplate.findFirst({ where: { id, deletedAt: null } })
    if (!template) {
      return res.status(404).json({ error: '模板不存在' })
    }

    // 只能修改自己的模板（管理员除外）
    if (template.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能修改自己的模板' })
    }

    // 如果要设为公开，需要管理员权限
    if (isPublic && !template.isPublic && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员可以创建公开模板' })
    }

    const updated = await prisma.dailyReportTemplate.update({
      where: { id },
      data: {
        name: name || template.name,
        type: type || template.type,
        content: content ? JSON.stringify(content) : template.content,
        isPublic: isPublic !== undefined ? isPublic : template.isPublic
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update daily report template error:', error)
    res.status(500).json({ error: '更新模板失败' })
  }
})

// 删除模板
router.delete('/:id', authenticateToken, checkPermission('create_reports'), logOperation('日报模板', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const template = await prisma.dailyReportTemplate.findFirst({ where: { id, deletedAt: null } })
    if (!template) {
      return res.status(404).json({ error: '模板不存在' })
    }

    // 只能删除自己的模板（管理员除外）
    if (template.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的模板' })
    }

    await prisma.dailyReportTemplate.update({ where: { id }, data: { deletedAt: new Date() } })

    res.json({ message: '删除模板成功' })
  } catch (error) {
    logger.error('Delete daily report template error:', error)
    res.status(500).json({ error: '删除模板失败' })
  }
})

// 使用模板（增加使用次数）
router.post('/:id/use', authenticateToken, checkPermission('create_reports'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const template = await prisma.dailyReportTemplate.findFirst({ where: { id, deletedAt: null } })
    if (!template) {
      return res.status(404).json({ error: '模板不存在' })
    }

    // 检查权限：公开模板或自己的模板
    if (!template.isPublic && template.userId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '没有权限使用此模板' })
    }

    const updated = await prisma.dailyReportTemplate.update({
      where: { id },
      data: { useCount: { increment: 1 } }
    })

    // 返回模板内容
    res.json({
      ...updated,
      content: JSON.parse(updated.content)
    })
  } catch (error) {
    logger.error('Use daily report template error:', error)
    res.status(500).json({ error: '使用模板失败' })
  }
})

export default router
