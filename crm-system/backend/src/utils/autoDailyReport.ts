import prisma from '../lib/prisma'
import logger from './logger'


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
  /** 自动来源类型：INVOICE/RECEIPT/CONTRACT/TASK等，用于前端分条展示标签 */
  sourceType?: string
  /** 来源对象ID（发票ID/回款ID等） */
  refId?: number
  /** 直接指定关联客户（无项目链时使用，如商机跟进） */
  organizationId?: number | null
}

/**
 * 自动写入日报（底层函数）
 * 分条存储：每个事件创建一条 DailyReportEntry，日报 content 作为条目拼接缓存
 */
export async function autoWriteDailyReport(params: AutoDailyReportParams): Promise<boolean> {
  try {
    const {
      userId,
      title,
      content,
      projectId = null,
      taskId = null,
      hours = 0,
      sourceType,
      refId,
      organizationId: directOrgId = null
    } = params

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // 事务 + 咨询锁：同一用户的日报写入串行化，防止并发写入丢条目
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int)`

      // 关联客户：优先项目链，其次直接指定（如商机客户）
      let organizationId: number | null = directOrgId
      if (projectId) {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { organizationId: true }
        })
        organizationId = project?.organizationId ?? organizationId
      }

      let dailyReport = await tx.dailyReport.findFirst({
        where: {
          userId,
          reportDate: { gte: today, lt: tomorrow },
          deletedAt: null
        },
        // 一天多篇时追加到最新一篇（用户当前编辑的通常是最新创建的）
        orderBy: { id: 'desc' }
      })

      if (!dailyReport) {
        dailyReport = await tx.dailyReport.create({
          data: {
            userId,
            reportDate: today,
            content: '',
            type: 'WORK',
            status: 'DRAFT',
            projectId: projectId || null,
            organizationId
          }
        })
      }

      // 分条记录：每件事一条
      await tx.dailyReportEntry.create({
        data: {
          reportId: dailyReport.id,
          organizationId,
          projectId,
          title,
          content: content || title,
          source: 'AUTO',
          sourceType: sourceType || (taskId ? 'TASK' : undefined),
          refId: refId ?? taskId ?? undefined
        }
      })

      // 重算日报 content 缓存 = 各条目拼接；总工时 = 各条目工时之和
      const entries = await tx.dailyReportEntry.findMany({
        where: { reportId: dailyReport.id, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { title: true, content: true, hours: true }
      })
      const newContent = entries
        .map(e => [e.title, e.content].filter(Boolean).join('\n'))
        .join('\n')
      const totalHours = Number(entries.reduce((sum, e) => sum + Number(e.hours || 0), 0).toFixed(1))

      await tx.dailyReport.update({
        where: { id: dailyReport.id },
        data: {
          content: newContent,
          hours: totalHours,
          // 第一条自动记录时带上项目/客户关联
          ...(dailyReport.projectId ? {} : { projectId: projectId || null }),
          ...(dailyReport.organizationId ? {} : { organizationId })
        }
      })
    })

    logger.info(`Auto daily report written for user ${userId}: ${title}`)
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
      type: 'WORK',
      sourceType: 'TASK'
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
      type: 'WORK',
      sourceType: 'TASK'
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
      type: 'WORK',
      sourceType: 'TASK'
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
      type: 'PROJECT',
      sourceType: 'NOTE'
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
    // 解析商机的关联客户与转化项目
    let projectId: number | null = null
    let organizationId: number | null = null
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: {
        organizationId: true,
        project: { select: { id: true } }
      }
    })
    projectId = opp?.project?.id ?? null
    organizationId = opp?.organizationId ?? null

    const lines: string[] = []
    lines.push(recordContent || `跟进：${opportunityName}`)
    if (nextPlan) {
      lines.push(`后续计划：${nextPlan}`)
    }

    return autoWriteDailyReport({
      userId,
      title: opportunityName,
      content: lines.join('\n'),
      projectId,
      organizationId,
      hours: 0,
      type: 'PRE_SALES',
      sourceType: 'OPPORTUNITY',
      refId: opportunityId
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
  action: 'CREATE' | 'UPDATE' | 'UPLOAD' | 'ARCHIVE' | 'ADD_MEMBER' | 'VERSION',
  projectId: number,
  changes?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', UPLOAD: '上传项目文件', ARCHIVE: '归档项目', ADD_MEMBER: '添加项目成员', VERSION: '发布项目版本'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}：${projectName}`)
    if (changes) {
      lines.push(changes)
    }

    return autoWriteDailyReport({
      userId,
      title: `${projectName} - ${actionText}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT',
      sourceType: 'PROJECT'
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
      type: 'WORK',
      sourceType: 'ORGANIZATION'
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
  opportunityId?: number | null,
  details?: string | null
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', SUBMIT: '提交', APPROVE: '批准', REJECT: '驳回'
    }
    const actionText = actionMap[action] || action

    // 通过商机解析关联客户与转化项目（注意：入参是商机ID，不是项目ID）
    let projectId: number | null = null
    let organizationId: number | null = null
    if (opportunityId) {
      const opp = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: {
          organizationId: true,
          project: { select: { id: true } }
        }
      })
      projectId = opp?.project?.id ?? null
      organizationId = opp?.organizationId ?? null
    }

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
      organizationId,
      hours: 0,
      type: 'PRE_SALES',
      sourceType: 'QUOTATION',
      refId: quotationId
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
      type: 'WORK',
      sourceType: 'EXPENSE'
    })
  } catch (error) {
    logger.error('Auto write expense record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 合同操作（含上传合同文件）
 */
export async function autoWriteContractRecord(
  userId: number,
  contractTitle: string,
  action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'SUBMIT' | 'UPLOAD',
  contractId: number,
  projectId?: number | null,
  contractAmount?: number,
  details?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '创建', UPDATE: '更新', APPROVE: '审批通过', REJECT: '审批驳回', SUBMIT: '提交审批', UPLOAD: '上传合同文件'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}：${contractTitle}`)
    if (contractAmount) {
      lines.push(`合同金额：¥${contractAmount.toFixed(2)}`)
    }
    if (details) {
      lines.push(details)
    }

    return autoWriteDailyReport({
      userId,
      title: `合同 - ${contractTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT',
      sourceType: 'CONTRACT',
      refId: contractId
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
      type: 'PROJECT',
      sourceType: 'PROCUREMENT'
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
      type: 'WORK',
      sourceType: 'BUSINESS_TRIP'
    })
  } catch (error) {
    logger.error('Auto write business trip record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 发票操作（开票/更新/上传附件）
 */
export async function autoWriteInvoiceRecord(
  userId: number,
  invoiceNo: string,
  action: 'CREATE' | 'UPDATE' | 'UPLOAD' | 'VOID',
  invoiceId: number,
  projectId?: number | null,
  amount?: number | null,
  invoiceType?: string,
  details?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '开具发票', UPDATE: '更新发票', UPLOAD: '上传发票附件', VOID: '作废发票'
    }
    const typeMap: Record<string, string> = {
      INCOME: '销项发票', EXPENSE: '进项发票'
    }
    const categoryMap: Record<string, string> = {
      VAT_SPECIAL: '增值税专票', VAT_NORMAL: '增值税普票', VAT_ELECTRONIC: '电子发票'
    }
    const actionText = actionMap[action] || action
    const typeText = invoiceType ? (typeMap[invoiceType] || invoiceType) : ''
    const lines: string[] = []
    lines.push(`${actionText}：${invoiceNo}${typeText ? `（${typeText}）` : ''}`)
    if (amount) {
      lines.push(`价税合计：¥${Number(amount).toFixed(2)}`)
    }
    if (details) {
      lines.push(details)
    }

    return autoWriteDailyReport({
      userId,
      title: `发票 - ${invoiceNo}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'WORK',
      sourceType: 'INVOICE',
      refId: invoiceId
    })
  } catch (error) {
    logger.error('Auto write invoice record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 合同回款/付款记录
 */
export async function autoWriteReceiptRecord(
  userId: number,
  contractName: string,
  action: 'CREATE' | 'UPDATE' | 'CONFIRM',
  receiptId: number,
  projectId?: number | null,
  amount?: number | null,
  details?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '登记回款', UPDATE: '更新回款', CONFIRM: '确认回款'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}：${contractName}`)
    if (amount) {
      lines.push(`回款金额：¥${Number(amount).toFixed(2)}`)
    }
    if (details) {
      lines.push(details)
    }

    return autoWriteDailyReport({
      userId,
      title: `回款 - ${contractName}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT',
      sourceType: 'RECEIPT',
      refId: receiptId
    })
  } catch (error) {
    logger.error('Auto write receipt record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 采购付款记录
 */
export async function autoWriteProcurementPaymentRecord(
  userId: number,
  procurementTitle: string,
  action: 'CREATE' | 'UPDATE' | 'CONFIRM',
  paymentId: number,
  projectId?: number | null,
  amount?: number | null,
  details?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '登记采购付款', UPDATE: '更新采购付款', CONFIRM: '确认采购付款'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}：${procurementTitle}`)
    if (amount) {
      lines.push(`付款金额：¥${Number(amount).toFixed(2)}`)
    }
    if (details) {
      lines.push(details)
    }

    return autoWriteDailyReport({
      userId,
      title: `采购付款 - ${procurementTitle}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT',
      sourceType: 'PROCUREMENT_PAYMENT',
      refId: paymentId
    })
  } catch (error) {
    logger.error('Auto write procurement payment record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 合同发货
 */
export async function autoWriteShipmentRecord(
  userId: number,
  contractName: string,
  action: 'CREATE' | 'UPDATE' | 'RECEIVE' | 'UPLOAD',
  shipmentId: number,
  projectId?: number | null,
  details?: string
): Promise<boolean> {
  try {
    const actionMap: Record<string, string> = {
      CREATE: '登记合同发货', UPDATE: '更新发货记录', RECEIVE: '确认收货', UPLOAD: '上传发货附件'
    }
    const actionText = actionMap[action] || action
    const lines: string[] = []
    lines.push(`${actionText}：${contractName}`)
    if (details) {
      lines.push(details)
    }

    return autoWriteDailyReport({
      userId,
      title: `发货 - ${contractName}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT',
      sourceType: 'SHIPMENT',
      refId: shipmentId
    })
  } catch (error) {
    logger.error('Auto write shipment record to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 商机状态变更（赢单/输单等）
 */
export async function autoWriteOpportunityStatusChange(
  userId: number,
  opportunityName: string,
  oldStatus: string,
  newStatus: string,
  opportunityId: number
): Promise<boolean> {
  try {
    const statusMap: Record<string, string> = {
      OPEN: '初步接触', FOLLOWING: '跟进中', WON: '赢单', LOST: '输单', CLOSED: '关闭'
    }
    const oldText = statusMap[oldStatus] || oldStatus
    const newText = statusMap[newStatus] || newStatus

    const lines: string[] = []
    lines.push(`售前机会状态推进：${opportunityName}`)
    lines.push(`从"${oldText}"变更为"${newText}"`)

    return autoWriteDailyReport({
      userId,
      title: `${opportunityName} - 状态推进`,
      content: lines.join('\n'),
      opportunityId,
      hours: 0,
      type: 'PRE_SALES',
      sourceType: 'OPPORTUNITY'
    })
  } catch (error) {
    logger.error('Auto write opportunity status change to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 创建/分配任务
 */
export async function autoWriteTaskCreate(
  userId: number,
  taskTitle: string,
  assigneeNames: string[],
  taskId: number,
  projectId?: number | null,
  dueDate?: Date | null
): Promise<boolean> {
  try {
    const lines: string[] = []
    lines.push(`创建任务：${taskTitle}`)
    if (assigneeNames.length > 0) {
      lines.push(`指派给：${assigneeNames.join('、')}`)
    }
    if (dueDate) {
      lines.push(`截止：${new Date(dueDate).toLocaleDateString('zh-CN')}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `创建任务：${taskTitle}`,
      content: lines.join('\n'),
      projectId,
      taskId,
      hours: 0,
      type: 'WORK',
      sourceType: 'TASK',
      refId: taskId
    })
  } catch (error) {
    logger.error('Auto write task create to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 创建商机
 */
export async function autoWriteOpportunityCreate(
  userId: number,
  opportunityName: string,
  opportunityId: number,
  organizationId?: number | null,
  budget?: number | null,
  notes?: string | null
): Promise<boolean> {
  try {
    const lines: string[] = []
    lines.push(`创建商机：${opportunityName}`)
    if (budget) {
      lines.push(`预计金额：¥${Number(budget).toFixed(2)}`)
    }
    if (notes && notes.trim()) {
      lines.push(`备注：${notes.trim()}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `创建商机：${opportunityName}`,
      content: lines.join('\n'),
      organizationId,
      hours: 0,
      type: 'PRE_SALES',
      sourceType: 'OPPORTUNITY',
      refId: opportunityId
    })
  } catch (error) {
    logger.error('Auto write opportunity create to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 商机转化为项目（重大节点）
 */
export async function autoWriteOpportunityConvert(
  userId: number,
  opportunityName: string,
  projectName: string,
  opportunityId: number,
  projectId: number
): Promise<boolean> {
  try {
    const lines: string[] = []
    lines.push(`商机赢单转化：${opportunityName}`)
    lines.push(`已创建项目：${projectName}`)

    return autoWriteDailyReport({
      userId,
      title: `商机转化：${opportunityName}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PRE_SALES',
      sourceType: 'OPPORTUNITY',
      refId: opportunityId
    })
  } catch (error) {
    logger.error('Auto write opportunity convert to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 合同订货项（合同订货明细）
 */
export async function autoWriteContractOrderItemRecord(
  userId: number,
  contractName: string,
  itemName: string,
  itemId: number,
  projectId?: number | null,
  quantity?: number | null,
  action: 'CREATE' | 'UPDATE' = 'CREATE',
  remarks?: string
): Promise<boolean> {
  try {
    const actionText = action === 'CREATE' ? '添加合同订货项' : '更新合同订货项'
    const lines: string[] = []
    lines.push(`${actionText}：${itemName}`)
    if (quantity != null) {
      lines.push(`数量：${quantity}`)
    }
    if (remarks && remarks.trim()) {
      lines.push(`备注：${remarks.trim()}`)
    }

    return autoWriteDailyReport({
      userId,
      title: `订货项 - ${itemName}`,
      content: lines.join('\n'),
      projectId,
      hours: 0,
      type: 'PROJECT',
      sourceType: 'CONTRACT',
      refId: itemId
    })
  } catch (error) {
    logger.error('Auto write contract order item to daily report failed:', error)
    return false
  }
}

/**
 * 自动写入日报 - 商机/项目文件上传
 */
export async function autoWriteFileUploadRecord(
  userId: number,
  targetName: string,
  fileNames: string[],
  projectId?: number | null,
  organizationId?: number | null,
  sourceType: string = 'PROJECT',
  refId?: number
): Promise<boolean> {
  try {
    const lines: string[] = []
    lines.push(`上传附件：${targetName}`)
    lines.push(`文件：${fileNames.join('、')}`)

    return autoWriteDailyReport({
      userId,
      title: `上传附件 - ${targetName}`,
      content: lines.join('\n'),
      projectId,
      organizationId,
      hours: 0,
      type: 'WORK',
      sourceType,
      refId
    })
  } catch (error) {
    logger.error('Auto write file upload to daily report failed:', error)
    return false
  }
}
