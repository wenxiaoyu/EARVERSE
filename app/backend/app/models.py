"""用户画像数据模型（task 2.1）。

设计要点（见 design.md D4）：
- 画像按 domain（场景）分片存储：每个场景独立短板/进度/节奏，互不影响；
- 另有 global 层存跨场景通用短板，避免「换场景就全忘」；
- 五维度：听力盲区、词汇掌握度、表达回避、场景战绩、错误史。

本模块保持纯函数 + 纯 dict 结构（不依赖 pydantic / DB），便于单测。
"""
from __future__ import annotations

import re

from datetime import date, datetime, timedelta, timezone
from typing import Any

SCHEMA_VERSION = 1

# 词汇掌握度四态（铁律：区分「不认识 / 认识但听不出 / 能懂但慢 / 已自动化」）
VOCAB_UNKNOWN = "unknown"        # 不认识（看到也不懂）
VOCAB_DEAF = "deaf"              # 哑巴词汇：看到认识、听到反应不出
VOCAB_RECOGNIZED = "recognized"  # 能听懂但反应慢（未自动化）
VOCAB_AUTOMATIC = "automatic"    # 听到即懂、反应快

# 反应时间阈值：低于此值视为「已自动化」
REACTION_THRESHOLD_MS = 1200

# 言语功能毕业所需的不同场合数
SKILL_GRADUATE_VENUES = 3

# 听力盲区内部 ID -> 展示名（避免界面出现 "core" 这类内部标识）
HEARING_LABELS = {
    "core": "核心高频词",
    "weak-form": "弱读",
    "weak_form": "弱读",
    "linking": "连读",
    "elision": "吞音",
    "reduction": "语流弱化",
    "connected-speech": "连读弱读",
    "assimilation": "同化",
    "intonation": "语调",
}


def hearing_label(rule_id: str, name: str = "") -> str:
    """把听力盲区名称变短、可读：映射 ID、去掉括号补充、限长。"""
    rid = (rule_id or "").strip()
    if rid in HEARING_LABELS:
        return HEARING_LABELS[rid]
    text = (name or rid).strip()
    text = re.split(r"[（(]", text)[0].strip(" /·-、")
    return (text or rid)[:14]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_date(offset_days: int = 0) -> str:
    """本地日期（避免 UTC 跨天错位）。"""
    return (date.today() + timedelta(days=offset_days)).isoformat()


def record_pron_issue(profile: dict[str, Any], domain: str, sound: str = "",
                      heard_as: str = "", word: str = "", tip: str = "") -> dict[str, Any]:
    """记录最近错点，供跟读/最小对立对下一组定向出题。"""
    d = ensure_domain(profile, domain)
    lst = d.setdefault("recent_pron_issues", [])
    key = (sound, heard_as, word)
    lst[:] = [x for x in lst if (x.get("sound"), x.get("heard_as"), x.get("word")) != key]
    item = {"sound": sound, "heard_as": heard_as, "word": word, "tip": tip, "at": now_iso()}
    lst.append(item)
    d["recent_pron_issues"] = lst[-10:]
    _touch(profile)
    return item


def recent_pron_issues(profile: dict[str, Any], domain: str, limit: int = 5) -> list[dict[str, Any]]:
    d = ensure_domain(profile, domain)
    items = list(reversed(d.get("recent_pron_issues") or []))
    return items[:limit]


def local_date_of(value: str) -> str:
    """把 UTC ISO 时间转成本地日期（YYYY-MM-DD）。"""
    raw = str(value or "")
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone().date().isoformat()
    except Exception:
        return raw[:10]


def coach_sessions(profile: dict[str, Any], domain: str) -> list[dict[str, Any]]:
    c = ensure_domain(profile, domain).get("coach") or {}
    return [s for s in (c.get("sessions") or []) if isinstance(s, dict)]


def coach_excerpt(profile: dict[str, Any], domain: str,
                  day: str | None = None) -> dict[str, Any]:
    """当日 Manbo 复盘；没有当日会话则回退最近一次，并带上那个日期。

    coach_when: "today" 表示今天的复盘；否则是 YYYY-MM-DD；空表示从没聊过。
    """
    day = day or local_date(0)
    sessions = coach_sessions(profile, domain)
    today = next((s for s in reversed(sessions)
                  if local_date_of(s.get("at", "")) == day), None)
    if today:
        chosen, when = today, "today"
    elif sessions:
        chosen = sessions[-1]
        when = local_date_of(chosen.get("at", ""))
    else:
        return {"coach_comment": "", "coach_next": [], "coach_when": ""}
    return {
        "coach_comment": str(chosen.get("summary") or "")[:200],
        "coach_next": [str(x)[:60] for x in (chosen.get("next_focus") or [])][:2],
        "coach_when": when,
    }


