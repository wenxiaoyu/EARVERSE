# 耳界 EARVERSE · 卸载（Windows）
#
# 用法（在安装目录里跑）：
#   powershell -ExecutionPolicy Bypass -File .\app\scripts\uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File .\app\scripts\uninstall.ps1 -Yes -PurgeData
#   powershell -ExecutionPolicy Bypass -File .\app\scripts\uninstall.ps1 -DryRun

param(
  [switch]$Yes,
  [switch]$PurgeData,
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $Root "app\backend"))) { $Root = (Get-Location).Path }

$AppName = "耳界 EARVERSE"
$DataDir = Join-Path $Root "app\backend\data"
$DevRepo = Test-Path (Join-Path $Root ".git")

function Say($m) { Write-Host "[earverse] $m" }
function Ok($m) { Write-Host "[earverse] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[earverse] $m" -ForegroundColor Red }
function Run([scriptblock]$b) { if ($DryRun) { Say "DRY: $b" } else { & $b } }

Say "安装目录：$Root"
if ($DevRepo) { Warn "检测到这是 git 仓库（开发目录），不会删除代码，只清理运行产物。" }

if (-not $Yes -and -not $DryRun) {
  $a = Read-Host "确认卸载耳界 EARVERSE？[y/N]"
  if ($a -notmatch '^(y|Y|yes|YES)$') { Write-Host "已取消"; exit 0 }
  if (-not $PurgeData) {
    $b = Read-Host "保留学习数据（profiles.db / 配置）？[Y/n]"
    if ($b -match '^(n|N|no|NO)$') { $PurgeData = $true }
  }
}

# 1. 进程
Say "关闭相关进程…"
if (-not $DryRun) {
  $procs = Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'uvicorn' -and $_.CommandLine -match 'app\.main:app' }
  foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force } catch {} }
}

# 2. 图标 / 数据
Say "删除桌面快捷方式与 App 数据…"
Run { Remove-Item (Join-Path $env:USERPROFILE "Desktop\$AppName.lnk") -Force -ErrorAction SilentlyContinue }
Run { Remove-Item (Join-Path $env:LOCALAPPDATA "EARVERSE") -Recurse -Force -ErrorAction SilentlyContinue }
$startup = [Environment]::GetFolderPath("Startup")
Run { Remove-Item (Join-Path $startup "$AppName.lnk") -Force -ErrorAction SilentlyContinue }

# 3. 目录
if ($DevRepo) {
  Say "清理运行产物（保留代码）…"
  Run { Remove-Item (Join-Path $Root ".venv") -Recurse -Force -ErrorAction SilentlyContinue }
  Run { Remove-Item (Join-Path $Root ".runtime") -Recurse -Force -ErrorAction SilentlyContinue }
  Run { Remove-Item (Join-Path $Root "app\frontend\node_modules") -Recurse -Force -ErrorAction SilentlyContinue }
  Run { Remove-Item (Join-Path $Root "app\frontend\dist") -Recurse -Force -ErrorAction SilentlyContinue }
  Run { Remove-Item (Join-Path $Root "logs") -Recurse -Force -ErrorAction SilentlyContinue }
  if ($PurgeData) { Run { Remove-Item $DataDir -Recurse -Force -ErrorAction SilentlyContinue } }
  else { Say "保留学习数据：$DataDir" }
} elseif (-not $PurgeData) {
  Say "保留学习数据：$DataDir（重装会自动复用）"
  if (-not $DryRun) {
    Get-ChildItem -Path $Root -Force | Where-Object { $_.Name -ne "app" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path (Join-Path $Root "app") -Force | Where-Object { $_.Name -ne "backend" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path (Join-Path $Root "app\backend") -Force | Where-Object { $_.Name -ne "data" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  if (-not $Force -and -not $DryRun) {
    Warn "将删除整个目录：$Root"
    $c = Read-Host "再确认一次？[y/N]"
    if ($c -notmatch '^(y|Y)$') { Write-Host "已取消"; exit 0 }
  }
  Say "删除安装目录：$Root"
  Run { Remove-Item $Root -Recurse -Force }
}

Ok "卸载完成。"
if (-not $PurgeData) { Write-Host "  学习数据仍在：$DataDir" }
