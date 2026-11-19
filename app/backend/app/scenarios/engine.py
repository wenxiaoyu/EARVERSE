"""场景实战引擎（task 7.1–7.3）。

群聊式实战：AI 扮演 <=3 个有隐藏立场的角色（design / spec scenario-practice）。
- start_session：从场景库建一个会话；
- actor_reply：某角色对用户发言的回复（LLM；无 LLM 时走离线剧本 beats）；
- review_session：复盘，判断是否办成、捕捉卡点；
- apply_review_to_profile：把结局写回画像（场景战绩 + 回避 + 错误）。
"""
from __future__ import annotations

import re

from typing import Any

from .. import seeddata
from ..llm import prompts


_CJK = re.compile(r"[\u4e00-\u9fff]")


def start_session(scenario_id: str, domain: str | None = None) -> dict[str, Any]:
    scenario = seeddata.scenario_by_id(scenario_id)
    if scenario is None:
        raise KeyError(f"未知场景: {scenario_id}")
    cast = scenario.get("cast") or []
    opener_turn = None
    if cast:
        first = cast[0]
        opener_turn = {
            "role": "assistant",
            "by": first["id"],
            "by_name": first.get("name", ""),
            "text": scenario.get("opener") or first.get("opener", ""),
        }
    return {
        "scenario_id": scenario_id,
        "domain": domain or scenario.get("cat", "work"),
        "title": scenario.get("title", ""),
        "goal": scenario.get("goal", ""),
        "cast": cast,
        "covers": scenario.get("covers") or [],
        "phrases": scenario.get("phrases") or [],
        "history": [opener_turn] if opener_turn else [],
        "user_turns": 0,
        "beat_index": 1,
        "beats": scenario.get("beats") or [],
    }


def _cast_of(session: dict, cast_id: str | None) -> dict[str, Any] | None:
    cast = session.get("cast") or []
    for c in cast:
        if c.get("id") == cast_id:
            return c
    return cast[0] if cast else None


def pick_next_speaker(session: dict) -> dict[str, Any] | None:
    """选择下一个说话的角色（避开上一个说话人）。"""
    cast = session.get("cast") or []
    if not cast:
        return None
    last = None
    for turn in reversed(session.get("history") or []):
        if turn.get("role") == "assistant":
            last = turn.get("by")
            break
    pool = [c for c in cast if c.get("id") != last] or cast
    # 简单轮转
    return pool[session.get("beat_index", 0) % len(pool)]


def build_actor_messages(session: dict, speaker: dict[str, Any],
                         user_text: str) -> list[dict]:
    others = [c for c in (session.get("cast") or []) if c.get("id") != speaker.get("id")]
    history = [
        {"role": t["role"], "text": t["text"], "by_name": t.get("by_name", "")}
        for t in session.get("history", [])
    ]
    return prompts.actor_messages(
        goal=session.get("goal", ""),
        role_name=speaker.get("name", ""),
        role_role=speaker.get("role", ""),
        stance=speaker.get("stance", ""),
        others=[{"name": o.get("name", ""), "role": o.get("role", "")} for o in others],
        history=history,
        user_text=user_text,
    )


def offline_reply(session: dict) -> dict[str, Any] | None:
    """无 LLM 时的离线剧本：按 beats 顺序推进。"""
    beats = session.get("beats") or []
    idx = session.get("beat_index", 0)
    if idx >= len(beats):
        return None
    beat = beats[idx]
    session["beat_index"] = idx + 1
    by = _cast_of(session, beat.get("by"))
    return {"by": beat.get("by"), "by_name": (by or {}).get("name", ""),
            "text": beat.get("text", "")}


async def actor_reply(llm, session: dict, user_text: str) -> dict[str, Any]:
    """记录用户发言并产出下一个角色的回复。"""
    session["history"].append({"role": "user", "text": user_text})
    session["user_turns"] = session.get("user_turns", 0) + 1
    # 7.2 对话中实时观察：每轮就把可疑信号记下来，供复盘汇总
    session.setdefault("live_signals", []).extend(observe_turn_signals(user_text))

    if llm is None:
        reply = offline_reply(session)
        if reply is None:
            return {"text": "", "by_name": ""}
        session["history"].append({"role": "assistant", "by": reply["by"],
                                    "by_name": reply["by_name"], "text": reply["text"]})
        return reply

    speaker = pick_next_speaker(session)
    if speaker is None:
        return {"text": "", "by_name": ""}
    messages = build_actor_messages(session, speaker, user_text)
    text = await llm.chat(messages, temperature=0.9, max_tokens=160)
    text = (text or "").strip()
    # 兜底：NPC 只能用英文；检测到中文则重试一次
    if _CJK.search(text):
        try:
            retry = messages + [{
                "role": "system",
                "content": "Your last reply contained Chinese characters. Reply again, in English only, with no Chinese.",
            }]
            again = await llm.chat(retry, temperature=0.7, max_tokens=160)
            again = (again or "").strip()
            if again and not _CJK.search(again):
                text = again
        except Exception:
            pass
        if _CJK.search(text):
            text = "Sorry, I didn't quite catch that — could you say it again?"
    session["history"].append({"role": "assistant", "by": speaker.get("id"),
                                "by_name": speaker.get("name", ""), "text": text})
    return {"by": speaker.get("id"), "by_name": speaker.get("name", ""), "text": text}


