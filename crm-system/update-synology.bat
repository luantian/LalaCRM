@echo off
chcp 65001 >nul
echo ========================================
echo   CRM 系统更新工具（群晖版）
echo ========================================
echo.

:: 检查 Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker 未运行，请先启动 Docker Desktop
    pause
    exit /b 1
)

:: 询问更新类型
echo 请选择要更新的内容：
echo 1. 只更新前端
echo 2. 只更新后端
echo 3. 更新前后端（完整更新）
echo.
set /p choice=请输入选项 (1/2/3): 

if "%choice%"=="1" goto update-frontend
if "%choice%"=="2" goto update-backend
if "%choice%"=="3" goto update-all
echo ❌ 无效选项
pause
exit /b 1

:update-frontend
echo.
echo 🔄 构建前端镜像...
docker buildx build --platform linux/arm64 -t crm-frontend:arm64 --load ./frontend
if errorlevel 1 goto error
echo 📦 导出镜像...
docker save crm-frontend:arm64 -o build/frontend.tar
if errorlevel 1 goto error
echo ✅ 前端镜像已导出到 build/frontend.tar
goto done

:update-backend
echo.
echo 🔄 构建后端镜像...
docker buildx build --platform linux/arm64 -t crm-backend:arm64 --load ./backend
if errorlevel 1 goto error
echo 📦 导出镜像...
docker save crm-backend:arm64 -o build/backend.tar
if errorlevel 1 goto error
echo ✅ 后端镜像已导出到 build/backend.tar
goto done

:update-all
echo.
echo 🔄 构建前端镜像...
docker buildx build --platform linux/arm64 -t crm-frontend:arm64 --load ./frontend
if errorlevel 1 goto error
echo 🔄 构建后端镜像...
docker buildx build --platform linux/arm64 -t crm-backend:arm64 --load ./backend
if errorlevel 1 goto error
echo 📦 导出镜像...
docker save crm-frontend:arm64 -o build/frontend.tar
docker save crm-backend:arm64 -o build/backend.tar
if errorlevel 1 goto error
echo ✅ 前后端镜像已导出
goto done

:error
echo ❌ 构建失败
pause
exit /b 1

:done
echo.
echo ========================================
echo ✅ 构建完成！
echo.
echo 下一步操作：
echo 1. 将 build 目录下的 .tar 文件上传到群晖
echo    /volume1/docker/crm-system/build/
echo.
echo 2. SSH 登录群晖执行：
echo    cd /volume1/docker/crm-system
echo    sudo docker-compose -f docker-compose.synology.yml down
echo    sudo docker load -i build/frontend.tar
echo    sudo docker load -i build/backend.tar
echo    sudo docker-compose -f docker-compose.synology.yml up -d
echo.
echo 3. 如果有数据库变更，执行迁移：
echo    sudo docker exec -it crm-backend npx prisma migrate deploy
echo ========================================
pause
