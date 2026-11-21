# 耳界 EARVERSE · 创建桌面快捷方式（Windows 过渡方案）
#
# 生成 %LOCALAPPDATA%\EARVERSE\open-app.cmd，
# 并在桌面创建一个带浏览器图标的「耳界 EARVERSE」快捷方式。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\app\scripts\install-shortcut.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $Root "app\backend"))) {
  $Root = (Get-Location).Path
}

$OpenPs1 = Join-Path $Root "app\scripts\open-app.ps1"
$AppName = "耳界 EARVERSE"
$WorkDir = Join-Path $env:LOCALAPPDATA "EARVERSE"
$CmdPath = Join-Path $WorkDir "open-app.cmd"
$Desktop = [Environment]::GetFolderPath("Desktop")
$LnkPath = Join-Path $Desktop "$AppName.lnk"

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

@"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$OpenPs1"
"@ | Set-Content -Path $CmdPath -Encoding ASCII

# 找一个可用的浏览器图标
$icon = $null
$cands = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
foreach ($c in $cands) { if (Test-Path $c) { $icon = $c; break } }

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($LnkPath)
$lnk.TargetPath = $CmdPath
$lnk.WorkingDirectory = $Root
$lnk.WindowStyle = 7
$lnk.Description = "耳界 EARVERSE · AI 英语教练"
if ($icon) { $lnk.IconLocation = "$icon,0" }
$lnk.Save()

Write-Host "[earverse] 已创建桌面快捷方式：$LnkPath" -ForegroundColor Green
Write-Host "[earverse] 启动器：$CmdPath" -ForegroundColor Yellow
