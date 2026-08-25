#!/bin/bash
# ===================================================
#  LalaCRM 本地打包 + 上传群晖一键脚本
#  在 Windows Git Bash 下运行：./build-and-upload.sh
#
#  功能：
#    1. 用 buildx 构建 ARM64 镜像（backend / frontend）
#    2. 导出 PostgreSQL ARM64 镜像
#    3. 通过 scp 上传 3 个 tar 到群晖
#    4. 提示在群晖上执行 update.sh 完成更新
#
#  依赖：Docker Desktop + buildx + OpenSSH(scp)
# ===================================================

set -e

# ---------------- 配置（按需修改） ----------------
SYNO_IP="192.168.3.116"
SYNO_USER="cechuangkeji"
SYNO_PORT="22"
SYNO_DEPLOY_DIR="/volume1/docker/crm-system"
# --------------------------------------------------

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_step() { echo -e "${BLUE}[步骤]${NC} $1"; }
log_info() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[X]${NC} $1"; }

# 项目根目录 = 脚本所在目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "=========================================="
echo "  LalaCRM 打包 + 上传群晖"
echo "=========================================="
echo "  群晖: ${SYNO_USER}@${SYNO_IP}:${SYNO_PORT}"
echo "  目标: ${SYNO_DEPLOY_DIR}/build/"
echo "=========================================="
echo ""

# -------------------------------------------------
# 0. 环境检查
# -------------------------------------------------
log_step "检查环境..."

if ! docker info > /dev/null 2>&1; then
    log_error "Docker 未运行，请先启动 Docker Desktop"
    exit 1
fi

if ! docker buildx version > /dev/null 2>&1; then
    log_error "docker buildx 不可用"
    exit 1
fi

mkdir -p ./build
log_info "环境就绪"

# -------------------------------------------------
# 1. 初始化 buildx 构建器
# -------------------------------------------------
log_step "初始化 ARM64 构建器..."
docker buildx create --name synology-builder --use 2>/dev/null \
  || docker buildx use synology-builder 2>/dev/null \
  || true
docker buildx inspect --bootstrap > /dev/null 2>&1
log_info "构建器就绪"

# -------------------------------------------------
# 2. 构建后端镜像
# -------------------------------------------------
log_step "构建后端镜像 (ARM64)..."
docker buildx build \
    --platform linux/arm64 \
    --tag crm-backend:arm64 \
    --output "type=docker,dest=./build/backend.tar" \
    ./backend
log_info "后端镜像构建完成: build/backend.tar"

# -------------------------------------------------
# 3. 构建前端镜像
# -------------------------------------------------
log_step "构建前端镜像 (ARM64)..."
docker buildx build \
    --platform linux/arm64 \
    --tag crm-frontend:arm64 \
    --output "type=docker,dest=./build/frontend.tar" \
    ./frontend
log_info "前端镜像构建完成: build/frontend.tar"

# -------------------------------------------------
# 4. 导出 PostgreSQL ARM64 镜像
#    （直接 docker save 跨架构镜像会报 manifest digest not found，
#     用临时 Dockerfile + buildx 导出可规避此问题）
# -------------------------------------------------
log_step "导出 PostgreSQL 镜像 (ARM64)..."
PG_DOCKERFILE="./build/Dockerfile.pg.tmp"
echo "FROM postgres:15-alpine" > "$PG_DOCKERFILE"
docker buildx build \
    --platform linux/arm64 \
    --tag postgres:15-alpine-arm64 \
    --output "type=docker,dest=./build/postgres.tar" \
    -f "$PG_DOCKERFILE" ./build
rm -f "$PG_DOCKERFILE"
log_info "PostgreSQL 镜像导出完成: build/postgres.tar"

# -------------------------------------------------
# 5. 同步 update.sh 到 build 目录（群晖端更新脚本）
# -------------------------------------------------
cp -f ./update.sh ./build/update.sh 2>/dev/null || log_warn "未找到 update.sh，跳过"
# 防 CRLF：Windows 编辑器可能把脚本存成 \r\n，群晖 bash 会报 $'\r': command not found
sed -i 's/\r$//' ./build/update.sh ./build/deploy-fresh.sh ./build/deploy-data-fix.sql 2>/dev/null || true

# -------------------------------------------------
# 6. 打包结果
# -------------------------------------------------
echo ""
log_step "构建产物："
ls -lh ./build/*.tar | awk '{printf "  %-40s %s\n", $NF, $5}'
echo ""

# -------------------------------------------------
# 7. 上传到群晖
# -------------------------------------------------
log_step "上传镜像到群晖 ${SYNO_IP}..."

# 先确保群晖目标 build 目录存在
ssh -p "$SYNO_PORT" "${SYNO_USER}@${SYNO_IP}" \
    "mkdir -p ${SYNO_DEPLOY_DIR}/build" 2>&1 | grep -v "^$" || true

# 上传 tar 文件、更新脚本与数据修正SQL
scp -P "$SYNO_PORT" \
    ./build/backend.tar \
    ./build/frontend.tar \
    ./build/postgres.tar \
    ./build/update.sh \
    ./build/deploy-data-fix.sql \
    "${SYNO_USER}@${SYNO_IP}:${SYNO_DEPLOY_DIR}/build/"

if [ $? -eq 0 ]; then
    log_info "上传完成"
else
    log_error "上传失败，请检查 SSH 连接和密码"
    exit 1
fi

# -------------------------------------------------
# 8. 完成
# -------------------------------------------------
echo ""
echo "=========================================="
log_info "打包 + 上传全部完成！"
echo "=========================================="
echo ""
echo -e "${BLUE}下一步：SSH 登录群晖执行更新${NC}"
echo ""
echo "  ssh ${SYNO_USER}@${SYNO_IP}"
echo "  cd ${SYNO_DEPLOY_DIR}"
echo "  sudo bash build/update.sh"
echo ""
echo -e "${YELLOW}update.sh 会自动：备份数据库 → 停服务 → 加载新镜像 → 启动 → 同步DB结构 → 验证${NC}"
echo ""
