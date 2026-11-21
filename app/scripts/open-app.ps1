# 耳界 EARVERSE · 以「桌面 App」方式打开（Windows）
#
# 复用已安装的后端服务，用 Chrome / Edge 的 --app 模式开独立窗口。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\app\scripts\open-app.ps1
#   $env:EARVERSE_DRY_RUN="1"  # 只打印不执行

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $Root "app\backend"))) {
  $Root = (Get-Location).Path
}

$HostAddr = "127.0.0.1"
$Port = 8000
$Url = "http://${HostAddr}:${Port}"
$DryRun = ($env:EARVERSE_DRY_RUN -eq "1")
$ProfileDir = Join-Path $env:LOCALAPPDATA "EARVERSE\chrome-profile"
$Logs = Join-Path $Root "logs"

function Say($m) { Write-Host "[earverse] $m" }
function DoRun([scriptblock]$b) { if ($DryRun) { Say "DRY: $b" } else { & $b } }

function Test-Health {
  try {
    $r = Invoke-WebRequest -Uri "$Url/api/health" -TimeoutSec 2 -UseBasicParsing
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Start-Backend {
  $py = Join-Path $Root ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) { $py = "python" }
  New-Item -ItemType Directory -Force -Path $Logs | Out-Null
  Say "服务未运行，后台启动 uvicorn…"
  if ($DryRun) { Say "DRY: $py -m uvicorn app.main:app --app-dir backend --host $HostAddr --port $Port"; return }
  Start-Process -FilePath $py `
    -ArgumentList @("-m","uvicorn","app.main:app","--app-dir","backend","--host",$HostAddr,"--port","$Port") `
    -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Logs "app.out.log") `
    -RedirectStandardError (Join-Path $Logs "app.err.log") | Out-Null
}

function Wait-Health([int]$seconds = 30) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-Health) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

if (Test-Health) {
  Say "服务已就绪 $Url"
} else {
  Start-Backend
  if (-not $DryRun -and -not (Wait-Health)) {
    Say "启动超时，查看日志：$Logs\app.err.log"
    exit 1
  }
}

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe"
  )
  foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
  return $null
}

$browser = Find-Browser
if ($browser) {
  Say "使用浏览器 App 模式：$(Split-Path -Leaf $browser)"
  DoRun { New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null }
  $args = @(
    "--app=$Url",
    "--window-size=1180,840",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate"
  )
  if ($DryRun) { Say "DRY: $browser $($args -join ' ')" }
  else { Start-Process -FilePath $browser -ArgumentList $args | Out-Null }
  exit 0
}

Say "未找到 Chrome/Edge/Brave，使用系统默认浏览器"
if (-not $DryRun) { Start-Process $Url } else { Say "DRY: Start-Process $Url" }