def set_goal(profile: dict[str, Any], domain: str, goal: dict[str, Any]) -> dict[str, Any]:
    d = ensure_domain(profile, domain)
    d["goal"] = goal
    _touch(profile)
    return goal


def get_today_goal(profile: dict[str, Any], domain: str) -> dict[str, Any] | None:
    d = ensure_domain(profile, domain)
    g = d.get("goal")
    if isinstance(g, dict) and g.get("for_date") == local_date(0) and g.get("text"):
        return g
    return None


def _empty_domain() -> dict[str, Any]:
    """一个场景轨道的初始画像。"""
    return {
        "hearing": {},          # rule_id -> {name, count, last_at, source}
        "vocab": {},            # word_id -> {state, seen_known, heard, reaction_ms, last_at, source}
        "avoidance": {},        # skill_id -> {count, last_at, evidence}
        "scenario_record": [],  # [{scenario_id, success, skills, stuck_at, at}]
        "errors": [],           # [{kind, original, detail, source, at}]
        "skill_venues": {},     # skill_id -> [venue(doman/scenario)_key, ...] 去重
        "pronunciation": {},   # target -> {score, issues, confidence, transcript, at}
        "daily": {},            # date -> {listening:{key:rec}, minimal_pairs:{ok,total}}
        "goal": None,           # 今日目标（来自昨日复盘，for_date 当天有效）
        "recent_pron_issues": [],  # 最近发音/听辨错点（供下一组题定向）
        "recitation": _recitation_default(),
        "coach": {                 # 陪练会话摘要与回流焦点
            "sessions": [],
            "weak_points": [],
            "next_focus": [],
            "last_summary": "",
            "updated_at": "",
            "conversation": [],     # 最近跨会话对话 [{role, text, at}]
            "facts": [],            # 学习者主动说过的个人事实 [{text, at}]
            "answer_log": [],       # 每道题作答记录 [{focus, answer, correct, correction, at}]
        },
    }


def _recitation_default() -> dict[str, Any]:
    """背诵维度的初始结构（独立能力，不参与 Today 进度）。"""
    return {
        "level": 2,              # L1–L5，自动升降
        "streak": 0,             # 连续背诵天数
        "last_date": "",         # 最近一次完成日期
        "attempts": 0,
        "history": [],           # 最近 30 次摘要
        "weak_chunks": [],       # [{text, misses, last_at, source}]
        "wpm_trend": [],         # 最近 30 次 wpm
    }


