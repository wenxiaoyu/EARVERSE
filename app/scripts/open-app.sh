#!/bin/bash
# 耳界 EARVERSE · 以「桌面 App」方式打开
#
# 原理：复用已有一键安装的后端服务，用 Chromium 的 --app 模式开一个
# 无地址栏的独立窗口，看起来就是一个桌面应用，无需 Electron 打包。
#
# 用法：
#   ./app/scripts/open-app.sh              # 启动并打开
#   EARVERSE_DRY_RUN=1 ./app/scripts/open-app.sh   # 只打印将要做什么
#
# 找不到 Chrome/Edge/Brave/Chromium 时，回退到系统默认浏览器。
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

URL="http://$COACH_HOST:$COACH_PORT"
DRY_RUN="${EARVERSE_DRY_RUN:-0}"
OS="$(uname -s)"

case "$OS" in
  Darwin) PROFILE_DIR="$HOME/Library/Application Support/EARVERSE/chrome-profile" ;;
  *)      PROFILE_DIR="$HOME/.config/earverse/chrome-profile" ;;
esac

say() { echo "[earverse] $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then say "DRY: $*"; else "$@"; fi; }

health_ok() { curl -sf --max-time 2 "$URL/api/health" >/dev/null 2>&1; }

start_backend() {
  local py="$APP_ROOT/.venv/bin/python"
  [ -x "$py" ] || py="${PYTHON:-python3}"
  mkdir -p "$APP_ROOT/logs"
  say "服务未运行，后台启动 uvicorn…"
  if [ "$DRY_RUN" = "1" ]; then
    say "DRY: $py -m uvicorn app.main:app --app-dir backend --host $COACH_HOST --port $COACH_PORT"
    return 0
  fi
  (
    cd "$APP_ROOT"
    nohup "$py" -m uvicorn app.main:app --app-dir backend \
      --host "$COACH_HOST" --port "$COACH_PORT" \
      >> "$APP_ROOT/logs/app.out.log" 2>&1 &
    echo $! > "$APP_ROOT/logs/app.pid"
  )
}

ensure_server() {
  health_ok && { say "服务已就绪 $URL"; return 0; }
  start_backend
  [ "$DRY_RUN" = "1" ] && return 0
  for _ in $(seq 1 30); do
    health_ok && { say "服务已就绪 $URL"; return 0; }
    sleep 1
  done
  say "启动超时，查看日志：$APP_ROOT/logs/app.out.log"
  return 1
}

find_browser() {
  case "$OS" in
    Darwin)
      local p
      for p in \
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
        "/Applications/Chromium.app/Contents/MacOS/Chromium" \
        "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
        [ -x "$p" ] && { printf '%s' "$p"; return 0; }
      done ;;
    *)
      local c
      for c in google-chrome google-chrome-stable chromium chromium-browser \
               microsoft-edge brave-browser; do
        command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return 0; }
      done ;;
  esac
  return 1
}

ensure_server

BROWSER="$(find_browser || true)"
if [ -n "$BROWSER" ]; then
  say "使用浏览器 App 模式：$(basename "$BROWSER")"
  run mkdir -p "$PROFILE_DIR"
  run "$BROWSER" \
    --app="$URL" \
    --window-size=1180,840 \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=Translate
  exit 0
fi

say "未找到 Chromium 内核浏览器，使用系统默认浏览器"
case "$OS" in
  Darwin) run open "$URL" ;;
  *)      run xdg-open "$URL" 2>/dev/null || run sensible-browser "$URL" ;;
esac
