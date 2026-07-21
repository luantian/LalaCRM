@echo off
echo 正在重启后端服务...
echo.

REM 切换到脚本所在目录的 backend 子目录（使用绝对路径，避免从其他目录调用时出错）
cd /d "%~dp0backend"

echo 1. 停止现有Node进程...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo 2. 生成Prisma Client...
call npx prisma generate

echo 3. 启动后端服务...
start "CRM Backend" cmd /k "npm run dev"

echo.
echo 服务已启动！
echo 后端API: http://localhost:5000
echo 前端界面: http://localhost:3000
echo.
pause
