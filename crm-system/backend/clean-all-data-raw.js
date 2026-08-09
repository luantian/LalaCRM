/**
 * 使用原生SQL清空所有业务数据
 * 保留：MenuItem、Department、Role、UserRole、RoleMenu、DictType、DictData、User(admin)
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function cleanAll() {
  console.log('==========================================')
  console.log('  清空所有业务数据（使用原生SQL）')
  console.log('==========================================\n')

  // 按外键依赖顺序删除
  const tables = [
    'DailyReportComment',
    'DailyReportTimeEntry',
    'DailyReport',
    'CheckIn',
    'Task',
    'ExpenseItem',
    'Expense',
    'BusinessTrip',
    'ContractReceiptFile',
    'ContractReceipt',
    'ContractShipmentFile',
    'ContractShipment',
    'ContractOrderItemFile',
    'ContractOrderItem',
    'ContractFile',
    'Contract',
    'InvoiceFile',
    'Invoice',
    'ProcurementPaymentFile',
    'ProcurementPayment',
    'ProcurementItemFile',
    'ProcurementItem',
    'Procurement',
    'QuotationItem',
    'Quotation',
    'OpportunityFollowUp',
    'OpportunityTeam',
    'Opportunity',
    'ProjectNoteFile',
    'ProjectNote',
    'ProjectVersion',
    'ProjectTeam',
    'ProjectFile',
    'Project',
    'OrgContact',
    'Organization',
    'Notification',
    'OperationLog',
    'LoginLog',
  ]

  let totalDeleted = 0

  for (const table of tables) {
    try {
      const result = await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`)
      console.log(`✓ ${table}: 已清空`)
      totalDeleted++
    } catch (e) {
      console.log(`✗ ${table}: ${e.message.substring(0, 80)}`)
    }
  }

  // 删除非admin用户
  try {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "User" WHERE username != 'admin'`
    )
    console.log(`\n✓ 用户: 删除 ${deleted} 个（保留admin）`)
  } catch (e) {
    console.log(`\n✗ 用户删除失败: ${e.message.substring(0, 80)}`)
  }

  console.log('\n==========================================')
  console.log(`  完成！清空了 ${totalDeleted} 个表`)
  console.log('  保留：菜单、部门、角色、字典、admin账号')
  console.log('==========================================')
}

cleanAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