def recitation_bucket(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    d = ensure_domain(profile, domain)
    b = d.setdefault("recitation", _recitation_default())
    for k, v in _recitation_default().items():
        b.setdefault(k, v)
    return b


def recitation_level(profile: dict[str, Any], domain: str) -> int:
    try:
        level = int(recitation_bucket(profile, domain).get("level", 2))
    except (TypeError, ValueError):
        level = 2
    return max(1, min(5, level))


def adapt_recitation_level(history: list[dict], current: int = 2) -> int:
    """按最近表现升降等级：连续两次高且低提示 → +1；最近一次完整度过低 → -1。"""
    cur = max(1, min(5, int(current or 2)))
    if not history:
        return cur
    last = history[-1]
    cov = float(last.get("coverage") or 0)
    hint = int(last.get("hint") or 0)
    recent = history[-2:]
    if len(recent) >= 2 and all(float(x.get("coverage") or 0) >= 0.85
                                and int(x.get("hint") or 0) <= 1 for x in recent):
        return min(5, cur + 1)
    if cov < 0.6:
        return max(1, cur - 1)
    return cur


def record_recitation(profile: dict[str, Any], domain: str,
                      attempt: dict[str, Any]) -> dict[str, Any]:
    """记录一次背诵：连续天数、历史、漏词语块、wpm 趋势、等级自适应。"""
    b = recitation_bucket(profile, domain)
    today = local_date(0)
    last = str(b.get("last_date") or "")
    if last != today:
        b["streak"] = int(b.get("streak") or 0) + 1 if last == local_date(-1) else 1
        b["last_date"] = today
    b["attempts"] = int(b.get("attempts") or 0) + 1

    summary = {
        "date": today,
        "at": now_iso(),
        "recitation_id": attempt.get("recitation_id", ""),
        "attempt_id": attempt.get("id", ""),
        "title": attempt.get("title", ""),
        "level": int(attempt.get("level") or recitation_level(profile, domain)),
        "hint": int(attempt.get("hint") or 0),
        "coverage": float(attempt.get("coverage") or 0),
        "accuracy": float(attempt.get("accuracy") or 0),
        "fluency": float(attempt.get("fluency") or 0),
        "independence": float(attempt.get("independence") or 0),
        "score": float(attempt.get("score") or 0),
        "wpm": float(attempt.get("wpm") or 0),
        "words": int(attempt.get("words") or 0),
    }
    hist = b.setdefault("history", [])
    hist.append(summary)
    b["history"] = hist[-30:]

    if summary["wpm"] > 0:
        trend = b.setdefault("wpm_trend", [])
        trend.append(round(summary["wpm"], 1))
        b["wpm_trend"] = trend[-30:]

    # 漏词语块：合并去重、累计 miss、保留最近 20 条
    for chunk in (attempt.get("missed_chunks") or []):
        text = str((chunk or {}).get("text") if isinstance(chunk, dict) else chunk).strip()
        if not text:
            continue
        lst = b.setdefault("weak_chunks", [])
        found = next((x for x in lst if str(x.get("text", "")).lower() == text.lower()), None)
        if found:
            found["misses"] = int(found.get("misses") or 0) + 1
            found["last_at"] = now_iso()
        else:
            lst.append({"text": text, "misses": 1, "last_at": now_iso(),
                        "source": "recitation"})
        b["weak_chunks"] = lst[-20:]

    b["level"] = adapt_recitation_level(b["history"], recitation_level(profile, domain))
    _touch(profile)
    return summary


def recitation_weak_chunks(profile: dict[str, Any], domain: str,
                           limit: int = 8) -> list[str]:
    b = recitation_bucket(profile, domain)
    items = sorted((b.get("weak_chunks") or []),
                   key=lambda x: str(x.get("last_at") or ""), reverse=True)
    items = sorted(items, key=lambda x: -int(x.get("misses") or 0))
    return [str(x.get("text")) for x in items[:limit] if x.get("text")]


def empty_profile(user_id: str = "default") -> dict[str, Any]:
    """新建一个空画像。"""
    return {
        "version": SCHEMA_VERSION,
        "user_id": user_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "global": _empty_domain(),   # 跨场景通用短板
        "domains": {},               # domain -> domain profile
    }


def ensure_domain(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    """取某场景轨道，不存在则创建。"""
    domains = profile.setdefault("domains", {})
    if domain not in domains:
        domains[domain] = _empty_domain()
    d = domains[domain]
    # 旧版本画像可能缺字段：按最新 schema 回填，避免写入时 KeyError
    for k, v in _empty_domain().items():
        d.setdefault(k, v)
    return d


def _touch(profile: dict[str, Any]) -> None:
    profile["updated_at"] = now_iso()


# ---------------------------------------------------------------- 词汇掌握度

def observe_vocab_seen(profile: dict[str, Any], domain: str, word_id: str,
                       known: bool, source: str = "") -> dict[str, Any]:
    """「看认不认识」层探测。"""
    bucket = ensure_domain(profile, domain)["vocab"]
    entry = bucket.setdefault(word_id, {"state": VOCAB_UNKNOWN})
    entry["seen_known"] = bool(known)
    entry["last_at"] = now_iso()
    if source:
        entry["source"] = source
    _recompute_vocab_state(entry)
    _touch(profile)
    return entry


def observe_vocab_heard(profile: dict[str, Any], domain: str, word_id: str,
                        heard: bool, reaction_ms: int | None = None,
                        source: str = "") -> dict[str, Any]:
    """「听认不认识」层探测，附带反应时间。"""
    bucket = ensure_domain(profile, domain)["vocab"]
    entry = bucket.setdefault(word_id, {"state": VOCAB_UNKNOWN})
    entry["heard"] = bool(heard)
    if reaction_ms is not None:
        entry["reaction_ms"] = int(reaction_ms)
    entry["last_at"] = now_iso()
    if source:
        entry["source"] = source
    _recompute_vocab_state(entry)
    _touch(profile)
    return entry


def _recompute_vocab_state(entry: dict[str, Any]) -> None:
    """按分层探测结果推导四态。核心：认识但听不出 = 哑巴词汇。"""
    seen = entry.get("seen_known")
    heard = entry.get("heard")
    if seen is False:
        entry["state"] = VOCAB_UNKNOWN
    elif seen is True and heard is False:
        entry["state"] = VOCAB_DEAF
    elif heard is True:
        reaction = entry.get("reaction_ms")
        if reaction is not None and reaction > REACTION_THRESHOLD_MS:
            entry["state"] = VOCAB_RECOGNIZED
        else:
            entry["state"] = VOCAB_AUTOMATIC
    # 只测过「看」没测过「听」：保持 unknown，等待听层探测


def vocab_state_counts(domain_profile: dict[str, Any]) -> dict[str, int]:
    counts = {VOCAB_UNKNOWN: 0, VOCAB_DEAF: 0, VOCAB_RECOGNIZED: 0, VOCAB_AUTOMATIC: 0}
    for entry in (domain_profile.get("vocab") or {}).values():
        state = entry.get("state", VOCAB_UNKNOWN)
        counts[state] = counts.get(state, 0) + 1
    return counts


def set_vocab_state(profile: dict[str, Any], domain: str, word_id: str,
                    state: str, source: str = "") -> dict[str, Any]:
    """由 AI 直接判定四态后写入（不经规则推导）。"""
    if state not in (VOCAB_UNKNOWN, VOCAB_DEAF, VOCAB_RECOGNIZED, VOCAB_AUTOMATIC):
        state = VOCAB_UNKNOWN
    bucket = ensure_domain(profile, domain)["vocab"]
    entry = bucket.setdefault(word_id, {})
    entry["state"] = state
    entry["last_at"] = now_iso()
    if source:
        entry["source"] = source
    _touch(profile)
    return entry


def record_pronunciation(profile: dict[str, Any], domain: str, target: str,
                          score: float | None = None,
                          issues: list[dict] | None = None,
                          confidence: float | None = None,
                          transcript: str = "") -> dict[str, Any]:
    """记录一次发音评估到画像的发音维度（按场景分轨）。"""
    d = ensure_domain(profile, domain)
    item = {
        "target": target,
        "score": score,
        "issues": list(issues or []),
        "confidence": confidence,
        "transcript": transcript,
        "at": now_iso(),
    }
    d["pronunciation"][target] = item
    _touch(profile)
    return item


# ---------------------------------------------------------------- 听力盲区

def daily_bucket(profile: dict[str, Any], domain: str, date: str | None = None) -> dict[str, Any]:
    """取「某场景 + 某天」的训练流水桶。"""
    d = ensure_domain(profile, domain)
    day = date or local_date(0)
    bucket = d.setdefault("daily", {}).setdefault(day, {})
    bucket.setdefault("listening", {})
    mp = bucket.setdefault("minimal_pairs", {})
    mp.setdefault("ok", 0)
    mp.setdefault("total", 0)
    return bucket


def record_daily_listening(profile: dict[str, Any], domain: str, item_key: str,
                           correct: bool, text: str = "", detail: str = "",
                           difficulty: int = 2) -> dict[str, Any]:
    bucket = daily_bucket(profile, domain)
    rec = {"key": item_key, "correct": bool(correct), "text": text,
           "detail": detail, "difficulty": difficulty, "at": now_iso()}
    bucket["listening"][item_key] = rec
    _touch(profile)
    return rec


def record_daily_minimal_pair(profile: dict[str, Any], domain: str,
                              correct: bool) -> dict[str, Any]:
    bucket = daily_bucket(profile, domain)
    mp = bucket["minimal_pairs"]
    mp["total"] = int(mp.get("total", 0)) + 1
    if correct:
        mp["ok"] = int(mp.get("ok", 0)) + 1
    _touch(profile)
    return mp


def record_hearing(profile: dict[str, Any], domain: str, rule_id: str,
                   name: str = "", source: str = "", weight: int = 1) -> dict[str, Any]:
    """记录/强化一个听力盲区（连读、弱读、吞音等）。同时写入 global 层。"""
    for scope in (ensure_domain(profile, domain), profile["global"]):
        bucket = scope["hearing"]
        entry = bucket.setdefault(rule_id, {"name": name, "count": 0})
        if name:
            entry["name"] = name
        entry["count"] = entry.get("count", 0) + weight
        entry["last_at"] = now_iso()
        if source:
            entry["source"] = source
    _touch(profile)
    return ensure_domain(profile, domain)["hearing"][rule_id]


# ---------------------------------------------------------------- 表达回避

def record_avoidance(profile: dict[str, Any], domain: str, skill_id: str,
                     evidence: str = "", source: str = "") -> dict[str, Any]:
    """记录一次表达回避（该说但绕开没说）。"""
    bucket = ensure_domain(profile, domain)["avoidance"]
    entry = bucket.setdefault(skill_id, {"count": 0})
    entry["count"] = entry.get("count", 0) + 1
    entry["last_at"] = now_iso()
    if evidence:
        entry["evidence"] = evidence
    if source:
        entry["source"] = source
    _touch(profile)
    return entry


# ---------------------------------------------------------------- 场景战绩 + 毕业

def record_scenario(profile: dict[str, Any], domain: str, scenario_id: str,
                    success: bool, skills: list[str] | None = None,
                    stuck_at: str = "") -> dict[str, Any]:
    """记录一次场景实战结果；成功的言语功能登记一个「场合」。"""
    d = ensure_domain(profile, domain)
    record = {
        "scenario_id": scenario_id,
        "success": bool(success),
        "skills": list(skills or []),
        "stuck_at": stuck_at,
        "at": now_iso(),
    }
    d["scenario_record"].append(record)
    if success:
        venue = f"{domain}:{scenario_id}"
        for skill_id in record["skills"]:
            venues = d["skill_venues"].setdefault(skill_id, [])
            if venue not in venues:
                venues.append(venue)
    _touch(profile)
    return record


def skill_venues(profile: dict[str, Any], skill_id: str) -> list[str]:
    """跨该用户所有场景轨道，汇总某言语功能已办成的场合（去重）。"""
    seen: list[str] = []
    for domain in profile.get("domains", {}).values():
        for v in (domain.get("skill_venues") or {}).get(skill_id, []):
            if v not in seen:
                seen.append(v)
    return seen


def is_skill_graduated(profile: dict[str, Any], skill_id: str) -> bool:
    """三场合毕业：同一功能在 >=3 个不同场合各办成 1 次。"""
    return len(skill_venues(profile, skill_id)) >= SKILL_GRADUATE_VENUES


# ---------------------------------------------------------------- 错误史

def record_error(profile: dict[str, Any], domain: str, kind: str,
                 original: str, detail: str = "", source: str = "") -> dict[str, Any]:
    """记录一条错误（听错/说错/写错的原句），供诊断与教练报告引用。"""
    d = ensure_domain(profile, domain)
    item = {
        "kind": kind,
        "original": original,
        "detail": detail,
        "source": source,
        "at": now_iso(),
    }
    d["errors"].append(item)
    _touch(profile)
    return item


# ---------------------------------------------------------------- 短板排序

def weakest_hearing(domain_profile: dict[str, Any], limit: int = 3) -> list[dict[str, Any]]:
    """按出现次数降序返回最弱听力盲区。"""
    items = [
        {"rule_id": rid, **info}
        for rid, info in (domain_profile.get("hearing") or {}).items()
    ]
    items.sort(key=lambda x: x.get("count", 0), reverse=True)
    merged: dict[str, dict[str, Any]] = {}
    for it in items:
        label = hearing_label(it["rule_id"], it.get("name", ""))
        if label in merged:
            merged[label]["count"] = merged[label].get("count", 0) + it.get("count", 0)
        else:
            merged[label] = {**it, "name": label}
    out = sorted(merged.values(), key=lambda x: x.get("count", 0), reverse=True)
    return out[:limit]


def deaf_words(domain_profile: dict[str, Any]) -> list[str]:
    """所有哑巴词汇的 word_id。"""
    return [
        wid for wid, e in (domain_profile.get("vocab") or {}).items()
        if e.get("state") == VOCAB_DEAF
    ]
