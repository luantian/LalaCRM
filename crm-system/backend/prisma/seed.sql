-- 菜单种子数据
-- 运行方式: cd backend && node prisma/seed.js
-- 此 SQL 文件仅供参考菜单结构，实际写入由 seed.js 完成

-- 导航顺序: 仪表盘 → 商机 → 报价 → 客户 → 项目 → 发票 → 收支 → 报销 → 日常办公 → 系统管理 → 日志审计
-- 日常办公: 日报 / 出差 / 打卡
-- 系统管理: 用户 / 角色 / 菜单 / 部门 / 字典
-- 日志审计: 操作日志 / 登录日志

SELECT 'Run: node prisma/seed.js' as hint;
