import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// ========== 字典类型 ==========

// 获取所有字典类型（包含数据项）
router.get('/types', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const types = await prisma.dictType.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    })

    res.json(types)
  } catch (error) {
    logger.error('Get dict types error:', error)
    res.status(500).json({ error: '获取字典类型列表失败' })
  }
})

// 创建字典类型
router.post('/types', authenticateToken, logOperation('数据字典', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能执行此操作' })
    }

    const { name, code, status, remark } = req.body

    if (!name || !code) {
      return res.status(400).json({ error: '字典名称和编码不能为空' })
    }

    // 检查编码是否已存在
    const existing = await prisma.dictType.findUnique({
      where: { code }
    })
    if (existing) {
      return res.status(400).json({ error: '字典编码已存在' })
    }

    const dictType = await prisma.dictType.create({
      data: {
        name,
        code,
        status: status || 'ENABLED',
        remark
      },
      include: { items: true }
    })

    res.status(201).json(dictType)
  } catch (error) {
    logger.error('Create dict type error:', error)
    res.status(500).json({ error: '创建字典类型失败' })
  }
})

// 更新字典类型
router.put('/types/:id', authenticateToken, logOperation('数据字典', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能执行此操作' })
    }

    const id = parseInt(req.params.id as string)
    const { name, code, status, remark } = req.body

    const existing = await prisma.dictType.findUnique({
      where: { id }
    })
    if (!existing) {
      return res.status(404).json({ error: '字典类型不存在' })
    }

    // 如果修改了编码，检查是否与其他记录冲突
    if (code && code !== existing.code) {
      const conflict = await prisma.dictType.findUnique({
        where: { code }
      })
      if (conflict) {
        return res.status(400).json({ error: '字典编码已存在' })
      }
    }

    const dictType = await prisma.dictType.update({
      where: { id },
      data: { name, code, status, remark },
      include: { items: true }
    })

    res.json(dictType)
  } catch (error) {
    logger.error('Update dict type error:', error)
    res.status(500).json({ error: '更新字典类型失败' })
  }
})

// 删除字典类型（级联删除数据项）
router.delete('/types/:id', authenticateToken, logOperation('数据字典', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能执行此操作' })
    }

    const id = parseInt(req.params.id as string)

    const existing = await prisma.dictType.findUnique({
      where: { id }
    })
    if (!existing) {
      return res.status(404).json({ error: '字典类型不存在' })
    }

    // 先删除关联的数据项，再删除字典类型
    await prisma.$transaction([
      prisma.dictData.deleteMany({ where: { dictTypeId: id } }),
      prisma.dictType.delete({ where: { id } })
    ])

    res.json({ message: '字典类型删除成功' })
  } catch (error) {
    logger.error('Delete dict type error:', error)
    res.status(500).json({ error: '删除字典类型失败' })
  }
})

// ========== 字典数据项 ==========

// 获取某个字典类型下的数据项
router.get('/types/:id/data', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const dictTypeId = parseInt(req.params.id as string)

    const dictType = await prisma.dictType.findUnique({
      where: { id: dictTypeId }
    })
    if (!dictType) {
      return res.status(404).json({ error: '字典类型不存在' })
    }

    const items = await prisma.dictData.findMany({
      where: { dictTypeId },
      orderBy: { sort: 'asc' }
    })

    res.json(items)
  } catch (error) {
    logger.error('Get dict data error:', error)
    res.status(500).json({ error: '获取字典数据项失败' })
  }
})

// 创建数据项
router.post('/types/:id/data', authenticateToken, logOperation('数据字典', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能执行此操作' })
    }

    const dictTypeId = parseInt(req.params.id as string)
    const { label, value, sort, cssClass, status, remark } = req.body

    if (!label || !value) {
      return res.status(400).json({ error: '标签和值不能为空' })
    }

    // 检查字典类型是否存在
    const dictType = await prisma.dictType.findUnique({
      where: { id: dictTypeId }
    })
    if (!dictType) {
      return res.status(404).json({ error: '字典类型不存在' })
    }

    const item = await prisma.dictData.create({
      data: {
        dictTypeId,
        label,
        value,
        sort: sort ?? 0,
        cssClass,
        status: status || 'ENABLED',
        remark
      }
    })

    res.status(201).json(item)
  } catch (error) {
    logger.error('Create dict data error:', error)
    res.status(500).json({ error: '创建字典数据项失败' })
  }
})

// 更新数据项
router.put('/data/:itemId', authenticateToken, logOperation('数据字典', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能执行此操作' })
    }

    const itemId = parseInt(req.params.itemId as string)
    const { label, value, sort, cssClass, status, remark } = req.body

    const existing = await prisma.dictData.findUnique({
      where: { id: itemId }
    })
    if (!existing) {
      return res.status(404).json({ error: '字典数据项不存在' })
    }

    const item = await prisma.dictData.update({
      where: { id: itemId },
      data: { label, value, sort, cssClass, status, remark }
    })

    res.json(item)
  } catch (error) {
    logger.error('Update dict data error:', error)
    res.status(500).json({ error: '更新字典数据项失败' })
  }
})

// 删除数据项
router.delete('/data/:itemId', authenticateToken, logOperation('数据字典', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能执行此操作' })
    }

    const itemId = parseInt(req.params.itemId as string)

    const existing = await prisma.dictData.findUnique({
      where: { id: itemId }
    })
    if (!existing) {
      return res.status(404).json({ error: '字典数据项不存在' })
    }

    await prisma.dictData.delete({
      where: { id: itemId }
    })

    res.json({ message: '字典数据项删除成功' })
  } catch (error) {
    logger.error('Delete dict data error:', error)
    res.status(500).json({ error: '删除字典数据项失败' })
  }
})

// 根据字典类型编码获取数据项（供前端下拉选项使用）
router.get('/code/:code', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const code = req.params.code as string

    const dictType = await prisma.dictType.findUnique({
      where: { code },
      include: {
        items: {
          orderBy: { sort: 'asc' }
        }
      }
    })

    if (!dictType) {
      return res.status(404).json({ error: '字典类型不存在' })
    }

    res.json(dictType.items)
  } catch (error) {
    logger.error('Get dict by code error:', error)
    res.status(500).json({ error: '获取字典数据失败' })
  }
})

export default router
