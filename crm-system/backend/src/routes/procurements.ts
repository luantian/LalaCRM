import { Router } from 'express'
import { isAdmin } from '../utils/permission'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import { upload } from '../middleware/upload'
import logger from '../utils/logger'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import { autoWriteProcurementRecord } from '../utils/autoDailyReport'
import path from 'path'
import fs from 'fs'

const router = Router()
const prisma = new PrismaClient()

// GET /stats/overview - Stats (before /:id)
router.get('/stats/overview', authenticateToken, checkPermission('project:procurement:list'), applyDataScope('assignedTo'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const [total, byStatus, amountResult] = await Promise.all([
      prisma.procurement.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.procurement.groupBy({ by: ['status'], where: { deletedAt: null, ...dataScopeWhere }, _count: true }),
      prisma.procurement.aggregate({ where: { deletedAt: null, ...dataScopeWhere }, _sum: { totalAmount: true } })
    ])
    const statusCounts: Record<string, number> = {}
    byStatus.forEach(item => { statusCounts[item.status] = item._count })
    res.json({ totalProcurements: total, totalAmount: amountResult._sum.totalAmount || 0, byStatus: statusCounts })
  } catch (error) {
    logger.error('Get procurement stats error:', error)
    res.status(500).json({ error: '获取采购统计失败' })
  }
})

// GET / - List procurements
router.get('/', authenticateToken, checkPermission('project:procurement:list'), applyDataScope('assignedTo'), async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 10
    const skip = (page - 1) * pageSize
    const { projectId, status, search } = req.query

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    // 构建查询条件：合并数据权限和筛选条件
    const conditions: any[] = [{ deletedAt: null }]
    if (Object.keys(dataScopeWhere).length > 0) {
      conditions.push(dataScopeWhere)
    }

    if (projectId) conditions.push({ projectId: parseInt(projectId as string) })
    if (status) conditions.push({ status: status as string })
    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search as string, mode: 'insensitive' } },
          { vendor: { contains: search as string, mode: 'insensitive' } }
        ]
      })
    }

    const where: any = conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}
    const [total, procurements] = await Promise.all([
      prisma.procurement.count({ where }),
      prisma.procurement.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, include: { project: true, files: { where: { deletedAt: null }, select: { id: true } } } })
    ])
    res.json({ data: procurements, pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } })
  } catch (error) {
    logger.error('Get procurements error:', error)
    res.status(500).json({ error: '获取采购列表失败' })
  }
})

// GET /:id - Detail
router.get('/:id', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const procurement = await prisma.procurement.findFirst({
      where: { id, deletedAt: null },
      include: { project: true, items: true, files: { where: { deletedAt: null } } }
    })
    if (!procurement) return res.status(404).json({ error: '采购单不存在' })

    // 数据范围检查：项目owner或团队成员可以查看（管理员除外）
    const project = await prisma.project.findFirst({
      where: { id: procurement.projectId, deletedAt: null },
      select: { ownerId: true, teamMembers: { select: { userId: true } } }
    })
    if (project?.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      const isTeamMember = project?.teamMembers.some(tm => tm.userId === req.user!.id)
      if (!isTeamMember) {
        return res.status(403).json({ error: '无权访问此采购单' })
      }
    }

    res.json(procurement)
  } catch (error) {
    logger.error('Get procurement error:', error)
    res.status(500).json({ error: '获取采购详情失败' })
  }
})

// POST / - Create procurement
router.post('/', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { title, vendor, totalAmount, expectedDate, status, projectId, assignedTo, remarks,
      purchaseContractNo, purchaseContractDate, paymentTerms, deliveryTerms, warrantyTerms } = req.body
    const procurement = await prisma.procurement.create({
      data: {
        title,
        vendor,
        totalAmount: totalAmount ? Number(totalAmount) : null,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status: status || 'PLANNED',
        projectId: projectId ? Number(projectId) : undefined as any,
        assignedTo: assignedTo ? Number(assignedTo) : null,
        remarks,
        purchaseContractNo,
        purchaseContractDate: purchaseContractDate ? new Date(purchaseContractDate) : null,
        paymentTerms,
        deliveryTerms,
        warrantyTerms
      }
    })
    if (req.user?.id) {
      autoWriteProcurementRecord(req.user.id, procurement.title, 'CREATE', procurement.id, procurement.projectId, procurement.totalAmount?.toNumber()).catch(() => {})
    }
    res.status(201).json(procurement)
  } catch (error) {
    logger.error('Create procurement error:', error)
    res.status(500).json({ error: '创建采购单失败' })
  }
})

