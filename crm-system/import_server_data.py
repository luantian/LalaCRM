"""
从服务器备份SQL中提取所有INSERT语句，正确处理字符串内换行符
"""
import re
import subprocess
import sys

BACKUP_FILE = r"C:\Users\Administrator\Downloads\backup_2026-08-11T10-33-11 (1).sql"
PSQL = r"C:\Program Files\PostgreSQL\15\bin\psql.exe"
DB_ARGS = ["-h", "localhost", "-p", "5432", "-U", "postgres", "-d", "crm_db"]

with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# 按表名分组提取 INSERT 语句
# 每个 INSERT 语句以 INSERT INTO 开头，以 );\n 结束
# 需要正确处理字符串内的换行符

tables = {}
idx = 0
while True:
    pos = content.find('INSERT INTO', idx)
    if pos == -1:
        break
    
    # 从 INSERT INTO 开始，找到 ); 结尾
    # 需要正确处理字符串内的分号
    in_string = False
    escape_next = False
    end = pos
    for i in range(pos, len(content)):
        ch = content[i]
        if escape_next:
            escape_next = False
            continue
        if ch == '\\':
            escape_next = True
            continue
        if ch == "'" and not in_string:
            in_string = True
            continue
        if ch == "'" and in_string:
            # 检查是否是转义的单引号 ''
            if i + 1 < len(content) and content[i + 1] == "'":
                escape_next = True
                continue
            in_string = False
            continue
        if ch == ';' and not in_string:
            end = i + 1
            break
    
    stmt = content[pos:end].strip()
    
    # 提取表名
    match = re.match(r'INSERT INTO "public"\."([^"]+)"', stmt)
    if match:
        table_name = match.group(1)
        if table_name not in tables:
            tables[table_name] = []
        tables[table_name].append(stmt)
    
    idx = end

print(f"提取了 {sum(len(v) for v in tables.values())} 条 INSERT 语句，涉及 {len(tables)} 个表")
for t, stmts in sorted(tables.items()):
    print(f"  {t}: {len(stmts)} 条")

# 定义表依赖顺序（先插入被依赖的表）
TABLE_ORDER = [
    'RoleModel', 'Department', 'User', 'UserRole',
    'Organization', 'OrgContact',
    'MenuItem', 'RoleMenu',
    'Project', 'ProjectFile', 'ProjectTeamMember', 'ProjectNote', 'ProjectNoteFile', 'ProjectVersion',
    'Contract', 'ContractFile', 'ContractOrderItem', 'ContractOrderItemFile', 
    'ContractShipment', 'ContractShipmentFile', 'ContractReceipt', 'ContractReceiptFile',
    'Opportunity', 'OpportunityFile', 'OpportunityRecord', 'OpportunityRecordFile', 'OpportunityTeamMember',
    'Quotation', 'QuotationFile', 'QuotationItem',
    'Procurement', 'ProcurementFile', 'ProcurementItem', 'ProcurementItemFile', 
    'ProcurementPayment', 'ProcurementPaymentFile',
    'Invoice', 'InvoiceFile',
    'BusinessTrip', 'Expense', 'ExpenseItem', 'ExpenseFile',
    'DailyReport', 'DailyReportItem', 'DailyReportTimeEntry', 'DailyReportComment',
    'DailyReportRelation', 'DailyReportFile', 'DailyReportTag', 'DailyReportVisibility',
    'DailyReportFavorite', 'DailyReportHistory', 'DailyReportArchive',
    'DailyReportReminder', 'DailyReportTemplate',
    'DailyCheckIn', 'Task', 'TaskFile', 'TaskRecord', 'TaskRecordFile',
    'Tag',
    'OperationLog', 'LoginLog',
    'DictType', 'DictData',
    'DatabaseBackup', 'Notification', 'SystemConfig', 'Holiday',
    'WeeklyReport', 'MonthlyReport',
    '_TaskAssignees',
]

# 按顺序写入SQL文件
output_file = r"F:\workspace\chuanglingda\projects\LalaCRM\crm-system\import_all_data.sql"
with open(output_file, 'w', encoding='utf-8') as f:
    f.write("-- 服务器数据导入\n")
    f.write("SET session_replication_role = replica;\n\n")
    
    inserted_tables = set()
    for table_name in TABLE_ORDER:
        if table_name in tables:
            f.write(f"-- Table: {table_name} ({len(tables[table_name])} rows)\n")
            for stmt in tables[table_name]:
                # 替换 "public". 前缀，因为 prisma db push 创建的表没有 schema 前缀问题
                clean_stmt = stmt.replace('"public".', '')
                f.write(clean_stmt + "\n")
            f.write("\n")
            inserted_tables.add(table_name)
    
    # 处理未在顺序表中列出的表
    for table_name in sorted(tables.keys()):
        if table_name not in inserted_tables:
            f.write(f"-- Table: {table_name} ({len(tables[table_name])} rows) - unordered\n")
            for stmt in tables[table_name]:
                clean_stmt = stmt.replace('"public".', '')
                f.write(clean_stmt + "\n")
            f.write("\n")
    
    f.write("SET session_replication_role = DEFAULT;\n")

print(f"\n已生成导入SQL文件: {output_file}")
