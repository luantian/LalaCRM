import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { applyDataScope, getDataScopeWhere } from '../middleware/dataScope'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取仪表盘统计数据（全面版）
router.get('/stats', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    // 统一时间基准，避免跨午夜不一致
    const now = new Date()

    // 1. 基础概览统计（使用聚合查询优化性能）
    const [
      totalCustomers,
      customerStats,
      salesAgg,
      activeProjects,
      activeContracts,
      totalOpportunities,
      opportunityStats
    ] = await Promise.all([
      prisma.customer.count({ where: { deletedAt: null, status: { not: 'INACTIVE' }, ...dataScopeWhere } }),
      prisma.customer.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...dataScopeWhere },
        _count: { id: true }
      }),
      prisma.sale.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, ...dataScopeWhere }
      }).then(async agg => {
        const [incomeAgg, expenseAgg] = await Promise.all([
          prisma.sale.aggregate({ _sum: { amount: true }, where: { deletedAt: null, type: 'IN', ...dataScopeWhere } }),
          prisma.sale.aggregate({ _sum: { amount: true }, where: { deletedAt: null, type: 'OUT', ...dataScopeWhere } })
        ])
        return {
          totalIncome: Number(incomeAgg._sum.amount || 0),
          totalExpense: Number(expenseAgg._sum.amount || 0)
        }
      }),
      prisma.project.count({ where: { deletedAt: null, status: 'IN_PROGRESS', ...dataScopeWhere } }),
      prisma.contract.count({ where: { deletedAt: null, status: 'ACTIVE', ...dataScopeWhere } }),
      prisma.opportunity.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.opportunity.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...dataScopeWhere },
        _count: { id: true },
        _sum: { budget: true }
      })
    ])

    // 客户状态统计
    const customerStatusMap: Record<string, number> = {}
    customerStats.forEach(s => { customerStatusMap[s.status] = s._count.id })

    // 商机漏斗统计
    const funnelMap: Record<string, number> = {}
    let totalBudget = 0
    opportunityStats.forEach(s => {
      funnelMap[s.status] = s._count.id
      totalBudget += Number(s._sum.budget || 0)
    })

    // 2. 销售趋势（使用groupBy优化，最近12个月）
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const trendSales = await prisma.sale.findMany({
      where: { deletedAt: null, date: { gte: twelveMonthsAgo }, ...dataScopeWhere },
      select: { type: true, amount: true, date: true }
    })

    const salesTrend: Record<string, { income: number; expense: number }> = {}
    trendSales.forEach(sale => {
      const month = sale.date.toISOString().slice(0, 7)
      if (!salesTrend[month]) salesTrend[month] = { income: 0, expense: 0 }
      if (sale.type === 'IN') salesTrend[month].income += Number(sale.amount)
      else salesTrend[month].expense += Number(sale.amount)
    })

    const monthlyData = Object.entries(salesTrend)
      .map(([month, data]) => ({
        month,
        ...data,
        profit: data.income - data.expense
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // 3. 本月业绩
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [monthIncome, monthExpense, monthNewCustomers, monthNewOpportunities] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, type: 'IN', date: { gte: monthStart }, ...dataScopeWhere }
      }),
      prisma.sale.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, type: 'OUT', date: { gte: monthStart }, ...dataScopeWhere }
      }),
      prisma.customer.count({ where: { deletedAt: null, createdAt: { gte: monthStart }, ...dataScopeWhere } }),
      prisma.opportunity.count({ where: { deletedAt: null, createdAt: { gte: monthStart }, ...dataScopeWhere } })
    ])

    // 4. 待办事项提醒
    const [
      pendingTrips,
      pendingExpenses,
      pendingContracts
    ] = await Promise.all([
      prisma.businessTrip.count({ where: { deletedAt: null, status: 'SUBMITTED', ...dataScopeWhere } }),
      prisma.expense.count({ where: { deletedAt: null, status: 'SUBMITTED', ...dataScopeWhere } }),
      prisma.contract.count({ where: { deletedAt: null, status: 'PENDING', ...dataScopeWhere } })
    ])

    // 5. 合同到期预警（30天内到期）
    const thirtyDaysLater = new Date(now)
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)

    const expiringContracts = await prisma.contract.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        endDate: {
          gte: now,
          lte: thirtyDaysLater
        },
        ...dataScopeWhere
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        customer: { select: { name: true } }
      },
      orderBy: { endDate: 'asc' },
      take: 10
    })

    // 6. 跟进提醒（只查自己的）
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const threeDaysLater = new Date(now)
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)

    let followUpReminders: any[] = []
    try {
      followUpReminders = await prisma.customerFollowUp.findMany({
        where: {
          deletedAt: null,
          userId,
          nextDate: { lte: threeDaysLater }
        },
        include: {
          customer: { select: { id: true, name: true } }
        },
        orderBy: { nextDate: 'asc' },
        take: 10
      })
    } catch (e) {
      // CustomerFollowUp 可能尚未创建
    }

    // 7. 项目进度概览
    const projectStats = await prisma.project.groupBy({
      by: ['status'],
      where: { deletedAt: null, ...dataScopeWhere },
      _count: { id: true }
    })
    const projectStatusMap: Record<string, number> = {}
    projectStats.forEach(s => { projectStatusMap[s.status] = s._count.id })

    const avgProgress = await prisma.project.aggregate({
      _avg: { progress: true },
      where: { deletedAt: null, status: 'IN_PROGRESS', ...dataScopeWhere }
    })

    // 8. 最新数据
    const [recentCustomers, recentSales, recentOpportunities] = await Promise.all([
      prisma.customer.findMany({
        where: { deletedAt: null, ...dataScopeWhere },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, companyName: true, createdAt: true, status: true }
      }),
      prisma.sale.findMany({
        where: { deletedAt: null, ...dataScopeWhere },
        take: 5,
        orderBy: { date: 'desc' },
        select: { id: true, type: true, amount: true, date: true, customer: { select: { name: true } } }
      }),
      prisma.opportunity.findMany({
        where: { deletedAt: null, ...dataScopeWhere },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, status: true, budget: true, winRate: true, createdAt: true }
      })
    ])

    res.json({
      overview: {
        totalCustomers,
        totalIncome: salesAgg.totalIncome,
        totalExpense: salesAgg.totalExpense,
        netIncome: salesAgg.totalIncome - salesAgg.totalExpense,
        activeProjects,
        activeContracts,
        totalSales: trendSales.length,
        totalOpportunities,
        totalBudget
      },
      monthly: {
        income: Number(monthIncome._sum.amount || 0),
        expense: Number(monthExpense._sum.amount || 0),
        profit: Number(monthIncome._sum.amount || 0) - Number(monthExpense._sum.amount || 0),
        newCustomers: monthNewCustomers,
        newOpportunities: monthNewOpportunities
      },
      customerStats: [
        { status: 'ACTIVE', _count: { id: customerStatusMap['ACTIVE'] || 0 } },
        { status: 'INACTIVE', _count: { id: customerStatusMap['INACTIVE'] || 0 } },
        { status: 'POTENTIAL', _count: { id: customerStatusMap['POTENTIAL'] || 0 } }
      ],
      opportunityFunnel: {
        open: funnelMap['OPEN'] || 0,
        qualified: funnelMap['QUALIFIED'] || 0,
        proposal: funnelMap['PROPOSAL'] || 0,
        negotiation: funnelMap['NEGOTIATION'] || 0,
        won: funnelMap['WON'] || 0,
        lost: funnelMap['LOST'] || 0,
        closed: funnelMap['CLOSED'] || 0,
        totalBudget
      },
      projectOverview: {
        pending: projectStatusMap['PENDING'] || 0,
        inProgress: projectStatusMap['IN_PROGRESS'] || 0,
        completed: projectStatusMap['COMPLETED'] || 0,
        onHold: projectStatusMap['ON_HOLD'] || 0,
        cancelled: projectStatusMap['CANCELLED'] || 0,
        avgProgress: Math.round(Number(avgProgress._avg.progress || 0))
      },
      todos: {
        pendingTrips,
        pendingExpenses,
        pendingContracts,
        total: pendingTrips + pendingExpenses + pendingContracts
      },
      warnings: {
        expiringContracts,
        followUpReminders
      },
      monthlyData,
      recent: {
        customers: recentCustomers,
        sales: recentSales,
        opportunities: recentOpportunities
      }
    })
  } catch (error) {
    logger.error('Get dashboard stats error:', error)
    res.status(500).json({ error: '获取统计数据失败' })
  }
})

export default router
