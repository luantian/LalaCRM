#!/bin/bash
BASE="http://localhost:5000"
PASS=0; FAIL=0; WARN=0
RESULTS=""

log_result() {
  local module="$1"; local test="$2"; local status="$3"; local detail="$4"
  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); fi
  if [ "$status" = "FAIL" ]; then FAIL=$((FAIL+1)); fi
  if [ "$status" = "WARN" ]; then WARN=$((WARN+1)); fi
  RESULTS="${RESULTS}\n[${status}] ${module} | ${test} | ${detail}"
}

# === 0. 登录获取Token ===
echo ">>> 登录中..."
RESP=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  log_result "认证" "管理员登录" "PASS" "成功获取Token"
else
  log_result "认证" "管理员登录" "FAIL" "无法获取Token: $RESP"
  echo "FATAL: 无法登录，终止测试"
  echo "$RESULTS"
  exit 1
fi
AUTH="Authorization: Bearer $TOKEN"

# === 1. 健康检查 ===
R=$(curl -s "$BASE/api/health")
echo "$R" | grep -q '"status":"ok"' && log_result "系统" "健康检查" "PASS" "返回ok" || log_result "系统" "健康检查" "FAIL" "$R"

# === 2. /me 接口 ===
R=$(curl -s "$BASE/api/auth/me" -H "$AUTH")
echo "$R" | grep -q '"id":35' && log_result "认证" "/me接口" "PASS" "返回用户信息" || log_result "认证" "/me接口" "FAIL" "$R"
# 检查是否包含permissions
echo "$R" | grep -q '"permissions"' && log_result "认证" "/me权限数据" "PASS" "包含permissions字段" || log_result "认证" "/me权限数据" "FAIL" "缺少permissions"

# === 3. Token无效测试 ===
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/users" -H "Authorization: Bearer invalidtoken123")
[ "$R" = "401" ] && log_result "认证" "无效Token拒绝" "PASS" "返回401" || log_result "认证" "无效Token拒绝" "FAIL" "返回$R"

# === 4. 无Token访问 ===
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/users")
[ "$R" = "401" ] && log_result "认证" "无Token拒绝" "PASS" "返回401" || log_result "认证" "无Token拒绝" "FAIL" "返回$R"

