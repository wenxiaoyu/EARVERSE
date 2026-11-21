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

# ---------- 运行时：系统优先，缺失则自动装便携版（无需管理员） ----------
$NodeVersion = "20.18.1"
$CondaVersion = "py312_24.9.2-0"
$Runtime = if ($env:EARVERSE_RUNTIME) { $env:EARVERSE_RUNTIME } else { Join-Path $Root ".runtime" }

function Download-To([string]$out, [string[]]$urls) {
  foreach ($u in $urls) {
    if (-not $u) { continue }
    Log "下载：$u"
    try {
      Invoke-WebRequest -Uri $u -OutFile $out -UseBasicParsing -TimeoutSec 900
      return $true
    } catch { Log "该源失败，换下一个…" }
  }
  return $false
}

function Ensure-Python {
  $cands = @(
    @{ exe = "python"; args = @() },
    @{ exe = "python3"; args = @() },
    @{ exe = "py"; args = @("-3") }
  )
  foreach ($c in $cands) {
    if (Get-Command $c.exe -ErrorAction SilentlyContinue) {
      & $c.exe @($c.args) -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>$null
      if ($LASTEXITCODE -eq 0) {
        $script:PythonExe = $c.exe
        $script:PythonArgs = $c.args
        Log "Python：$(& $c.exe @($c.args) --version 2>&1)（系统已有）"
        return
      }
    }
  }
  $rtPy = Join-Path $Runtime "python\python.exe"
  if (Test-Path $rtPy) {
    & $rtPy -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) {
      $script:PythonExe = $rtPy
      $script:PythonArgs = @()
      Log "Python：$(& $rtPy --version 2>&1)（便携版已存在）"
      return
    }
  }
  Log "未检测到 Python 3.10+，自动安装便携版（无需管理员）…"
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try {
      winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent | Out-Null
      $env:PATH = [Environment]::GetEnvironmentVariable("PATH","User") + ";" + [Environment]::GetEnvironmentVariable("PATH","Machine")
      if (Get-Command py -ErrorAction SilentlyContinue) {
        $script:PythonExe = "py"
        $script:PythonArgs = @("-3")
        Log "Python：$(& py -3 --version 2>&1)（winget 安装）"
        return
      }
    } catch { Log "winget 安装失败，改用便携版…" }
  }
  $f = "Miniconda3-$CondaVersion-Windows-x86_64.exe"
  New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
  $exe = Join-Path $env:TEMP $f
  $ok = Download-To $exe @(
    "https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/$f",
    "https://repo.anaconda.com/miniconda/$f"
  )
  if (-not $ok) { Die "Python 下载失败，请检查网络或手动安装 Python 3.10+" }
  $dest = Join-Path $Runtime "python"
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  $p = Start-Process -FilePath $exe -ArgumentList @("/InstallationType=JustMe","/RegisterPython=0","/AddToPath=0","/S","/D=$dest") -Wait -PassThru
  if ($p.ExitCode -ne 0) { Die "Python 便携版安装失败（exit $($p.ExitCode)）" }
  $script:PythonExe = Join-Path $dest "python.exe"
  if (-not (Test-Path $script:PythonExe)) { Die "Python 便携版异常：$($script:PythonExe) 不存在" }
  Log "Python：$(& $script:PythonExe --version 2>&1)（便携版）"
}

function Ensure-Node {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    & node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
    if ($LASTEXITCODE -eq 0) { Log "Node：$(& node -v)（系统已有）"; return }
  }
  $rtNodeDir = Join-Path $Runtime "node"
  $rtNode = Join-Path $rtNodeDir "node.exe"
  if (Test-Path $rtNode) {
    & $rtNode -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
    if ($LASTEXITCODE -eq 0) {
      $env:PATH = "$rtNodeDir;$env:PATH"
      Log "Node：$(& $rtNode -v)（便携版已存在）"
      return
    }
  }
  Log "未检测到 Node 18+，自动安装便携版（无需管理员）…"
  $pkg = "node-v$NodeVersion-win-x64.zip"
  New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
  $zip = Join-Path $env:TEMP $pkg
  $ok = Download-To $zip @(
    "https://npmmirror.com/mirrors/node/v$NodeVersion/$pkg",
    "https://nodejs.org/dist/v$NodeVersion/$pkg"
  )
  if (-not $ok) { Die "Node 下载失败，请检查网络或手动安装 Node 18+" }
  $tmp = Join-Path $env:TEMP ("earverse-node-" + [guid]::NewGuid().ToString("N"))
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $dest = Join-Path $Runtime "node"
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Move-Item -Path (Join-Path $tmp "node-v$NodeVersion-win-x64") -Destination $dest
  Remove-Item -Recurse -Force $tmp
  $env:PATH = "$dest;$env:PATH"
  Log "Node：$(& node -v)（便携版）"
}

Ensure-Python
Ensure-Node
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Die "npm 未找到（应随 Node 一起提供，请检查安装）。"
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
