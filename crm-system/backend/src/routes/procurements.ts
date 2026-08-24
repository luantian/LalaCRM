import prisma from '../lib/prisma'
import { Router } from 'express'
import { isAdmin } from '../utils/permission'
import { authenticateToken, authenticateFileToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import { applyDataScope, getDataScopeWhere } from '../middleware/dataScope'
import logger from '../utils/logger'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import { autoWriteProcurementRecord } from '../utils/autoDailyReport'
import path from 'path'
import fs from 'fs'

const router = Router()

// 数据权限：校验用户对采购单的可访问性（采购负责人/项目负责人/团队成员或管理员），
// 用于附件下载/预览/删除等按 fileId 操作的端点，防止 fileId 枚举越权
async function canAccessProcurement(procurementId: number, userId: number): Promise<boolean> {
  const scopeWhere = await getDataScopeWhere(userId, undefined, {
    ownerField: 'assignedTo',
    relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }]
  })
  const procurement = await prisma.procurement.findFirst({
    where: { id: procurementId, deletedAt: null, ...scopeWhere },
    select: { id: true }
  })
  return !!procurement
}

// GET /stats/overview - Stats (before /:id)
router.get('/stats/overview', authenticateToken, checkPermission('project:procurement:list'), applyDataScope({ ownerField: 'assignedTo', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, ...dataScopeWhere }
    
    const [total, byStatus, amountResult] = await Promise.all([
      prisma.procurement.count({ where }),
      prisma.procurement.groupBy({ by: ['status'], where, _count: true }),
      prisma.procurement.aggregate({ where, _sum: { totalAmount: true } })
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
router.get('/', authenticateToken, checkPermission('project:procurement:list'), applyDataScope({ ownerField: 'assignedTo', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 10
    const skip = (page - 1) * pageSize
    const { projectId, status, search } = req.query

    // 构建查询条件
    const conditions: any[] = [{ deletedAt: null }]

    // 数据权限过滤
    const dataScopeWhere = (req as any).dataScopeWhere || {}
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
router.get('/:id', authenticateToken, checkPermission('project:procurement:list'), applyDataScope({ ownerField: 'assignedTo', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const procurement = await prisma.procurement.findFirst({
      where: { id, deletedAt: null, ...dataScopeWhere },
      include: { project: true, items: { where: { deletedAt: null } }, files: { where: { deletedAt: null } } }
    })
    if (!procurement) return res.status(404).json({ error: '采购单不存在' })

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

    // 必填字段校验
    const missingFields: string[] = []
    if (!title) missingFields.push('采购标题')
    if (!vendor) missingFields.push('供应商名称')
    
    if (missingFields.length > 0) {
      return res.status(400).json({ error: `以下字段不能为空：${missingFields.join('、')}` })
    }

    const procurement = await prisma.procurement.create({
      data: {
        title,
        vendor,
        totalAmount: totalAmount ? Number(totalAmount) : null,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        // 创建一律为计划中，状态流转必须走审批接口（防止直选状态绕过把关）
        status: 'PLANNED',
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
      autoWriteProcurementRecord(req.user.id, procurement.title, 'CREATE', procurement.id, procurement.projectId, procurement.totalAmount?.toNumber()).catch((err) => logger.warn('Auto daily report failed:', err.message))
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
      data: {
        status: status as any,
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        approvalNote: remark?.trim() || null
      }
    })

    logger.info(`Procurement ${id} status changed from ${procurement.status} to ${status} by ${req.user?.username}`)
    // 根据状态判断是 APPROVE 还是 REJECT
    const reportAction = (status === 'CANCELLED' || status === 'REJECTED') ? 'REJECT' : 'APPROVE'
    if (req.user?.id) {
      autoWriteProcurementRecord(req.user.id, procurement.title, reportAction, id, procurement.projectId, procurement.totalAmount?.toNumber()).catch((err) => logger.warn('Auto daily report failed:', err.message))
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

    // 权限校验：管理员、采购负责人或项目负责人可以编辑
    if (!(await isAdmin(req.user!.id))) {
      const isAssignee = current.assignedTo === req.user!.id
      let isProjectOwner = false
      if (!isAssignee && current.projectId) {
        const project = await prisma.project.findFirst({
          where: { id: current.projectId, deletedAt: null },
          select: { ownerId: true }
        })
        isProjectOwner = project?.ownerId === req.user!.id
      }
      if (!isAssignee && !isProjectOwner) {
        return res.status(403).json({ error: '只有采购负责人或项目负责人才能编辑采购单' })
      }
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
      autoWriteProcurementRecord(req.user.id, procurement.title, 'UPDATE', procurement.id, procurement.projectId, procurement.totalAmount?.toNumber()).catch((err) => logger.warn('Auto daily report failed:', err.message))
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

    // 权限校验：管理员或采购负责人可以删除
    if (!(await isAdmin(req.user!.id))) {
      if (existing.assignedTo !== req.user!.id) {
        return res.status(403).json({ error: '只有采购负责人才能删除采购单' })
      }
    }

    // 级联软删除采购明细及其附件
    const items = await prisma.procurementItem.findMany({ where: { procurementId: id }, select: { id: true } })
    const itemIds = items.map((i: any) => i.id)
    if (itemIds.length > 0) {
      await prisma.procurementItemFile.updateMany({ where: { procurementItemId: { in: itemIds } }, data: { deletedAt: new Date() } })
    }
    await prisma.procurementItem.updateMany({ where: { procurementId: id }, data: { deletedAt: new Date() } })
    // 级联软删除采购付款及其附件
    const payments = await prisma.procurementPayment.findMany({ where: { procurementId: id }, select: { id: true } })
    const paymentIds = payments.map((p: any) => p.id)
    if (paymentIds.length > 0) {
      await prisma.procurementPaymentFile.updateMany({ where: { procurementPaymentId: { in: paymentIds } }, data: { deletedAt: new Date() } })
    }
    await prisma.procurementPayment.updateMany({ where: { procurementId: id }, data: { deletedAt: new Date() } })
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
    
    // 先查找明细及关联的采购单
    const item = await prisma.procurementItem.findFirst({ 
      where: { id: itemId, deletedAt: null },
      include: { procurement: { select: { id: true, projectId: true, assignedTo: true } } }
    })
    if (!item) {
      return res.status(404).json({ error: '采购明细不存在' })
    }

    // 权限校验：有 project:procurement:delete 权限的可以删除
    if (!(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权限删除' })
    }

    // 级联软删除明细附件
    await prisma.procurementItemFile.updateMany({ where: { procurementItemId: itemId }, data: { deletedAt: new Date() } })
    // 级联软删除明细附件
    await prisma.procurementItemFile.updateMany({ where: { procurementItemId: itemId }, data: { deletedAt: new Date() } })
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
router.get('/files/:fileId/download', authenticateFileToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 数据权限：通过附件所属采购单校验访问权
    if (!(await canAccessProcurement(file.procurementId, req.user!.id))) {
      return res.status(403).json({ error: '无权访问该采购单的附件' })
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
router.get('/files/:fileId/preview', authenticateFileToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 数据权限：通过附件所属采购单校验访问权
    if (!(await canAccessProcurement(file.procurementId, req.user!.id))) {
      return res.status(403).json({ error: '无权访问该采购单的附件' })
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

    const file = await prisma.procurementFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 数据权限：只有数据范围内可见的采购单才能删除附件
    if (!(await canAccessProcurement(file.procurementId, req.user!.id))) {
      return res.status(403).json({ error: '无权删除该采购单的附件' })
    }

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
router.get('/item-files/:fileId/download', authenticateFileToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
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
router.get('/item-files/:fileId/preview', authenticateFileToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
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
    
    const file = await prisma.procurementItemFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

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
router.get('/payment-files/:fileId/download', authenticateFileToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementPaymentFile.findFirst({ 
      where: { id: fileId, deletedAt: null }
    })

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
router.get('/payment-files/:fileId/preview', authenticateFileToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.procurementPaymentFile.findFirst({ 
      where: { id: fileId, deletedAt: null }
    })
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
    
    const file = await prisma.procurementPaymentFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    await prisma.procurementPaymentFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete procurement payment file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

export default router
