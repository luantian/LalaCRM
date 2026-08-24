#!/bin/bash
# ===================================================
#  LalaCRM 一键更新脚本
#  使用场景：服务器上已有 CRM 系统，需要更新到新版本
#  使用方法：
#    1. 将新的 build/backend.tar 和 build/frontend.tar 上传到 /volume1/docker/crm-system/build/
#    2. SSH 登录群晖
#    3. cd /volume1/docker/crm-system
#    4. ./update.sh
# ===================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
DEPLOY_DIR="/volume1/docker/crm-system"
COMPOSE_FILE="docker-compose.synology.yml"
BACKUP_DIR="/volume1/docker/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

log_step() { echo -e "${BLUE}[步骤]${NC} $1"; }
log_info() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

echo ""
echo "=========================================="
echo "  LalaCRM 一键更新脚本"
echo "=========================================="
echo ""

# -------------------------------------------------
# 1. 环境检查
# -------------------------------------------------
log_step "检查运行环境..."

if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    log_error "docker-compose 未安装"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "找不到 $COMPOSE_FILE，请在 $DEPLOY_DIR 目录下执行"
    exit 1
fi

# 检查镜像文件（至少有一个新镜像）
if [ ! -f "build/backend.tar" ] && [ ! -f "build/frontend.tar" ]; then
    log_error "未找到新的 Docker 镜像文件"
    log_warn "请将 build/backend.tar 和 build/frontend.tar 上传到 $DEPLOY_DIR/build/ 目录"
    exit 1
fi

HAS_NEW_BACKEND=false
HAS_NEW_FRONTEND=false
[ -f "build/backend.tar" ] && HAS_NEW_BACKEND=true
[ -f "build/frontend.tar" ] && HAS_NEW_FRONTEND=true

log_info "环境检查通过"
log_info "将更新：$($HAS_NEW_BACKEND && echo -n '后端 ')$($HAS_NEW_FRONTEND && echo -n '前端')"

# -------------------------------------------------
# 2. 备份数据库
# -------------------------------------------------
log_step "备份数据库..."

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/crm_db_$TIMESTAMP.sql"

# 确保数据库正在运行
if ! docker ps --format '{{.Names}}' | grep -q "crm-postgres"; then
    log_warn "数据库未运行，尝试启动..."
    docker-compose -f "$COMPOSE_FILE" up -d postgres
    sleep 5
fi

if docker exec crm-postgres pg_isready -U crm_user -d crm_db > /dev/null 2>&1; then
    if docker exec crm-postgres pg_dump -U crm_user crm_db > "$BACKUP_FILE" 2>/dev/null; then
        # 压缩备份
        gzip "$BACKUP_FILE" 2>/dev/null && BACKUP_FILE="$BACKUP_FILE.gz"
        log_info "数据库已备份到：$BACKUP_FILE"
    else
        log_warn "数据库备份失败，但继续更新..."
    fi

    # 保留最近 5 个备份，删除旧的
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/crm_db_*.sql* 2>/dev/null | wc -l | tr -d ' ')
    if [ "$BACKUP_COUNT" -gt 5 ]; then
        ls -1 "$BACKUP_DIR"/crm_db_*.sql* | head -n -5 | xargs rm -f 2>/dev/null
        log_info "已清理旧备份，保留最近 5 个"
    fi
else
    log_warn "数据库未就绪，跳过备份"
fi

# -------------------------------------------------
# 3. 确认更新
# -------------------------------------------------
echo ""
echo "即将执行以下操作："
echo "  1. 停止当前服务"
echo "  2. 加载新镜像"
echo "  3. 启动服务（使用新镜像）"
echo "  4. 同步数据库结构"
echo "  5. 验证服务状态"
echo ""

read -p "是否继续？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消更新"
    exit 0
fi
echo ""

# -------------------------------------------------
# 4. 停止服务
# -------------------------------------------------
log_step "停止服务..."

