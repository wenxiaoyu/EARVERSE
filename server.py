#!/usr/bin/env python3
"""
英语训练器 · 本地服务

做三件事，只用 Python 标准库（PEP 8 / 无第三方依赖）：
  1. 提供静态页面（替代 python3 -m http.server）
  2. POST /api/chat  把对话请求转给大模型，流式转发回来
  3. GET/POST /api/config  在设置页填写 base_url / api_key / model

为什么不让浏览器直接调模型：
  · 密钥不会出现在浏览器、localStorage、开发者工具里
  · 公司网关通常不放行跨域请求，走本机转发就没有 CORS 问题
  · 只监听 127.0.0.1，局域网里的其他设备连不上

启动：python3 server.py   （或双击 start.command）
"""

import hmac  # noqa: F401  (保留：以后接需要签名的网关时用)
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "env.config.json")
UPSTREAM_TIMEOUT = 90
MAX_BODY = 256 * 1024


# ---------------------------------------------------------------- 配置

def read_config():
    """环境变量优先，其次是同目录的 env.config.json。"""
    cfg = {"base_url": "", "api_key": "", "model": "", "temperature": 0.85, "max_tokens": 400}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg.update({k: v for k, v in json.load(f).items() if v is not None})
        except Exception as e:  # 配置坏了不能让服务起不来
            print("[config] 读取失败：%s" % e, file=sys.stderr)
    cfg["base_url"] = (os.environ.get("OPENAI_BASE_URL") or cfg.get("base_url") or "").strip()
    cfg["api_key"] = (os.environ.get("OPENAI_API_KEY") or cfg.get("api_key") or "").strip()
    cfg["model"] = (os.environ.get("OPENAI_MODEL") or cfg.get("model") or "").strip()
    return cfg


def write_config(partial):
    cfg = read_config()
    for k in ("base_url", "api_key", "model"):
        if k in partial:
            cfg[k] = str(partial[k] or "").strip()
    for k in ("temperature", "max_tokens"):
        if k in partial:
            try:
                cfg[k] = float(partial[k]) if k == "temperature" else int(partial[k])
            except (TypeError, ValueError):
                pass
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    try:
        os.chmod(CONFIG_PATH, 0o600)  # 只有本机当前用户能读
    except OSError:
        pass
    return cfg


def endpoint_for(base_url):
    b = base_url.rstrip("/")
    if b.endswith("/chat/completions"):
        return b
    if b.endswith("/v1") or "/v1/" in b:
        return b + "/chat/completions"
    return b + "/v1/chat/completions"


def mask_key(key):
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return key[:4] + "…" + key[-4:]


# ---------------------------------------------------------------- 请求处理

class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # -- 工具 ----------------------------------------------------
    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0:
            return {}
        if n > MAX_BODY:
            raise ValueError("请求太大")
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def end_headers(self):
        # 本地开发：永远拿最新的 js/css，不然改了代码看不到
        path = self.path.split("?")[0]
        if path.startswith("/api/") or path.endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.command != "GET" or "/api/" in self.path:
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    # -- GET -----------------------------------------------------
    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/"):
            if path == "/api/health":
                cfg = read_config()
                return self._json({
                    "ok": True,
                    "configured": bool(cfg["base_url"] and cfg["model"]),
                    "model": cfg["model"],
                    "host": cfg["base_url"].split("//")[-1].split("/")[0],
                })
            if path == "/api/config":
                cfg = read_config()
                return self._json({
                    "configured": bool(cfg["base_url"] and cfg["model"]),
                    "base_url": cfg["base_url"],
                    "model": cfg["model"],
                    "key_hint": mask_key(cfg["api_key"]),
                })
            return self._json({"error": "not found"}, 404)

        # 别把配置文件当静态资源发出去
        if "config.json" in path or "/." in path:
            return self._json({"error": "forbidden"}, 403)
        return super().do_GET()

    # -- POST ----------------------------------------------------
    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/config":
            try:
                body = self._read_body()
            except Exception as e:
                return self._json({"error": "bad request: %s" % e}, 400)
            cfg = write_config(body)
            return self._json({
                "ok": True,
                "configured": bool(cfg["base_url"] and cfg["model"]),
                "model": cfg["model"],
                "key_hint": mask_key(cfg["api_key"]),
            })
        if path == "/api/chat":
            try:
                body = self._read_body()
            except Exception as e:
                return self._json({"error": "bad request: %s" % e}, 400)
            return self._chat(body)
        return self._json({"error": "not found"}, 404)

    # -- 转发 ----------------------------------------------------
    def _chat(self, body):
        cfg = read_config()
        if not cfg["base_url"] or not cfg["model"]:
            return self._json({"error": "not_configured",
                               "message": "还没配置模型"}, 503)

        messages = body.get("messages") or []
        if not isinstance(messages, list) or not messages:
            return self._json({"error": "bad request", "message": "messages 不能为空"}, 400)

        payload = {
            "model": cfg["model"],
            "messages": messages,
            "temperature": float(body.get("temperature", cfg.get("temperature", 0.85))),
            "max_tokens": int(body.get("max_tokens", cfg.get("max_tokens", 400))),
            "stream": bool(body.get("stream")),
        }
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(endpoint_for(cfg["base_url"]), data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        if cfg["api_key"]:
            req.add_header("Authorization", "Bearer " + cfg["api_key"])

        try:
            resp = urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:400]
            except Exception:
                pass
            hint = {
                401: "密钥不对或没权限",
                403: "这个 key 没有调用该模型的权限",
                404: "base_url 或模型名不对",
                429: "被限流了，等几秒再试",
            }.get(e.code, "上游返回错误")
            return self._json({"error": "upstream", "status": e.code,
                               "message": "%s（HTTP %s）" % (hint, e.code),
                               "detail": detail}, 502)
        except (urllib.error.URLError, socket.timeout) as e:
            return self._json({"error": "upstream",
                               "message": "连不上模型服务：%s" % getattr(e, "reason", e)}, 502)

        if not payload["stream"]:
            try:
                raw = resp.read()
            finally:
                resp.close()
            try:
                obj = json.loads(raw.decode("utf-8"))
            except Exception:
                return self._json({"error": "upstream", "message": "返回的不是 JSON"}, 502)
            return self._json(obj)

        # --- 流式：把上游的 SSE 一块一块转给浏览器 ---
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        try:
            while True:
                line = resp.readline()
                if not line:
                    break
                if not line.strip():
                    continue
                self._chunk(line)
            self._chunk(b"")
        except (BrokenPipeError, ConnectionResetError):
            pass  # 用户在生成中途换了场景，正常
        finally:
            try:
                resp.close()
            except Exception:
                pass
            self.close_connection = True

    def _chunk(self, data):
        if not data:
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
            return
        self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
        self.wfile.flush()


def main():
    port = int(os.environ.get("PORT", "8770"))
    host = "127.0.0.1"
    cfg = read_config()
    print("英语训练器")
    print("地址：http://%s:%d" % (host, port))
    if cfg["base_url"] and cfg["model"]:
        print("模型：%s @ %s" % (cfg["model"], cfg["base_url"]))
    else:
        print("模型：未配置 —— 先在「设置 → 说英语」里填好，现在会用离线演示模式")
    print("关闭此窗口即停止服务。")
    print()
    srv = ThreadingHTTPServer((host, port), Handler)
    srv.daemon_threads = True
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
