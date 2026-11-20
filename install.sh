#!/usr/bin/env bash
# 耳界 EARVERSE · 跨平台安装
#
# 远端一键：
#   国内：curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | bash
#   海外：curl -fsSL https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.sh | bash
#   加参数：curl -fsSL ... | bash -s -- --no-start
#   指定目录：curl -fsSL ... | EARVERSE_DIR="$HOME/apps/earverse" bash
#   国内加速：curl -fsSL ... | EARVERSE_CN=1 bash
#
# 本地仓库：
#   ./install.sh [--no-start] [--update]
set -euo pipefail

REPO_OWNER="wenxiaoyu"
REPO_NAME="EARVERSE"
BRANCH="main"
GITEE_OWNER="fish"
GITEE_REPO="earverse"
GITHUB_TARBALL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.tar.gz"
GITEE_TARBALL="https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/repository/archive/${BRANCH}.tar.gz"
GITEE_API="https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/commits/${BRANCH}"
GITHUB_API="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${BRANCH}"
VERSION_FILE_NAME=".earverse-version"

START=1
UPDATE=0
AUTO_UPDATE=0
CHECK_ONLY=0
NO_UPDATE_CHECK="${EARVERSE_NO_UPDATE_CHECK:-0}"
SOURCE="${EARVERSE_SOURCE:-auto}"
CN="${EARVERSE_CN:-0}"
CUSTOM_TARBALL="${EARVERSE_TARBALL:-}"
for arg in "$@"; do
  case "$arg" in
    --no-start) START=0 ;;
    --start) START=1 ;;
    --update) UPDATE=1 ;;
    --cn) CN=1 ;;
    --check-update) CHECK_ONLY=1 ;;
    --no-update-check) NO_UPDATE_CHECK=1 ;;
    --source=*) SOURCE="${arg#*=}" ;;
    --tarball=*) CUSTOM_TARBALL="${arg#*=}" ;;
    -h|--help)
      cat <<'EOF'
耳界 EARVERSE 安装器

用法：
  ./install.sh                 本地安装并启动
  ./install.sh --no-start      只安装
  ./install.sh --update        更新代码（保留画像/设置）
  ./install.sh --cn            使用国内 pip/npm 镜像
  ./install.sh --check-update  只检查远程是否有新版本
  ./install.sh --no-update-check  跳过自动更新检查
  ./install.sh --source=gitee  强制从 Gitee 下载
  curl -fsSL <install.sh> | bash
  curl -fsSL <install.sh> | bash -s -- --no-start --cn

环境变量：
  EARVERSE_DIR      安装目录（默认 ~/earverse）
  EARVERSE_SOURCE   auto | gitee | github | custom（默认 auto）
  EARVERSE_TARBALL  自定义代码包 URL（配合 source=custom）
  EARVERSE_CN       1 = 使用国内 pip/npm 镜像
  EARVERSE_NO_UPDATE_CHECK  1 = 不检查远程更新
EOF
      exit 0 ;;
  esac
done

BOLD=""; AMBER=""; RED=""; RESET=""
if [ -t 1 ]; then BOLD="\033[1m"; AMBER="\033[33m"; RED="\033[31m"; RESET="\033[0m"; fi
log()  { printf "${AMBER}[earverse]${RESET} %s\n" "$*"; }
ok()   { printf "${BOLD}[earverse]${RESET} %s\n" "$*"; }
die()  { printf "${RED}[earverse] %s${RESET}\n" "$*" >&2; exit 1; }

case "$SOURCE" in
  auto|gitee|github|custom) ;;
  *) die "EARVERSE_SOURCE 只支持 auto / gitee / github / custom" ;;
esac
if [ "$SOURCE" = "custom" ] && [ -z "$CUSTOM_TARBALL" ]; then
  die "EARVERSE_SOURCE=custom 时必须同时设置 EARVERSE_TARBALL"
fi

# 远端最新 commit SHA：优先 Gitee，失败再 GitHub
remote_sha() {
  local api sha
  for api in "$GITEE_API" "$GITHUB_API"; do
    sha="$(curl -fsSL --connect-timeout 5 --max-time 15 \
      -H 'User-Agent: earverse-installer' "$api" 2>/dev/null \
      | grep -oE '"sha"[[:space:]]*:[[:space:]]*"[0-9a-f]{7,}"' \
      | head -n 1 | grep -oE '[0-9a-f]{7,}' || true)"
    if [ -n "$sha" ]; then printf '%s' "$sha"; return 0; fi
  done
  return 1
}

