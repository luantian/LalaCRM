import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 上传报销附件
router.post('/:id/files', authenticateToken, upload.array('files', 10), logOperation('报销附件', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const expenseId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    const expense = await prisma.expense.findFirst({ where: { id: expenseId, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '报销记录不存在' })
    }

    // 只能为自己的报销上传附件（管理员除外）
    if (expense.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权操作此报销记录' })
    }

    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.expenseFile.create({
          data: {
            expenseId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    res.status(201).json({
      message: `成功上传 ${files.length} 个文件`,
      files: fileRecords
    })
  } catch (error) {
    logger.error('Upload expense files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取报销附件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const expenseId = parseInt(req.params.id as string)

    // 检查报销记录是否存在且用户有权限访问
    const expense = await prisma.expense.findFirst({ where: { id: expenseId, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '报销记录不存在' })
    }

    if (expense.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权访问此报销记录' })
    }

    const files = await prisma.expenseFile.findMany({
      where: { expenseId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(files)
  } catch (error) {
    logger.error('Get expense files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除报销附件
router.delete('/:id/files/:fileId', authenticateToken, logOperation('报销附件', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.expenseFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { expense: { select: { ownerId: true } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 只能删除自己报销的附件（管理员除外）
    if (file.expense.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权删除此文件' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    await prisma.expenseFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })

    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete expense file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 下载报销附件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.expenseFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { expense: { select: { ownerId: true } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 只能下载自己报销的附件（管理员除外）
    if (file.expense.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权下载此文件' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download expense file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

export default router
