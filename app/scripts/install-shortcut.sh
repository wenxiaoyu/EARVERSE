#!/bin/bash
# 耳界 EARVERSE · 创建桌面快捷方式（过渡方案）
#
# macOS：生成 ~/Applications/耳界 EARVERSE.app（双击即开 App 模式窗口）
#        并在桌面放一个别名。
# Linux：生成 ~/.local/share/applications/earverse.desktop 并复制到桌面。
# Windows：请用 install-shortcut.ps1。
#
# 用法：./app/scripts/install-shortcut.sh
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

OPEN_APP="$APP_ROOT/scripts/open-app.sh"
APP_NAME="耳界 EARVERSE"
BUNDLE_ID="com.earverse.desktop"
OS="$(uname -s)"

say() { echo "[earverse] $*"; }
chmod +x "$OPEN_APP" || true

make_icon() {
  # 尽力生成 .icns：svg → png → iconset → icns；缺工具则跳过（用系统默认图标）
  local svg="$APP_ROOT/frontend/public/logo.svg"
  local out="$1"
  [ -f "$svg" ] || return 1
  command -v iconutil >/dev/null 2>&1 || return 1
  command -v sips >/dev/null 2>&1 || return 1
  local tmp; tmp="$(mktemp -d)"
  local png="$tmp/logo.png"
  # 用 QuickLook 把 svg 转 png（macOS 自带）
  if command -v qlmanage >/dev/null 2>&1; then
    qlmanage -t -s 1024 -o "$tmp" "$svg" >/dev/null 2>&1 || true
  fi
  [ -f "$tmp/logo.svg.png" ] && mv "$tmp/logo.svg.png" "$png"
  [ -f "$png" ] || { rm -rf "$tmp"; return 1; }
  local set="$tmp/icon.iconset"; mkdir -p "$set"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$png" --out "$set/icon_${s}x${s}.png" >/dev/null 2>&1 || true
    local d=$((s*2))
    sips -z $d $d "$png" --out "$set/icon_${s}x${s}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$set" -o "$out" >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
}

install_macos() {
  local app="$HOME/Applications/$APP_NAME.app"
  local contents="$app/Contents"
  rm -rf "$app"
  mkdir -p "$contents/MacOS" "$contents/Resources"

  cat > "$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>earverse</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSUIElement</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
</dict>
</plist>
PLIST

  cat > "$contents/MacOS/earverse" <<LAUNCH
#!/bin/bash
# 后台启动器：拉起服务 + detach 开窗后立即退出。
# 注：.app 主进程不能阻塞，否则 macOS 会报「应用程序无响应 / -1712」。
mkdir -p "\$HOME/Library/Logs"
export EARVERSE_DETACH=1
exec "$OPEN_APP" >> "\$HOME/Library/Logs/EARVERSE-launch.log" 2>&1
LAUNCH
  chmod +x "$contents/MacOS/earverse"

  if make_icon "$contents/Resources/icon.icns"; then
    say "已生成应用图标"
  else
    say "跳过图标（缺 qlmanage/sips/iconutil）"
  fi

  # 注册到 Launchpad / Spotlight
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" >/dev/null 2>&1 || true

  # 桌面快捷方式：符号链接（双击可启动；之前的 -1712 是主进程阻塞导致，已修）
  rm -rf "$HOME/Desktop/$APP_NAME.app" "$HOME/Desktop/$APP_NAME" 2>/dev/null || true
  ln -sfn "$app" "$HOME/Desktop/$APP_NAME.app" 2>/dev/null || true

  say "已创建：$app"
  say "桌面快捷方式：~/Desktop/$APP_NAME.app（双击即可用）"
  say "启动日志：~/Library/Logs/EARVERSE-launch.log"
  say "启动器：$OPEN_APP"
}

install_linux() {
  local dir="$HOME/.local/share/applications"
  mkdir -p "$dir"
  local file="$dir/earverse.desktop"
  cat > "$file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=AI 英语教练
Exec=$OPEN_APP
Terminal=false
Categories=Education;Languages;
StartupNotify=true
DESKTOP
  chmod +x "$file"
  if [ -d "$HOME/Desktop" ]; then
    cp "$file" "$HOME/Desktop/earverse.desktop" 2>/dev/null || true
    chmod +x "$HOME/Desktop/earverse.desktop" 2>/dev/null || true
  fi
  say "已创建：$file"
}

case "$OS" in
  Darwin) install_macos ;;
  Linux)  install_linux ;;
  *) say "当前系统请用 install-shortcut.ps1（Windows）"; exit 1 ;;
esac
