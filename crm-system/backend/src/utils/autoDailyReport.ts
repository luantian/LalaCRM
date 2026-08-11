import { PrismaClient } from '@prisma/client'
import logger from './logger'

const prisma = new PrismaClient()

/**
 * 自动写入日报 - 工具函数
 * 当用户在任务、项目、商机中添加记录或完成操作时，自动将精简内容写入当日日报
 */

interface AutoDailyReportParams {
  userId: number
  title: string
  content: string
  projectId?: number | null
  opportunityId?: number | null
  taskId?: number | null
  hours?: number
  type?: 'WORK' | 'PRE_SALES' | 'PROJECT' | 'MEETING' | 'TRAINING' | 'OTHER'
}

/**
 * 自动写入日报（底层函数）
 */
export async function autoWriteDailyReport(params: AutoDailyReportParams): Promise<boolean> {
  try {
    const {
      userId,
      title,
      content,
      projectId = null,
      opportunityId = null,
      taskId = null,
      hours = 0,
      type = 'WORK'
    } = params

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    let dailyReport = await prisma.dailyReport.findFirst({
      where: {
        userId,
        reportDate: { gte: today, lt: tomorrow },
        deletedAt: null
      }
    })

    if (!dailyReport) {
      dailyReport = await prisma.dailyReport.create({
        data: {
          userId,
          reportDate: today,
          content: '今日工作总结',
          type: 'WORK',
          status: 'DRAFT'
        }
      })
    }

    let itemTitle = title
    if (taskId) {
      itemTitle = `【任务】${title}`
    } else if (projectId && !taskId) {
      itemTitle = `【项目】${title}`
    } else if (opportunityId) {
      itemTitle = `【售前】${title}`
    }

    await prisma.dailyReportItem.create({
      data: {
        reportId: dailyReport.id,
        title: itemTitle,
        content: content,
        projectId,
        taskId,
        hours,
        status: 'COMPLETED',
        order: 0
      }
    })

    const totalHours = await prisma.dailyReportItem.aggregate({
      where: { reportId: dailyReport.id, deletedAt: null },
      _sum: { hours: true }
    })

    await prisma.dailyReport.update({
      where: { id: dailyReport.id },
      data: { hours: totalHours._sum.hours || 0 }
    })

    logger.info(`Auto daily report written for user ${userId}: ${itemTitle}`)
    return true
  } catch (error) {
    logger.error('Auto write daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 任务完成
 * 精简格式：任务标题 + 完成总结 + 关联项目
 */
export async function autoWriteTaskCompletion(
  userId: number,
  taskTitle: string,
  completionNote: string,
  taskId: number
): Promise<boolean> {
  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { title: true, projectId: true, project: { select: { name: true } } }
    })

    // 精简内容：只保留用户关心的核心信息
    const lines: string[] = []
    lines.push(`完成任务：${task?.title || taskTitle}`)
    if (completionNote && completionNote !== '任务已完成') {
      lines.push(`完成总结：${completionNote}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `完成：${task?.title || taskTitle}`,
      content: lines.join('\n'),
      projectId: task?.projectId || null,
      taskId,
      hours: 0,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write task completion to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 任务流转（开始/提交/驳回）
 * 精简格式：任务标题 + 流转动作 + 备注
 */
export async function autoWriteTaskFlow(
  userId: number,
  taskId: number,
  action: 'START' | 'SUBMIT' | 'REJECT',
  note?: string
): Promise<boolean> {
  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { title: true, projectId: true, project: { select: { name: true } } }
    })

    if (!task) {
      logger.warn(`Task ${taskId} not found for auto daily report`)
      return false
    }

    const actionMap = {
      'START': '开始处理',
      'SUBMIT': '提交完成',
      'REJECT': '驳回任务'
    }
    const actionText = actionMap[action]

    const lines: string[] = []
    lines.push(`${actionText}：${task.title}`)
    if (note) {
      lines.push(`备注：${note}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `${actionText}：${task.title}`,
      content: lines.join('\n'),
      projectId: task.projectId || null,
      taskId,
      hours: 0,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write task flow to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 任务记录
 * 精简格式：任务标题 + 记录类型 + 记录内容
 */
export async function autoWriteTaskRecord(
  userId: number,
  taskTitle: string,
  recordType: string,
  recordContent: string,
  taskId: number,
  nextPlan?: string | null,
  nextDate?: Date | null
): Promise<boolean> {
  try {
    const typeMap: Record<string, string> = {
      'NOTE': '备注', 'CALL': '电话沟通', 'MEETING': '会议',
      'EMAIL': '邮件', 'VISIT': '拜访', 'OTHER': '其他'
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { title: true, projectId: true, project: { select: { name: true } } }
    })

    const recordLabel = typeMap[recordType] || recordType || '记录'
    const lines: string[] = []
    lines.push(`${recordLabel}：${task?.title || taskTitle}`)
    if (recordContent) {
      lines.push(recordContent)
    }
    if (nextPlan) {
      lines.push(`后续计划：${nextPlan}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `${task?.title || taskTitle} - ${recordLabel}`,
      content: lines.join('\n'),
      projectId: task?.projectId || null,
      taskId,
      hours: 0,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write task record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 项目备注
 * 精简格式：项目名 + 备注内容
 */
export async function autoWriteProjectNote(
  userId: number,
  projectName: string,
  noteTitle: string,
  noteContent: string,
  noteType: string,
  projectId: number
): Promise<boolean> {
  try {
    const noteTypeMap: Record<string, string> = {
      GENERAL: '一般备注', DEVELOPMENT: '开发记录', IMPROVEMENT: '改进建议',
      ISSUE: '问题记录', MEETING: '会议纪要'
    }

    const lines: string[] = []
    lines.push(`[${noteTypeMap[noteType] || '备注'}] ${noteTitle}`)
    if (noteContent) {
      lines.push(noteContent)
    }

    return autoWriteDailyReport({
      userId,
      title: `${projectName} - ${noteTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT'
    })
  } catch (error) {
    logger.error('Auto write project note to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 售前/商机记录
 * 精简格式：售前名 + 记录内容 + 下次计划
 */
export async function autoWriteOpportunityRecord(
  userId: number,
  opportunityName: string,
  recordContent: string,
  opportunityId: number,
  nextPlan?: string | null,
  nextDate?: Date | null
): Promise<boolean> {
  try {
    const lines: string[] = []
    lines.push(recordContent || `跟进：${opportunityName}`)
    if (nextPlan) {
      lines.push(`后续计划：${nextPlan}`)
    }

    return autoWriteDailyReport({
      userId,
      title: opportunityName,
      content: lines.join('\n'),
      opportunityId,
      hours: 0,
      type: 'PRE_SALES'
    })
  } catch (error) {
    logger.error('Auto write opportunity record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 项目创建/编辑
 */
export async function autoWriteProjectRecord(
  userId: number,
  projectName: string,
  action: 'CREATE' | 'UPDATE',
  projectId: number,
  changes?: string
): Promise<boolean> {
  try {
    const actionText = action === 'CREATE' ? '创建' : '更新'
    const lines: string[] = []
    lines.push(`${actionText}项目：${projectName}`)
    if (changes) {
      lines.push(changes)
    }

    return autoWriteDailyReport({
      userId,
      title: `${projectName} - 项目${actionText}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT'
    })
  } catch (error) {
    logger.error('Auto write project record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 客户创建/编辑
 */
export async function autoWriteOrganizationRecord(
  userId: number,
  organizationName: string,
  action: 'CREATE' | 'UPDATE',
  organizationId: number,
  changes?: string
): Promise<boolean> {
  try {
    const actionText = action === 'CREATE' ? '创建' : '更新'
    const lines: string[] = []
    lines.push(`${actionText}客户：${organizationName}`)
    if (changes) {
      lines.push(changes)
    }

    return autoWriteDailyReport({
      userId,
      title: `${organizationName} - 客户${actionText}`,
      content: lines.join('\n'),
      hours: 0,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write organization record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 报价单操作
 */
export async function autoWriteQuotationRecord(
  userId: number,
  quotationTitle: string,
  action: 'CREATE' | 'UPDATE' | 'SUBMIT' | 'APPROVE' | 'REJECT',
  quotationId: number,
  projectId?: number | null,
  details?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', SUBMIT: '提交', APPROVE: '批准', REJECT: '驳回'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}报价单：${quotationTitle}`)
    if (details) {
      lines.push(details)
    }

    return autoWriteDailyReport({
      userId,
      title: `报价单 - ${quotationTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PRE_SALES'
    })
  } catch (error) {
    logger.error('Auto write quotation record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 费用报销操作
 */
export async function autoWriteExpenseRecord(
  userId: number,
  expenseTitle: string,
  action: 'CREATE' | 'UPDATE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'PAY',
  expenseId: number,
  projectId?: number | null,
  amount?: number
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', SUBMIT: '提交审批', APPROVE: '审批通过', REJECT: '审批驳回', PAY: '支付完成'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}费用报销：${expenseTitle}`)
    if (amount) {
      lines.push(`报销金额：¥${amount.toFixed(2)}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `费用报销 - ${expenseTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write expense record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 合同操作
 */
export async function autoWriteContractRecord(
  userId: number,
  contractTitle: string,
  action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'SUBMIT',
  contractId: number,
  projectId?: number | null,
  contractAmount?: number
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', APPROVE: '审批通过', REJECT: '审批驳回', SUBMIT: '提交审批'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}合同：${contractTitle}`)
    if (contractAmount) {
      lines.push(`合同金额：¥${contractAmount.toFixed(2)}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `合同 - ${contractTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT'
    })
  } catch (error) {
    logger.error('Auto write contract record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 采购操作
 */
export async function autoWriteProcurementRecord(
  userId: number,
  procurementTitle: string,
  action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'SUBMIT',
  procurementId: number,
  projectId?: number | null,
  totalAmount?: number
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', APPROVE: '审批通过', REJECT: '审批驳回', SUBMIT: '提交审批'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}采购：${procurementTitle}`)
    if (totalAmount) {
      lines.push(`采购金额：¥${totalAmount.toFixed(2)}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `采购 - ${procurementTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT'
    })
  } catch (error) {
    logger.error('Auto write procurement record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 出差操作
 */
export async function autoWriteBusinessTripRecord(
  userId: number,
  tripTitle: string,
  action: 'CREATE' | 'UPDATE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'COMPLETE',
  tripId: number,
  destination?: string,
  startDate?: Date,
  endDate?: Date
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', SUBMIT: '提交审批', APPROVE: '审批通过', REJECT: '审批驳回', COMPLETE: '完成出差'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}出差：${tripTitle}`)
    if (destination) {
      lines.push(`目的地：${destination}`)
    }
    if (startDate && endDate) {
      const start = new Date(startDate).toLocaleDateString('zh-CN')
      const end = new Date(endDate).toLocaleDateString('zh-CN')
      lines.push(`时间：${start} - ${end}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `出差 - ${tripTitle}`,
      content: lines.join('\n'),
      hours: 0,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write business trip record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 售前阶段变更
 */
export async function autoWriteOpportunityStageChange(
  userId: number,
  opportunityName: string,
  oldStage: string,
  newStage: string,
  opportunityId: number,
  projectId?: number | null
): Promise<boolean> {
  try {
    const stageMap: Record<string, string> = {
      INITIAL: '初步接触', QUALIFIED: '需求确认', PROPOSAL: '方案报价',
      NEGOTIATION: '商务谈判', CLOSED_WON: '赢单', CLOSED_LOST: '输单'
    }
    const oldStageText = stageMap[oldStage] || oldStage
    const newStageText = stageMap[newStage] || newStage

    const lines: string[] = []
    lines.push(`售前机会阶段推进：${opportunityName}`)
    lines.push(`从"${oldStageText}"推进到"${newStageText}"`)

    return autoWriteDailyReport({
      userId,
      title: `${opportunityName} - 阶段推进`,
      content: lines.join('\n'),
      opportunityId,
      projectId,
      hours: 0,
      type: 'PRE_SALES'
    })
  } catch (error) {
    logger.error('Auto write opportunity stage change to daily report failed:', error)
    return false
  }
}
