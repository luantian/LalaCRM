import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取所有费用报销记录
router.get('/', authenticateToken, checkPermission('view_expenses'), applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const { page = '1', pageSize = '10', status = '', category = '', search = '' } = req.query

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

    if (category) {
      conditions.push({ category: category as string })
    }

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ]
      })
    }

    const where: any = conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}

    const total = await prisma.expense.count({ where })

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      },
      orderBy: { expenseDate: 'desc' },
      skip,
      take
    })

    // 批量查询审批人信息
    const approverIds = [...new Set(expenses.filter(e => e.approvedBy).map(e => e.approvedBy!))]
    const approvers = approverIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } })
      : []
    const approverMap = Object.fromEntries(approvers.map(a => [a.id, a]))

    const dataWithApprover = expenses.map(e => ({
      ...e,
      approver: e.approvedBy ? approverMap[e.approvedBy] || null : null
    }))

    res.json({
      data: dataWithApprover,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get expenses error:', error)
    res.status(500).json({ error: '获取费用报销记录失败' })
  }
})

// 费用统计
router.get('/stats/overview', authenticateToken, checkPermission('view_expenses'), async (req: AuthRequest, res) => {
  try {
    const expenses = await prisma.expense.findMany({ where: { deletedAt: null } })

    const totalExpenses = expenses.length
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

    // 按类别统计
    const categoryStats = expenses.reduce((acc, e) => {
      if (!acc[e.category]) {
        acc[e.category] = { count: 0, amount: 0 }
      }
      acc[e.category].count++
      acc[e.category].amount += Number(e.amount)
      return acc
    }, {} as Record<string, { count: number; amount: number }>)

    // 按状态统计
    const statusCount = expenses.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    res.json({
      totalExpenses,
      totalAmount,
      draft: statusCount['DRAFT'] || 0,
      submitted: statusCount['SUBMITTED'] || 0,
      approved: statusCount['APPROVED'] || 0,
      rejected: statusCount['REJECTED'] || 0,
      paid: statusCount['PAID'] || 0,
      categoryStats,
      averagePerExpense: totalExpenses > 0 ? (totalAmount / totalExpenses).toFixed(2) : '0'
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取单个费用报销记录
router.get('/:id', authenticateToken, checkPermission('view_expenses'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const expense = await prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        project: true,
        owner: { select: { id: true, name: true } }
      }
    })

    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    res.json(expense)
  } catch (error) {
    res.status(500).json({ error: '获取费用报销详情失败' })
  }
})

// 创建费用报销记录（默认为草稿）
router.post('/', authenticateToken, checkPermission('submit_expenses'), logOperation('费用报销', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const {
      title,
      customerId,
      projectId,
      category,
      amount,
      expenseDate,
      description,
      receipt
    } = req.body

    if (!title || !category || !amount || !expenseDate || !projectId) {
      return res.status(400).json({ error: '标题、费用类别、金额、费用日期和关联项目不能为空' })
    }

    const expense = await prisma.expense.create({
      data: {
        title,
        customerId: customerId || null,
        projectId: projectId || null,
        category,
        amount: parseFloat(amount),
        expenseDate: new Date(expenseDate),
        description,
        receipt,
        ownerId: req.user!.id
        // status 默认为 DRAFT，由 schema 控制
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(expense)
  } catch (error) {
    logger.error('Create expense error:', error)
    res.status(500).json({ error: '创建费用报销记录失败' })
  }
})

// 更新费用报销记录（仅草稿或被驳回时允许编辑）
router.put('/:id', authenticateToken, checkPermission('submit_expenses'), logOperation('费用报销', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      title,
      customerId,
      projectId,
      category,
      amount,
      expenseDate,
      description,
      receipt
    } = req.body

    const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    // 只允许编辑草稿或被驳回的记录
    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许编辑' })
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        title,
        customerId: customerId || null,
        projectId: projectId || null,
        category,
        amount: amount ? parseFloat(amount) : existing.amount,
        expenseDate: expenseDate ? new Date(expenseDate) : existing.expenseDate,
        description,
        receipt
        // 不允许通过 PUT 修改 status
      }
    })

    res.json(expense)
  } catch (error) {
    logger.error('Update expense error:', error)
    res.status(500).json({ error: '更新费用报销记录失败' })
  }
})

// 删除费用报销记录（仅草稿或被驳回时允许删除）
router.delete('/:id', authenticateToken, checkPermission('submit_expenses'), logOperation('费用报销', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许删除' })
    }

    await prisma.expenseFile.updateMany({ where: { expenseId: id }, data: { deletedAt: new Date() } })
    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete expense error:', error)
    res.status(500).json({ error: '删除费用报销记录失败' })
  }
})

// 提交申请（DRAFT → SUBMITTED）
router.post('/:id/submit', authenticateToken, checkPermission('submit_expenses'), logOperation('费用报销', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态可以提交申请' })
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Submit expense error:', error)
    res.status(500).json({ error: '提交申请失败' })
  }
})

// 审批通过（SUBMITTED → APPROVED）
router.post('/:id/approve', authenticateToken, checkPermission('approve_expenses'), logOperation('费用报销', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { remark } = req.body

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以审批' })
    }

    // 将审批备注追加到 description
    const approver = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })
    const approverName = approver?.name || req.user!.username || '审批人'
    const remarkText = remark ? `\n[审批备注 by ${approverName}]: ${remark}` : ''

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        description: (expense.description || '') + remarkText
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Approve expense error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 驳回（SUBMITTED → REJECTED）
router.post('/:id/reject', authenticateToken, checkPermission('approve_expenses'), logOperation('费用报销', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({ error: '驳回原因不能为空' })
    }

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以驳回' })
    }

    const approver = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })
    const approverName = approver?.name || req.user!.username || '审批人'
    const rejectText = `\n[驳回 by ${approverName}]: ${reason}`

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        description: (expense.description || '') + rejectText
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Reject expense error:', error)
    res.status(500).json({ error: '驳回失败' })
  }
})

// 重新提交（REJECTED → SUBMITTED）
router.post('/:id/resubmit', authenticateToken, checkPermission('submit_expenses'), logOperation('费用报销', 'RESUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'REJECTED') {
      return res.status(400).json({ error: '只有被驳回状态可以重新提交' })
    }

    // 只能重新提交自己的
    if (expense.ownerId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: '只能重新提交自己的报销申请' })
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvedBy: null,
        approvedAt: null
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Resubmit expense error:', error)
    res.status(500).json({ error: '重新提交失败' })
  }
})

// 标记已支付（APPROVED → PAID）
router.post('/:id/pay', authenticateToken, checkPermission('approve_expenses'), logOperation('费用报销', 'PAY'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'APPROVED') {
      return res.status(400).json({ error: '只有已批准状态可以标记支付' })
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'PAID' },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Pay expense error:', error)
    res.status(500).json({ error: '标记支付失败' })
  }
})

export default router
