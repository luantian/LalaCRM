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

    const expense = await prisma.expense.findUnique({ where: { id: expenseId } })
    if (!expense) {
      return res.status(404).json({ error: '报销记录不存在' })
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

    const files = await prisma.expenseFile.findMany({
      where: { expenseId },
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

    const file = await prisma.expenseFile.findUnique({ where: { id: fileId } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    await prisma.expenseFile.delete({ where: { id: fileId } })

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

    const file = await prisma.expenseFile.findUnique({ where: { id: fileId } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
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
