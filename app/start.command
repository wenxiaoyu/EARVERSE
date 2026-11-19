#!/bin/bash
# 一键启动 AI 英语教练：后端 FastAPI 同时托管前端构建产物。
# 首次使用请先：cd app/frontend && npm install && npm run build
set -e
cd "$(dirname "$0")"

# 优先用虚拟环境；没有就用系统 python3
if [ -d ".venv" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

echo "启动 AI 英语教练 → http://127.0.0.1:8000"
exec "$PY" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
