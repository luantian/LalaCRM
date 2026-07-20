import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取所有出差记录
router.get('/', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const { page = '1', pageSize = '10', status = '', search = '' } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    // 构建查询条件：合并数据权限和筛选条件
    const conditions: any[] = [{ deletedAt: null }]
    if (Object.keys(dataScopeWhere).length > 0) {
      conditions.push(dataScopeWhere)
    }

    if (status) {
      conditions.push({ status: status as string })
    }

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search as string, mode: 'insensitive' } },
          { destination: { contains: search as string, mode: 'insensitive' } },
          { purpose: { contains: search as string, mode: 'insensitive' } }
        ]
      })
    }

    const where: any = conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}

    const total = await prisma.businessTrip.count({ where })

    const trips = await prisma.businessTrip.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      },
      orderBy: { startDate: 'desc' },
      skip,
      take
    })

    res.json({
      data: trips,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get business trips error:', error)
    res.status(500).json({ error: '获取出差记录失败' })
  }
})

// 出差统计
router.get('/stats/overview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const trips = await prisma.businessTrip.findMany({ where: { deletedAt: null } })

    const totalTrips = trips.length
    const totalDays = trips.reduce((sum, t) => sum + t.days, 0)
    const totalAmount = trips.reduce((sum, t) => sum + Number(t.totalAmount), 0)
    const totalAccommodation = trips.reduce((sum, t) => sum + Number(t.accommodation || 0), 0)
    const totalTransportation = trips.reduce((sum, t) => sum + Number(t.transportation || 0), 0)
    const totalMeals = trips.reduce((sum, t) => sum + Number(t.meals || 0), 0)
    const totalOther = trips.reduce((sum, t) => sum + Number(t.otherExpenses || 0), 0)

    // 按状态统计
    const statusCount = trips.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    res.json({
      totalTrips,
      totalDays,
      totalAmount,
      totalAccommodation,
      totalTransportation,
      totalMeals,
      totalOther,
      draft: statusCount['DRAFT'] || 0,
      submitted: statusCount['SUBMITTED'] || 0,
      approved: statusCount['APPROVED'] || 0,
      completed: statusCount['COMPLETED'] || 0,
      rejected: statusCount['REJECTED'] || 0,
      averagePerTrip: totalTrips > 0 ? (totalAmount / totalTrips).toFixed(2) : '0'
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取单个出差记录
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const trip = await prisma.businessTrip.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        project: true,
        owner: { select: { id: true, name: true } }
      }
    })

    if (!trip) {
      return res.status(404).json({ error: '出差记录不存在' })
    }

    res.json(trip)
  } catch (error) {
    res.status(500).json({ error: '获取出差详情失败' })
  }
})

// 创建出差记录（默认为草稿）
router.post('/', authenticateToken, logOperation('出差管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const {
      title,
      customerId,
      projectId,
      destination,
      purpose,
      startDate,
      endDate,
      days,
      accommodation,
      transportation,
      meals,
      otherExpenses,
      notes
    } = req.body

    // 计算总费用
    const totalAmount = (parseFloat(accommodation || 0) +
                        parseFloat(transportation || 0) +
                        parseFloat(meals || 0) +
                        parseFloat(otherExpenses || 0))

    const trip = await prisma.businessTrip.create({
      data: {
        title,
        customerId: customerId || null,
        projectId: projectId || null,
        destination,
        purpose,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days: parseInt(days),
        accommodation: parseFloat(accommodation || 0),
        transportation: parseFloat(transportation || 0),
        meals: parseFloat(meals || 0),
        otherExpenses: parseFloat(otherExpenses || 0),
        totalAmount,
        notes,
        ownerId: req.user!.id
        // status 默认为 DRAFT，由 schema 控制
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(trip)
  } catch (error) {
    logger.error('Create business trip error:', error)
    res.status(500).json({ error: '创建出差记录失败' })
  }
})

// 提交申请（DRAFT → SUBMITTED）
router.post('/:id/submit', authenticateToken, checkPermission('submit_trips'), logOperation('出差管理', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态可以提交申请' })
    }

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Submit business trip error:', error)
    res.status(500).json({ error: '提交申请失败' })
  }
})

