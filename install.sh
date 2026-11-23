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

# 保底把常见工具目录加进 PATH（curl/tar/md5 等），兼容极简 shell 环境
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

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
SHORTCUT=1
OPEN=1
UNINSTALL=0
UNINSTALL_ARGS=()
NO_UPDATE_CHECK="${EARVERSE_NO_UPDATE_CHECK:-0}"
SOURCE="${EARVERSE_SOURCE:-auto}"
CN="${EARVERSE_CN:-0}"
CUSTOM_TARBALL="${EARVERSE_TARBALL:-}"
for arg in "$@"; do
  case "$arg" in
    --no-start) START=0 ;;
    --start) START=1 ;;
    --no-shortcut) SHORTCUT=0 ;;
    --no-open) OPEN=0 ;;
    --uninstall) UNINSTALL=1 ;;
    --yes|-y) UNINSTALL_ARGS+=("--yes") ;;
    --purge-data|--purge) UNINSTALL_ARGS+=("--purge-data") ;;
    --keep-data) UNINSTALL_ARGS+=("--keep-data") ;;
    --dry-run) UNINSTALL_ARGS+=("--dry-run") ;;
    --force) UNINSTALL_ARGS+=("--force") ;;
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
  ./install.sh --no-shortcut   不创建桌面图标
  ./install.sh --no-open       启动后不自动打开窗口
  ./install.sh --uninstall     卸载（可加 --purge-data / --yes / --dry-run）
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

# ---------- 卸载 ----------
if [ "$UNINSTALL" = "1" ]; then
  CAND=""
  if [ -n "${EARVERSE_DIR:-}" ] && [ -d "$EARVERSE_DIR" ]; then
    CAND="$EARVERSE_DIR"
  elif [ -f "./app/backend/app/main.py" ]; then
    CAND="$(pwd)"
  elif [ -d "$HOME/earverse" ]; then
    CAND="$HOME/earverse"
  fi
  [ -n "$CAND" ] || die "找不到安装目录。请进入安装目录后运行 ./app/scripts/uninstall.sh"
  SCRIPT="$CAND/app/scripts/uninstall.sh"
  [ -f "$SCRIPT" ] || die "未找到卸载脚本：$SCRIPT"
  exec bash "$SCRIPT" "${UNINSTALL_ARGS[@]+"${UNINSTALL_ARGS[@]}"}"
fi

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

# ---------- 运行时：系统优先，缺失则自动装便携版（无需 sudo） ----------
NODE_VERSION="20.18.1"
CONDA_VERSION="py312_24.9.2-0"
RUNTIME_DIR="${EARVERSE_RUNTIME:-$ROOT/.runtime}"

download_to() {
  local out="$1"; shift
  local u
  for u in "$@"; do
    [ -n "$u" ] || continue
    log "下载：$u"
    if curl -fSL --connect-timeout 10 --retry 2 --max-time 900 "$u" -o "$out" 2>/dev/null; then
      return 0
    fi
    log "该源失败，换下一个…"
  done
  return 1
}

