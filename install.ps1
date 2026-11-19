# 耳界 EARVERSE · Windows 一键安装（PowerShell）
# 用法：双击 install.bat，或在 PowerShell 运行：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 --no-start

$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$NoStart = ($args -contains "--no-start") -or ($env:EARVERSE_NO_START -eq "1")
$Update = $args -contains "--update"
$Source = if ($env:EARVERSE_SOURCE) { $env:EARVERSE_SOURCE.ToLower() } else { "auto" }
$Cn = ($args -contains "--cn") -or ($env:EARVERSE_CN -eq "1")
$CustomTarball = $env:EARVERSE_TARBALL
foreach ($a in $args) {
  if ($a -like "--source=*") { $Source = $a.Substring(9).ToLower() }
  if ($a -like "--tarball=*") { $CustomTarball = $a.Substring(10) }
}
function Log($m) { Write-Host "[earverse] $m" -ForegroundColor Yellow }
function Ok($m) { Write-Host "[earverse] $m" -ForegroundColor Green }
function Die($m) {
  Write-Host "[earverse] $m" -ForegroundColor Red
  exit 1
}

if (@("auto","gitee","github","custom") -notcontains $Source) {
  Die "EARVERSE_SOURCE 只支持 auto / gitee / github / custom"
}
if ($Source -eq "custom" -and -not $CustomTarball) {
  Die "EARVERSE_SOURCE=custom 时必须同时设置 EARVERSE_TARBALL"
}

# ---------- 定位代码：本地目录 或 远端下载 ----------
$Root = $null
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "app\backend"))) {
  $Root = $PSScriptRoot
}
if (-not $Root) {
  $Dest = if ($env:EARVERSE_DIR) { $env:EARVERSE_DIR } else { Join-Path $HOME "earverse" }
  $needDownload = $Update -or (-not (Test-Path (Join-Path $Dest "app\backend")))
  if ($needDownload) {
    Log "下载最新代码 → $Dest"
    $stamp = [guid]::NewGuid().ToString("N")
    $zip = Join-Path $env:TEMP "earverse-$stamp.zip"
    $tmp = Join-Path $env:TEMP "earverse-$stamp"
    $giteeZip = "https://gitee.com/fish/earverse/repository/archive/main.zip"
    $githubZip = "https://github.com/wenxiaoyu/EARVERSE/archive/refs/heads/main.zip"
    $candidates = switch ($Source) {
      "gitee"  { @($giteeZip) }
      "github" { @($githubZip) }
      "custom" { @($CustomTarball) }
      default  { @($giteeZip, $githubZip) }
    }
    $src = $null
    foreach ($url in $candidates) {
      if (-not $url) { continue }
      Log "尝试下载：$url"
      try {
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
        if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 180
        Expand-Archive -Path $zip -DestinationPath $tmp -Force
        $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
        if ($src) { break }
      } catch {
        Log "该源不可用，换下一个…"
      }
    }
    if (-not $src) { Die "下载失败。请检查网络，或设置 EARVERSE_SOURCE / EARVERSE_TARBALL 指定源。" }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $backup = Join-Path $Dest ".earverse-data-preserve"
    if (Test-Path (Join-Path $Dest "app\backend\data")) {
      if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
      Move-Item (Join-Path $Dest "app\backend\data") $backup
    }
    Copy-Item (Join-Path $src.FullName "*") $Dest -Recurse -Force
    if (Test-Path $backup) {
      $dataDir = Join-Path $Dest "app\backend\data"
      if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse -Force }
      Move-Item $backup $dataDir
    }
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Log "已安装：${Dest}（加 --update 更新代码）"
  }
  $Root = $Dest
}
Set-Location $Root
Log "目录：$Root"
Log "平台：Windows"

# ---------- 国内镜像 ----------
if ($Cn) {
  if (-not $env:PIP_INDEX_URL) { $env:PIP_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple" }
  if (-not $env:npm_config_registry) { $env:npm_config_registry = "https://registry.npmmirror.com" }
  Log "使用国内镜像：pip / npm"
}

# ---------- Python ----------
$PythonExe = $null
$PythonArgs = @()
$candidates = @(
  @{ exe = "python"; args = @() },
  @{ exe = "python3"; args = @() },
  @{ exe = "py"; args = @("-3") }
)
foreach ($c in $candidates) {
  if (Get-Command $c.exe -ErrorAction SilentlyContinue) {
    & $c.exe @($c.args) -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) {
      $PythonExe = $c.exe
      $PythonArgs = $c.args
      break
    }
  }
}
if (-not $PythonExe) {
  Die "未找到 Python 3.10+。请安装：winget install Python.Python.3.12（或 https://www.python.org/downloads/）"
}
$pyVer = (& $PythonExe @PythonArgs --version 2>&1)
Log "Python：$pyVer"

# ---------- Node ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die "未找到 Node.js。请安装 Node 18+：winget install OpenJS.NodeJS.LTS"
}
& node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if ($LASTEXITCODE -ne 0) {
  Die "Node 版本过低，需要 18+（当前 $(& node -v)）。"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Die "未找到 npm（通常随 Node 一起安装）。"
}
Log "Node：$(& node -v)  npm：$(& npm -v)"

# ---------- 虚拟环境 ----------
$Vpy = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Vpy)) {
  Log "创建 Python 虚拟环境 .venv …"
  & $PythonExe @PythonArgs -m venv (Join-Path $Root ".venv")
  if ($LASTEXITCODE -ne 0) { Die "创建虚拟环境失败。" }
}
if (-not (Test-Path $Vpy)) { Die "虚拟环境创建失败：$Vpy" }

Log "安装后端依赖…"
& $Vpy -m pip install --upgrade pip | Out-Null
& $Vpy -m pip install -r (Join-Path $Root "app\backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { Die "后端依赖安装失败。" }

# ---------- 前端 ----------
Log "安装前端依赖并构建…"
Push-Location (Join-Path $Root "app\frontend")
try {
  if (Test-Path "package-lock.json") { & npm ci } else { & npm install }
  if ($LASTEXITCODE -ne 0) { Die "前端依赖安装失败。" }
  & npm run build
  if ($LASTEXITCODE -ne 0) { Die "前端构建失败。" }
} finally {
  Pop-Location
}

Ok "安装完成。"

# ---------- 启动 ----------
if ($NoStart) {
  Write-Host ""
  Write-Host "启动：双击 start.bat → http://127.0.0.1:8000"
  exit 0
}

function Test-PortFree([int]$port) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
    $l.Start()
    $l.Stop()
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-PortFree 8000)) {
  Ok "8000 端口已被占用：可能服务已在运行。"
  Write-Host "打开 http://127.0.0.1:8000 即可；停止后再用 start.bat 启动。"
  exit 0
}

Ok "启动服务：http://127.0.0.1:8000"
Set-Location (Join-Path $Root "app\backend")
& $Vpy -m uvicorn app.main:app --host 127.0.0.1 --port 8000
