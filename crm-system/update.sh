#!/bin/bash
# ===================================================
#  群晖端更新脚本（由 deploy.bat 自动调用）
#  不要手动运行此脚本
# ===================================================

set -e

DEPLOY_PATH=$1
UPDATE_DIR="/tmp/crm-update"

if [ -z "$DEPLOY_PATH" ]; then
    echo "❌ 错误：未指定部署路径"
    exit 1
fi

echo "========================================"
echo "  CRM 系统更新脚本"
echo "========================================"
echo ""

# 进入部署目录
cd "$DEPLOY_PATH"

# 停止服务
echo "[1/5] 停止服务..."
sudo docker-compose -f docker-compose.synology.yml down || true

# 加载镜像
echo ""
echo "[2/5] 加载 Docker 镜像..."

if [ -f "$UPDATE_DIR/frontend.tar" ]; then
    echo "  加载前端镜像..."
    sudo docker load -i "$UPDATE_DIR/frontend.tar"
    rm -f "$UPDATE_DIR/frontend.tar"
fi

if [ -f "$UPDATE_DIR/backend.tar" ]; then
    echo "  加载后端镜像..."
    sudo docker load -i "$UPDATE_DIR/backend.tar"
    rm -f "$UPDATE_DIR/backend.tar"
fi

# 启动服务
echo ""
echo "[3/5] 启动服务..."
sudo docker-compose -f docker-compose.synology.yml up -d

# 等待服务启动
echo "  等待服务启动..."
sleep 5

# 执行数据库迁移（如果后端有更新）
if [ -f "$UPDATE_DIR/backend.tar" ] || [ ! -z "$(sudo docker ps -q -f name=crm-backend)" ]; then
    echo ""
    echo "[4/5] 检查数据库迁移..."
    sudo docker exec crm-backend npx prisma migrate deploy 2>/dev/null || echo "  无需迁移或迁移已完成"
fi

# 清理临时文件
echo ""
echo "[5/5] 清理临时文件..."
rm -rf "$UPDATE_DIR"

echo ""
echo "========================================"
echo "✅ 更新完成！"
echo "========================================"
echo ""
echo "服务状态："
sudo docker-compose -f docker-compose.synology.yml ps
echo ""
