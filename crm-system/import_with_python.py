#!/usr/bin/env python3
"""
直接从 SQL 备份文件导入数据到 PostgreSQL 数据库
使用 psycopg2 避免 psql 命令行工具的编码问题
"""

import psycopg2
import re
import sys

# 数据库连接配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'user': 'postgres',
    'password': 'postgres',
    'dbname': 'crm_db'
}

# 备份文件路径
BACKUP_FILE = r'C:\Users\Administrator\Downloads\backup_2026-08-11T10-33-11 (1).sql'

def read_sql_file(filepath):
    """读取 SQL 文件，处理编码问题"""
    encodings = ['utf-8', 'gbk', 'gb2312', 'latin1']
    
    for encoding in encodings:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                content = f.read()
            print(f"✓ 成功使用 {encoding} 编码读取文件")
            return content
        except UnicodeDecodeError:
            continue
    
    # 如果都失败，使用 binary 模式读取并尝试转换
    with open(filepath, 'rb') as f:
        raw_data = f.read()
    # 尝试移除 BOM
    if raw_data.startswith(b'\xef\xbb\xbf'):
        raw_data = raw_data[3:]
    content = raw_data.decode('utf-8', errors='replace')
    print("✓ 使用 UTF-8 读取（带错误替换）")
    return content

def extract_insert_statements(content):
    """提取所有 INSERT 语句"""
    # 匹配 INSERT INTO 语句
    pattern = r'(INSERT INTO "public"\."[^"]+" \([^)]+\) VALUES \([^;]+\);)'
    matches = re.findall(pattern, content, re.DOTALL)
    print(f"✓ 找到 {len(matches)} 条 INSERT 语句")
    return matches

def fix_array_fields(stmt):
    """修复数组字段的格式问题
    将逗号分隔的字符串转换为 PostgreSQL 数组格式
    例如：'ADMIN,ROLE_MS5QDFMB' -> '{ADMIN,ROLE_MS5QDFMB}'
    """
    # 修复 requiredRoles 字段（MenuItem 表的第 11 个字段）
    # 匹配模式：'xxx' 后跟 , 'MENU' 或 , 'BUTTON' 或 , 'DIRECTORY'
    # 需要将其改为 '{xxx}'
    
    # 查找 requiredRoles 的位置（在 isVisible 之后，menuType 之前）
    import re
    
    # 匹配：true/false, '角色列表', 'MENU/BUTTON/DIRECTORY'
    # 将 '角色列表' 改为 '{角色列表}'
    pattern = r"(,\s*(?:true|false),\s*)'([^']*)'(,\s*'(?:MENU|BUTTON|DIRECTORY)')"
    
    def replace_array(match):
        prefix = match.group(1)
        roles_str = match.group(2)
        suffix = match.group(3)
        
        if not roles_str:  # 空字符串
            return f"{prefix}'{{}}'{suffix}"
        
        # 将逗号分隔的角色转换为 PostgreSQL 数组格式
        roles = roles_str.split(',')
        array_str = '{' + ','.join(roles) + '}'
        return f"{prefix}'{array_str}'{suffix}"
    
    return re.sub(pattern, replace_array, stmt)

def insert_data(conn, statements):
    """执行 INSERT 语句"""
    cur = conn.cursor()
    
    # 禁用外键约束检查
    cur.execute("SET session_replication_role = replica;")
    conn.commit()
    
    success_count = 0
    error_count = 0
    errors = []
    
    for i, stmt in enumerate(statements, 1):
        try:
            # 移除 "public". 前缀
            clean_stmt = stmt.replace('"public".', '')
            
            # 修复数组字段格式
            clean_stmt = fix_array_fields(clean_stmt)
            
            cur.execute(clean_stmt)
            conn.commit()  # 每条语句单独提交
            success_count += 1
            
            if i % 100 == 0:
                print(f"  已导入 {i}/{len(statements)} 条记录...")
        except Exception as e:
            conn.rollback()  # 失败时回滚
            error_count += 1
            error_msg = f"语句 {i}: {str(e)}"
            errors.append(error_msg)
            # 继续执行下一条，不中断
            continue
    
    # 重新启用外键约束检查
    cur.execute("SET session_replication_role = DEFAULT;")
    conn.commit()
    
    cur.close()
    
    return success_count, error_count, errors

def main():
    print("=" * 60)
    print("开始导入数据到 PostgreSQL 数据库")
    print("=" * 60)
    
    # 1. 读取 SQL 文件
    print("\n[1/3] 读取 SQL 备份文件...")
    content = read_sql_file(BACKUP_FILE)
    
    # 2. 提取 INSERT 语句
    print("\n[2/3] 提取 INSERT 语句...")
    statements = extract_insert_statements(content)
    
    if not statements:
        print("✗ 未找到任何 INSERT 语句")
        return
    
    # 3. 连接数据库并导入
    print("\n[3/3] 导入数据到数据库...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print(f"✓ 成功连接到数据库 {DB_CONFIG['dbname']}")
        
        success, errors_count, error_list = insert_data(conn, statements)
        
        print("\n" + "=" * 60)
        print("导入完成!")
        print("=" * 60)
        print(f"✓ 成功导入: {success} 条")
        print(f"✗ 失败: {errors_count} 条")
        
        if error_list:
            print("\n错误详情（前 10 条）:")
            for err in error_list[:10]:
                print(f"  - {err}")
            if len(error_list) > 10:
                print(f"  ... 还有 {len(error_list) - 10} 条错误")
        
        conn.close()
        
    except Exception as e:
        print(f"✗ 数据库连接或导入失败: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
