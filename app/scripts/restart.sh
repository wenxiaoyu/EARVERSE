#!/bin/bash
# 一键：自动编译 → 重启（改完代码直接跑这个）。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/service.sh" restart
