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
}

# 插入种子数据
seed_data() {
    log_step "插入种子数据（部门、角色、菜单、管理员）..."
    
    # 1. 插入部门和角色
    if docker exec crm-backend node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  // 1. 插入部门
  const depts = [
    { name: '销售部', order: 1 },
    { name: '技术部', order: 2 },
    { name: '市场部', order: 3 },
    { name: '财务部', order: 4 },
    { name: '人事部', order: 5 }
  ];
  
  for (const d of depts) {
    await prisma.department.create({ data: d }).catch(() => {});
  }
  console.log('✓ 部门数据插入完成');
  
  // 2. 插入角色
  const roles = [
    { name: '管理员', code: 'ADMIN', description: '系统管理员，拥有所有权限', dataScope: 'ALL' },
    { name: '销售经理', code: 'SALES_MANAGER', description: '销售部门经理', dataScope: 'DEPARTMENT_BELOW' },
    { name: '项目经理', code: 'PROJECT_MANAGER', description: '项目部门经理', dataScope: 'DEPARTMENT_BELOW' },
    { name: '普通用户', code: 'USER', description: '普通员工', dataScope: 'SELF' }
  ];
  
  for (const r of roles) {
    await prisma.roleModel.create({ data: r }).catch(() => {});
  }
  console.log('✓ 角色数据插入完成');
  
  // 3. 创建管理员账号
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedPassword,
      name: '管理员',
      email: 'admin@localhost',
      roleId: 1,  // 系统管理员
      deptId: 1   // 销售部
    }
  }).catch(() => {
    console.log('! 管理员账号已存在');
  });
  
  console.log('✓ 管理员账号创建完成（用户名: admin, 密码: admin123）');
  console.log('! 请登录后立即修改密码！');
}

main().finally(() => prisma.\$disconnect());
"; then
        log_info "基础数据插入成功"
    else
        log_error "基础数据插入失败"
        exit 1
    fi
    
    # 2. 插入菜单权限（从 seed.sql 导入）
    # 注意：需要确保 seed.sql 文件已上传到群晖的 /volume1/docker/crm-system/backend/prisma/ 目录
    if [ -f "backend/prisma/seed.sql" ]; then
        log_info "导入菜单权限数据..."
        # 使用 docker cp 将文件复制到容器内，然后在容器内执行
        if docker cp backend/prisma/seed.sql crm-postgres:/tmp/seed.sql && \
           docker exec crm-postgres psql -U crm_user -d crm_db -f /tmp/seed.sql > /dev/null 2>&1; then
            log_info "菜单权限导入成功"
            # 删除临时文件
            docker exec crm-postgres rm -f /tmp/seed.sql
        else
            log_warn "菜单权限导入失败，请手动导入"
            log_warn "手动导入命令：docker cp backend/prisma/seed.sql crm-postgres:/tmp/seed.sql && docker exec crm-postgres psql -U crm_user -d crm_db -f /tmp/seed.sql"
        fi
    else
        log_warn "未找到 seed.sql 文件，跳过菜单权限导入"
        log_warn "请上传 seed.sql 到 backend/prisma/ 目录，然后执行："
        log_warn "  docker cp backend/prisma/seed.sql crm-postgres:/tmp/seed.sql"
        log_warn "  docker exec crm-postgres psql -U crm_user -d crm_db -f /tmp/seed.sql"
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
    echo "  地址: http://192.168.2.13:8880"
    echo ""
    echo -e "${BLUE}登录信息:${NC}"
    echo "  用户名: admin"
    echo "  密码: admin123"
    echo ""
    echo -e "${YELLOW}重要提示:${NC}"
    echo "  1. 请立即登录并修改管理员密码"
    echo "  2. 进入'系统管理 > 菜单管理'导入菜单数据"
    echo "  3. 进入'系统管理 > 角色管理'配置各角色的权限"
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
