"""Manbo 的学习者上下文：把画像压成英文 LearnerBrief（不把中文标签喂给模型）。"""
from __future__ import annotations

import re
from typing import Any

from .. import models
from ..reports import metrics as report_metrics

HEARING_EN = {
    "core": "core high-frequency words",
    "weak-form": "weak forms",
    "weak_form": "weak forms",
    "linking": "linking",
    "elision": "elision",
    "reduction": "reduction",
    "connected-speech": "connected speech",
    "assimilation": "assimilation",
    "intonation": "intonation",
}


def _en_rule(rule_id: str) -> str:
    rid = (rule_id or "").strip()
    return HEARING_EN.get(rid, re.sub(r"[-_]+", " ", rid) or "connected speech")


def _focus_text(b: dict[str, Any]) -> str:
    """今天的练习焦点，用一句英文概括（供开场/教练使用）。"""
    goal = b.get("today_goal") or {}
    words = goal.get("words") or []
    hearing = goal.get("hearing") or []
    deaf = b.get("deaf_words") or []
    weak = b.get("weak_hearing") or []
    if words:
        return f"using the words {', '.join(words[:2])} naturally"
    if hearing:
        return f"hearing and saying {hearing[0]} correctly"
    if deaf:
        return f"catching the words {', '.join(deaf[:2])} by ear"
    if weak:
        return f"the sound pattern '{weak[0].get('rule', 'connected speech')}'"
    return "speaking more naturally and confidently"


def brief(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    """English-only snapshot used in the system prompt."""
    d = models.ensure_domain(profile, domain)
    counts = models.vocab_state_counts(d)
    goal = models.get_today_goal(profile, domain) or {}
    hearing = sorted(
        ({"rule": _en_rule(rid), "count": int(info.get("count") or 0)}
         for rid, info in (d.get("hearing") or {}).items()),
        key=lambda x: x["count"], reverse=True,
    )[:4]
    errors = [
        {"kind": str(e.get("kind") or "error"), "original": str(e.get("original") or "")[:160]}
        for e in (d.get("errors") or [])[-4:] if e.get("original")
    ]
    pron = [
        {"sound": str(x.get("sound") or ""), "heard_as": str(x.get("heard_as") or ""),
         "word": str(x.get("word") or "")}
        for x in models.recent_pron_issues(profile, domain, limit=4)
    ]
    scenarios = [
        {"success": bool(x.get("success"))}
        for x in (d.get("scenario_record") or [])[-3:]
    ]
    try:
        m = report_metrics.compute(profile, domain, "week")
        dims = {
            x["key"]: {"score": x["score"], "n": x["n"], "confidence": x["confidence"]}
            for x in m.get("metrics", [])
        }
        active_days = int(m.get("active_days") or 0)
    except Exception:
        dims, active_days = {}, 0
    coach_log = d.get("coach") or {}
    conversation = [
        {"role": str(t.get("role") or ""), "text": str(t.get("text") or "")[:300]}
        for t in (coach_log.get("conversation") or [])[-8:]
        if t.get("role") in ("user", "assistant") and str(t.get("text") or "").strip()
    ]
    facts = [str(f.get("text") or "")[:200]
             for f in (coach_log.get("facts") or [])[-10:] if f.get("text")]
    answer_log = [
        {"focus": str(a.get("focus") or ""), "answer": str(a.get("answer") or "")[:160],
         "correct": bool(a.get("correct")), "correction": str(a.get("correction") or "")[:160]}
        for a in (coach_log.get("answer_log") or [])[-10:]
    ]
    focus = _focus_text({"today_goal": goal, "deaf_words": models.deaf_words(d)[:6],
                          "weak_hearing": hearing})
    return {
        "domain": domain,
        "first_time": not bool(coach_log.get("sessions")),
        "focus": focus,
        "active_days_this_week": active_days,
        "today_goal": {
            "kind": goal.get("kind") or "",
            "words": [str(w) for w in (goal.get("words") or [])][:5],
            "hearing": [_en_rule(str(h)) for h in (goal.get("hearing") or [])][:3],
            "skills": [str(s) for s in (goal.get("skills") or [])][:3],
        },
        "metrics": dims,
        "vocab": counts,
        "weak_hearing": hearing,
        "deaf_words": models.deaf_words(d)[:6],
        "recent_errors": errors,
        "pronunciation_issues": pron,
        "recent_scenarios": scenarios,
        "recitation_level": models.recitation_level(profile, domain),
        "coach_last_summary": coach_log.get("last_summary") or "",
        "coach_next_focus": list(coach_log.get("next_focus") or [])[:3],
        "conversation": conversation,
        "facts": facts,
        "answer_log": answer_log,
    }


def greeting(brief_data: dict[str, Any]) -> str:
    """Fast local English greeting; no LLM needed for first paint."""
    goal = brief_data.get("today_goal") or {}
    words = goal.get("words") or []
    hearing = goal.get("hearing") or []
    if words:
        return (f"Hey! I remember today's focus: {', '.join(words[:2])}. "
                "Want to warm up with one of those, or just tell me about your day?")
    if hearing:
        return (f"Hey! I know {hearing[0]} has been tricky for you. "
                "Should we try it in a real sentence, or talk about something else?")
    if (brief_data.get("deaf_words") or []):
        return ("Hey! I've got a few words I think you know by sight but not by ear. "
                "Want to test one, or just chat first?")
    return "Hey, I'm Manbo. Tell me one thing about your day — in English."


def opening(brief_data: dict[str, Any]) -> str:
    """主动开场：第一次自我介绍；熟了以后不再重复自我介绍，只打招呼+回忆+今日焦点。"""
    focus = brief_data.get("focus") or "speaking more naturally"
    first = bool(brief_data.get("first_time"))
    facts = brief_data.get("facts") or []
    last = brief_data.get("coach_last_summary") or ""
    if first:
        return (f"Hi, I'm Manbo — your English coach. Nice to meet you! "
                f"I've looked at your practice, and today we should work on {focus}. "
                f"Let's start simple: tell me one thing about your day, in English.")
    if facts:
        return (f"Hey, good to see you again! I remember you mentioned: {facts[0]}. "
                f"Today let's focus on {focus}. Ready? Tell me one thing you did today.")
    if last:
        return (f"Hey, welcome back! Last time we worked on improving your English. "
                f"Today let's focus on {focus}. How has your day been so far?")
    return (f"Hey, welcome back! Today we'll focus on {focus}. "
            f"Let's start — tell me about your day.")
