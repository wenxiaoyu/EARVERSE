#!/bin/bash
# 运行时环境变量（launchd 环境极简，这里补全 PATH 与绝对路径）。
# 所有脚本都 source 本文件。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export HOME="${HOME:-/Users/xpeng}"

# --- node/npm：优先当前 PATH，其次 nvm 最新版本 ---
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(dirname "$(command -v node)")"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM="$(ls -1 "$HOME/.nvm/versions/node" | sort -V | tail -1)"
  NODE_BIN="$HOME/.nvm/versions/node/$LATEST_NVM/bin"
else
  NODE_BIN="/usr/local/bin"
fi

# --- python：优先显式设置，其次 miniconda，再次系统 ---
if [ -z "${PYTHON:-}" ]; then
  if [ -x "/opt/homebrew/Caskroom/miniconda/base/bin/python3" ]; then
    PYTHON="/opt/homebrew/Caskroom/miniconda/base/bin/python3"
  else
    PYTHON="$(command -v python3)"
  fi
fi

export NODE_BIN
export PYTHON
export PATH="$NODE_BIN:/opt/homebrew/Caskroom/miniconda/base/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# 服务参数
export COACH_HOST="127.0.0.1"
export COACH_PORT="8000"
export COACH_LABEL="com.xpeng.english-coach"
export COACH_UID="$(id -u)"