ensure_python() {
  local c
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1 && \
       "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
      PY="$c"; log "Python：$("$PY" --version 2>&1)（系统已有）"; return 0
    fi
  done
  if [ -x "$RUNTIME_DIR/python/bin/python3" ] && \
     "$RUNTIME_DIR/python/bin/python3" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    export PATH="$RUNTIME_DIR/python/bin:$PATH"
    PY="$RUNTIME_DIR/python/bin/python3"
    log "Python：$("$PY" --version 2>&1)（便携版已存在）"
    return 0
  fi
  local os arch
  case "$PLATFORM" in
    macOS)      os="MacOSX" ;;
    Linux|WSL)  os="Linux" ;;
    *) die "当前系统无法自动安装 Python，请手动安装 Python 3.10+ 后重试" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) if [ "$os" = "MacOSX" ]; then arch="arm64"; else arch="aarch64"; fi ;;
    x86_64|amd64)  arch="x86_64" ;;
    *) die "当前 CPU 架构不支持自动安装 Python：$(uname -m)" ;;
  esac
  local f="Miniconda3-${CONDA_VERSION}-${os}-${arch}.sh"
  local tmp; tmp="$(mktemp -d)"
  log "未检测到 Python 3.10+，自动安装便携版（无需 sudo）…"
  download_to "$tmp/mc.sh" \
    "https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/${f}" \
    "https://repo.anaconda.com/miniconda/${f}" \
    || die "Python 下载失败。请检查网络，或手动安装 Python 3.10+ 后重试"
  mkdir -p "$RUNTIME_DIR"
  rm -rf "$RUNTIME_DIR/python"
  bash "$tmp/mc.sh" -b -p "$RUNTIME_DIR/python" >/dev/null 2>&1 \
    || die "Python 便携版安装失败"
  rm -rf "$tmp"
  export PATH="$RUNTIME_DIR/python/bin:$PATH"
  PY="$RUNTIME_DIR/python/bin/python3"
  [ -x "$PY" ] || die "Python 便携版异常：$PY 不存在"
  log "Python：$("$PY" --version 2>&1)（便携版）"
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && \
     node -e 'process.exit(process.versions.node.split(".").map(Number)[0] >= 18 ? 0 : 1)' 2>/dev/null; then
    log "Node：$(node -v)（系统已有）"; return 0
  fi
  if [ -x "$RUNTIME_DIR/node/bin/node" ] && \
     "$RUNTIME_DIR/node/bin/node" -e 'process.exit(process.versions.node.split(".").map(Number)[0] >= 18 ? 0 : 1)' 2>/dev/null; then
    export PATH="$RUNTIME_DIR/node/bin:$PATH"
    log "Node：$("$RUNTIME_DIR/node/bin/node" -v)（便携版已存在）"
    return 0
  fi
  local os arch
  case "$PLATFORM" in
    macOS)      os="darwin" ;;
    Linux|WSL)  os="linux" ;;
    *) die "当前系统无法自动安装 Node，请手动安装 Node 18+ 后重试" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) die "当前 CPU 架构不支持自动安装 Node：$(uname -m)" ;;
  esac
  local pkg="node-v${NODE_VERSION}-${os}-${arch}.tar.gz"
  local tmp; tmp="$(mktemp -d)"
  log "未检测到 Node 18+，自动安装便携版（无需 sudo）…"
  download_to "$tmp/node.tgz" \
    "https://npmmirror.com/mirrors/node/v${NODE_VERSION}/${pkg}" \
    "https://nodejs.org/dist/v${NODE_VERSION}/${pkg}" \
    || die "Node 下载失败。请检查网络，或手动安装 Node 18+ 后重试"
  tar -xzf "$tmp/node.tgz" -C "$tmp"
  mkdir -p "$RUNTIME_DIR"
  rm -rf "$RUNTIME_DIR/node"
  mv "$tmp/node-v${NODE_VERSION}-${os}-${arch}" "$RUNTIME_DIR/node"
  rm -rf "$tmp"
  export PATH="$RUNTIME_DIR/node/bin:$PATH"
  log "Node：$(node -v)（便携版）"
}

ensure_python
ensure_node
command -v npm >/dev/null 2>&1 || die "npm 未找到（应随 Node 一起提供，请检查安装）"
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

# ---------- 桌面图标（默认创建） ----------
if [ "$SHORTCUT" = "1" ] && [ "$CHECK_ONLY" = "0" ]; then
  if [ -x "$ROOT/app/scripts/install-shortcut.sh" ]; then
    bash "$ROOT/app/scripts/install-shortcut.sh" \
      || log "创建桌面图标失败（可稍后手动运行 app/scripts/install-shortcut.sh）"
  fi
fi

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
  if [ "$OPEN" = "1" ] && [ -x "$ROOT/app/scripts/open-app.sh" ]; then
    EARVERSE_DETACH=1 bash "$ROOT/app/scripts/open-app.sh" >/dev/null 2>&1 || true
  fi
  echo "打开 http://127.0.0.1:8000 即可；停止后再用 ./start.sh 启动。"
  exit 0
fi

ok "启动服务：http://127.0.0.1:8000"
cd app/backend
"$ROOT/$VPY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
UV_PID=$!
if [ "$OPEN" = "1" ] && [ -x "$ROOT/app/scripts/open-app.sh" ]; then
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://127.0.0.1:8000/api/health" 2>/dev/null; then
      EARVERSE_DETACH=1 bash "$ROOT/app/scripts/open-app.sh" >/dev/null 2>&1 || true
      break
    fi
    sleep 1
  done
fi
wait "$UV_PID"
