#!/usr/bin/env bash
# 耳界 EARVERSE · 跨平台一键安装（macOS / Linux / WSL / Git Bash）
# 用法：./install.sh            安装并启动
#       ./install.sh --no-start 只安装，不启动
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

START=1
for arg in "$@"; do
  case "$arg" in
    --no-start) START=0 ;;
    --start) START=1 ;;
  esac
done

BOLD=""; AMBER=""; RED=""; RESET=""
if [ -t 1 ]; then BOLD="\033[1m"; AMBER="\033[33m"; RED="\033[31m"; RESET="\033[0m"; fi
log()  { printf "${AMBER}[earverse]${RESET} %s\n" "$*"; }
ok()   { printf "${BOLD}[earverse]${RESET} %s\n" "$*"; }
die()  { printf "${RED}[earverse] %s${RESET}\n" "$*" >&2; exit 1; }

# ---------- 平台 ----------
case "$(uname -s)" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  if grep -qi microsoft /proc/version 2>/dev/null; then PLATFORM="WSL"; else PLATFORM="Linux"; fi ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="Windows (Git Bash)" ;;
  *) PLATFORM="$(uname -s)" ;;
esac
log "平台：$PLATFORM"

# ---------- Python ----------
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && \
     "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
[ -n "$PY" ] || die "未找到 Python 3.10+。请先安装：
  macOS: brew install python
  Ubuntu/Debian: sudo apt install python3 python3-venv
  Windows: https://www.python.org/downloads/（或 winget install Python.Python.3.12）"
log "Python：$("$PY" --version 2>&1)"

# ---------- Node ----------
command -v node >/dev/null 2>&1 || die "未找到 Node.js。请安装 Node 18+：
  macOS: brew install node
  Ubuntu/Debian: sudo apt install nodejs npm
  Windows: winget install OpenJS.NodeJS.LTS"
command -v npm >/dev/null 2>&1 || die "未找到 npm（通常随 Node 一起安装）。"
node -e 'const v=process.versions.node.split(".").map(Number); process.exit(v[0]>=18?0:1)' \
  || die "Node 版本过低，需要 18+（当前 $(node -v)）。"
log "Node：$(node -v)  npm：$(npm -v)"

# ---------- 虚拟环境 ----------
if [ -x ".venv/Scripts/python.exe" ]; then
  VPY=".venv/Scripts/python.exe"
elif [ -x ".venv/bin/python" ]; then
  VPY=".venv/bin/python"
else
  log "创建 Python 虚拟环境 .venv …"
  "$PY" -m venv .venv
  if [ -x ".venv/Scripts/python.exe" ]; then VPY=".venv/Scripts/python.exe"; else VPY=".venv/bin/python"; fi
fi

log "安装后端依赖…"
"$VPY" -m pip install --upgrade pip >/dev/null
"$VPY" -m pip install -r app/backend/requirements.txt

# ---------- 前端 ----------
log "安装前端依赖并构建…"
(
  cd app/frontend
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npm run build
)

ok "安装完成。"

# ---------- 启动 ----------
if [ "$START" = "0" ]; then
  echo
  echo "启动：./start.sh        → http://127.0.0.1:8000"
  exit 0
fi

if ! "$VPY" - <<'PY' 2>/dev/null
import socket, sys
s = socket.socket()
try:
    s.bind(("127.0.0.1", 8000))
    s.close()
except OSError:
    sys.exit(1)
PY
then
  ok "8000 端口已被占用：可能服务已在运行。"
  echo "打开 http://127.0.0.1:8000 即可；停止后再用 ./start.sh 启动。"
  exit 0
fi

ok "启动服务：http://127.0.0.1:8000"
cd app/backend
exec "$(cd "$ROOT" && echo "$VPY")" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
