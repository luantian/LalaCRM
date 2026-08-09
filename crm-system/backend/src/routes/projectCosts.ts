import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { isAdmin } from '../utils/permission';

const router = Router();
const prisma = new PrismaClient();

// 检查用户是否有权限访问项目
async function checkProjectAccess(projectId: number, userId: number, role?: string): Promise<boolean> {
  // 管理员可以访问所有项目
  if (await isAdmin(userId)) return true;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { ownerId: true }
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;

  const member = await prisma.projectTeamMember.findFirst({
    where: { projectId, userId, deletedAt: null }
  });
  return !!member;
}

// GET /:projectId/summary - 项目费用汇总（收入/支出分开统计）
router.get('/:projectId/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const pid = Number(projectId);

    if (isNaN(pid)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // 检查用户是否有权限访问此项目
    const hasAccess = await checkProjectAccess(pid, req.user!.id, req.user?.role);
    if (!hasAccess) {
      return res.status(403).json({ error: '无权访问此项目的费用数据' });
    }

    // 获取项目预算
    const project = await prisma.project.findFirst({
      where: { id: pid, deletedAt: null },
      select: { id: true, budget: true },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // ===== 支出项 =====

    // 报销费用（包括直接关联项目的和通过出差关联的）
    const expenseResult = await prisma.expense.aggregate({
      where: { 
        deletedAt: null,
        OR: [
          { projectId: pid },
          { trip: { projectId: pid, deletedAt: null } }
        ]
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    // 采购付款（按实际付款金额统计）
    const procurementPaymentResult = await prisma.procurementPayment.aggregate({
      where: { deletedAt: null, procurement: { deletedAt: null, projectId: pid } },
      _sum: { amount: true },
      _count: true,
    });

    const expenseTotal = Number(expenseResult._sum.totalAmount ?? 0);
    const procurementPaymentTotal = Number(procurementPaymentResult._sum.amount ?? 0);

    // 支出合计
    const totalExpense = expenseTotal + procurementPaymentTotal;

    // ===== 收入项 =====

    // 合同回款（客户付给我们的钱，只统计已确认收款状态：RECEIVED 或 CONFIRMED）
    const contractReceiptResult = await prisma.contractReceipt.aggregate({
      where: { deletedAt: null, status: { in: ['RECEIVED', 'CONFIRMED'] }, contract: { deletedAt: null, projectId: pid } },
      _sum: { amount: true },
      _count: true,
    });

    const contractReceiptTotal = Number(contractReceiptResult._sum.amount ?? 0);

    // 收入合计
    const totalIncome = contractReceiptTotal;

    // 项目预算
    const totalBudget = Number(project.budget ?? 0);
    const profit = totalIncome - totalExpense;

    res.json({
      projectId: pid,
      totalBudget,
      // 收入
      income: {
        contractReceipts: {
          total: contractReceiptTotal,
          count: contractReceiptResult._count,
        },
        total: totalIncome,
      },
      // 支出
      expense: {
        expenseReports: {
          total: expenseTotal,
          count: expenseResult._count,
        },
        procurementPayments: {
          total: procurementPaymentTotal,
          count: procurementPaymentResult._count,
        },
        total: totalExpense,
      },
      profit,
    });
  } catch (error) {
    logger.error('Error fetching project cost summary:', error);
    res.status(500).json({ error: 'Failed to fetch project cost summary' });
  }
});

export default router;
