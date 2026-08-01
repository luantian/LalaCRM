import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import logger from '../utils/logger'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 获取合同付款记录列表
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    const payments = await prisma.contractPayment.findMany({
      where: { contractId, deletedAt: null },
      include: {
        files: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { paymentDate: 'desc' }
    })

    // 计算汇总
    const totalPaid = payments
      .filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED')
      .reduce((sum, p) => sum + Number(p.amount), 0)

    res.json({
      data: payments,
      summary: {
        totalPaid,
        paymentCount: payments.length
      }
    })
  } catch (error) {
    logger.error('Get payments error:', error)
    res.status(500).json({ error: '获取付款记录失败' })
  }
})

// 创建付款记录
router.post('/', authenticateToken, logOperation('合同付款', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    if (!contractId || !amount || !paymentDate) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    // 检查用户是否有权操作该合同（合同所有者或管理员）
    const contract = await prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }
    if (contract.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权操作此合同的付款记录' })
    }

    const payment = await prisma.contractPayment.create({
      data: {
        contractId,
        amount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        paymentType: paymentType || 'PROGRESS',
        status: status || 'PENDING',
        invoiceNo,
        remarks
      }
    })

    res.status(201).json(payment)
  } catch (error) {
    logger.error('Create payment error:', error)
    res.status(500).json({ error: '创建付款记录失败' })
  }
})

// 更新付款记录
router.put('/:id', authenticateToken, logOperation('合同付款', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    const existing = await prisma.contractPayment.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '付款记录不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权操作此付款记录' })
    }

    const payment = await prisma.contractPayment.update({
      where: { id },
      data: {
        amount,
        paymentDate: paymentDate ? new Date(paymentDate) : undefined,
        paymentMethod,
        paymentType,
        status,
        invoiceNo,
        remarks
      }
    })

    res.json(payment)
  } catch (error) {
    logger.error('Update payment error:', error)
    res.status(500).json({ error: '更新付款记录失败' })
  }
})

// 上传付款记录附件
router.post('/:id/files', authenticateToken, upload.array('files', 10), logOperation('合同付款', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const paymentId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择文件' })
    }

    const payment = await prisma.contractPayment.findFirst({ where: { id: paymentId, deletedAt: null } })
    if (!payment) {
      return res.status(404).json({ error: '付款记录不存在' })
    }

    const createdFiles = await Promise.all(
      files.map(file =>
        prisma.contractPaymentFile.create({
          data: {
            paymentId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    res.json({ message: '上传成功', files: createdFiles })
  } catch (error) {
    logger.error('Upload payment files error:', error)
    res.status(500).json({ error: '上传附件失败' })
  }
})

// 获取付款记录附件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const paymentId = parseInt(req.params.id as string)
    const files = await prisma.contractPaymentFile.findMany({
      where: { paymentId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get payment files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载付款记录附件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractPaymentFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }
    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download payment file error:', error)
    res.status(500).json({ error: '下载附件失败' })
  }
})

// 预览付款记录附件（图片/PDF/Word/Excel）
router.get('/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractPaymentFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview payment file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除付款记录附件
router.delete('/:id/files/:fileId', authenticateToken, logOperation('合同付款', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractPaymentFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    await prisma.contractPaymentFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete payment file error:', error)
    res.status(500).json({ error: '删除附件失败' })
  }
})

// 删除付款记录
router.delete('/:id', authenticateToken, logOperation('合同付款', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.contractPayment.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '付款记录不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权操作此付款记录' })
    }
    await prisma.contractPayment.update({ where: { id }, data: { deletedAt: new Date() } })
    // 级联软删除关联文件
    await prisma.contractPaymentFile.updateMany({ where: { paymentId: id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete payment error:', error)
    res.status(500).json({ error: '删除付款记录失败' })
  }
})

export default router
