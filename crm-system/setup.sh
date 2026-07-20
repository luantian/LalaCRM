#!/bin/bash

echo "CRM系统启动脚本"
echo "================"

# 检查PostgreSQL是否运行
echo "检查PostgreSQL连接..."
if ! pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
    echo "警告: PostgreSQL可能未运行"
    echo "请确保PostgreSQL已启动，或使用Docker: docker-compose up -d postgres"
fi

# 后端设置
echo ""
echo "设置后端..."
cd backend

if [ ! -d "node_modules" ]; then
    echo "安装后端依赖..."
    npm install
fi

# 检查数据库
echo "检查数据库..."
if ! npx prisma migrate status > /dev/null 2>&1; then
    echo "初始化数据库..."
    npx prisma migrate dev --name init
fi

# 生成Prisma客户端
npx prisma generate

cd ..

# 前端设置
echo ""
echo "设置前端..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

cd ..

echo ""
echo "================"
echo "设置完成！"
echo ""
echo "启动后端: cd backend && npm run dev"
echo "启动前端: cd frontend && npm run dev"
echo ""
echo "或者使用Docker: docker-compose up -d"
echo "================"
