@echo off
title CRM System Startup

echo ============================================
echo   CRM System - Starting Up
echo ============================================
echo.

echo [0/4] Stopping existing services...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [1/4] Generating Prisma Client...
cd backend
call npx prisma generate
cd ..
echo.

echo [2/4] Starting backend service (port 5000)...
start "CRM Backend" cmd /k "cd backend && npm run dev"
echo.

echo [3/4] Waiting for backend initialization...
timeout /t 3 /nobreak >nul
echo.

echo [4/4] Starting frontend service (port 3000)...
start "CRM Frontend" cmd /k "cd frontend && npm run dev"
echo.

echo ============================================
echo   Startup completed!
echo.
echo   Backend API : http://localhost:5000
echo   Frontend    : http://localhost:3000
echo ============================================
echo.
echo Close the two command windows to stop services
echo.
pause
