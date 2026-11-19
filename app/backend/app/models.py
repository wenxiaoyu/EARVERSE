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
    }


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
    day = date or now_iso()[:10]
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
