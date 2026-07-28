import { PrismaClient } from '@prisma/client'
import logger from './logger'

const prisma = new PrismaClient()

/**
 * 自动写入日报 - 工具函数
 * 当用户在任务、项目、商机中添加记录或完成操作时，自动将完整内容写入当日日报
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
      hours = 0.5,
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
 * 包含：任务描述、关联项目、负责人/执行人、优先级、截止日期、完成总结
 */
export async function autoWriteTaskCompletion(
  userId: number,
  taskTitle: string,
  completionNote: string,
  taskId: number
): Promise<boolean> {
  try {
    // 查询任务完整信息
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        assigner: { select: { name: true } },
        assignees: { select: { name: true } },
        project: { select: { name: true } }
      }
    })

    const priorityMap: Record<string, string> = {
      LOW: '低', MEDIUM: '中', HIGH: '高', URGENT: '紧急'
    }
    const typeMap: Record<string, string> = {
      DAILY_WORK: '日常工作', PROJECT_TASK: '项目任务', ISSUE: '问题处理', OTHER: '其他'
    }

    const lines: string[] = []

    // 任务基本信息
    lines.push(`📌 任务：${task?.title || taskTitle}`)
    if (task?.project?.name) lines.push(`📁 关联项目：${task.project.name}`)
    lines.push(`📋 任务类型：${typeMap[task?.type || ''] || task?.type || '-'}`)
    lines.push(`⚡ 优先级：${priorityMap[task?.priority || ''] || task?.priority || '-'}`)
    lines.push(`👤 委派人：${task?.assigner?.name || '-'}`)
    lines.push(`👥 执行人：${task?.assignees?.map(a => a.name).join('、') || '-'}`)
    if (task?.dueDate) {
      lines.push(`📅 截止日期：${new Date(task.dueDate).toISOString().slice(0, 10)}`)
    }

    // 任务描述
    if (task?.description) {
      lines.push('')
      lines.push(`📝 任务描述：${task.description}`)
    }

    // 完成总结
    lines.push('')
    lines.push(`✅ 完成总结：${completionNote || '任务已完成'}`)

    return autoWriteDailyReport({
      userId,
      title: `完成任务：${taskTitle}`,
      content: lines.join('\n'),
      projectId: task?.projectId || null,
      taskId,
      hours: 0.5,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write task completion to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 任务记录（信息记录）
 * 包含：任务描述、关联项目、负责人/执行人、记录内容、下次计划
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
    const priorityMap: Record<string, string> = {
      LOW: '低', MEDIUM: '中', HIGH: '高', URGENT: '紧急'
    }

    // 查询任务完整信息
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        assigner: { select: { name: true } },
        assignees: { select: { name: true } },
        project: { select: { name: true } }
      }
    })

    const lines: string[] = []

    // 任务基本信息
    lines.push(`📌 任务：${task?.title || taskTitle}`)
    if (task?.project?.name) lines.push(`📁 关联项目：${task.project.name}`)
    lines.push(`📋 记录类型：${typeMap[recordType] || recordType || '记录'}`)
    lines.push(`⚡ 优先级：${priorityMap[task?.priority || ''] || task?.priority || '-'}`)
    lines.push(`👤 委派人：${task?.assigner?.name || '-'}`)
    lines.push(`👥 执行人：${task?.assignees?.map(a => a.name).join('、') || '-'}`)
    if (task?.dueDate) {
      lines.push(`📅 截止日期：${new Date(task.dueDate).toISOString().slice(0, 10)}`)
    }

    // 任务描述
    if (task?.description) {
      lines.push('')
      lines.push(`📝 任务描述：${task.description}`)
    }

    // 记录内容
    lines.push('')
    lines.push(`💬 记录内容：${recordContent}`)

    // 下次计划
    if (nextPlan) {
      lines.push('')
      lines.push(`📋 下次计划：${nextPlan}`)
      if (nextDate) {
        lines.push(`📅 计划日期：${new Date(nextDate).toISOString().slice(0, 10)}`)
      }
    }

    return autoWriteDailyReport({
      userId,
      title: `${taskTitle} - ${typeMap[recordType] || '记录'}`,
      content: lines.join('\n'),
      projectId: task?.projectId || null,
      taskId,
      hours: 0.25,
      type: 'WORK'
    })
  } catch (error) {
    logger.error('Auto write task record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 项目备注
 * 包含：项目名称、客户、备注类型、完整内容
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

    // 查询项目完整信息（含客户）
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        organization: { select: { name: true } }
      }
    })

    const lines: string[] = []

    lines.push(`📁 项目：${projectName}`)
    if (project?.organization?.name) lines.push(`🏢 客户：${project.organization.name}`)
    lines.push(`📋 备注类型：${noteTypeMap[noteType] || noteType || '一般备注'}`)
    lines.push(`📌 标题：${noteTitle}`)

    if (noteContent) {
      lines.push('')
      lines.push(`📝 内容：${noteContent}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `${projectName} - ${noteTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0.25,
      type: 'PROJECT'
    })
  } catch (error) {
    logger.error('Auto write project note to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 售前/商机记录
 * 包含：商机名称、客户、应用领域、成单率、竞争对手、决策人、记录内容、下次计划
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
    // 查询商机完整信息
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null },
      include: {
        organization: { select: { name: true } }
      }
    })

    const statusMap: Record<string, string> = {
      OPEN: '开放', FOLLOWING: '跟进中',
      WON: '已赢单', LOST: '已丢单'
    }

    const lines: string[] = []

    lines.push(`💼 商机：${opportunityName}`)
    if (opportunity?.organization?.name) lines.push(`🏢 客户：${opportunity.organization.name}`)
    if (opportunity?.application) lines.push(`🏭 应用领域：${opportunity.application}`)
    lines.push(`📊 当前状态：${statusMap[opportunity?.status || ''] || opportunity?.status || '-'}`)
    if (opportunity?.winRate != null) lines.push(`🎯 成单率：${opportunity.winRate}%`)
    if (opportunity?.budget) lines.push(`💰 预算：${Number(opportunity.budget).toLocaleString()}元`)
    if (opportunity?.decisionMaker) lines.push(`👤 客户决策人：${opportunity.decisionMaker}`)
    if (opportunity?.competitors) lines.push(`⚔️ 竞争对手：${opportunity.competitors}`)

    // 记录内容
    lines.push('')
    lines.push(`💬 记录内容：${recordContent}`)

    // 下次计划
    if (nextPlan) {
      lines.push('')
      lines.push(`📋 下次计划：${nextPlan}`)
      if (nextDate) {
        lines.push(`📅 计划日期：${new Date(nextDate).toISOString().slice(0, 10)}`)
      }
    }

    return autoWriteDailyReport({
      userId,
      title: `${opportunityName}`,
      content: lines.join('\n'),
      opportunityId,
      hours: 0.25,
      type: 'PRE_SALES'
    })
  } catch (error) {
    logger.error('Auto write opportunity record to daily report failed:', error)
    return false
  }
}
