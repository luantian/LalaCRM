import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { applyDataScope, getDataScopeWhere } from '../middleware/dataScope'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 获取工作总览统计数据（全面版）
router.get('/stats', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    // 统一时间基准，避免跨午夜不一致
    const now = new Date()

    // 1. 基础概览统计
    const [
      totalOrganizations,
      organizationStats,
      activeProjects,
      activeContracts,
      totalOpportunities,
      opportunityStats,
      // 回款统计（替代原来的Sale表）
      receiptStats
    ] = await Promise.all([
      prisma.organization.count({ where: { deletedAt: null, status: { not: 'INACTIVE' }, ...dataScopeWhere } }),
      prisma.organization.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...dataScopeWhere },
        _count: { id: true }
      }),
      prisma.project.count({ where: { deletedAt: null, status: 'IN_PROGRESS', ...dataScopeWhere } }),
      prisma.contract.count({ where: { deletedAt: null, status: 'ACTIVE', ...dataScopeWhere } }),
      prisma.opportunity.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.opportunity.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...dataScopeWhere },
        _count: { id: true },
        _sum: { budget: true }
      }),
      prisma.contractReceipt.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, status: { in: ['CONFIRMED', 'RECEIVED'] }, contract: { deletedAt: null } }
      })
    ])

    // 组织状态统计
    const organizationStatusMap: Record<string, number> = {}
    organizationStats.forEach(s => { organizationStatusMap[s.status] = s._count.id })

    // 商机漏斗统计
    const funnelMap: Record<string, number> = {}
    let totalBudget = 0
    opportunityStats.forEach(s => {
      funnelMap[s.status] = s._count.id
      totalBudget += Number(s._sum.budget || 0)
    })

    // 2. 合同回款趋势（最近12个月）
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const recentReceipts = await prisma.contractReceipt.findMany({
      where: { deletedAt: null, receiptDate: { gte: twelveMonthsAgo }, contract: { deletedAt: null } },
      select: { amount: true, receiptDate: true, status: true }
    })

    const receiptTrend: Record<string, number> = {}
    recentReceipts.forEach(r => {
      const month = r.receiptDate.toISOString().slice(0, 7)
      if (!receiptTrend[month]) receiptTrend[month] = 0
      receiptTrend[month] += Number(r.amount)
    })

    const monthlyData = Object.entries(receiptTrend)
      .map(([month, amount]) => ({
        month,
        receiptAmount: amount
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // 3. 本月统计
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [monthReceiptAmount, monthNewOrganizations, monthNewOpportunities] = await Promise.all([
      prisma.contractReceipt.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, receiptDate: { gte: monthStart }, contract: { deletedAt: null } }
      }),
      prisma.organization.count({ where: { deletedAt: null, createdAt: { gte: monthStart }, ...dataScopeWhere } }),
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
        organization: { select: { name: true } }
      },
      orderBy: { endDate: 'asc' },
      take: 10
    })

    // 6. 跟进提醒
    const followUpReminders: any[] = []

    // 7. 项目进度概览
    const projectStats = await prisma.project.groupBy({
      by: ['status'],
      where: { deletedAt: null, ...dataScopeWhere },
      _count: { id: true }
    })
    const projectStatusMap: Record<string, number> = {}
    projectStats.forEach(s => { projectStatusMap[s.status] = s._count.id })

    // 8. 最新数据
    const [recentOrganizations, recentOpportunities] = await Promise.all([
      prisma.organization.findMany({
        where: { deletedAt: null, ...dataScopeWhere },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, type: true, createdAt: true, status: true }
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
        totalOrganizations,
        totalReceiptAmount: Number(receiptStats._sum.amount || 0),
        activeProjects,
        activeContracts,
        totalOpportunities,
        totalBudget
      },
      monthly: {
        receiptAmount: Number(monthReceiptAmount._sum.amount || 0),
        newOrganizations: monthNewOrganizations,
        newOpportunities: monthNewOpportunities
      },
      organizationStats: [
        { status: 'ACTIVE', _count: { id: organizationStatusMap['ACTIVE'] || 0 } },
        { status: 'INACTIVE', _count: { id: organizationStatusMap['INACTIVE'] || 0 } },
        { status: 'POTENTIAL', _count: { id: organizationStatusMap['POTENTIAL'] || 0 } }
      ],
      opportunityFunnel: {
        open: funnelMap['OPEN'] || 0,
        following: funnelMap['FOLLOWING'] || 0,
        won: funnelMap['WON'] || 0,
        lost: funnelMap['LOST'] || 0,
        totalBudget
      },
      projectOverview: {
        inProgress: projectStatusMap['IN_PROGRESS'] || 0,
        completed: projectStatusMap['COMPLETED'] || 0,
        onHold: projectStatusMap['ON_HOLD'] || 0,
        cancelled: projectStatusMap['CANCELLED'] || 0
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
        organizations: recentOrganizations,
        opportunities: recentOpportunities
      }
    })
  } catch (error) {
    logger.error('Get dashboard stats error:', error)
    res.status(500).json({ error: '获取统计数据失败' })
  }
})

// 获取当前用户参与的进行中项目
router.get('/my-projects', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ error: '未登录' })

    const myInProgressProjects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { in: ['IN_PROGRESS'] },
        OR: [
          { ownerId: userId },
          { teamMembers: { some: { userId, deletedAt: null } } }
        ]
      },
      include: {
        organization: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { teamMembers: true, tasks: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    })

    res.json(myInProgressProjects)
  } catch (error) {
    logger.error('Get my in-progress projects error:', error)
    res.status(500).json({ error: '获取项目列表失败' })
  }
})

export default router
