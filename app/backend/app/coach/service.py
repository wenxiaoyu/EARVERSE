"""Live Coach Mira：一轮对话编排 + 英语门禁 + 结构化动作。"""
from __future__ import annotations

import json
import re
from typing import Any

from ..llm.client import LLMClient
from . import context, guard, prompts

MOODS = {"warm", "curious", "thinking", "encouraging", "correcting",
         "celebrating", "concerned", "confused"}
GESTURES = {"none", "nod", "lean_in", "open_palm", "point_up",
            "hand_on_chest", "shrug", "thumbs_up", "wave", "chin_tap"}


def _parse(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I | re.M).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except Exception:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            obj = json.loads(text[start:end + 1])
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None
    return None


def _local_reply(user_text: str) -> str:
    t = (user_text or "").lower()
    if "?" in user_text:
        return "That's a good question. I'd say it depends — what do you think?"
    if any(w in t for w in ("tired", "exhausted", "busy", "stress")):
        return "That sounds like a lot. What's one small thing you can do for yourself today?"
    if any(w in t for w in ("hello", "hi", "hey")):
        return "Hey! Good to see you. What's on your mind today?"
    return "Got it. Tell me a little more — what happened next?"


def _normalize(data: dict[str, Any] | None, raw: str, user_text: str) -> dict[str, Any]:
    if data:
        reply = guard.english_or(str(data.get("reply") or "").strip())
        correction = guard.english_or(str(data.get("correction") or "").strip(), "")
        mood = str(data.get("mood") or "").strip().lower()
        gesture = str(data.get("gesture") or "").strip().lower()
    else:
        # 模型偶尔直接返回英文文本而不是 JSON；保留可用文本，中文则丢弃
        reply = guard.english_or(raw.strip())
        correction, mood, gesture = "", "", ""
    if not raw and data:
        reply = guard.english_or(reply)
    if not correction or guard.has_cjk(correction):
        correction = ""
    if mood not in MOODS:
        mood = "warm"
    if gesture not in GESTURES:
        gesture = "nod" if mood in ("warm", "encouraging") else "open_palm"
    return {
        "reply": reply,
        "correction": correction,
        "mood": mood,
        "gesture": gesture,
        "blocked": False,
        "english_only": True,
    }


async def start(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    b = context.brief(profile, domain)
    return {
        "greeting": context.greeting(b),
        "brief": b,
        "mood": "warm",
        "gesture": "nod",
        "english_only": True,
    }


async def turn(llm: LLMClient | None, profile: dict[str, Any], domain: str,
               user_text: str, history: list[dict] | None = None) -> dict[str, Any]:
    text = (user_text or "").strip()[:800]
    if not text:
        return {"reply": guard.EMPTY_REPLY, "correction": "",
                "mood": "curious", "gesture": "nod", "blocked": False,
                "english_only": True}
    # 中文/日文/韩文：不交给模型理解，直接英文引导
    if not guard.is_english_input(text):
        return guard.redirect()
    if llm is None:
        out = _normalize(None, _local_reply(text), text)
        return out

    b = context.brief(profile, domain)
    raw = ""
    for strict in (False, True):
        try:
            raw = await llm.chat(prompts.coach_messages(b, history or [], text, strict),
                                 temperature=0.7, max_tokens=220)
        except Exception:
            break
        data = _parse(raw)
        reply = str((data or {}).get("reply") or "").strip()
        if data and reply and not guard.has_cjk(reply):
            return _normalize(data, raw, text)
        # 模型直接返回英文文本（非 JSON）也可用
        if not data and raw.strip() and not guard.has_cjk(raw):
            return _normalize(None, raw, text)
        # 含中文：带更严格提示重试一次
    # LLM 失败/连续中文 -> 本地英文回退
    return _normalize(None, _local_reply(text), text)