// 审批通过（SUBMITTED → APPROVED）
router.post('/:id/approve', authenticateToken, checkPermission('approve_business_trips'), logOperation('出差管理', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { remark } = req.body

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以审批' })
    }

    const approverName = req.user?.username || '审批人'
    const remarkText = remark ? `\n[审批备注 by ${approverName}]: ${remark}` : ''

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: {
        status: 'APPROVED',
        notes: (trip.notes || '') + remarkText
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Approve business trip error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 驳回（SUBMITTED → REJECTED）
router.post('/:id/reject', authenticateToken, checkPermission('approve_business_trips'), logOperation('出差管理', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({ error: '驳回原因不能为空' })
    }

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以驳回' })
    }

    const approverName = req.user?.username || '审批人'
    const rejectText = `\n[驳回 by ${approverName}]: ${reason}`

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: (trip.notes || '') + rejectText
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Reject business trip error:', error)
    res.status(500).json({ error: '驳回失败' })
  }
})

// 重新提交（REJECTED → SUBMITTED）
router.post('/:id/resubmit', authenticateToken, logOperation('出差管理', 'RESUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'REJECTED') {
      return res.status(400).json({ error: '只有被驳回状态可以重新提交' })
    }

    if (trip.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能重新提交自己的出差申请' })
    }

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Resubmit business trip error:', error)
    res.status(500).json({ error: '重新提交失败' })
  }
})

// 标记已完成（APPROVED → COMPLETED）
router.post('/:id/complete', authenticateToken, logOperation('出差管理', 'COMPLETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'APPROVED') {
      return res.status(400).json({ error: '只有已批准状态可以标记完成' })
    }

    if (trip.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能操作自己的出差申请' })
    }

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Complete business trip error:', error)
    res.status(500).json({ error: '标记完成失败' })
  }
})

// 更新出差记录（仅草稿或被驳回时允许编辑）
router.put('/:id', authenticateToken, logOperation('出差管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      title,
      customerId,
      projectId,
      destination,
      purpose,
      startDate,
      endDate,
      days,
      accommodation,
      transportation,
      meals,
      otherExpenses,
      notes
    } = req.body

    const currentTrip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!currentTrip) {
      return res.status(404).json({ error: '出差记录不存在' })
    }

    // 只允许编辑草稿或被驳回的记录
    if (currentTrip.status !== 'DRAFT' && currentTrip.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许编辑' })
    }

    // 只能编辑自己的（ADMIN 除外）
    if (currentTrip.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能编辑自己的出差记录' })
    }

    const totalAmount = (parseFloat(accommodation || 0) +
                        parseFloat(transportation || 0) +
                        parseFloat(meals || 0) +
                        parseFloat(otherExpenses || 0))

    const trip = await prisma.businessTrip.update({
      where: { id },
      data: {
        title,
        customerId: customerId || null,
        projectId: projectId || null,
        destination,
        purpose,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days: parseInt(days),
        accommodation: parseFloat(accommodation || 0),
        transportation: parseFloat(transportation || 0),
        meals: parseFloat(meals || 0),
        otherExpenses: parseFloat(otherExpenses || 0),
        totalAmount,
        notes
        // 不允许通过 PUT 修改 status
      }
    })

    res.json(trip)
  } catch (error) {
    logger.error('Update business trip error:', error)
    res.status(500).json({ error: '更新出差记录失败' })
  }
})

// 删除出差记录（仅草稿或被驳回时允许删除）
router.delete('/:id', authenticateToken, logOperation('出差管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '出差记录不存在' })
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许删除' })
    }

    if (existing.ownerId !== req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能删除自己的出差记录' })
    }

    await prisma.businessTrip.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete business trip error:', error)
    res.status(500).json({ error: '删除出差记录失败' })
  }
})

export default router
