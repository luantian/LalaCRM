import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// GET /stats/overview - Stats (before /:id)
router.get('/stats/overview', authenticateToken, checkPermission('view_procurements'), async (req: AuthRequest, res) => {
  try {
    const [total, byStatus, amountResult] = await Promise.all([
      prisma.procurement.count({ where: { deletedAt: null } }),
      prisma.procurement.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      prisma.procurement.aggregate({ where: { deletedAt: null }, _sum: { totalAmount: true } })
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
router.get('/', authenticateToken, checkPermission('view_procurements'), applyDataScope('assignedTo'), async (req: AuthRequest, res) => {
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
      prisma.procurement.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, include: { project: true } })
    ])
    res.json({ data: procurements, pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } })
  } catch (error) {
    logger.error('Get procurements error:', error)
    res.status(500).json({ error: '获取采购列表失败' })
  }
})

// GET /:id - Detail
router.get('/:id', authenticateToken, checkPermission('view_procurements'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const procurement = await prisma.procurement.findFirst({
      where: { id, deletedAt: null },
      include: { project: true, items: true }
    })
    if (!procurement) return res.status(404).json({ error: '采购单不存在' })
    res.json(procurement)
  } catch (error) {
    logger.error('Get procurement error:', error)
    res.status(500).json({ error: '获取采购详情失败' })
  }
})

// POST / - Create procurement
router.post('/', authenticateToken, checkPermission('edit_procurements'), logOperation('采购管理', 'CREATE'), async (req: AuthRequest, res) => {
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
    res.status(201).json(procurement)
  } catch (error) {
    logger.error('Create procurement error:', error)
    res.status(500).json({ error: '创建采购单失败' })
  }
})

// 审批采购单
router.post('/:id/approve', authenticateToken, checkPermission('approve_procurements'), logOperation('采购管理', 'APPROVE'), async (req: AuthRequest, res) => {
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

    const procurement = await prisma.procurement.findFirst({ where: { id, deletedAt: null } })
    if (!procurement) {
      return res.status(404).json({ error: '采购单不存在' })
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
    res.json(updated)
  } catch (error) {
    logger.error('Approve procurement error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// PUT /:id - Update procurement
router.put('/:id', authenticateToken, checkPermission('edit_procurements'), logOperation('采购管理', 'UPDATE'), async (req: AuthRequest, res) => {
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
    res.json(procurement)
  } catch (error) {
    logger.error('Update procurement error:', error)
    res.status(500).json({ error: '更新采购单失败' })
  }
})

// DELETE /:id - Delete procurement
router.delete('/:id', authenticateToken, checkPermission('edit_procurements'), logOperation('采购管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    await prisma.procurementItem.updateMany({ where: { procurementId: id }, data: { deletedAt: new Date() } })
    await prisma.procurement.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete procurement error:', error)
    res.status(500).json({ error: '删除采购单失败' })
  }
})

// GET /:id/items - List procurement items
router.get('/:id/items', authenticateToken, checkPermission('edit_procurements'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const items = await prisma.procurementItem.findMany({ where: { procurementId: id, deletedAt: null }, orderBy: { createdAt: 'desc' } })
    res.json(items)
  } catch (error) {
    logger.error('Get items error:', error)
    res.status(500).json({ error: '获取采购明细失败' })
  }
})

// POST /:id/items - Create procurement item
router.post('/:id/items', authenticateToken, checkPermission('edit_procurements'), logOperation('采购管理', 'CREATE'), async (req: AuthRequest, res) => {
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
router.put('/items/:itemId', authenticateToken, checkPermission('edit_procurements'), logOperation('采购管理', 'UPDATE'), async (req: AuthRequest, res) => {
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
router.delete('/items/:itemId', authenticateToken, checkPermission('edit_procurements'), logOperation('采购管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const itemId = parseInt(req.params.itemId as string)
    await prisma.procurementItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete item error:', error)
    res.status(500).json({ error: '删除采购明细失败' })
  }
})

export default router