# === 5. 用户管理 ===
R=$(curl -s "$BASE/api/users?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"users"' && log_result "用户管理" "用户列表" "PASS" "返回users数组" || log_result "用户管理" "用户列表" "FAIL" "$R"
TOTAL=$(echo "$R" | grep -o '"total":[0-9]*' | cut -d: -f2)
log_result "用户管理" "用户总数" "PASS" "共${TOTAL}个用户"

# === 6. 角色管理 ===
R=$(curl -s "$BASE/api/roles" -H "$AUTH")
echo "$R" | grep -q '"roles"' && log_result "角色管理" "角色列表" "PASS" "返回roles数组" || log_result "角色管理" "角色列表" "FAIL" "$R"

# === 7. 菜单管理 ===
R=$(curl -s "$BASE/api/menus" -H "$AUTH")
echo "$R" | grep -q '"menus"' && log_result "菜单管理" "菜单列表" "PASS" "返回menus数组" || log_result "菜单管理" "菜单列表" "FAIL" "$R"

# === 8. 部门管理 ===
R=$(curl -s "$BASE/api/departments" -H "$AUTH")
echo "$R" | grep -q '\[' && log_result "部门管理" "部门列表" "PASS" "返回数组" || log_result "部门管理" "部门列表" "FAIL" "$R"

# === 9. 客户管理（组织）===
R=$(curl -s "$BASE/api/organizations?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "客户管理" "客户列表" "PASS" "返回data" || log_result "客户管理" "客户列表" "FAIL" "$(echo $R | head -c 200)"

# === 10. 售前管理（商机）===
R=$(curl -s "$BASE/api/opportunities?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "售前管理" "售前列表" "PASS" "返回data" || log_result "售前管理" "售前列表" "FAIL" "$(echo $R | head -c 200)"

# === 11. 项目管理 ===
R=$(curl -s "$BASE/api/projects?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"projects"' && log_result "项目管理" "项目列表" "PASS" "返回projects数组" || log_result "项目管理" "项目列表" "FAIL" "$(echo $R | head -c 200)"

# === 12. 任务管理 ===
R=$(curl -s "$BASE/api/tasks?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"tasks"' && log_result "任务管理" "任务列表" "PASS" "返回tasks数组" || log_result "任务管理" "任务列表" "FAIL" "$(echo $R | head -c 200)"

# === 13. 合同管理 ===
R=$(curl -s "$BASE/api/contracts?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"contracts"' && log_result "合同管理" "合同列表" "PASS" "返回contracts数组" || log_result "合同管理" "合同列表" "FAIL" "$(echo $R | head -c 200)"

# === 14. 日报管理 ===
R=$(curl -s "$BASE/api/daily-reports?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"reports"' && log_result "日报管理" "日报列表" "PASS" "返回reports数组" || log_result "日报管理" "日报列表" "FAIL" "$(echo $R | head -c 200)"

# === 15. 出差管理 ===
R=$(curl -s "$BASE/api/business-trips?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"trips"' && log_result "出差管理" "出差列表" "PASS" "返回trips数组" || log_result "出差管理" "出差列表" "FAIL" "$(echo $R | head -c 200)"

# === 16. 费用管理 ===
R=$(curl -s "$BASE/api/expenses?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "费用管理" "费用列表" "PASS" "返回data" || log_result "费用管理" "费用列表" "FAIL" "$(echo $R | head -c 200)"

# === 17. 发票管理 ===
R=$(curl -s "$BASE/api/invoices?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "发票管理" "发票列表" "PASS" "返回data" || log_result "发票管理" "发票列表" "FAIL" "$(echo $R | head -c 200)"

# === 18. 报价单管理 ===
R=$(curl -s "$BASE/api/quotations?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "报价单" "报价单列表" "PASS" "返回data" || log_result "报价单" "报价单列表" "FAIL" "$(echo $R | head -c 200)"

# === 19. 采购管理 ===
R=$(curl -s "$BASE/api/procurements?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "采购管理" "采购列表" "PASS" "返回data" || log_result "采购管理" "采购列表" "FAIL" "$(echo $R | head -c 200)"

# === 20. Dashboard ===
R=$(curl -s "$BASE/api/dashboard" -H "$AUTH")
echo "$R" | grep -q '"totalProjects"' && log_result "Dashboard" "数据概览" "PASS" "返回totalProjects等" || log_result "Dashboard" "数据概览" "FAIL" "$(echo $R | head -c 200)"

# === 21. Dashboard 统计 ===
R=$(curl -s "$BASE/api/dashboard/stats" -H "$AUTH")
[ "$R" != "" ] && echo "$R" | grep -qv '"error"' && log_result "Dashboard" "统计数据" "PASS" "返回统计数据" || log_result "Dashboard" "统计数据" "FAIL" "$(echo $R | head -c 200)"

# === 22. 周报 ===
R=$(curl -s "$BASE/api/weekly-reports?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"reports"' && log_result "周报管理" "周报列表" "PASS" "返回reports数组" || log_result "周报管理" "周报列表" "FAIL" "$(echo $R | head -c 200)"

# === 23. 月报 ===
R=$(curl -s "$BASE/api/monthly-reports?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"reports"' && log_result "月报管理" "月报列表" "PASS" "返回reports数组" || log_result "月报管理" "月报列表" "FAIL" "$(echo $R | head -c 200)"

# === 24. 系统配置 ===
R=$(curl -s "$BASE/api/settings" -H "$AUTH")
echo "$R" | grep -q '"settings"' && log_result "系统配置" "配置列表" "PASS" "返回settings" || log_result "系统配置" "配置列表" "FAIL" "$(echo $R | head -c 200)"

# === 25. 操作日志 ===
R=$(curl -s "$BASE/api/operation-logs?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "操作日志" "日志列表" "PASS" "返回data" || log_result "操作日志" "日志列表" "FAIL" "$(echo $R | head -c 200)"

# === 26. 登录日志 ===
R=$(curl -s "$BASE/api/login-logs?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "登录日志" "日志列表" "PASS" "返回data" || log_result "登录日志" "日志列表" "FAIL" "$(echo $R | head -c 200)"

# === 27. 通知 ===
R=$(curl -s "$BASE/api/notifications?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"data"' && log_result "通知管理" "通知列表" "PASS" "返回data" || log_result "通知管理" "通知列表" "FAIL" "$(echo $R | head -c 200)"

# === 28. 字典 ===
R=$(curl -s "$BASE/api/dicts" -H "$AUTH")
echo "$R" | grep -q '\[' && log_result "字典管理" "字典列表" "PASS" "返回数组" || log_result "字典管理" "字典列表" "FAIL" "$(echo $R | head -c 200)"

# === 29. 角色菜单关联 ===
R=$(curl -s "$BASE/api/role-menus/44" -H "$AUTH")
echo "$R" | grep -q '"menuIds"' && log_result "角色菜单" "查询角色菜单" "PASS" "返回menuIds" || log_result "角色菜单" "查询角色菜单" "FAIL" "$(echo $R | head -c 200)"

# === 30. 数据库备份列表 ===
R=$(curl -s "$BASE/api/database/backups" -H "$AUTH")
echo "$R" | grep -q '"backups"' && log_result "数据库备份" "备份列表" "PASS" "返回backups数组" || log_result "数据库备份" "备份列表" "FAIL" "$(echo $R | head -c 200)"

# === 31. 项目成本 ===
R=$(curl -s "$BASE/api/project-costs?projectId=1" -H "$AUTH")
echo "$R" | grep -qv '"error"' && log_result "项目成本" "成本查询" "PASS" "返回成本数据" || log_result "项目成本" "成本查询" "WARN" "可能无数据:$R"

# === 32. 项目备注 ===
R=$(curl -s "$BASE/api/project-notes?projectId=1&page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"notes"' && log_result "项目备注" "备注列表" "PASS" "返回notes数组" || log_result "项目备注" "备注列表" "FAIL" "$(echo $R | head -c 200)"

# === 33. 打卡签到 ===
R=$(curl -s "$BASE/api/check-ins?page=1&pageSize=10" -H "$AUTH")
echo "$R" | grep -q '"checkIns"' && log_result "签到打卡" "签到列表" "PASS" "返回checkIns数组" || log_result "签到打卡" "签到列表" "FAIL" "$(echo $R | head -c 200)"

# === 34. 404 处理 ===
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/nonexistent")
[ "$R" = "404" ] && log_result "系统" "404处理" "PASS" "返回404" || log_result "系统" "404处理" "FAIL" "返回$R"

# === 35. 前端服务 ===
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/")
[ "$HTTP_CODE" = "200" ] && log_result "前端" "前端服务" "PASS" "3001端口正常" || log_result "前端" "前端服务" "FAIL" "返回$HTTP_CODE"

# === 36. 统计接口 - 工时分析 ===
R=$(curl -s "$BASE/api/stats/hours-analysis" -H "$AUTH")
[ -n "$R" ] && echo "$R" | grep -qv '"error"' && log_result "统计" "工时分析" "PASS" "返回工时数据" || log_result "统计" "工时分析" "FAIL" "$(echo $R | head -c 200)"

# === 37. 日报模板 ===
R=$(curl -s "$BASE/api/daily-report-templates" -H "$AUTH")
echo "$R" | grep -q '"templates"' && log_result "日报模板" "模板列表" "PASS" "返回templates" || log_result "日报模板" "模板列表" "FAIL" "$(echo $R | head -c 200)"

# === 38. 日报提醒 ===
R=$(curl -s "$BASE/api/daily-report-reminders" -H "$AUTH")
echo "$R" | grep -q '\[' && log_result "日报提醒" "提醒列表" "PASS" "返回数组" || log_result "日报提醒" "提醒列表" "FAIL" "$(echo $R | head -c 200)"

# === 39. 合同订单明细 ===
R=$(curl -s "$BASE/api/contract-order-items?contractId=1" -H "$AUTH")
[ -n "$R" ] && log_result "合同订单" "订单明细查询" "PASS" "接口可访问" || log_result "合同订单" "订单明细查询" "FAIL" "无响应"

# === 40. 合同回款 ===
R=$(curl -s "$BASE/api/contract-receipts?contractId=1" -H "$AUTH")
[ -n "$R" ] && log_result "合同回款" "回款查询" "PASS" "接口可访问" || log_result "合同回款" "回款查询" "FAIL" "无响应"

# === 41. 合同发货 ===
R=$(curl -s "$BASE/api/contract-shipments?contractId=1" -H "$AUTH")
[ -n "$R" ] && log_result "合同发货" "发货查询" "PASS" "接口可访问" || log_result "合同发货" "发货查询" "FAIL" "无响应"

# === 42. 采购付款 ===
R=$(curl -s "$BASE/api/procurement-payments?procurementId=1" -H "$AUTH")
[ -n "$R" ] && log_result "采购付款" "付款查询" "PASS" "接口可访问" || log_result "采购付款" "付款查询" "FAIL" "无响应"

echo ""
echo "============================================"
echo "        LalaCRM 全面测试报告"
echo "============================================"
echo -e "$RESULTS"
echo ""
echo "============================================"
echo "测试统计: 通过=$PASS 失败=$FAIL 警告=$WARN 总计=$((PASS+FAIL+WARN))"
echo "============================================"