// 审批采购单
router.post('/:id/approve', authenticateToken, checkPermission('project:procurement:approve'), logOperation('采购管理', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { status, remark } = req.body

    // 采购状态流转规则
    const validTransitions: Record<string, string[]> = {
      'PLANNED': ['ORDERED', 'CANCELLED'],
      'ORDERED': ['IN_TRANSIT', 'CANCELLED'],
      'IN_TRANSIT': ['RECEIVED', 'CANCELLED'],
      'RECEIVED': [],
      'CANCELLED': []
    }

    if (!status) {
      return res.status(400).json({ error: '状态不能为空' })
    }

    const procurement = await prisma.procurement.findFirst({
      where: { id, deletedAt: null },
      include: { project: { select: { ownerId: true } } }
    })
    if (!procurement) {
      return res.status(404).json({ error: '采购单不存在' })
    }

    // 防止自审批：项目负责人/采购负责人不能审批自己的采购单（管理员除外）
    const isAssigned = procurement.assignedTo === req.user!.id
    const isProjectOwner = procurement.project?.ownerId === req.user!.id
    if ((isAssigned || isProjectOwner) && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能审批自己负责的采购单' })
    }

    const allowedNext = validTransitions[procurement.status] || []
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `采购状态不能从 ${procurement.status} 变更为 ${status}`,
        allowedTransitions: allowedNext
      })
    }

    const updated = await prisma.procurement.update({
      where: { id },
      data: { status: status as any }
    })

    logger.info(`Procurement ${id} status changed from ${procurement.status} to ${status} by ${req.user?.username}`)
    // 根据状态判断是 APPROVE 还是 REJECT
    const reportAction = (status === 'CANCELLED' || status === 'REJECTED') ? 'REJECT' : 'APPROVE'
    if (req.user?.id) {
      autoWriteProcurementRecord(req.user.id, procurement.title, reportAction, id, procurement.projectId, procurement.totalAmount?.toNumber()).catch(() => {})
    }
    res.json(updated)
  } catch (error) {
    logger.error('Approve procurement error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// PUT /:id - Update procurement
router.put('/:id', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { title, vendor, totalAmount, expectedDate, status, assignedTo, remarks,
      purchaseContractNo, purchaseContractDate, paymentTerms, deliveryTerms, warrantyTerms } = req.body

    // 检查当前状态，不允许通过 PUT 直接修改状态
    const current = await prisma.procurement.findFirst({ where: { id, deletedAt: null } })
    if (!current) {
      return res.status(404).json({ error: '采购单不存在' })
    }
    if (status && status !== current.status) {
      return res.status(400).json({ error: '状态变更必须通过审批接口 POST /:id/approve' })
    }

    const procurement = await prisma.procurement.update({
      where: { id },
      data: {
        title, vendor,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
        expectedDate: expectedDate !== undefined ? (expectedDate ? new Date(expectedDate) : null) : undefined,
        status,
        assignedTo: assignedTo !== undefined ? (assignedTo ? Number(assignedTo) : null) : undefined,
        remarks,
        purchaseContractNo,
        purchaseContractDate: purchaseContractDate !== undefined ? (purchaseContractDate ? new Date(purchaseContractDate) : null) : undefined,
        paymentTerms,
        deliveryTerms,
        warrantyTerms
      }
    })
    if (req.user?.id) {
      autoWriteProcurementRecord(req.user.id, procurement.title, 'UPDATE', procurement.id, procurement.projectId, procurement.totalAmount?.toNumber()).catch(() => {})
    }
    res.json(procurement)
  } catch (error) {
    logger.error('Update procurement error:', error)
    res.status(500).json({ error: '更新采购单失败' })
  }
})

// DELETE /:id - Delete procurement
router.delete('/:id', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.procurement.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '采购单不存在' })
    }

    // 只允许删除计划中或已取消的采购单
    if (existing.status !== 'PLANNED' && existing.status !== 'CANCELLED') {
      return res.status(400).json({ error: '只能删除计划中或已取消的采购单' })
    }

    await prisma.procurementPayment.updateMany({ where: { procurementId: id }, data: { deletedAt: new Date() } })
    await prisma.procurementItem.updateMany({ where: { procurementId: id }, data: { deletedAt: new Date() } })
    await prisma.procurementFile.updateMany({ where: { procurementId: id }, data: { deletedAt: new Date() } })
    await prisma.procurement.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete procurement error:', error)
    res.status(500).json({ error: '删除采购单失败' })
  }
})

