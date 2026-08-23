import prisma from '../lib/prisma'
import { Router } from 'express'
import { isAdmin } from '../utils/permission'
import { authenticateToken, authenticateFileToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import logger from '../utils/logger'
import { autoWriteContractOrderItemRecord } from '../utils/autoDailyReport'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import fs from 'fs'
import path from 'path'
import { checkContractProjectArchived } from '../utils/archive'
import { getDataScopeWhere } from '../middleware/dataScope'

const router = Router()

// 获取合同订货明细列表
router.get('/', authenticateToken, checkPermission('project:contract:list'), async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    // 数据权限：校验用户对该合同的数据范围（与合同列表一致），
    // 防止拿到他人合同 id 后越权读取订货明细
    const contractScopeWhere = await getDataScopeWhere(req.user!.id, req.user?.role, {
      ownerField: 'ownerId',
      relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }]
    })
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null, ...contractScopeWhere },
      select: { id: true }
    })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }

    const items = await prisma.contractOrderItem.findMany({
      where: { contractId, deletedAt: null },
      include: {
        files: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } }
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
router.post('/', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同订货', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, productName, spec, quantity, unit, unitPrice, totalPrice, deliveryDate, contactName, contactPhone, remarks } = req.body

    if (!contractId || !productName || !quantity || !unitPrice) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    // 数值范围校验（数据库字段为 Decimal(12,2)，最大值 9999999999.99）
    const MAX_DECIMAL_VALUE = 9999999999.99
    const parsedQuantity = Number(quantity)
    const parsedUnitPrice = Number(unitPrice)
    const parsedTotalPrice = totalPrice ? Number(totalPrice) : null

    if (parsedQuantity <= 0 || parsedQuantity > 999999) {
      return res.status(400).json({ error: '数量必须在 1 到 999999 之间' })
    }
    if (parsedUnitPrice <= 0 || parsedUnitPrice > MAX_DECIMAL_VALUE) {
      return res.status(400).json({ error: `单价必须在 0.01 到 ${MAX_DECIMAL_VALUE} 之间` })
    }
    if (parsedTotalPrice !== null && parsedTotalPrice > MAX_DECIMAL_VALUE) {
      return res.status(400).json({ error: `总价不能超过 ${MAX_DECIMAL_VALUE}` })
    }
    if (parsedTotalPrice !== null && parsedTotalPrice <= 0) {
      return res.status(400).json({ error: '总价必须大于 0' })
    }

    // 检查用户是否有权操作该合同
    const contract = await prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }
    if (contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此合同的订货明细' })
    }

    // 检查项目是否已归档
    const isArchived = await checkContractProjectArchived(contractId)
    if (isArchived) {
      return res.status(403).json({ error: '项目已归档，无法创建订货明细' })
    }

    const item = await prisma.contractOrderItem.create({
      data: {
        contractId,
        productName,
        spec,
        quantity: parsedQuantity,
        unit: unit || '个',
        unitPrice: parsedUnitPrice,
        totalPrice: parsedTotalPrice !== null ? parsedTotalPrice : (parsedQuantity * parsedUnitPrice),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        contactName,
        contactPhone,
        remarks
      }
    })

    // 自动写入工作日报（Notes）
    autoWriteContractOrderItemRecord(
      req.user!.id,
      contract.name,
      productName,
      item.id,
      contract.projectId,
      parsedQuantity,
      'CREATE',
      remarks
    ).catch((err) => logger.warn('Auto daily report failed:', err.message))

    res.status(201).json(item)
  } catch (error) {
    logger.error('Create order item error:', error)
    res.status(500).json({ error: '创建订货明细失败' })
  }
})

