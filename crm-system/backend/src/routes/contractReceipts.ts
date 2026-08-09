import { Router } from 'express'
import { isAdmin } from '../utils/permission'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import logger from '../utils/logger'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import fs from 'fs'
import path from 'path'
import { checkContractProjectArchived } from '../utils/archive'

const router = Router()
const prisma = new PrismaClient()

// 获取合同回款记录列表
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    const receipts = await prisma.contractReceipt.findMany({
      where: { contractId, deletedAt: null },
      include: {
        files: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { receiptDate: 'desc' }
    })

    // 计算汇总
    const totalReceived = receipts
      .filter(r => r.status === 'RECEIVED' || r.status === 'CONFIRMED')
      .reduce((sum, r) => sum + Number(r.amount), 0)

    res.json({
      data: receipts,
      summary: {
        totalReceived,
        receiptCount: receipts.length
      }
    })
  } catch (error) {
    logger.error('Get receipts error:', error)
    res.status(500).json({ error: '获取回款记录失败' })
  }
})

// 创建回款记录
router.post('/', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同回款', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, amount, receiptDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    if (!contractId || !amount || !receiptDate) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    // 检查用户是否有权操作该合同（合同所有者或管理员）
    const contract = await prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }
    if (contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此合同的回款记录' })
    }

    // 检查项目是否已归档
    if (contract.projectId) {
      const isArchived = await checkContractProjectArchived(contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法创建回款记录' })
      }
    }

    const receipt = await prisma.contractReceipt.create({
      data: {
        contractId,
        amount,
        receiptDate: new Date(receiptDate),
        paymentMethod,
        paymentType: paymentType || 'PROGRESS',
        status: status || 'PENDING',
        invoiceNo,
        remarks
      }
    })

    res.status(201).json(receipt)
  } catch (error) {
    logger.error('Create receipt error:', error)
    res.status(500).json({ error: '创建回款记录失败' })
  }
})

// 更新回款记录
router.put('/:id', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同回款', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { amount, receiptDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    const existing = await prisma.contractReceipt.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '回款记录不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此回款记录' })
    }

    // 检查项目是否已归档
    if (existing.contract.projectId) {
      const isArchived = await checkContractProjectArchived(existing.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法更新回款记录' })
      }
    }

    const receipt = await prisma.contractReceipt.update({
      where: { id },
      data: {
        amount,
        receiptDate: receiptDate ? new Date(receiptDate) : undefined,
        paymentMethod,
        paymentType,
        status,
        invoiceNo,
        remarks
      }
    })

    res.json(receipt)
  } catch (error) {
    logger.error('Update receipt error:', error)
    res.status(500).json({ error: '更新回款记录失败' })
  }
})

// 上传回款记录附件
router.post('/:id/files', authenticateToken, checkPermission('project:contract:edit'), upload.array('files', 10), logOperation('合同回款', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const receiptId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择文件' })
    }

    const receipt = await prisma.contractReceipt.findFirst({ 
      where: { id: receiptId, deletedAt: null },
      include: { contract: { select: { projectId: true } } }
    })
    if (!receipt) {
      return res.status(404).json({ error: '回款记录不存在' })
    }

    // 检查项目是否已归档
    if (receipt.contract.projectId) {
      const isArchived = await checkContractProjectArchived(receipt.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法上传附件' })
      }
    }

    const createdFiles = await Promise.all(
      files.map(file =>
        prisma.contractReceiptFile.create({
          data: {
            receiptId,
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
    logger.error('Upload receipt files error:', error)
    res.status(500).json({ error: '上传附件失败' })
  }
})

// 获取回款记录附件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const receiptId = parseInt(req.params.id as string)
    const files = await prisma.contractReceiptFile.findMany({
      where: { receiptId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get receipt files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载回款记录附件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractReceiptFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }
    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download receipt file error:', error)
    res.status(500).json({ error: '下载附件失败' })
  }
})

// 预览回款记录附件（图片/PDF/Word/Excel）
router.get('/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractReceiptFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview receipt file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除回款记录附件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同回款', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractReceiptFile.findFirst({ 
      where: { id: fileId, deletedAt: null },
      include: { receipt: { include: { contract: { select: { projectId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 检查项目是否已归档
    if (file.receipt.contract.projectId) {
      const isArchived = await checkContractProjectArchived(file.receipt.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法删除附件' })
      }
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    await prisma.contractReceiptFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete receipt file error:', error)
    res.status(500).json({ error: '删除附件失败' })
  }
})

// 删除回款记录
router.delete('/:id', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同回款', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.contractReceipt.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '回款记录不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此回款记录' })
    }

    // 检查项目是否已归档
    if (existing.contract.projectId) {
      const isArchived = await checkContractProjectArchived(existing.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法删除回款记录' })
      }
    }

    await prisma.contractReceipt.update({ where: { id }, data: { deletedAt: new Date() } })
    // 级联软删除关联文件
    await prisma.contractReceiptFile.updateMany({ where: { receiptId: id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete receipt error:', error)
    res.status(500).json({ error: '删除回款记录失败' })
  }
})

export default router
