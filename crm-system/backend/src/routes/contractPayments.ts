import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取合同付款记录列表
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    const payments = await prisma.contractPayment.findMany({
      where: { contractId, deletedAt: null },
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
    logger.error('Get payments error:', error)
    res.status(500).json({ error: '获取付款记录失败' })
  }
})

// 创建付款记录
router.post('/', authenticateToken, logOperation('合同付款', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    if (!contractId || !amount || !paymentDate) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    const payment = await prisma.contractPayment.create({
      data: {
        contractId,
        amount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        paymentType: paymentType || 'PROGRESS',
        status: status || 'PENDING',
        invoiceNo,
        remarks
      }
    })

    res.status(201).json(payment)
  } catch (error) {
    logger.error('Create payment error:', error)
    res.status(500).json({ error: '创建付款记录失败' })
  }
})

// 更新付款记录
router.put('/:id', authenticateToken, logOperation('合同付款', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    const payment = await prisma.contractPayment.update({
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

    res.json(payment)
  } catch (error) {
    logger.error('Update payment error:', error)
    res.status(500).json({ error: '更新付款记录失败' })
  }
})

// 删除付款记录
router.delete('/:id', authenticateToken, logOperation('合同付款', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    await prisma.contractPayment.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete payment error:', error)
    res.status(500).json({ error: '删除付款记录失败' })
  }
})

export default router
