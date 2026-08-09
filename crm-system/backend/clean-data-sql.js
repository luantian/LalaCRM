const { Client } = require('pg');

require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function cleanAllData() {
  console.log('开始清空所有业务数据...\n');
  
  await client.connect();
  
  // 按依赖顺序删除的表
  const tables = [
    'DailyReportComment',
    'DailyReportTimeEntry', 
    'DailyReport',
    'CheckIn',
    'TaskRecord',
    'Task',
    'ExpenseItem',
    'Expense',
    'BusinessTrip',
    'ContractPayment',
    'ContractShipment',
    'ContractOrderItem',
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
    'ProjectVersion',
    'ProjectTeam',
    'ProjectNote',
    'ProjectFile',
    'Project',
    'OrgContact',
    'Organization',
    'Notification',
    'OperationLog',
    'LoginLog'
  ];
  
  let totalDeleted = 0;
  
  for (const table of tables) {
    try {
      const result = await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      console.log(`✓ ${table} 已清空`);
    } catch (error) {
      console.log(`✗ ${table} 清空失败:`, error.message);
    }
  }
  
  // 删除测试用户（保留 admin）
  const deleteUsers = await client.query(`DELETE FROM "User" WHERE username != 'admin'`);
  console.log(`\n✓ 删除了 ${deleteUsers.rowCount} 个测试用户（保留 admin）`);
  
  await client.end();
  
  console.log('\n========================================');
  console.log('数据清空完成！');
  console.log('保留内容：');
  console.log('  - admin 用户');
  console.log('  - 部门数据');
  console.log('  - 角色和权限配置');
  console.log('  - 菜单和字典');
  console.log('========================================\n');
}

cleanAllData().catch(console.error);