# ---------- 定位代码：本地目录 或 远端下载 ----------
ROOT=""
DEST="${EARVERSE_DIR:-$HOME/earverse}"
SRC="${BASH_SOURCE[0]:-}"
if [ -n "$SRC" ] && [ -f "$SRC" ]; then
  CAND="$(cd "$(dirname "$SRC")" && pwd)"
  if [ -d "$CAND/app/backend" ]; then
    if [ -d "$CAND/.git" ]; then
      # 开发者从源码仓库运行：不自动覆盖当前工作区
      ROOT="$CAND"
    else
      # 已安装目录：继续走远程更新检查
      DEST="$CAND"
    fi
  fi
fi

if [ -n "$ROOT" ] && [ "$CHECK_ONLY" = "1" ]; then
  log "本地仓库模式，跳过远程更新检查"
  exit 0
fi

if [ -z "$ROOT" ]; then
  command -v curl >/dev/null 2>&1 || die "需要 curl 才能远端安装。"
  command -v tar  >/dev/null 2>&1 || die "需要 tar 才能解压。"

  LOCAL_SHA="$(head -n 1 "$DEST/$VERSION_FILE_NAME" 2>/dev/null || true)"
  REMOTE_SHA=""
  if [ "$SOURCE" != "custom" ]; then
    REMOTE_SHA="$(remote_sha || true)"
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    if [ ! -d "$DEST/app/backend" ]; then
      log "尚未安装：$DEST"
    elif [ -z "$REMOTE_SHA" ]; then
      log "无法获取远程版本（网络或 API 不可用）；本地版本：${LOCAL_SHA:-未知}"
    elif [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
      log "已是最新版本：${REMOTE_SHA:0:8}"
    else
      log "发现新版本：${LOCAL_SHA:0:8} → ${REMOTE_SHA:0:8}"
    fi
    exit 0
  fi

  if [ "$UPDATE" != "1" ] && [ "$NO_UPDATE_CHECK" != "1" ] && [ "$SOURCE" != "custom" ] \
     && [ -d "$DEST/app/backend" ] && [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
    log "发现新版本：${LOCAL_SHA:0:8} → ${REMOTE_SHA:0:8}，自动更新"
    UPDATE=1
    AUTO_UPDATE=1
  elif [ "$UPDATE" != "1" ] && [ -d "$DEST/app/backend" ] && [ -n "$REMOTE_SHA" ]; then
    log "已是最新版本：${REMOTE_SHA:0:8}"
  fi

  if [ ! -d "$DEST/app/backend" ] || [ "$UPDATE" = "1" ]; then
    log "下载最新代码 → $DEST"
    TMP="$(mktemp -d)"
    mkdir -p "$TMP/x"

    CANDIDATES=()
    case "$SOURCE" in
      gitee)  CANDIDATES=("$GITEE_TARBALL") ;;
      github) CANDIDATES=("$GITHUB_TARBALL") ;;
      custom) CANDIDATES=("$CUSTOM_TARBALL") ;;
      auto)   CANDIDATES=("$GITEE_TARBALL" "$GITHUB_TARBALL") ;;
    esac

    SRC_DIR=""
    for url in "${CANDIDATES[@]}"; do
      [ -n "$url" ] || continue
      log "尝试：$url"
      rm -rf "$TMP/x"; mkdir -p "$TMP/x"
      if curl -fsSL --connect-timeout 8 --max-time 180 "$url" -o "$TMP/repo.tgz" 2>/dev/null \
         && tar -tzf "$TMP/repo.tgz" >/dev/null 2>&1; then
        tar -xzf "$TMP/repo.tgz" -C "$TMP/x"
        SRC_DIR="$(find "$TMP/x" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
        [ -n "$SRC_DIR" ] && break
      fi
      log "该源不可用，换下一个…"
    done
    if [ -z "$SRC_DIR" ]; then
      if [ "$AUTO_UPDATE" = "1" ] && [ -d "$DEST/app/backend" ]; then
        log "更新下载失败，继续使用已安装版本"
        UPDATE=0
      else
        die "下载失败。请检查网络，或设置 EARVERSE_SOURCE / EARVERSE_TARBALL 指定源。"
      fi
    fi
    rm -f "$TMP/repo.tgz"

    if [ -n "$SRC_DIR" ]; then
      mkdir -p "$DEST"
      # 更新时保留画像与设置
      if [ -d "$DEST/app/backend/data" ]; then
        rm -rf "$DEST/.earverse-data-preserve"
        mv "$DEST/app/backend/data" "$DEST/.earverse-data-preserve"
      fi
      cp -R "$SRC_DIR/." "$DEST/"
      if [ -d "$DEST/.earverse-data-preserve" ]; then
        mkdir -p "$DEST/app/backend"
        rm -rf "$DEST/app/backend/data"
        mv "$DEST/.earverse-data-preserve" "$DEST/app/backend/data"
      fi
      if [ "$SOURCE" != "custom" ] && [ -n "$REMOTE_SHA" ]; then
        printf '%s\n' "$REMOTE_SHA" > "$DEST/$VERSION_FILE_NAME"
      fi
      rm -rf "$TMP"
    fi
  else
    log "已安装：${DEST}（加 --update 更新代码）"
  fi
  ROOT="$DEST"
