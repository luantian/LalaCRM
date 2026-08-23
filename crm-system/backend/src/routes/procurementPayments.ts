import prisma from '../lib/prisma'
import { Router } from 'express'
import { isAdmin } from '../utils/permission'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import { autoWriteProcurementPaymentRecord } from '../utils/autoDailyReport'

const router = Router()

// 获取采购付款记录列表
router.get('/', authenticateToken, checkPermission('project:procurement:list'), async (req: AuthRequest, res) => {
  try {
    const procurementId = parseInt(req.query.procurementId as string)
    if (!procurementId) {
      return res.status(400).json({ error: '缺少采购ID' })
    }

    // 数据权限：与采购单可见性对齐（项目负责人/团队成员/采购负责人或管理员）
    const procurement = await prisma.procurement.findFirst({
      where: { id: procurementId, deletedAt: null },
      include: { project: { select: { ownerId: true } } }
    })
    if (!procurement) {
      return res.status(404).json({ error: '采购单不存在' })
    }
    if (!(await isAdmin(req.user!.id))) {
      const isProjectOwner = procurement.project?.ownerId === req.user!.id
      const isAssignee = procurement.assignedTo === req.user!.id
      let isTeamMember = false
      if (!isProjectOwner && !isAssignee && procurement.projectId) {
        const tm = await prisma.projectTeamMember.findFirst({
          where: { projectId: procurement.projectId, userId: req.user!.id, deletedAt: null }
        })
        isTeamMember = !!tm
      }
      if (!isProjectOwner && !isAssignee && !isTeamMember) {
        return res.status(403).json({ error: '无权查看该采购单的付款记录' })
      }
    }

    const payments = await prisma.procurementPayment.findMany({
      where: { procurementId, deletedAt: null },
      include: { files: { where: { deletedAt: null }, select: { id: true } } },
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
    logger.error('Get procurement payments error:', error)
    res.status(500).json({ error: '获取采购付款记录失败' })
  }
})

// 创建采购付款记录
router.post('/', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购付款', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { procurementId, amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    if (!procurementId || !amount || !paymentDate) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    // 检查用户是否有权操作该采购单（项目负责人或管理员）
    const procurement = await prisma.procurement.findFirst({
      where: { id: procurementId, deletedAt: null },
      include: { project: { select: { ownerId: true } } }
    })
    if (!procurement) {
      return res.status(404).json({ error: '采购单不存在' })
    }
    if (procurement.project?.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此采购单的付款记录' })
    }

    const payment = await prisma.procurementPayment.create({
      data: {
        procurementId,
        amount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        paymentType: paymentType || 'PROGRESS',
        status: status || 'PENDING',
        invoiceNo,
        remarks
      }
    })

    // 自动写入工作日报（Notes）
    autoWriteProcurementPaymentRecord(
      req.user!.id,
      procurement.title,
      'CREATE',
      payment.id,
      procurement.projectId,
      Number(amount),
      [
        `付款日期：${new Date(paymentDate).toLocaleDateString('zh-CN')}`,
        remarks && remarks.trim() ? `备注：${remarks.trim()}` : ''
      ].filter(Boolean).join('\n')
    ).catch((err) => logger.warn('Auto daily report failed:', err.message))

    res.status(201).json(payment)
  } catch (error) {
    logger.error('Create procurement payment error:', error)
    res.status(500).json({ error: '创建采购付款记录失败' })
  }
})

// 更新采购付款记录
router.put('/:id', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购付款', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    const existing = await prisma.procurementPayment.findFirst({
      where: { id, deletedAt: null },
      include: { procurement: { include: { project: { select: { ownerId: true } } } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '付款记录不存在' })
    }
    if (existing.procurement.project?.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此付款记录' })
    }

    const payment = await prisma.procurementPayment.update({
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

    // 自动写入工作日报（Notes）：状态变为已付/已确认记为"确认付款"
    const newStatus = status !== undefined ? status : existing.status
    const confirmed = (newStatus === 'RECEIVED' || newStatus === 'CONFIRMED') &&
      existing.status !== 'RECEIVED' && existing.status !== 'CONFIRMED'
    autoWriteProcurementPaymentRecord(
      req.user!.id,
      existing.procurement.title,
      confirmed ? 'CONFIRM' : 'UPDATE',
      id,
      existing.procurement.projectId,
      amount !== undefined ? Number(amount) : null,
      newStatus !== existing.status ? `状态：${existing.status} → ${newStatus}` : ''
    ).catch((err) => logger.warn('Auto daily report failed:', err.message))

    res.json(payment)
  } catch (error) {
    logger.error('Update procurement payment error:', error)
    res.status(500).json({ error: '更新采购付款记录失败' })
  }
})

// 删除采购付款记录
router.delete('/:id', authenticateToken, checkPermission('project:procurement:edit'), logOperation('采购付款', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.procurementPayment.findFirst({
      where: { id, deletedAt: null },
      include: { procurement: { include: { project: { select: { ownerId: true } } } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '付款记录不存在' })
    }
    if (existing.procurement.project?.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此付款记录' })
    }
    await prisma.procurementPayment.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete procurement payment error:', error)
    res.status(500).json({ error: '删除采购付款记录失败' })
  }
})

export default router
