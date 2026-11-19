#!/bin/bash
# 升级为 LaunchDaemon：开机即启动（无需登录）。需要 sudo。
# 会自动停用并移除旧的 LaunchAgent，避免端口冲突。
set -e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

DAEMON_PLIST="/Library/LaunchDaemons/$COACH_LABEL.plist"
AGENT_PLIST="$HOME/Library/LaunchAgents/$COACH_LABEL.plist"

mkdir -p "$APP_ROOT/logs"

echo "[daemon] 停用旧的 LaunchAgent（若存在）"
launchctl bootout "gui/$COACH_UID/$COACH_LABEL" 2>/dev/null || true
rm -f "$AGENT_PLIST"

echo "[daemon] 写入 $DAEMON_PLIST"
sudo tee "$DAEMON_PLIST" >/dev/null <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$COACH_LABEL</string>
  <key>UserName</key><string>$(id -un)</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$APP_ROOT/scripts/serve.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ProcessType</key><string>Background</string>
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

sudo chown root:wheel "$DAEMON_PLIST"
sudo chmod 644 "$DAEMON_PLIST"

echo "[daemon] 加载到 system 域"
sudo launchctl bootout "system/$COACH_LABEL" 2>/dev/null || true
sudo launchctl bootstrap system "$DAEMON_PLIST"

echo "[daemon] 等待就绪…"
for i in $(seq 1 30); do
  if curl -sf "http://$COACH_HOST:$COACH_PORT/api/health" >/dev/null 2>&1; then
    echo "[daemon] ✅ 开机自启已就位，服务在 http://$COACH_HOST:$COACH_PORT"
    echo "[daemon] 状态：sudo launchctl print system/$COACH_LABEL | head"
    exit 0
  fi
  sleep 1
done
echo "[daemon] ⚠ 30 秒内未就绪，查看日志：$APP_ROOT/scripts/service.sh logs"
exit 1
