"""Mira 的英语-only 门禁。

中文/日文/韩文输入不进入 LLM；AI 输出含非英文脚本时重试或回退。
"""
from __future__ import annotations

import re

CJK_RE = re.compile(
    r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    r"\u3040-\u30ff\uac00-\ud7af"
    r"\u3000-\u303f\uff00-\uffef]"
)
LATIN_RE = re.compile(r"[A-Za-z]")

REDIRECT = (
    "I only speak English, so I didn't catch that. "
    "Could you try saying it again in English?"
)
EMPTY_REPLY = "I'm listening. Tell me a little more — in English."
FALLBACK_REPLY = "Let's keep it in English. What would you like to talk about?"


def has_cjk(text: str) -> bool:
    return bool(CJK_RE.search(text or ""))


def is_english_input(text: str) -> bool:
    """User text is acceptable only when it has English letters and no CJK/kana/hangul."""
    t = (text or "").strip()
    return bool(t) and bool(LATIN_RE.search(t)) and not has_cjk(t)


def redirect() -> dict:
    return {
        "reply": REDIRECT,
        "correction": "",
        "mood": "confused",
        "gesture": "shrug",
        "blocked": True,
        "english_only": True,
    }


def english_or(text: str, fallback: str = FALLBACK_REPLY) -> str:
    """Never let Chinese reach TTS or the transcript."""
    t = (text or "").strip()
    if not t or has_cjk(t):
        return fallback
    return t
