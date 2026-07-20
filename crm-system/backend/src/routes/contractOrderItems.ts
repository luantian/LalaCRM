import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import logger from '../utils/logger'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 获取合同订货明细列表
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    const items = await prisma.contractOrderItem.findMany({
      where: { contractId, deletedAt: null },
      include: {
        files: { orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(items)
  } catch (error) {
    logger.error('Get order items error:', error)
    res.status(500).json({ error: '获取订货明细失败' })
  }
})

// 创建订货明细
router.post('/', authenticateToken, logOperation('合同订货', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, productName, spec, quantity, unit, unitPrice, totalPrice, deliveryDate, contactName, contactPhone, remarks } = req.body

    if (!contractId || !productName || !quantity || !unitPrice) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    const parsedUnitPrice = Number(unitPrice)
    const item = await prisma.contractOrderItem.create({
      data: {
        contractId,
        productName,
        spec,
        quantity: Number(quantity),
        unit: unit || '个',
        unitPrice: parsedUnitPrice,
        totalPrice: totalPrice ? Number(totalPrice) : (Number(quantity) * parsedUnitPrice),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        contactName,
        contactPhone,
        remarks
      }
    })

    res.status(201).json(item)
  } catch (error) {
    logger.error('Create order item error:', error)
    res.status(500).json({ error: '创建订货明细失败' })
  }
})

// 更新订货明细
router.put('/:id', authenticateToken, logOperation('合同订货', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { productName, spec, quantity, unit, unitPrice, totalPrice, deliveryDate, contactName, contactPhone, remarks } = req.body

    const parsedUnitPrice = unitPrice ? Number(unitPrice) : undefined
    const parsedQuantity = quantity ? Number(quantity) : undefined

    const item = await prisma.contractOrderItem.update({
      where: { id },
      data: {
        productName,
        spec,
        quantity: parsedQuantity,
        unit,
        unitPrice: parsedUnitPrice,
        totalPrice: totalPrice ? Number(totalPrice) : (parsedQuantity && parsedUnitPrice ? parsedQuantity * parsedUnitPrice : undefined),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        contactName,
        contactPhone,
        remarks
      }
    })

    res.json(item)
  } catch (error) {
    logger.error('Update order item error:', error)
    res.status(500).json({ error: '更新订货明细失败' })
  }
})

// 上传订货明细附件
router.post('/:id/files', authenticateToken, upload.array('files', 10), logOperation('合同订货', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const orderItemId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择文件' })
    }

    const orderItem = await prisma.contractOrderItem.findFirst({ where: { id: orderItemId, deletedAt: null } })
    if (!orderItem) {
      return res.status(404).json({ error: '订货明细不存在' })
    }

    const createdFiles = await Promise.all(
      files.map(file =>
        prisma.contractOrderItemFile.create({
          data: {
            orderItemId,
            fileName: file.originalname,
            filePath: file.path,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    res.json({ message: '上传成功', files: createdFiles })
  } catch (error) {
    logger.error('Upload order item files error:', error)
    res.status(500).json({ error: '上传附件失败' })
  }
})

// 获取订货明细附件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const orderItemId = parseInt(req.params.id as string)
    const files = await prisma.contractOrderItemFile.findMany({
      where: { orderItemId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get order item files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载订货明细附件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractOrderItemFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }
    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download order item file error:', error)
    res.status(500).json({ error: '下载附件失败' })
  }
})

// 预览订货明细附件（图片和PDF）- 必须在下载路由之前
router.get('/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractOrderItemFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    // 设置正确的 Content-Type
    const ext = file.fileName.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      pdf: 'application/pdf'
    }

    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream'
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`)

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
  } catch (error) {
    logger.error('Preview order item file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除订货明细附件
router.delete('/:id/files/:fileId', authenticateToken, logOperation('合同订货', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractOrderItemFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath)
    }
    await prisma.contractOrderItemFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete order item file error:', error)
    res.status(500).json({ error: '删除附件失败' })
  }
})

// 删除订货明细
router.delete('/:id', authenticateToken, logOperation('合同订货', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    // 软删除订货明细
    await prisma.contractOrderItem.update({ where: { id }, data: { deletedAt: new Date() } })
    // 级联软删除关联文件
    await prisma.contractOrderItemFile.updateMany({ where: { orderItemId: id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete order item error:', error)
    res.status(500).json({ error: '删除订货明细失败' })
  }
})

export default router
