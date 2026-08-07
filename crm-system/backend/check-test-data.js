const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 数据库中所有表的数据统计 ===\n');

  // 核心用户相关
  const users = await prisma.user.findMany();
  console.log(`用户 (User): ${users.length} 条`);
  users.forEach(u => console.log(`  - id=${u.id}, username=${u.username}, role=${u.role}`));

  const roles = await prisma.roleModel.findMany();
  console.log(`\n角色 (RoleModel): ${roles.length} 条`);
  roles.forEach(r => console.log(`  - id=${r.id}, roleKey=${r.roleKey}, name=${r.name}`));

  const userRoles = await prisma.userRole.findMany();
  console.log(`\n用户角色关联 (UserRole): ${userRoles.length} 条`);

  // 业务数据
  const projects = await prisma.project.findMany();
  console.log(`\n项目 (Project): ${projects.length} 条`);

  const contracts = await prisma.contract.findMany();
  console.log(`合同 (Contract): ${contracts.length} 条`);

  const organizations = await prisma.organization.findMany();
  console.log(`客户/组织 (Organization): ${organizations.length} 条`);

  const opportunities = await prisma.opportunity.findMany();
  console.log(`售前/商机 (Opportunity): ${opportunities.length} 条`);

  const dailyReports = await prisma.dailyReport.findMany();
  console.log(`日报 (DailyReport): ${dailyReports.length} 条`);

  const expenses = await prisma.expense.findMany();
  console.log(`费用 (Expense): ${expenses.length} 条`);

  const businessTrips = await prisma.businessTrip.findMany();
  console.log(`出差 (BusinessTrip): ${businessTrips.length} 条`);

  const checkins = await prisma.checkIn.findMany();
  console.log(`签到 (CheckIn): ${checkins.length} 条`);

  const operationLogs = await prisma.operationLog.findMany();
  console.log(`操作日志 (OperationLog): ${operationLogs.length} 条`);

  const loginLogs = await prisma.loginLog.findMany();
  console.log(`登录日志 (LoginLog): ${loginLogs.length} 条`);

  // 其他可能的表
  try {
    const departments = await prisma.department.findMany();
    console.log(`\n部门 (Department): ${departments.length} 条`);
  } catch(e) {}

  try {
    const menuItems = await prisma.menuItem.findMany();
    console.log(`菜单项 (MenuItem): ${menuItems.length} 条`);
  } catch(e) {}

  try {
    const roleMenus = await prisma.roleMenu.findMany();
    console.log(`角色菜单关联 (RoleMenu): ${roleMenus.length} 条`);
  } catch(e) {}

  try {
    const contractOrderItems = await prisma.contractOrderItem.findMany();
    console.log(`合同订货明细 (ContractOrderItem): ${contractOrderItems.length} 条`);
  } catch(e) {}

  try {
    const contractPayments = await prisma.contractPayment.findMany();
    console.log(`合同付款 (ContractPayment): ${contractPayments.length} 条`);
  } catch(e) {}

  try {
    const contractShipments = await prisma.contractShipment.findMany();
    console.log(`合同发货 (ContractShipment): ${contractShipments.length} 条`);
  } catch(e) {}

  try {
    const attachments = await prisma.attachment.findMany();
    console.log(`附件 (Attachment): ${attachments.length} 条`);
  } catch(e) {}

  try {
    const quotations = await prisma.quotation.findMany();
    console.log(`报价 (Quotation): ${quotations.length} 条`);
  } catch(e) {}

  try {
    const procurement = await prisma.procurement.findMany();
    console.log(`采购 (Procurement): ${procurement.length} 条`);
  } catch(e) {}

  try {
    const projectTeamMembers = await prisma.projectTeamMember.findMany();
    console.log(`项目团队成员 (ProjectTeamMember): ${projectTeamMembers.length} 条`);
  } catch(e) {}
}

main().catch(console.error).finally(() => prisma.$disconnect());
