#!/bin/bash
# 耳界 EARVERSE · 卸载（macOS / Linux）
#
# 会做：停服务 → 卸开机自启 → 关进程 → 删桌面图标/缓存 → 清理安装目录
#
# 用法：
#   ./app/scripts/uninstall.sh                 # 交互确认，默认保留学习数据
#   ./app/scripts/uninstall.sh --yes           # 不确认，默认保留学习数据
#   ./app/scripts/uninstall.sh --purge-data    # 连学习数据一起删
#   ./app/scripts/uninstall.sh --dry-run       # 只打印将要做什么
#   ./app/scripts/uninstall.sh --force         # 允许删除 git 仓库目录（危险）
set -euo pipefail
# 旧版 env.sh 在 set -u 下会报 PYTHON: unbound variable，这里临时关掉
set +u
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"
set -u
ROOT="$(cd "$APP_ROOT/.." && pwd)"

YES=0
KEEP_DATA=1
DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --keep-data) KEEP_DATA=1 ;;
    --purge-data|--purge) KEEP_DATA=0 ;;
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '3,14p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg"; exit 2 ;;
  esac
done

OS="$(uname -s)"
say() { printf '\033[33m[earverse]\033[0m %s\n' "$*"; }
ok()  { printf '\033[1m[earverse]\033[0m %s\n' "$*"; }
warn(){ printf '\033[31m[earverse]\033[0m %s\n' "$*"; }
run() { if [ "$DRY_RUN" = "1" ]; then say "DRY: $*"; else "$@"; fi; }

APP_NAME="耳界 EARVERSE"
DAEMON_PLIST="/Library/LaunchDaemons/$COACH_LABEL.plist"
AGENT_PLIST="$HOME/Library/LaunchAgents/$COACH_LABEL.plist"

# 判断是不是开发仓库（有 .git 时保护代码，只清运行产物）
DEV_REPO=0
if [ -d "$ROOT/.git" ]; then DEV_REPO=1; fi

say "安装目录：$ROOT"
if [ "$DEV_REPO" = "1" ]; then
  warn "检测到这是 git 仓库（开发目录），不会删除代码，只清理运行产物。"
fi

if [ "$YES" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  printf "确认卸载耳界 EARVERSE？[y/N] "
  read -r a
  case "$a" in y|Y|yes|YES) ;; *) echo "已取消"; exit 0 ;; esac
  if [ "$KEEP_DATA" = "1" ]; then
    printf "保留学习数据（profiles.db / 配置）？[Y/n] "
    read -r b
    case "$b" in n|N|no|NO) KEEP_DATA=0 ;; esac
  fi
fi

# ---------- 1. 开机自启 ----------
if [ -f "$DAEMON_PLIST" ]; then
  say "卸载 LaunchDaemon（需要 sudo）…"
  if [ "$DRY_RUN" = "1" ]; then
    say "DRY: sudo launchctl bootout system/$COACH_LABEL; sudo rm -f $DAEMON_PLIST"
  else
    sudo launchctl bootout "system/$COACH_LABEL" 2>/dev/null || true
    sudo rm -f "$DAEMON_PLIST"
  fi
elif [ -f "$AGENT_PLIST" ]; then
  say "卸载 LaunchAgent…"
  run launchctl bootout "gui/$COACH_UID/$COACH_LABEL" || true
  run rm -f "$AGENT_PLIST"
else
  say "未发现开机自启配置，跳过"
fi

# ---------- 2. 进程 ----------
say "关闭相关进程…"
if [ "$DRY_RUN" = "1" ]; then
  say "DRY: pkill -f 'uvicorn app.main:app' / supervise.py / EARVERSE chrome profile"
else
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -f "scripts/supervise.py" 2>/dev/null || true
  pkill -f "EARVERSE/chrome-profile" 2>/dev/null || true
fi

# ---------- 3. 图标与缓存 ----------
say "删除桌面图标与缓存…"
case "$OS" in
  Darwin)
    run rm -rf "$HOME/Applications/$APP_NAME.app"
    run rm -rf "$HOME/Desktop/$APP_NAME.app"
    run rm -rf "$HOME/Library/Application Support/EARVERSE"
    run rm -f  "$HOME/Library/Logs/EARVERSE-launch.log"
    ;;
  Linux)
    run rm -f "$HOME/.local/share/applications/earverse.desktop"
    run rm -f "$HOME/Desktop/earverse.desktop"
    run rm -rf "$HOME/.config/earverse"
    ;;
esac

# ---------- 4. 安装目录 ----------
DATA_DIR="$ROOT/app/backend/data"
if [ "$DEV_REPO" = "1" ]; then
  say "清理运行产物（保留代码）…"
  run rm -rf "$ROOT/.venv" "$ROOT/.runtime"
  run rm -rf "$ROOT/app/frontend/node_modules" "$ROOT/app/frontend/dist"
  run rm -rf "$ROOT/app/logs"
  if [ "$KEEP_DATA" = "1" ]; then
    say "保留学习数据：${DATA_DIR}"
  else
    run rm -rf "${DATA_DIR}"
  fi
elif [ "$KEEP_DATA" = "1" ]; then
  say "保留学习数据：${DATA_DIR}（重装会自动复用）"
  if [ "$DRY_RUN" = "1" ]; then
    say "DRY: 删除 $ROOT 下除 app/backend/data 之外的内容"
  else
    find "$ROOT" -mindepth 1 -maxdepth 1 ! -name app -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT/app" -mindepth 1 -maxdepth 1 ! -name backend -exec rm -rf {} + 2>/dev/null || true
    find "$ROOT/app/backend" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} + 2>/dev/null || true
  fi
else
  if [ "$FORCE" != "1" ] && [ "$DRY_RUN" != "1" ]; then
    warn "将删除整个目录：$ROOT"
    printf "再确认一次？[y/N] "
    read -r c
    case "$c" in y|Y) ;; *) echo "已取消"; exit 0 ;; esac
  fi
  say "删除安装目录：$ROOT"
  run rm -rf "$ROOT"
fi

ok "卸载完成。"
if [ "$KEEP_DATA" = "1" ]; then
  echo "  学习数据仍在：${DATA_DIR}"
  echo "  重新安装时会自动复用。"
fi
