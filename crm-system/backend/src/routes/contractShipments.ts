import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取合同发货记录列表
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    const shipments = await prisma.contractShipment.findMany({
      where: { contractId, deletedAt: null },
      orderBy: { shipDate: 'desc' }
    })

    res.json(shipments)
  } catch (error) {
    logger.error('Get shipments error:', error)
    res.status(500).json({ error: '获取发货记录失败' })
  }
})

// 创建发货记录
router.post('/', authenticateToken, logOperation('合同发货', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, shipDate, logisticsNo, logisticsCompany, content, quantity, status, receiveDate, receiver, remarks } = req.body

    if (!contractId || !shipDate) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    const shipment = await prisma.contractShipment.create({
      data: {
        contractId,
        shipDate: new Date(shipDate),
        logisticsNo,
        logisticsCompany,
        content,
        quantity,
        status: status || 'SHIPPED',
        receiveDate: receiveDate ? new Date(receiveDate) : null,
        receiver,
        remarks
      }
    })

    res.status(201).json(shipment)
  } catch (error) {
    logger.error('Create shipment error:', error)
    res.status(500).json({ error: '创建发货记录失败' })
  }
})

// 更新发货记录
router.put('/:id', authenticateToken, logOperation('合同发货', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { shipDate, logisticsNo, logisticsCompany, content, quantity, status, receiveDate, receiver, remarks } = req.body

    const shipment = await prisma.contractShipment.update({
      where: { id },
      data: {
        shipDate: shipDate ? new Date(shipDate) : undefined,
        logisticsNo,
        logisticsCompany,
        content,
        quantity,
        status,
        receiveDate: receiveDate ? new Date(receiveDate) : null,
        receiver,
        remarks
      }
    })

    res.json(shipment)
  } catch (error) {
    logger.error('Update shipment error:', error)
    res.status(500).json({ error: '更新发货记录失败' })
  }
})

// 删除发货记录
router.delete('/:id', authenticateToken, logOperation('合同发货', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    await prisma.contractShipment.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete shipment error:', error)
    res.status(500).json({ error: '删除发货记录失败' })
  }
})

export default router