docker-compose -f "$COMPOSE_FILE" down --timeout 30 > /dev/null 2>&1 || true
sleep 3

# 确认容器已停止
REMAINING=$(docker ps --filter "name=crm-" --format '{{.Names}}' | wc -l | tr -d ' ')
if [ "$REMAINING" -gt 0 ]; then
    log_warn "部分容器未正常停止，强制停止..."
    docker ps --filter "name=crm-" --format '{{.Names}}' | xargs docker stop > /dev/null 2>&1 || true
    sleep 2
fi

log_info "服务已停止"

# -------------------------------------------------
# 5. 加载新镜像
# -------------------------------------------------
log_step "加载 Docker 镜像..."

if $HAS_NEW_BACKEND; then
    if docker load -i build/backend.tar > /dev/null 2>&1; then
        log_info "后端镜像加载成功"
    else
        log_error "后端镜像加载失败"
        log_warn "请检查 build/backend.tar 文件是否完整"
        exit 1
    fi
fi

if $HAS_NEW_FRONTEND; then
    if docker load -i build/frontend.tar > /dev/null 2>&1; then
        log_info "前端镜像加载成功"
    else
        log_error "前端镜像加载失败"
        log_warn "请检查 build/frontend.tar 文件是否完整"
        exit 1
    fi
fi

if [ -f "build/postgres.tar" ]; then
    if docker load -i build/postgres.tar > /dev/null 2>&1; then
        log_info "数据库镜像加载成功"
    else
        log_warn "数据库镜像加载失败，继续使用现有镜像"
    fi
fi

# -------------------------------------------------
# 6. 启动服务
# -------------------------------------------------
log_step "启动服务..."

docker-compose -f "$COMPOSE_FILE" up -d

# 等待数据库就绪
log_info "等待数据库启动..."
DB_READY=false
for i in $(seq 1 60); do
    if docker exec crm-postgres pg_isready -U crm_user -d crm_db > /dev/null 2>&1; then
        DB_READY=true
        break
    fi
    sleep 2
done

if ! $DB_READY; then
    log_error "数据库启动超时（120秒）"
    log_warn "请检查数据库日志：docker logs crm-postgres"
    log_warn "如需恢复，数据库备份位于：$BACKUP_DIR"
    exit 1
fi
log_info "数据库启动成功"

# -------------------------------------------------
# 7. 同步数据库结构
# -------------------------------------------------
log_step "同步数据库结构..."

# 容器启动命令(docker-compose.synology.yml)自带一次 prisma db push。
# 此前本步骤紧接着再 exec 一次 push，两者并发 ALTER 同一批新列，
# 后完成者报 "column ... already exists" 导致更新假失败(2026-08-24 实际发生)。
# 现改为：先等容器内置 push 跑完(后端 health 通过说明其已结束)，
# 再执行一次幂等 push 作为校验(无 diff 时秒回成功)。
log_info "等待容器内置 db push 完成(后端就绪)..."
BOOT_READY=false
for i in $(seq 1 90); do
    if docker exec crm-backend node -e "fetch('http://localhost:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" > /dev/null 2>&1; then
        BOOT_READY=true
        break
    fi
    sleep 2
done
if $BOOT_READY; then
    log_info "后端已就绪(内置 db push 已完成)"
else
    log_warn "后端 180 秒未就绪，继续尝试同步(容器可能仍在启动)"
fi

MIGRATE_LOG="/tmp/crm_migrate_$TIMESTAMP.log"
if docker exec crm-backend sh -c "cd /app && npx prisma db push" > "$MIGRATE_LOG" 2>&1; then
    # 检查是否有警告
    if grep -q -i "warning" "$MIGRATE_LOG" 2>/dev/null; then
        log_warn "数据库同步完成，但有警告："
        grep -i "warning" "$MIGRATE_LOG" | sed 's/^/  /'
    else
        log_info "数据库结构同步成功"
    fi
