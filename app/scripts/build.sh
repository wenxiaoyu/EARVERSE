#!/bin/bash
# 幂等构建前端：缺依赖先装，再构建。
set -e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

cd "$APP_ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "[build] 安装前端依赖…"
  npm install --silent
fi
echo "[build] 构建前端…"
npm run build
echo "[build] 完成"
