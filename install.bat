@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo   耳界 EARVERSE - 一键安装 (Windows)
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