# ---------------------------------------------------------------- 复盘

_HESITATION_MARKERS = ("i don't know", "not sure", "um", "uh", "sorry", "maybe")


def observe_turn_signals(user_text: str) -> list[dict[str, Any]]:
    """实时短板观察（7.2）。对话中每轮调用，启发式捕捉卡顿/回避/用错信号。"""
    text = (user_text or "").strip()
    words = text.split()
    signals: list[dict[str, Any]] = []
    if len(words) < 5:
        signals.append({"type": "avoidance", "issue": "回答过短，可能回避开口",
                        "quote": text})
    low = text.lower()
    for marker in _HESITATION_MARKERS:
        if marker in low:
            signals.append({"type": "pattern", "issue": f"犹豫/回避措辞：{marker}",
                            "quote": text})
    return signals

def local_review(session: dict) -> dict[str, Any]:
    """本地兜底复盘：至少统计话轮，给一个粗略成败。"""
    turns = session.get("user_turns", 0)
    stuck = list(session.get("live_signals") or [])
    if turns < 3 and not stuck:
        stuck = [{"quote": "（样本不足）", "issue": "用户话轮太少，可能回避了开口",
                  "type": "avoidance"}]
    return {
        "success": turns >= 3,
        "achieved_skills": session.get("covers", [])[:1] if turns >= 3 else [],
        "stuck": stuck,
        "advice": "多开口、把目标的事主动说完。" if turns < 3 else "继续在真实场景里复现。",
        "source": "local",
    }


async def review_session(llm, session: dict) -> dict[str, Any]:
    if llm is None:
        return local_review(session)
    turns = [{"role": t["role"], "text": t["text"],
              "by": t.get("by_name", "")} for t in session.get("history", [])]
    messages = prompts.scenario_review_messages(
        goal=session.get("goal", ""),
        scenario_title=session.get("title", ""),
        turns=turns,
        skill_ids=session.get("covers", []),
    )
    try:
        text = await llm.chat(messages, temperature=0.4, max_tokens=700)
    except Exception:
        return local_review(session)
    data = prompts.parse_json_reply(text)
    if not data:
        return local_review(session)
    data["source"] = "llm"
    # 只允许从 covers 里挑功能，防止模型自造
    allowed = set(session.get("covers") or [])
    data["achieved_skills"] = [s for s in (data.get("achieved_skills") or []) if s in allowed]
    # 合并对话中实时捕捉到的信号（7.2），避免 LLM 复盘漏掉
    live = list(session.get("live_signals") or [])
    existing = {(s.get("quote"), s.get("issue")) for s in (data.get("stuck") or [])}
    for sig in live:
        if (sig.get("quote"), sig.get("issue")) not in existing:
            data.setdefault("stuck", []).append(sig)
    return data


def apply_review_to_profile(profile: dict[str, Any], session: dict,
                            review: dict[str, Any]) -> dict[str, Any]:
    """把复盘结局写入画像。"""
    from .. import models

    domain = session.get("domain", "work")
    success = bool(review.get("success"))
    skills = review.get("achieved_skills") or []
    stuck = review.get("stuck") or []
    stuck_text = "; ".join(s.get("quote", "") for s in stuck if s.get("quote"))

    models.record_scenario(profile, domain, session.get("scenario_id", ""),
                           success=success, skills=skills, stuck_at=stuck_text)

    for s in stuck:
        stype = s.get("type", "")
        issue = f"{s.get('issue','')} | {s.get('quote','')}"
        if stype == "avoidance":
            # 回避信号：关联到场景覆盖的言语功能
            for skill_id in (session.get("covers") or [])[:1]:
                models.record_avoidance(profile, domain, skill_id,
                                        evidence=issue, source="scenario")
        elif stype in ("ear", "word", "pattern"):
            models.record_error(profile, domain, "speaking", s.get("quote", ""),
                                detail=issue, source="scenario")
    return profile
