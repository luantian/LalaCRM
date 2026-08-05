/**
 * 批量替换后端路由中的 checkPermission 参数
 * 把旧扁平式权限标识改为三段式
 */
const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'src/routes');

// 映射表
const MAP = {
  'view_organizations': 'crm:organization:list',
  'edit_organizations': 'crm:organization:edit',
  'view_projects': 'project:project:list',
  'edit_projects': 'project:project:edit',
  'create_projects': 'project:project:add',
  'view_opportunities': 'crm:opportunity:list',
  'edit_opportunities': 'crm:opportunity:edit',
  'view_quotations': 'crm:quotation:list',
  'edit_quotations': 'crm:quotation:edit',
  'approve_quotations': 'crm:quotation:approve',
  'view_contracts': 'project:archive:list',
  'edit_contracts': 'project:archive:edit',
  'approve_contracts': 'project:archive:approve',
  'view_procurements': 'project:archive:list',
  'edit_procurements': 'project:archive:edit',
  'approve_procurements': 'project:archive:approve',
  'view_business_trips': 'office:trip:list',
  'submit_trips': 'office:trip:add',
  'approve_business_trips': 'office:trip:approve',
  'view_expenses': 'finance:expense:list',
  'submit_expenses': 'finance:expense:add',
  'approve_expenses': 'finance:expense:approve',
  'view_invoices': 'finance:expense:list',
  'edit_invoices': 'finance:expense:edit',
  'view_reports': 'office:dailyreport:list',
  'create_reports': 'office:dailyreport:add',
  'manage_system': 'system:manage',
};

let totalReplacements = 0;
let modifiedFiles = [];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = 0;
  const original = content;

  // 替换 checkPermission('xxx')
  for (const [oldPerm, newPerm] of Object.entries(MAP)) {
    const regex = new RegExp(`checkPermission\\('${oldPerm}'\\)`, 'g');
    const matches = content.match(regex);
    if (matches) {
      changed += matches.length;
      content = content.replace(regex, `checkPermission('${newPerm}')`);
    }
  }

  if (changed > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalReplacements += changed;
    modifiedFiles.push(path.basename(filePath));
    console.log(`[OK] ${path.basename(filePath)}: ${changed} 处替换`);
  }
}

const files = fs.readdirSync(routesDir);
for (const file of files) {
  if (file.endsWith('.ts')) {
    processFile(path.join(routesDir, file));
  }
}

console.log(`\n=== 完成 ===`);
console.log(`修改文件: ${modifiedFiles.length} 个 (${modifiedFiles.join(', ')})`);
console.log(`总替换: ${totalReplacements} 处`);
