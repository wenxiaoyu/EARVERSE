#!/bin/bash
# 服务管理：自动识别 LaunchDaemon（开机自启）或 LaunchAgent（登录自启）。
# 用法：start | stop | restart | status | logs | uninstall
set -e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

DAEMON_PLIST="/Library/LaunchDaemons/$COACH_LABEL.plist"
AGENT_PLIST="$HOME/Library/LaunchAgents/$COACH_LABEL.plist"

if [ -f "$DAEMON_PLIST" ]; then
  MODE="daemon"; DOMAIN="system"; PLIST="$DAEMON_PLIST"; SUDO="sudo"
else
  MODE="agent"; DOMAIN="gui/$COACH_UID"; PLIST="$AGENT_PLIST"; SUDO=""
fi

cmd="${1:-status}"

wait_health() {
  for i in $(seq 1 25); do
    if curl -sf "http://$COACH_HOST:$COACH_PORT/api/health" >/dev/null 2>&1; then
      echo "✅ 就绪 http://$COACH_HOST:$COACH_PORT"; return 0
    fi
    sleep 1
  done
  echo "⚠ 未在 25 秒内就绪，查看日志：$0 logs"; return 1
}

case "$cmd" in
  start)
    $SUDO launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null || $SUDO launchctl kickstart "$DOMAIN/$COACH_LABEL"
    echo "已启动 [$MODE]"; wait_health ;;
  stop)
    $SUDO launchctl bootout "$DOMAIN/$COACH_LABEL" 2>/dev/null || true
    echo "已停止 [$MODE]. plist 保留, 重启/登录仍会自启" ;;
  restart)
    echo "[restart] 构建前端…"; "$APP_ROOT/scripts/build.sh"
    echo "[restart] 重启服务 [$MODE]..."
    $SUDO launchctl kickstart -k "$DOMAIN/$COACH_LABEL"
    wait_health ;;
  status)
    echo "模式: $MODE ($DOMAIN)"
    if $SUDO launchctl print "$DOMAIN/$COACH_LABEL" >/dev/null 2>&1; then
      echo "● 已加载 $COACH_LABEL"
      $SUDO launchctl print "$DOMAIN/$COACH_LABEL" | grep -E "state =|pid =|runatload|keepalive" | sed 's/^/  /'
    else
      echo "○ 未加载"
    fi
    if curl -sf "http://$COACH_HOST:$COACH_PORT/api/health" >/dev/null 2>&1; then
      echo "● HTTP：$(curl -s "http://$COACH_HOST:$COACH_PORT/api/health")"
    else
      echo "○ HTTP 无响应"
    fi ;;
  logs)
    tail -n 100 -f "$APP_ROOT/logs/coach.out.log" "$APP_ROOT/logs/coach.err.log" ;;
  uninstall)
    $SUDO launchctl bootout "$DOMAIN/$COACH_LABEL" 2>/dev/null || true
    $SUDO rm -f "$PLIST"
    echo "已卸载 [$MODE]. 不再自启" ;;
  *)
    echo "用法: $0 {start|stop|restart|status|logs|uninstall}"; exit 2 ;;
esac
