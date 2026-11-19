#!/usr/bin/env python3
"""单进程监督器：同时托管前端 watch 构建 + 后端 uvicorn。

为什么需要它：launchd 只可靠地跟踪一个主进程。让本脚本作为主进程，
内部拉起两个子进程：
  1) `npm run watch`（vite build --watch）—— 前端改了自动重编译到 dist；
  2) `uvicorn --reload` —— 后端 .py 改了自动重启。
收到 SIGTERM/SIGINT 时优雅关闭两个子进程；任一子进程退出则整体退出，
交由 launchd 的 KeepAlive 拉起整套。
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import pathlib

ROOT = pathlib.Path(os.environ["APP_ROOT"])
PYTHON = os.environ.get("PYTHON") or sys.executable
HOST = os.environ.get("COACH_HOST", "127.0.0.1")
PORT = os.environ.get("COACH_PORT", "8000")

_children: list[subprocess.Popen] = []


def _spawn(cmd: list[str], cwd: pathlib.Path) -> subprocess.Popen:
    print(f"[supervise] 启动: {' '.join(cmd)} (cwd={cwd})", flush=True)
    return subprocess.Popen(cmd, cwd=str(cwd), env=os.environ.copy())


def _shutdown(reason: str = "") -> None:
    print(f"[supervise] 关闭: {reason}", flush=True)
    for c in _children:
        if c.poll() is None:
            try:
                c.terminate()
            except Exception:
                pass
    deadline = time.time() + 10
    for c in _children:
        while c.poll() is None and time.time() < deadline:
            time.sleep(0.1)
        if c.poll() is None:
            try:
                c.kill()
            except Exception:
                pass
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGTERM, lambda *_: _shutdown("SIGTERM"))
    signal.signal(signal.SIGINT, lambda *_: _shutdown("SIGINT"))

    _children.append(_spawn(["npm", "run", "watch"], ROOT / "frontend"))
    _children.append(_spawn(
        [PYTHON, "-m", "uvicorn", "app.main:app",
         "--app-dir", "backend", "--host", HOST, "--port", str(PORT),
         "--reload", "--reload-dir", "backend/app"],
        ROOT,
    ))

    while True:
        for child in _children:
            code = child.poll()
            if code is not None:
                _shutdown(f"子进程退出 code={code}")
        time.sleep(1)


if __name__ == "__main__":
    main()
