"""OpenAI 兼容 LLM 客户端 + 流式 SSE（task 3.1）。

设计：httpx 惰性导入（未装依赖也能 import 本模块跑纯逻辑单测）；
endpoint 解析、SSE 行解析做成纯函数便于测试。
"""
from __future__ import annotations

import json
from typing import AsyncIterator, Iterable

from ..config import LLMConfig


def endpoint_for(base_url: str) -> str:
    """把各种 base_url 归一化成 chat/completions 端点。"""
    b = (base_url or "").rstrip("/")
    if not b:
        raise ValueError("base_url 为空")
    if b.endswith("/chat/completions"):
        return b
    if b.endswith("/v1") or "/v1/" in b:
        return b + "/chat/completions"
    return b + "/v1/chat/completions"


def build_headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def build_payload(model: str, messages: list[dict], stream: bool,
                  temperature: float = 0.85, max_tokens: int = 400,
                  extras: dict | None = None) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if extras:
        payload.update(extras)
    return payload


def provider_extras(cfg: LLMConfig) -> dict:
    """供应商特定字段。DeepSeek 默认开 thinking，这里按配置关闭。"""
    extras: dict = {}
    if getattr(cfg, "disable_thinking", True) and "deepseek" in (cfg.base_url or "").lower():
        extras["thinking"] = {"type": "disabled"}
    return extras


def parse_sse_line(line: str) -> tuple[bool, str]:
    """解析一行 SSE。

    返回 (done, content)：
    - done=True 表示收到 [DONE]
    - content 为该行的增量文本（可能为空）
    """
    line = line.strip()
    if not line or not line.startswith("data:"):
        return False, ""
    payload = line[len("data:"):].strip()
    if payload == "[DONE]":
        return True, ""
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return False, ""
    choices: Iterable = obj.get("choices") or []
    for choice in choices:
        delta = choice.get("delta") or {}
        content = delta.get("content")
        if content:
            return False, content
    return False, ""


def extract_message_content(obj: dict) -> str:
    """从非流式响应中取第一段 content。"""
    choices = obj.get("choices") or []
    if not choices:
        return ""
    return (choices[0].get("message") or {}).get("content") or ""


class LLMClient:
    def __init__(self, cfg: LLMConfig):
        self.cfg = cfg

    def _ensure_ready(self) -> str:
        if not self.cfg.base_url:
            raise RuntimeError("未配置 LLM base_url")
        if not self.cfg.model:
            raise RuntimeError("未配置 LLM model")
        return endpoint_for(self.cfg.base_url)

    async def chat(self, messages: list[dict],
                   temperature: float | None = None,
                   max_tokens: int | None = None) -> str:
        """非流式调用，返回完整文本。"""
        import httpx

        url = self._ensure_ready()
        payload = build_payload(
            self.cfg.model, messages, stream=False,
            temperature=temperature if temperature is not None else self.cfg.temperature,
            max_tokens=max_tokens if max_tokens is not None else self.cfg.max_tokens,
            extras=provider_extras(self.cfg),
        )
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(url, headers=build_headers(self.cfg.api_key), json=payload)
            resp.raise_for_status()
            return extract_message_content(resp.json())

    async def stream_chat(self, messages: list[dict],
                          temperature: float | None = None,
                          max_tokens: int | None = None) -> AsyncIterator[str]:
        """流式调用，逐段 yield 文本增量。"""
        import httpx

        url = self._ensure_ready()
        payload = build_payload(
            self.cfg.model, messages, stream=True,
            temperature=temperature if temperature is not None else self.cfg.temperature,
            max_tokens=max_tokens if max_tokens is not None else self.cfg.max_tokens,
            extras=provider_extras(self.cfg),
        )
        async with httpx.AsyncClient(timeout=90) as client:
            async with client.stream("POST", url,
                                     headers=build_headers(self.cfg.api_key),
                                     json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    done, content = parse_sse_line(line)
                    if done:
                        break
                    if content:
                        yield content
