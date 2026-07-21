import { Router, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import { sortValidation } from '../middleware/validation'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取所有销售记录（支持分页、筛选）
router.get('/', authenticateToken, applyDataScope('ownerId'), sortValidation(['amount', 'type', 'date', 'category', 'createdAt', 'updatedAt']), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      type = '',
      customerId = '',
      startDate = '',
      endDate = '',
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    const where: any = { deletedAt: null, ...dataScopeWhere }

    if (type) {
      where.type = type as string
    }

    if (customerId) {
      where.customerId = parseInt(customerId as string)
    }

    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate as string)
      if (endDate) where.date.lte = new Date(endDate as string)
    }

    const total = await prisma.sale.count({ where })

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    res.json({
      data: sales,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get sales error:', error)
    res.status(500).json({ error: '获取销售记录失败' })
  }
})

// 销售统计
router.get('/stats/overview', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const sales = await prisma.sale.findMany({ where: { deletedAt: null, ...dataScopeWhere } })

    const totalIncome = sales
      .filter(s => s.type === 'IN')
      .reduce((sum, s) => sum + Number(s.amount), 0)

    const totalExpense = sales
      .filter(s => s.type === 'OUT')
      .reduce((sum, s) => sum + Number(s.amount), 0)

    // 按月统计
    const monthlyStats = sales.reduce((acc, sale) => {
      const month = sale.date.toISOString().slice(0, 7)
      if (!acc[month]) {
        acc[month] = { income: 0, expense: 0 }
      }
      if (sale.type === 'IN') {
        acc[month].income += Number(sale.amount)
      } else {
        acc[month].expense += Number(sale.amount)
      }
      return acc
    }, {} as Record<string, { income: number; expense: number }>)

    const monthlyData = Object.entries(monthlyStats)
      .map(([month, data]) => ({
        month,
        ...data,
        profit: data.income - data.expense
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)

    res.json({
      totalSales: sales.length,
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
      monthlyData
    })
  } catch (error) {
    logger.error('Get sales stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 导出销售数据
router.get('/export/csv', authenticateToken, applyDataScope('ownerId'), logOperation('销售管理', 'EXPORT'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const sales = await prisma.sale.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: {
        customer: { select: { name: true } },
        owner: { select: { name: true } }
      }
    })

    const headers = ['类型', '金额', '客户', '描述', '日期', '负责人']
    // CSV安全：转义双引号，并用单引号前缀公式触发字符，防止CSV注入
    const escapeCsvCell = (value: string) => {
      const escaped = value.replace(/"/g, '""')
      if (/^[=+\-@]/.test(escaped)) {
        return "'" + escaped
      }
      return escaped
    }
    const rows = sales.map(s => [
      s.type === 'IN' ? '收入' : '支出',
      s.amount.toString(),
      s.customer.name,
      s.description || '',
      s.date.toISOString().split('T')[0],
      s.owner.name
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${escapeCsvCell(String(cell))}"`).join(','))
      .join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=sales.csv')
    res.send('﻿' + csv) // 添加BOM以支持Excel打开中文
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 获取单个销售记录
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const sale = await prisma.sale.findFirst({
      where: { id: parseInt(id), deletedAt: null },
      include: {
        customer: true,
        owner: { select: { id: true, name: true } }
      }
    })

    if (!sale) {
      return res.status(404).json({ error: '销售记录不存在' })
    }

    res.json(sale)
  } catch (error) {
    res.status(500).json({ error: '获取销售详情失败' })
  }
})

// 创建销售记录
router.post('/', authenticateToken, logOperation('销售管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { customerId, projectId, contractId, type, category, amount, description, date } = req.body

    if (!customerId || !type || !category || !amount || !date) {
      return res.status(400).json({ error: '必填字段缺失' })
    }

    const sale = await prisma.sale.create({
      data: {
        customerId,
        projectId: projectId || null,
        contractId: contractId || null,
        type,
        category,
        amount,
        description,
        date: new Date(date),
        ownerId: req.user!.id
      },
      include: {
        customer: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(sale)
  } catch (error) {
    logger.error('Create sale error:', error)
    res.status(500).json({ error: '创建销售记录失败' })
  }
})

// 更新销售记录
router.put('/:id', authenticateToken, logOperation('销售管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { customerId, projectId, contractId, type, category, amount, description, date } = req.body

    const existing = await prisma.sale.findFirst({ where: { id: parseInt(id), deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '销售记录不存在' })
    }

    const sale = await prisma.sale.update({
      where: { id: parseInt(id) },
      data: {
        customerId,
        projectId: projectId || null,
        contractId: contractId || null,
        type,
        category,
        amount,
        description,
        date: new Date(date)
      }
    })

    res.json(sale)
  } catch (error) {
    logger.error('Update sale error:', error)
    res.status(500).json({ error: '更新销售记录失败' })
  }
})

// 删除销售记录
router.delete('/:id', authenticateToken, logOperation('销售管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const numericId = parseInt(id)

    const existing = await prisma.sale.findFirst({ where: { id: numericId, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '销售记录不存在' })
    }

    await prisma.sale.update({
      where: { id: numericId },
      data: { deletedAt: new Date() }
    })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete sale error:', error)
    res.status(500).json({ error: '删除销售记录失败' })
  }
})

export default router