const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 开始清理测试数据 ===\n');

  // 第1阶段：清理最底层的附件表和关联表
  console.log('【1/6】清理附件和关联表...');
  await prisma.contractOrderItemFile.deleteMany();
  await prisma.contractPaymentFile.deleteMany();
  await prisma.contractShipmentFile.deleteMany();
  await prisma.contractFile.deleteMany();
  await prisma.projectFile.deleteMany();
  await prisma.opportunityFile.deleteMany();
  await prisma.opportunityRecordFile.deleteMany();
  await prisma.procurementFile.deleteMany();
  await prisma.procurementItemFile.deleteMany();
  await prisma.procurementPaymentFile.deleteMany();
  await prisma.invoiceFile.deleteMany();
  await prisma.projectNoteFile.deleteMany();
  await prisma.dailyReportFile.deleteMany();
  await prisma.dailyReportComment.deleteMany();
  await prisma.dailyReportTag.deleteMany();
  await prisma.dailyReportRelation.deleteMany();
  await prisma.dailyReportFavorite.deleteMany();
  await prisma.dailyReportVisibility.deleteMany();
  await prisma.dailyReportHistory.deleteMany();
  await prisma.taskFile.deleteMany();
  await prisma.taskRecordFile.deleteMany();
  console.log('  ✓ 附件表已清空');

  // 第2阶段：清理业务明细表
  console.log('\n【2/6】清理业务明细表...');
  await prisma.contractOrderItem.deleteMany();
  await prisma.contractPayment.deleteMany();
  await prisma.contractShipment.deleteMany();
  await prisma.procurementItem.deleteMany();
  await prisma.procurementPayment.deleteMany();
  await prisma.expenseItem.deleteMany();
  await prisma.expenseFile.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotationFile.deleteMany();
  await prisma.dailyReportItem.deleteMany();
  await prisma.dailyReportTimeEntry.deleteMany();
  await prisma.dailyReportTemplate.deleteMany();
  await prisma.dailyReportReminder.deleteMany();
  await prisma.opportunityRecord.deleteMany();
  await prisma.opportunityTeamMember.deleteMany();
  await prisma.projectTeamMember.deleteMany();
  await prisma.projectNote.deleteMany();
  await prisma.projectVersion.deleteMany();
  await prisma.taskRecord.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.dailyCheckIn.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.operationLog.deleteMany();
  await prisma.loginLog.deleteMany();
  await prisma.orgContact.deleteMany();  // 先删联系人（被Organization引用）
  console.log('  ✓ 明细表已清空');

  // 第3阶段：清理业务主表
  console.log('\n【3/6】清理业务主表...');
  await prisma.invoice.deleteMany();
  await prisma.procurement.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.project.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.monthlyReport.deleteMany();
  await prisma.businessTrip.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.task.deleteMany();
  console.log('  ✓ 业务主表已清空');

  // 第4阶段：清理用户和角色关联
  console.log('\n【4/6】清理用户角色关联...');
  await prisma.userRole.deleteMany();
  console.log('  ✓ UserRole关联已清空');

  // 第5阶段：清理用户
  console.log('\n【5/6】清理用户数据...');
  await prisma.user.deleteMany();
  console.log('  ✓ 用户已清空');

  // 第6阶段：清理角色和菜单关联
  console.log('\n【6/6】清理角色数据...');
  await prisma.roleMenu.deleteMany();
  console.log('  ✓ RoleMenu关联已清空');
  
  await prisma.roleModel.deleteMany();
  console.log('  ✓ 角色已清空');

  // 统计保留的数据
  console.log('\n=== 保留的系统配置数据 ===');
  const menuCount = await prisma.menuItem.count();
  console.log(`  菜单项 (MenuItem): ${menuCount} 条`);
  
  try {
    const deptCount = await prisma.department.count();
    console.log(`  部门 (Department): ${deptCount} 条`);
  } catch(e) {}

  try {
    const dictTypeCount = await prisma.dictType.count();
    const dictDataCount = await prisma.dictData.count();
    console.log(`  字典类型 (DictType): ${dictTypeCount} 条`);
    console.log(`  字典数据 (DictData): ${dictDataCount} 条`);
  } catch(e) {}

  console.log('\n=== ✅ 测试数据清理完成 ===');
  console.log('\n现在可以从头开始：');
  console.log('  1. 创建角色');
  console.log('  2. 为角色分配菜单权限');
  console.log('  3. 创建用户并分配角色');
  console.log('  4. 创建业务数据');
}

main().catch(console.error).finally(() => prisma.$disconnect());
