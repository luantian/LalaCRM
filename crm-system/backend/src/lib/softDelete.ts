import { Prisma } from '@prisma/client'

// ===== 全局软删除扩展 =====
// 支持软删除的模型列表（所有包含 deletedAt 字段的模型）
const SOFT_DELETE_MODELS = new Set([
  // 售前管理
  'Organization', 'OrgContact',
  'Opportunity', 'OpportunityRecord', 'OpportunityRecordFile',
  'OpportunityTeamMember', 'OpportunityFile',
  'Quotation', 'QuotationItem', 'QuotationFile',
  // 项目管理
  'Project', 'ProjectFile', 'ProjectTeamMember',
  'ProjectNote', 'ProjectNoteFile', 'ProjectVersion',
  'Contract', 'ContractFile',
  'ContractOrderItem', 'ContractOrderItemFile',
  'ContractReceipt', 'ContractReceiptFile',
  'ContractShipment', 'ContractShipmentFile',
  'Procurement', 'ProcurementFile', 'ProcurementItem',
  'ProcurementPayment', 'ProcurementItemFile', 'ProcurementPaymentFile',
  // 财务
  'InvoiceFile',
  'Expense', 'ExpenseItem', 'ExpenseFile',
  // 办公
  'DailyReport', 'DailyReportItem', 'DailyReportTimeEntry',
  'DailyReportComment', 'DailyReportTemplate',
  'DailyReportFile', 'DailyReportRelation',
  'DailyReportReminder',
  'WeeklyReport', 'MonthlyReport',
  'BusinessTrip', 'DailyCheckIn',
  // 任务
  'Task', 'TaskRecord', 'TaskRecordFile', 'TaskFile',
  // 通知
  'Notification'
])

/**
 * 判断是否为空值检查（用于识别 where 中是否已指定 deletedAt）
 */
function hasDeletedAtFilter(where: any): boolean {
  if (!where) return false
  return where.deletedAt !== undefined
}

/**
 * Prisma $extends 扩展：自动为支持软删除的模型过滤已删除数据
 *
 * 用法：
 *   const prisma = new PrismaClient().$extends(softDeleteExtension)
 *
 * 效果：
 *   - findMany / findFirst / findUnique / count 自动加 deletedAt: null
 *   - 如果查询中已显式指定了 deletedAt（如 deletedAt: { not: null }），则不覆盖
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && !hasDeletedAtFilter(args?.where)) {
          args = args ?? {}
          if (!args.where) args.where = {}
          args.where = Object.assign({}, args.where, { deletedAt: null })
        }
        return query(args)
      },
      async findFirst({ model, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && !hasDeletedAtFilter(args?.where)) {
          args = args ?? {}
          if (!args.where) args.where = {}
          args.where = Object.assign({}, args.where, { deletedAt: null })
        }
        return query(args)
      },
      async findUnique({ model, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && !hasDeletedAtFilter(args?.where)) {
          args = args ?? {}
          ;(args as any).where = Object.assign({}, args?.where, { deletedAt: null })
        }
        return query(args)
      },
      async count({ model, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && !hasDeletedAtFilter(args?.where)) {
          args = args ?? {}
          if (!args.where) args.where = {}
          args.where = Object.assign({}, args.where, { deletedAt: null })
        }
        return query(args)
      },
      async update({ model, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && !hasDeletedAtFilter(args?.where)) {
          args = args ?? {}
          ;(args as any).where = Object.assign({}, args?.where, { deletedAt: null })
        }
        return query(args)
      },
      async updateMany({ model, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && !hasDeletedAtFilter(args?.where)) {
          args = args ?? {}
          if (!args.where) args.where = {}
          args.where = Object.assign({}, args.where, { deletedAt: null })
        }
        return query(args)
      },
    },
  },
})
