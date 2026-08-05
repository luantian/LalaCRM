#!/bin/bash
# ============================================
#  群晖 NAS 一键部署脚本
#  使用方式：在群晖上执行 ./deploy-to-synology.sh
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
DEPLOY_DIR="/volume1/docker/crm-system"
BACKUP_DIR="/volume1/docker/backups"
COMPOSE_FILE="docker-compose.synology.yml"

# 打印带颜色的消息
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否在群晖上运行
check_environment() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装或未运行"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未启动"
        exit 1
    fi
    
    log_info "环境检查通过"
}

# 备份数据库
backup_database() {
    log_info "开始备份数据库..."
    
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/crm_db_$(date +%Y%m%d_%H%M%S).sql"
    
    docker exec crm-postgres pg_dump -U crm_user crm_db > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        log_info "数据库备份成功: $BACKUP_FILE"
    else
        log_error "数据库备份失败"
        exit 1
    fi
}

# 停止服务
stop_services() {
    log_info "停止当前服务..."
    cd "$DEPLOY_DIR"
    docker-compose -f "$COMPOSE_FILE" down
    log_info "服务已停止"
}

# 加载镜像
load_images() {
    log_info "加载 Docker 镜像..."
    
    if [ ! -d "./build" ]; then
        log_error "找不到 build 目录，请先上传镜像文件"
        exit 1
    fi
    
    docker load -i ./build/backend.tar
    log_info "✓ 后端镜像已加载"
    
    docker load -i ./build/frontend.tar
    log_info "✓ 前端镜像已加载"
    
    docker load -i ./build/postgres.tar
    log_info "✓ 数据库镜像已加载"
}

# 启动服务
start_services() {
    log_info "启动服务..."
    cd "$DEPLOY_DIR"
    docker-compose -f "$COMPOSE_FILE" up -d
    
    if [ $? -eq 0 ]; then
        log_info "服务启动成功"
    else
        log_error "服务启动失败"
        exit 1
    fi
}

# 等待数据库就绪
wait_database() {
    log_info "等待数据库就绪..."
    
    for i in {1..30}; do
        if docker exec crm-postgres pg_isready -U crm_user -d crm_db &> /dev/null; then
            log_info "数据库已就绪"
            return 0
        fi
        sleep 2
    done
    
    log_error "数据库启动超时"
    exit 1
}

# 执行数据库迁移
migrate_database() {
    log_info "执行数据库迁移..."
    
    # 进入后端容器执行 prisma db push
    docker exec crm-backend sh -c "cd /app && npx prisma db push"
    
    if [ $? -eq 0 ]; then
        log_info "数据库迁移成功"
    else
        log_error "数据库迁移失败"
        exit 1
    fi
}

# 插入权限菜单数据
insert_permissions() {
    log_info "插入权限菜单数据..."
    
    docker exec crm-backend node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const buttons = [
    { id: 98, key: 'project:contract:list',   label: '查看合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:list' },
    { id: 99, key: 'project:contract:add',    label: '新增合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:add' },
    { id: 100, key: 'project:contract:edit',  label: '编辑合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:edit' },
    { id: 101, key: 'project:contract:delete', label: '删除合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:delete' },
    { id: 102, key: 'project:procurement:list',   label: '查看采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:list' },
    { id: 103, key: 'project:procurement:add',    label: '新增采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:add' },
    { id: 104, key: 'project:procurement:edit',   label: '编辑采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:edit' },
    { id: 105, key: 'project:procurement:delete', label: '删除采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:delete' },
    { id: 106, key: 'project:contract:approve',   label: '合同审批', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:approve' },
    { id: 107, key: 'project:procurement:approve', label: '采购审批', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:approve' },
  ];
  
  for (const b of buttons) {
    await prisma.menuItem.create({ 
      data: { ...b, isVisible: true, requiredRoles: [], order: 0 } 
    }).catch(e => console.log('skip', b.key));
  }
  
  // 给管理员角色分配
  for (const b of buttons) {
    await prisma.roleMenu.create({ 
      data: { roleId: 1, menuId: b.id } 
    }).catch(() => {});
  }
  
  console.log('权限菜单插入完成');
}

main().finally(() => prisma.\$disconnect());
"
    
    if [ $? -eq 0 ]; then
        log_info "权限菜单插入成功"
    else
        log_warn "权限菜单插入失败（可能已存在）"
    fi
}

# 清理旧镜像
cleanup() {
    log_info "清理未使用的镜像..."
    docker image prune -f
}

# 显示部署信息
show_info() {
    echo ""
    echo "=========================================="
    log_info "部署完成！"
    echo "=========================================="
    echo ""
    echo "访问地址: http://$(hostname -I | awk '{print $1}'):8880"
    echo "          http://192.168.2.13:8880"
    echo ""
    echo "容器状态:"
    docker ps --filter "name=crm-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "日志查看:"
    echo "  后端: docker logs -f crm-backend"
    echo "  前端: docker logs -f crm-frontend"
    echo "  数据库: docker logs -f crm-postgres"
    echo ""
    echo "重要提示:"
    echo "  1. 请进入'系统管理 > 角色管理'配置合同/采购权限"
    echo "  2. 数据库备份位于: $BACKUP_DIR"
    echo ""
}

# 主流程
main() {
    echo ""
    echo "=========================================="
    echo "  LalaCRM 群晖一键部署脚本"
    echo "=========================================="
    echo ""
    
    check_environment
    backup_database
    stop_services
    load_images
    start_services
    wait_database
    migrate_database
    insert_permissions
    cleanup
    show_info
}

# 执行主流程
main
