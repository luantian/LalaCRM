@echo off
REM ===================================================
REM  本地构建 ARM64 镜像（用于群晖 DS223j）
REM  双击运行
REM ===================================================

echo === 1. 初始化 buildx ===
docker buildx create --name synology-builder --use 2>nul || docker buildx use synology-builder
docker buildx inspect --bootstrap

echo.
echo === 2. 创建 build 目录 ===
if not exist build mkdir build

echo.
echo === 3. 构建后端镜像 (ARM64) ===
docker buildx build --platform linux/arm64 --tag crm-backend:synology --output "type=docker,dest=./build/backend.tar" ./backend
if errorlevel 1 (
    echo 后端构建失败！
    pause
    exit /b 1
)

echo.
echo === 4. 构建前端镜像 (ARM64) ===
docker buildx build --platform linux/arm64 --tag crm-frontend:synology --output "type=docker,dest=./build/frontend.tar" ./frontend
if errorlevel 1 (
    echo 前端构建失败！
    pause
    exit /b 1
)

echo.
echo === 5. 拉取 PostgreSQL ARM64 镜像 ===
docker pull --platform linux/arm64 postgres:15-alpine
docker save postgres:15-alpine -o ./build/postgres.tar
if errorlevel 1 (
    echo PostgreSQL 镜像导出失败！
    pause
    exit /b 1
)

echo.
echo ===================================================
echo 构建完成！
echo ===================================================
echo.
echo 输出文件在 build 目录：
dir build
echo.
echo 下一步：
echo   1. 把 build 目录里的 3 个 .tar 文件上传到群晖
echo   2. SSH 登录群晖执行：
echo      docker load -i /volume1/docker/build/backend.tar
echo      docker load -i /volume1/docker/build/frontend.tar
echo      docker load -i /volume1/docker/build/postgres.tar
echo   3. 启动服务：
echo      cd /volume1/docker/crm-system
echo      docker-compose -f docker-compose.synology.yml up -d
echo.
pause