// 更新订货明细
router.put('/:id', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同订货', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { productName, spec, quantity, unit, unitPrice, totalPrice, deliveryDate, contactName, contactPhone, remarks } = req.body

    const parsedUnitPrice = unitPrice ? Number(unitPrice) : undefined
    const parsedQuantity = quantity ? Number(quantity) : undefined

    // 数值范围校验（数据库字段为 Decimal(12,2)，最大值 9999999999.99）
    const MAX_DECIMAL_VALUE = 9999999999.99
    if (parsedQuantity !== undefined && (parsedQuantity <= 0 || parsedQuantity > 999999)) {
      return res.status(400).json({ error: '数量必须在 1 到 999999 之间' })
    }
    if (parsedUnitPrice !== undefined && (parsedUnitPrice <= 0 || parsedUnitPrice > MAX_DECIMAL_VALUE)) {
      return res.status(400).json({ error: `单价必须在 0.01 到 ${MAX_DECIMAL_VALUE} 之间` })
    }
    if (totalPrice !== undefined) {
      const parsedTotalPrice = Number(totalPrice)
      if (parsedTotalPrice <= 0 || parsedTotalPrice > MAX_DECIMAL_VALUE) {
        return res.status(400).json({ error: `总价必须在 0.01 到 ${MAX_DECIMAL_VALUE} 之间` })
      }
    }

    const existing = await prisma.contractOrderItem.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '订货明细不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此订货明细' })
    }

    // 检查项目是否已归档
    if (existing.contract.projectId) {
      const isArchived = await checkContractProjectArchived(existing.contract.projectId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法更新订货明细' })
      }
    }

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
router.post('/:id/files', authenticateToken, checkPermission('project:contract:edit'), upload.array('files', 10), logOperation('合同订货', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const orderItemId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择文件' })
    }

    const orderItem = await prisma.contractOrderItem.findFirst({
      where: { id: orderItemId, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!orderItem) {
      return res.status(404).json({ error: '订货明细不存在' })
    }
    if (orderItem.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此订货明细' })
    }

    // 检查项目是否已归档
    if (orderItem.contract.projectId) {
      const isArchived = await checkContractProjectArchived(orderItem.contract.projectId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法上传附件' })
      }
    }

    const createdFiles = await Promise.all(
      files.map(file =>
        prisma.contractOrderItemFile.create({
          data: {
            orderItemId,
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
    logger.error('Upload order item files error:', error)
    res.status(500).json({ error: '上传附件失败' })
  }
})

// 获取订货明细附件列表
router.get('/:id/files', authenticateToken, checkPermission('project:contract:list'), async (req: AuthRequest, res) => {
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
router.get('/files/:fileId/download', authenticateFileToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractOrderItemFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { orderItem: { include: { contract: { select: { ownerId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    if (file.orderItem.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权下载此文件' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }
    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download order item file error:', error)
    res.status(500).json({ error: '下载附件失败' })
  }
})

// 预览订货明细附件（图片/PDF/Word/Excel）- 必须在下载路由之前
router.get('/files/:fileId/preview', authenticateFileToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractOrderItemFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { orderItem: { include: { contract: { select: { ownerId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    if (file.orderItem.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权预览此文件' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview order item file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除订货明细附件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同订货', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractOrderItemFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { orderItem: { include: { contract: { select: { ownerId: true, projectId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 所有权校验：管理员或合同负责人才能删除附件（与订货明细删除的校验保持一致）
    if (file.orderItem.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只有合同负责人才能删除附件' })
    }

    // 检查项目是否已归档
    if (file.orderItem.contract.projectId) {
      const isArchived = await checkContractProjectArchived(file.orderItem.contract.projectId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法删除附件' })
      }
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    await prisma.contractOrderItemFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete order item file error:', error)
    res.status(500).json({ error: '删除附件失败' })
  }
})

// 删除订货明细
router.delete('/:id', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同订货', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.contractOrderItem.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '订货明细不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此订货明细' })
    }

    // 检查项目是否已归档
    if (existing.contract.projectId) {
      const isArchived = await checkContractProjectArchived(existing.contract.projectId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法删除订货明细' })
      }
    }

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