// GET /:id/items - List procurement items
router.get('/:id/items', authenticateToken, checkPermission('project:procurement:edit'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const items = await prisma.procurementItem.findMany({
      where: { procurementId: id, deletedAt: null },
      include: { files: { where: { deletedAt: null }, select: { id: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(items)
  } catch (error) {
    logger.error('Get items error:', error)
    res.status(500).json({ error: '获取采购明细失败' })
  }
})

// POST /:id/items - Create procurement item
router.post('/:id/items', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { name, spec, quantity, unit, unitPrice, remarks } = req.body
    const qty = Number(quantity)
    const price = Number(unitPrice)
    const item = await prisma.procurementItem.create({
      data: { procurementId: id, name, spec, quantity: qty, unit, unitPrice: price, totalPrice: qty * price, remarks }
    })
    res.status(201).json(item)
  } catch (error) {
    logger.error('Create item error:', error)
    res.status(500).json({ error: '创建采购明细失败' })
  }
})

// PUT /items/:itemId - Update procurement item
router.put('/items/:itemId', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const itemId = parseInt(req.params.itemId as string)
    const { name, spec, quantity, unit, unitPrice, remarks } = req.body
    const qty = quantity !== undefined ? Number(quantity) : undefined
    const price = unitPrice !== undefined ? Number(unitPrice) : undefined
    const item = await prisma.procurementItem.update({
      where: { id: itemId },
      data: {
        name, spec, quantity: qty, unit, unitPrice: price,
        totalPrice: qty !== undefined && price !== undefined ? qty * price : undefined,
        remarks
      }
    })
    res.json(item)
  } catch (error) {
    logger.error('Update item error:', error)
    res.status(500).json({ error: '更新采购明细失败' })
  }
})

// DELETE /items/:itemId - Delete procurement item
router.delete('/items/:itemId', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const itemId = parseInt(req.params.itemId as string)
    await prisma.procurementItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete item error:', error)
    res.status(500).json({ error: '删除采购明细失败' })
  }
})

// ==================== 采购附件管理 ====================

// 上传采购附件
router.post('/:id/files', authenticateToken, checkPermission('project:procurement:edit'), upload.array('files', 10), logOperation('采购管理', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const procurementId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    const procurement = await prisma.procurement.findFirst({ where: { id: procurementId, deletedAt: null } })
    if (!procurement) {
      return res.status(404).json({ error: '采购单不存在' })
    }

    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.procurementFile.create({
          data: {
            procurementId,
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
    logger.error('Upload procurement files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取采购附件列表
router.get('/:id/files', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const procurementId = parseInt(req.params.id as string)
    const files = await prisma.procurementFile.findMany({
      where: { procurementId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get procurement files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载采购附件
router.get('/files/:fileId/download', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download procurement file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 预览采购附件（图片/PDF/Word/Excel）
router.get('/files/:fileId/preview', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview procurement file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除采购附件
router.delete('/files/:fileId', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    await prisma.procurementFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete procurement file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// ==================== 采购明细附件管理 ====================

// 上传采购明细附件
router.post('/items/:itemId/files', authenticateToken, checkPermission('project:procurement:edit'), upload.array('files', 10), logOperation('采购管理', 'UPLOAD_ITEM_FILE'), async (req: AuthRequest, res) => {
  try {
    const itemId = parseInt(req.params.itemId as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    const item = await prisma.procurementItem.findFirst({ where: { id: itemId, deletedAt: null } })
    if (!item) {
      return res.status(404).json({ error: '采购明细不存在' })
    }

    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.procurementItemFile.create({
          data: {
            procurementItemId: itemId,
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
    logger.error('Upload procurement item files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取采购明细附件列表
router.get('/items/:itemId/files', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const itemId = parseInt(req.params.itemId as string)
    const files = await prisma.procurementItemFile.findMany({
      where: { procurementItemId: itemId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get procurement item files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载采购明细附件
router.get('/item-files/:fileId/download', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementItemFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download procurement item file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 预览采购明细附件（图片/PDF/Word/Excel）
router.get('/item-files/:fileId/preview', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementItemFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview procurement item file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除采购明细附件
router.delete('/item-files/:fileId', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'DELETE_ITEM_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    await prisma.procurementItemFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete procurement item file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// ==================== 采购付款记录附件管理 ====================

// 上传采购付款记录附件
router.post('/payments/:paymentId/files', authenticateToken, checkPermission('project:procurement:edit'), upload.array('files', 10), logOperation('采购管理', 'UPLOAD_PAYMENT_FILE'), async (req: AuthRequest, res) => {
  try {
    const paymentId = parseInt(req.params.paymentId as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    const payment = await prisma.procurementPayment.findFirst({ where: { id: paymentId, deletedAt: null } })
    if (!payment) {
      return res.status(404).json({ error: '付款记录不存在' })
    }

    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.procurementPaymentFile.create({
          data: {
            procurementPaymentId: paymentId,
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
    logger.error('Upload procurement payment files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取采购付款记录附件列表
router.get('/payments/:paymentId/files', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const paymentId = parseInt(req.params.paymentId as string)
    const files = await prisma.procurementPaymentFile.findMany({
      where: { procurementPaymentId: paymentId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get procurement payment files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载采购付款记录附件
router.get('/payment-files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementPaymentFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download procurement payment file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 预览采购付款记录附件（图片/PDF/Word/Excel）
router.get('/payment-files/:fileId/preview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementPaymentFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview procurement payment file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除采购付款记录附件
router.delete('/payment-files/:fileId', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购管理', 'DELETE_PAYMENT_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    await prisma.procurementPaymentFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete procurement payment file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

export default router
