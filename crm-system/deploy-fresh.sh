#!/bin/bash

# ============================================
# LalaCRM 首次部署脚本
# 使用场景：服务器上从未部署过 CRM 系统
# 使用方法：在群晖上执行 ./deploy-fresh.sh
# ============================================

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

log_step() {
    echo -e "${BLUE}[步骤]${NC} $1"
}

log_info() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 未安装"
        exit 1
    fi
}

# 检查环境
check_environment() {
    log_step "检查运行环境..."
    
    # 检查 Docker
    check_command docker
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    
    # 检查是否在正确的目录
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "找不到 $COMPOSE_FILE，请在 $DEPLOY_DIR 目录下执行"
        exit 1
    fi
    
    # 检查镜像文件
    if [ ! -f "build/backend.tar" ] || [ ! -f "build/frontend.tar" ]; then
        log_error "找不到 Docker 镜像文件，请先上传 build 目录"
        exit 1
    fi
    
    # 检查端口是否被占用
    if docker ps --format '{{.Ports}}' | grep -qE "0.0.0.0:[0-9]+->8880/tcp"; then
        log_error "端口 8880 已被占用"
        exit 1
    fi
    
    log_info "环境检查通过"
}

# 加载镜像
load_images() {
    log_step "加载 Docker 镜像..."
    
    if ! docker load -i build/backend.tar; then
        log_error "加载后端镜像失败"
        exit 1
    fi
    log_info "后端镜像加载成功"
    
    if ! docker load -i build/frontend.tar; then
        log_error "加载前端镜像失败"
        exit 1
    fi
    log_info "前端镜像加载成功"
    
    if [ -f "build/postgres.tar" ]; then
        if ! docker load -i build/postgres.tar; then
            log_warn "加载数据库镜像失败，使用现有镜像"
        else
            log_info "数据库镜像加载成功"
        fi
    fi
    
    log_info "所有镜像加载完成"
}

# 启动数据库
start_database() {
    log_step "启动数据库服务..."
    
    docker-compose -f "$COMPOSE_FILE" up -d postgres
    
    # 等待数据库就绪
    log_info "等待数据库启动..."
    for i in {1..60}; do
        if docker exec crm-postgres pg_isready -U crm_user -d crm_db &> /dev/null; then
            log_info "数据库启动成功"
            return 0
        fi
        sleep 2
    done
    
    log_error "数据库启动超时（120秒）"
    log_warn "请检查容器日志: docker logs crm-postgres"
    exit 1
}

# 初始化数据库
init_database() {
    log_step "初始化数据库结构..."
    
    # 启动后端容器（不启动服务）
    docker-compose -f "$COMPOSE_FILE" up -d backend
    
    # 等待后端容器就绪
    sleep 5
    
    # 执行数据库迁移（首次部署，不使用 --accept-data-loss）
    if ! docker exec crm-backend sh -c "cd /app && npx prisma db push"; then
        log_error "数据库迁移失败"
        log_warn "请检查数据库连接和权限"
        exit 1
    fi
    log_info "数据库结构初始化成功"

    # 写入节假日种子数据（db push 不执行迁移中的 INSERT，此脚本幂等可重复）
    docker exec crm-backend sh -c "cd /app && node prisma/seed-holidays.js" || log_warn "节假日种子数据写入失败（不影响主流程）"
}

