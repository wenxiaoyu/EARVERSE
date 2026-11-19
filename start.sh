#!/usr/bin/env bash
# 耳界 EARVERSE · 启动（需先运行 ./install.sh）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -x ".venv/Scripts/python.exe" ]; then VPY="$ROOT/.venv/Scripts/python.exe"
elif [ -x ".venv/bin/python" ]; then VPY="$ROOT/.venv/bin/python"
else echo "未安装：请先运行 ./install.sh"; exit 1; fi

cd "$ROOT/app/backend"
echo "[earverse] http://127.0.0.1:8000"
exec "$VPY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
