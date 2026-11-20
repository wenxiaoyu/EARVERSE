"""Mira 的学习者上下文：把画像压成英文 LearnerBrief（不把中文标签喂给模型）。"""
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
    return {
        "domain": domain,
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
    return "Hey, I'm Mira. Tell me one thing about your day — in English."
