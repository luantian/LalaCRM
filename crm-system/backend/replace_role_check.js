const fs = require('fs');
const path = require('path');

const files = [
  'contractOrderItems.ts',
  'contractPayments.ts',
  'contracts.ts',
  'contractShipments.ts',
  'dailyReports.ts',
  'dailyReportTemplates.ts',
  'departments.ts',
  'dicts.ts',
  'expenseFiles.ts',
  'expenses.ts',
  'loginLogs.ts',
  'monthlyReports.ts',
  'notifications.ts',
  'operationLogs.ts',
  'opportunities.ts',
  'procurementPayments.ts',
  'procurements.ts',
  'projectNotes.ts',
  'projects.ts',
  'quotations.ts',
  'roleMenus.ts',
  'weeklyReports.ts',
  'organizations.ts'
];

files.forEach(file => {
  const filePath = path.join('src/routes', file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 添加 import（如果没有）
  if (!content.includes("from '../utils/permission'")) {
    // 找到最后一个 import 语句
    const importMatch = content.match(/^import.*from\s+['"][^'"]+['"];?\s*$/m);
    if (importMatch) {
      content = content.replace(
        /^(import.*from\s+['"][^'"]+['"];?\s*)$/m,
        `$1\nimport { isAdmin } from '../utils/permission'`
      );
    }
  }
  
  // 替换角色判断
  content = content.replace(/req\.user\?\.role\s*!==\s*['"]ADMIN['"]/g, '!(await isAdmin(req.user!.id))');
  content = content.replace(/req\.user\.role\s*!==\s*['"]ADMIN['"]/g, '!(await isAdmin(req.user!.id))');
  content = content.replace(/req\.user\?\.role\s*===\s*['"]ADMIN['"]/g, 'await isAdmin(req.user!.id)');
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
});
