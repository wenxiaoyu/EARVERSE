@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo 未安装：请先双击 install.bat
  pause
  exit /b 1
)
echo [earverse] http://127.0.0.1:8000
cd /d "%~dp0app\backend"
"%~dp0.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