# 插入种子数据（菜单 + ADMIN 角色由 seed.js 写入；再创建管理员账号）
seed_data() {
    log_step "写入种子数据（菜单、角色、管理员）..."

    # 1) 菜单与 ADMIN 角色（seed.js：66 个菜单含按钮权限，全部授权给 ADMIN 角色）
    #    注意：seed.js 会清空 RoleMenu/MenuItem 重建，仅适用于全新库
    if ! docker exec crm-backend sh -c "cd /app && node prisma/seed.js"; then
        log_error "菜单/角色种子数据写入失败"
        log_warn "可手动重试查看错误：docker exec crm-backend sh -c 'cd /app && node prisma/seed.js'"
        exit 1
    fi
    log_info "菜单与 ADMIN 角色写入完成"

    # 2) 创建管理员账号（权限判定走 UserRole 关联表，必须同时写入 UserRole）
    if ! docker exec crm-backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const exists = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (exists) { console.log('! 管理员账号已存在，跳过创建'); return; }
  const adminRole = await prisma.roleModel.findFirst({ where: { roleKey: 'ADMIN' } });
  if (!adminRole) throw new Error('ADMIN 角色不存在，请确认 seed.js 已执行');
  const user = await prisma.user.create({
    data: {
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      name: '管理员',
      email: 'admin@localhost',
      roleId: adminRole.id,
    }
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
  console.log('✓ 管理员账号创建完成（用户名: admin, 初始密码: admin123）');
  console.log('! 请登录后立即修改密码！');
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.\$disconnect());
"; then
        log_error "管理员账号创建失败"
        exit 1
    fi
}

# 启动完整服务
start_services() {
    log_step "启动所有服务..."
    
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # 等待服务就绪（使用 wget，群晖默认有）
    log_info "等待服务启动..."
    for i in {1..30}; do
        if wget -q --spider http://localhost:8880/api/health > /dev/null 2>&1; then
            log_info "服务启动成功"
            return 0
        fi
        sleep 2
    done
    
    log_error "服务启动超时（60秒）"
    log_warn "请检查容器日志:"
    log_warn "  docker logs crm-backend"
    log_warn "  docker logs crm-frontend"
    exit 1
}

# 验证部署
verify_deployment() {
    log_step "验证部署状态..."
    
    # 检查所有容器是否运行
    RUNNING_CONTAINERS=$(docker ps --filter "name=crm-" --format '{{.Names}}' | wc -l | tr -d ' ')
    if [ "$RUNNING_CONTAINERS" -lt 3 ]; then
        log_error "部分容器未启动，当前运行的容器:"
        docker ps --filter "name=crm-"
        exit 1
    fi
    
    # 检查服务健康状态（使用 wget）
    if ! wget -q --spider http://localhost:8880/api/health > /dev/null 2>&1; then
        log_warn "后端 API 未响应，但服务已启动"
        log_warn "可能需要等待几秒钟，或检查后端日志"
    fi
    
    log_info "所有服务运行正常"
}

# 主流程
main() {
    echo ""
    echo "=========================================="
    echo "  LalaCRM 首次部署脚本"
    echo "=========================================="
    echo ""
    echo "此脚本将执行以下操作:"
    echo "  1. 检查运行环境"
    echo "  2. 加载 Docker 镜像"
    echo "  3. 启动并初始化数据库"
    echo "  4. 插入种子数据"
    echo "  5. 启动所有服务"
    echo "  6. 验证部署状态"
    echo ""
    
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消部署"
        exit 0
    fi
    echo ""
    
    check_environment
    load_images
    start_database
    init_database
    seed_data
    start_services
    verify_deployment
    
    echo ""
    echo "=========================================="
    log_info "部署成功完成！"
    echo "=========================================="
    echo ""
    echo -e "${BLUE}访问信息:${NC}"
    echo "  地址: http://192.168.3.116:8880"
    echo ""
    echo -e "${BLUE}登录信息:${NC}"
    echo "  用户名: admin"
    echo "  密码: admin123"
    echo ""
    echo -e "${YELLOW}重要提示:${NC}"
    echo "  1. 请立即登录并修改管理员密码"
    echo "  2. 菜单与权限已随种子数据写入，无需手动导入"
    echo "  3. 进入'系统管理 > 角色管理'按需创建其他角色并配置权限"
    echo "  4. 创建其他用户账号"
    echo ""
    echo -e "${BLUE}容器状态:${NC}"
    docker ps --filter "name=crm-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo -e "${BLUE}常用命令:${NC}"
    echo "  查看日志: docker logs -f crm-backend"
    echo "  重启服务: docker-compose -f $COMPOSE_FILE restart"
    echo "  停止服务: docker-compose -f $COMPOSE_FILE down"
    echo "  更新系统: ./update.sh"
    echo ""
}

main
