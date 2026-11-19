#!/bin/bash
# 英语训练器 — 本地启动器
# 双击运行。为什么要用本地服务而不是双击 index.html：
#   1. 浏览器会拒绝 file:// 页面的 localStorage，进度存不下来；
#   2. 「说英语」要连模型，密钥得放在本机后端，不能进浏览器。

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8770}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已在运行，直接打开浏览器。"
  open "http://localhost:$PORT"
  exit 0
fi

echo "英语训练器"
echo "地址：http://localhost:$PORT"
echo "关闭此窗口即停止服务。"
echo

python3 server.py &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM

sleep 1
open "http://localhost:$PORT"
wait "$SRV"