fi

cd "$ROOT"
case "$(uname -s)" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  if grep -qi microsoft /proc/version 2>/dev/null; then PLATFORM="WSL"; else PLATFORM="Linux"; fi ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="Windows (Git Bash)" ;;
  *) PLATFORM="$(uname -s)" ;;
esac
log "目录：$ROOT"
log "平台：$PLATFORM"

# ---------- Python ----------
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && \
     "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
[ -n "$PY" ] || die "未找到 Python 3.10+。请先安装：
  macOS: brew install python
  Ubuntu/Debian: sudo apt install python3 python3-venv
  Windows: https://www.python.org/downloads/（或 winget install Python.Python.3.12）"
log "Python：$("$PY" --version 2>&1)"

# ---------- Node ----------
command -v node >/dev/null 2>&1 || die "未找到 Node.js。请安装 Node 18+：
  macOS: brew install node
  Ubuntu/Debian: sudo apt install nodejs npm
  Windows: winget install OpenJS.NodeJS.LTS"
command -v npm >/dev/null 2>&1 || die "未找到 npm（通常随 Node 一起安装）。"
node -e 'const v=process.versions.node.split(".").map(Number); process.exit(v[0]>=18?0:1)' \
  || die "Node 版本过低，需要 18+（当前 $(node -v)）。"
log "Node：$(node -v)  npm：$(npm -v)"

# ---------- 国内镜像 ----------
if [ "$CN" = "1" ]; then
  export PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
  export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"
  log "使用国内镜像：pip / npm"
fi

# ---------- 虚拟环境 ----------
if [ -x ".venv/Scripts/python.exe" ]; then
  VPY=".venv/Scripts/python.exe"
elif [ -x ".venv/bin/python" ]; then
  VPY=".venv/bin/python"
else
  log "创建 Python 虚拟环境 .venv …"
  "$PY" -m venv .venv
  if [ -x ".venv/Scripts/python.exe" ]; then VPY=".venv/Scripts/python.exe"; else VPY=".venv/bin/python"; fi
fi

log "安装后端依赖…"
"$VPY" -m pip install --upgrade pip >/dev/null
"$VPY" -m pip install -r app/backend/requirements.txt

# ---------- 前端 ----------
log "安装前端依赖并构建…"
(
  cd app/frontend
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npm run build
)

ok "安装完成。"

# ---------- 启动 ----------
if [ "$START" = "0" ]; then
  echo
  echo "启动：cd \"$ROOT\" && ./start.sh   → http://127.0.0.1:8000"
  exit 0
fi

if ! "$VPY" - <<'PY' 2>/dev/null
import socket, sys
s = socket.socket()
try:
    s.bind(("127.0.0.1", 8000))
    s.close()
except OSError:
    sys.exit(1)
PY
then
  ok "8000 端口已被占用：可能服务已在运行。"
  echo "打开 http://127.0.0.1:8000 即可；停止后再用 ./start.sh 启动。"
  exit 0
fi

ok "启动服务：http://127.0.0.1:8000"
cd app/backend
exec "$ROOT/$VPY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
