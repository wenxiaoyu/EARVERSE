"""Live Coach Manbo：一轮对话编排 + 英语门禁 + 结构化动作。"""
from __future__ import annotations

import json
import re
from typing import Any

from .. import models
from ..llm.client import LLMClient
from . import context, guard, prompts

MOODS = {"warm", "curious", "thinking", "encouraging", "correcting",
         "celebrating", "concerned", "confused"}


def _infer_actions(reply: str) -> dict[str, str]:
    t = (reply or "").lower()
    if "?" in reply:
        return {"mood": "curious", "gesture": "lean_in"}
    if "!" in reply or any(w in t for w in ("great", "awesome", "nice", "perfect", "good job")):
        return {"mood": "encouraging", "gesture": "thumbs_up"}
    if any(w in t for w in ("sorry", "worried", "that sounds hard", "that sounds tough")):
        return {"mood": "concerned", "gesture": "hand_on_chest"}
    return {"mood": "warm", "gesture": "nod"}
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


async def stream_turn(llm: LLMClient | None, profile: dict[str, Any], domain: str,
                    user_text: str, history: list[dict] | None = None):
    """SSE：流式输出 Manbo 的英文回复。用户插话时前端中断即可。"""
    text = (user_text or "").strip()[:800]
    if not text:
        yield {"type": "done", "reply": guard.EMPTY_REPLY, "correction": "",
               "mood": "curious", "gesture": "nod", "english_only": True}
        return
    if not guard.is_english_input(text):
        yield {"type": "done", "reply": guard.REDIRECT, "correction": "",
               "mood": "confused", "gesture": "shrug", "blocked": True, "english_only": True}
        return
    if llm is None:
        yield {"type": "done", "reply": _local_reply(text), "correction": "",
               "mood": "warm", "gesture": "nod", "english_only": True}
        return
    b = context.brief(profile, domain)
    try:
        full = ""
        async for chunk in llm.stream_chat(
            prompts.coach_stream_messages(b, history or [], text),
            temperature=0.7, max_tokens=160,
        ):
            if not chunk:
                continue
            full += chunk
            if not guard.has_cjk(chunk):
                yield {"type": "delta", "text": chunk}
        reply = guard.english_or(full.strip(), _local_reply(text))
        actions = _infer_actions(reply)
        yield {"type": "done", "reply": reply, "correction": "",
               "mood": actions["mood"], "gesture": actions["gesture"],
               "english_only": True}
    except Exception:
        reply = _local_reply(text)
        yield {"type": "done", "reply": reply, "correction": "",
               "mood": "warm", "gesture": "nod", "english_only": True}


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


def _clean_history(history: list[dict]) -> list[dict]:
    out = []
    for m in (history or [])[-20:]:
        role = m.get("role")
        text = str(m.get("text") or "").strip()
        if role in ("user", "assistant") and text and not guard.has_cjk(text):
            out.append({"role": role, "text": text})
    return out


def _local_summary(history: list[dict]) -> dict[str, Any]:
    turns = sum(1 for m in history if m.get("role") == "user")
    summary = (f"We had a {turns}-turn conversation in English. "
               if turns else "We didn't get much talking in this session. ")
    summary += "Try a little more speaking next time."
    return {"summary": summary, "wins": [], "gaps": [],
            "next_focus": ["Keep the conversation going in English"],
            "corrections": []}


async def end(llm: LLMClient | None, profile: dict[str, Any], domain: str,
              history: list[dict] | None = None) -> dict[str, Any]:
    """生成英文会话摘要，并把弱项/改写回流到学习档案。"""
    hist = _clean_history(history or [])
    b = context.brief(profile, domain)
    if not hist or not any(m["role"] == "user" for m in hist):
        return {**_local_summary(hist), "saved": False, "english_only": True}

    data: dict[str, Any] | None = None
    if llm is not None:
        try:
            raw = await llm.chat(prompts.summary_messages(b, hist),
                                 temperature=0.4, max_tokens=260)
            data = _parse(raw)
        except Exception:
            data = None
    out = _local_summary(hist) if not data else {
        "summary": guard.english_or(str(data.get("summary") or "").strip(),
                                    _local_summary(hist)["summary"]),
        "wins": [guard.english_or(str(x), "") for x in (data.get("wins") or []) if x][:3],
        "gaps": [guard.english_or(str(x), "") for x in (data.get("gaps") or []) if x][:3],
        "next_focus": [guard.english_or(str(x), "") for x in (data.get("next_focus") or []) if x][:3],
        "corrections": [
            {"original": str(c.get("original") or "").strip()[:160],
             "better": guard.english_or(str(c.get("better") or "").strip(), "")}
            for c in (data.get("corrections") or [])[:3]
            if isinstance(c, dict) and c.get("better")
        ],
    }
    out["wins"] = [x for x in out["wins"] if x]
    out["gaps"] = [x for x in out["gaps"] if x]
    out["next_focus"] = [x for x in out["next_focus"] if x]
    if not out["next_focus"]:
        out["next_focus"] = ["Keep the conversation going in English"]

    # 回流到画像：会话日志 + 弱项焦点 + 口语改写写入错误史
    d = models.ensure_domain(profile, domain)
    log = d.setdefault("coach", {})
    entry = {
        "at": models.now_iso(),
        "summary": out["summary"],
        "wins": out["wins"],
        "gaps": out["gaps"],
        "next_focus": out["next_focus"],
        "turns": sum(1 for m in hist if m["role"] == "user"),
    }
    sessions = log.setdefault("sessions", [])
    sessions.append(entry)
    log["sessions"] = sessions[-20:]
    log["weak_points"] = (log.get("weak_points") or []) + out["gaps"]
    log["weak_points"] = log["weak_points"][-20:]
    log["next_focus"] = out["next_focus"]
    log["last_summary"] = out["summary"]
    log["updated_at"] = models.now_iso()
    for c in out.get("corrections", []):
        if c.get("original") and c.get("better"):
            models.record_error(profile, domain, "speaking",
                                c["original"], c["better"], "coach")

    # 把下次焦点设成明天的目标，进入今天的工作台即可见
    goal_text = " · ".join(out["next_focus"][:2]).strip()
    if goal_text:
        models.set_goal(profile, domain, {
            "text": goal_text,
            "kind": "coach",
            "words": [],
            "hearing": [],
            "skills": [],
            "source": "coach",
            "from_date": models.local_date(0),
            "for_date": models.local_date(1),
        })
    models._touch(profile)
    return {**out, "saved": True, "english_only": True,
            "tomorrow_goal": goal_text or ""}