else
    log_error "数据库同步失败"
    log_warn "迁移日志："
    cat "$MIGRATE_LOG" 2>/dev/null | sed 's/^/  /'
    log_warn ""
    log_warn "建议："
    log_warn "  1. 查看后端日志：docker logs crm-backend"
    log_warn "  2. 如需回滚数据库，请执行："
    if [[ "$BACKUP_FILE" == *.gz ]]; then
        log_warn "     gunzip -c $BACKUP_FILE | docker exec -i crm-postgres psql -U crm_user -d crm_db"
    else
        log_warn "     cat $BACKUP_FILE | docker exec -i crm-postgres psql -U crm_user -d crm_db"
    fi
    exit 1
fi

# 写入节假日种子数据（db push 不执行迁移中的 INSERT，此脚本幂等可重复）
docker exec crm-backend sh -c "cd /app && node prisma/seed-holidays.js" || log_warn "节假日种子数据写入失败（不影响主流程）"
rm -f "$MIGRATE_LOG"

# -------------------------------------------------
# 8. 等待服务就绪并验证
# -------------------------------------------------
log_step "验证服务状态..."

# 检查所有容器是否运行
RUNNING_CONTAINERS=$(docker ps --filter "name=crm-" --format '{{.Names}}' | wc -l | tr -d ' ')
if [ "$RUNNING_CONTAINERS" -lt 3 ]; then
    log_error "部分容器未启动，当前运行的容器："
    docker ps --filter "name=crm-"
    log_warn "请检查容器日志：docker logs crm-backend"
    exit 1
fi

# 等待后端 API 就绪
# 注意：后端健康路由是 /health（无 /api 前缀），nginx 只反代 /api 和 /ws，
# 所以从宿主机经 8880 端口探测 /api/health 永远 404 —— 必须在容器内探测。
log_info "等待后端 API 就绪..."
API_READY=false
for i in $(seq 1 30); do
    if docker exec crm-backend node -e "fetch('http://localhost:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" > /dev/null 2>&1; then
        API_READY=true
        break
    fi
    sleep 2
done

if $API_READY; then
    log_info "后端 API 正常响应"
else
    log_warn "后端 API 未响应，可能需要更多时间启动"
    log_warn "请稍后检查：docker exec crm-backend node -e \"fetch('http://localhost:5000/health').then(r=>console.log(r.status))\""
fi

# 检查异常容器
UNHEALTHY=$(docker ps --filter "name=crm-" --filter "health=unhealthy" --format '{{.Names}}' | wc -l | tr -d ' ')
if [ "$UNHEALTHY" -gt 0 ]; then
    log_warn "以下容器状态异常："
    docker ps --filter "name=crm-" --filter "health=unhealthy" --format "  {{.Names}}: {{.Status}}"
fi

# -------------------------------------------------
# 9. 清理临时文件
# -------------------------------------------------
# 清理加载过的旧镜像（可选，释放磁盘空间）
log_step "清理旧镜像..."
docker image prune -f > /dev/null 2>&1 || true

# -------------------------------------------------
# 10. 显示结果
# -------------------------------------------------
echo ""
echo "=========================================="
if $API_READY; then
    log_info "更新成功完成！"
else
    log_warn "更新已完成，但 API 尚未就绪"
fi
echo "=========================================="
echo ""
echo "服务状态："
docker ps --filter "name=crm-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "数据库备份：$BACKUP_FILE"
echo ""
echo "常用命令："
echo "  查看后端日志：docker logs -f crm-backend"
echo "  重启服务：docker-compose -f $COMPOSE_FILE restart"
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "  回滚数据库：gunzip -c $BACKUP_FILE | docker exec -i crm-postgres psql -U crm_user -d crm_db"
else
    echo "  回滚数据库：cat $BACKUP_FILE | docker exec -i crm-postgres psql -U crm_user -d crm_db"
fi
echo ""
