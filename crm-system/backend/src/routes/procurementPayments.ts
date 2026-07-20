import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取采购付款记录列表
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const procurementId = parseInt(req.query.procurementId as string)
    if (!procurementId) {
      return res.status(400).json({ error: '缺少采购ID' })
    }

    const payments = await prisma.procurementPayment.findMany({
      where: { procurementId, deletedAt: null },
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
router.post('/', authenticateToken, logOperation('采购付款', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { procurementId, amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

    if (!procurementId || !amount || !paymentDate) {
      return res.status(400).json({ error: '缺少必填字段' })
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

    res.status(201).json(payment)
  } catch (error) {
    logger.error('Create procurement payment error:', error)
    res.status(500).json({ error: '创建采购付款记录失败' })
  }
})

// 更新采购付款记录
router.put('/:id', authenticateToken, logOperation('采购付款', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { amount, paymentDate, paymentMethod, paymentType, status, invoiceNo, remarks } = req.body

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

    res.json(payment)
  } catch (error) {
    logger.error('Update procurement payment error:', error)
    res.status(500).json({ error: '更新采购付款记录失败' })
  }
})

// 删除采购付款记录
router.delete('/:id', authenticateToken, logOperation('采购付款', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    await prisma.procurementPayment.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete procurement payment error:', error)
    res.status(500).json({ error: '删除采购付款记录失败' })
  }
})

export default router
