-- 禁用外键约束
SET session_replication_role = replica;

-- 导入数据
\i insert_data.sql

-- 启用外键约束
SET session_replication_role = DEFAULT;
