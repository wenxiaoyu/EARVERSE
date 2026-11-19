#!/bin/bash
# launchd 入口：先构建一次前端，再交给监督器（前端 watch + 后端 reload）。
set -e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

mkdir -p "$APP_ROOT/logs"
echo "[serve] $(date '+%F %T') 启动，$COACH_HOST:$COACH_PORT"

# 启动前保证 dist 存在（首次/清空后）
"$APP_ROOT/scripts/build.sh"

exec "$PYTHON" "$APP_ROOT/scripts/supervise.py"
