@echo off
chcp 65001 >nul
echo ========================================
echo   CRM 一键部署工具
echo ========================================
echo.

:: 配置信息（根据实际情况修改）
set SYNOLOGY_IP=192.168.2.13
set SYNOLOGY_USER=admin
set SYNOLOGY_PORT=22
set SYNOLOGY_PATH=/volume1/docker/crm-system

:: 检查 build 目录
if not exist build (
    echo ❌ build 目录不存在，请先运行 build-for-synology.bat
    pause
    exit /b 1
)

:: 检查 tar 文件
echo 检查镜像文件...
set HAS_FRONTEND=0
set HAS_BACKEND=0

if exist build\frontend.tar set HAS_FRONTEND=1
if exist build\backend.tar set HAS_BACKEND=1

if %HAS_FRONTEND%==0 if %HAS_BACKEND%==0 (
    echo ❌ 未找到任何镜像文件
    echo 请先运行 build-for-synology.bat 构建镜像
    pause
    exit /b 1
)

:: 显示将要部署的内容
echo.
echo 即将部署：
if %HAS_FRONTEND%==1 echo   ✓ 前端镜像
if %HAS_BACKEND%==1 echo   ✓ 后端镜像
echo.
echo 目标服务器：%SYNOLOGY_IP%:%SYNOLOGY_PORT%
echo 目标路径：%SYNOLOGY_PATH%
echo.

:: 确认
set /p confirm=确认部署？(Y/N): 
if /i not "%confirm%"=="Y" (
    echo 已取消
    pause
    exit /b 0
)

echo.
echo ========================================
echo   开始部署...
echo ========================================
echo.

:: 创建远程临时目录
echo [1/5] 准备远程环境...
ssh -p %SYNOLOGY_PORT% %SYNOLOGY_USER%@%SYNOLOGY_IP% "mkdir -p /tmp/crm-update"
if errorlevel 1 (
    echo ❌ SSH 连接失败，请检查网络和 SSH 配置
    pause
    exit /b 1
)

:: 上传镜像文件
if %HAS_FRONTEND%==1 (
    echo.
    echo [2/5] 上传前端镜像...
    scp -P %SYNOLOGY_PORT% build\frontend.tar %SYNOLOGY_USER%@%SYNOLOGY_IP%:/tmp/crm-update/
    if errorlevel 1 goto upload-error
)

if %HAS_BACKEND%==1 (
    echo.
    echo [3/5] 上传后端镜像...
    scp -P %SYNOLOGY_PORT% build\backend.tar %SYNOLOGY_USER%@%SYNOLOGY_IP%:/tmp/crm-update/
    if errorlevel 1 goto upload-error
)

:: 上传更新脚本
echo.
echo [4/5] 上传更新脚本...
scp -P %SYNOLOGY_PORT% update.sh %SYNOLOGY_USER%@%SYNOLOGY_IP%:/tmp/crm-update/
if errorlevel 1 goto upload-error

:: 执行远程更新
echo.
echo [5/5] 执行远程更新...
ssh -p %SYNOLOGY_PORT% %SYNOLOGY_USER%@%SYNOLOGY_IP% "sudo -S bash /tmp/crm-update/update.sh %SYNOLOGY_PATH%"
if errorlevel 1 (
    echo.
    echo ❌ 远程更新失败
    pause
    exit /b 1
)

:: 清理本地临时文件（可选）
:: del /q build\*.tar

echo.
echo ========================================
echo ✅ 部署完成！
echo ========================================
echo.
echo 访问地址：http://%SYNOLOGY_IP%:8880
echo.
pause
exit /b 0

:upload-error
echo.
echo ❌ 文件上传失败
pause
exit /b 1
