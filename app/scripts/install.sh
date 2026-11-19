#!/bin/bash
# 安装：写 LaunchAgent plist（登录自启 + 崩溃常驻）并立即启动。
set -e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

PLIST="$HOME/Library/LaunchAgents/$COACH_LABEL.plist"
if [ -f "/Library/LaunchDaemons/$COACH_LABEL.plist" ]; then
  echo "检测到已安装 LaunchDaemon（开机自启）。如需改用登录自启，请先："
  echo "  ./app/scripts/service.sh uninstall"
  exit 1
fi
mkdir -p "$APP_ROOT/logs" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$COACH_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$APP_ROOT/scripts/serve.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>WorkingDirectory</key><string>$APP_ROOT</string>
  <key>StandardOutPath</key><string>$APP_ROOT/logs/coach.out.log</string>
  <key>StandardErrorPath</key><string>$APP_ROOT/logs/coach.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>$PATH</string>
    <key>APP_ROOT</key><string>$APP_ROOT</string>
    <key>PYTHON</key><string>$PYTHON</string>
  </dict>
</dict>
</plist>
PLIST_EOF

echo "[install] plist 已写入 $PLIST"

# 卸载旧实例（忽略不存在）
launchctl bootout "gui/$COACH_UID/$COACH_LABEL" 2>/dev/null || true

# 加载并启动（bootstrap 失败时回退 load）
if ! launchctl bootstrap "gui/$COACH_UID" "$PLIST" 2>/dev/null; then
  launchctl load -w "$PLIST"
fi

echo "[install] 已加载。等待服务就绪…"
for i in $(seq 1 20); do
  if curl -sf "http://$COACH_HOST:$COACH_PORT/api/health" >/dev/null 2>&1; then
    echo "[install] ✅ 服务已在 http://$COACH_HOST:$COACH_PORT 运行"
    exit 0
  fi
  sleep 1
done
echo "[install] ⚠ 20 秒内未就绪，请查看日志：$APP_ROOT/scripts/service.sh logs"
exit 1
