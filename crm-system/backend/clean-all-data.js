/**
 * 清空所有业务数据
 * 保留：MenuItem、Department、Role、UserRole、RoleMenu
 * 清空：所有业务表（用户、组织、项目、合同、财务等）
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function cleanAll() {
  console.log('==========================================')
  console.log('  清空所有业务数据')
  console.log('==========================================\n')

  const steps = [
    { name: 'DailyReportComment', label: '日报评论' },
    { name: 'DailyReportTimeEntry', label: '日报时间记录' },
    { name: 'DailyReport', label: '日报' },
    { name: 'CheckIn', label: '打卡记录' },
    { name: 'Task', label: '任务' },
    { name: 'ExpenseItem', label: '费用明细' },
    { name: 'Expense', label: '费用报销' },
    { name: 'BusinessTrip', label: '出差记录' },
    { name: 'ContractReceiptFile', label: '回款附件' },
    { name: 'ContractReceipt', label: '合同回款' },
    { name: 'ContractShipmentFile', label: '发货附件' },
    { name: 'ContractShipment', label: '发货记录' },
    { name: 'ContractOrderItemFile', label: '订单明细附件' },
    { name: 'ContractOrderItem', label: '订单明细' },
    { name: 'ContractFile', label: '合同附件' },
    { name: 'Contract', label: '合同' },
    { name: 'InvoiceFile', label: '发票附件' },
    { name: 'Invoice', label: '发票' },
    { name: 'ProcurementPaymentFile', label: '采购付款附件' },
    { name: 'ProcurementPayment', label: '采购付款' },
    { name: 'ProcurementItemFile', label: '采购明细附件' },
    { name: 'ProcurementItem', label: '采购明细' },
    { name: 'Procurement', label: '采购单' },
    { name: 'QuotationItem', label: '报价明细' },
    { name: 'Quotation', label: '报价单' },
    { name: 'OpportunityFollowUp', label: '商机跟进' },
    { name: 'OpportunityTeam', label: '商机团队' },
    { name: 'Opportunity', label: '商机' },
    { name: 'ProjectNoteFile', label: '项目笔记附件' },
    { name: 'ProjectNote', label: '项目笔记' },
    { name: 'ProjectVersion', label: '项目版本' },
    { name: 'ProjectTeam', label: '项目团队' },
    { name: 'ProjectFile', label: '项目附件' },
    { name: 'Project', label: '项目' },
    { name: 'OrgContact', label: '联系人' },
    { name: 'Organization', label: '组织/客户' },
    { name: 'Notification', label: '通知' },
    { name: 'OperationLog', label: '操作日志' },
    { name: 'LoginLog', label: '登录日志' },
  ]

  // 不删除的表
  const keepTables = ['MenuItem', 'Department', 'Role', 'UserRole', 'RoleMenu', 'DictType', 'DictData', 'User']

  let totalDeleted = 0

  for (const step of steps) {
    try {
      const count = await prisma[step.name].count()
      if (count > 0) {
        await prisma[step.name].deleteMany()
        console.log(`✓ ${step.label}: 删除 ${count} 条`)
        totalDeleted += count
      } else {
        console.log(`- ${step.label}: 无数据`)
      }
    } catch (e) {
      console.log(`✗ ${step.label}: ${e.message.substring(0, 60)}`)
    }
  }

  // 删除非admin用户（保留admin账号）
  const deletedUsers = await prisma.user.deleteMany({
    where: { username: { not: 'admin' } }
  })
  console.log(`\n✓ 用户: 删除 ${deletedUsers.count} 个（保留admin）`)
  totalDeleted += deletedUsers.count

  console.log('\n==========================================')
  console.log(`  完成！共删除 ${totalDeleted} 条记录`)
  console.log('  保留：菜单、部门、角色、字典、admin账号')
  console.log('==========================================')
}

cleanAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
