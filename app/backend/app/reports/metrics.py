"""报告 v2：周期化的六维能力指标。

原则：
- period 真正参与筛选；
- 比例指标带 n 和 Wilson 95% 区间；
- 样本不足明确标注，不输出 0%/100% 的假掌握；
- 词汇是累计快照，不伪装成周期变化。
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from .. import models

CONF_LABEL = {"high": "高置信", "medium": "中置信", "low": "低置信", "none": "无数据"}

# key -> (high_n, medium_n)
CONF_RULES = {
    "listening": (20, 8),
    "effort": (6, 3),
    "phoneme": (20, 8),
    "pronunciation": (10, 4),
    "interaction": (10, 5),
    "vocab": (50, 20),
}


def period_range(period: str, today: date | None = None) -> dict[str, Any]:
    """返回当前/上一周期。上一周期按相同 weekday / 相同日对齐。"""
    today = today or date.fromisoformat(models.local_date(0))
    if period == "month":
        start = today.replace(day=1)
        prev_start = (start - timedelta(days=1)).replace(day=1)
        nxt = (prev_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        prev_end = min(prev_start + timedelta(days=today.day - 1), nxt - timedelta(days=1))
        label = "本月"
    else:
        start = today - timedelta(days=today.weekday())
        prev_start = start - timedelta(days=7)
        prev_end = today - timedelta(days=7)
        label = "本周"
    return {
        "period": "month" if period == "month" else "week",
        "label": label,
        "start": start.isoformat(),
        "end": today.isoformat(),
        "prev_start": prev_start.isoformat(),
        "prev_end": prev_end.isoformat(),
        "days": (today - start).days + 1,
    }


def _in(value: str, start: str, end: str) -> bool:
    d = models.local_date_of(value)
    return bool(d) and start <= d <= end


def _median(nums: list[float]) -> float | None:
    if not nums:
        return None
    s = sorted(nums)
    m = len(s) // 2
    return (s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2)


def wilson(success: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """比例的 Wilson 95% 区间，返回 0–1。"""
    if total <= 0:
        return 0.0, 0.0
    p = success / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    margin = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return max(0.0, center - margin), min(1.0, center + margin)


def _confidence(n: int, key: str) -> str:
    high, medium = CONF_RULES.get(key, (20, 8))
    if n >= high:
        return "high"
    if n >= medium:
        return "medium"
    if n > 0:
        return "low"
    return "none"


def _delta(cur: float | None, prev: float | None, unit: str,
           min_n: bool = True, threshold: float = 3.0) -> dict[str, Any]:
    if cur is None or prev is None or not min_n:
        return {"delta": None, "delta_text": "", "direction": "none"}
    diff = cur - prev
    direction = "flat" if abs(diff) < threshold else ("up" if diff > 0 else "down")
    if direction == "flat":
        return {"delta": round(diff, 1), "delta_text": "持平", "direction": "flat"}
    sign = "+" if diff > 0 else ""
    text = f"{sign}{round(diff, 1)}{unit}"
    return {"delta": round(diff, 1), "delta_text": text, "direction": direction}


def _stats(profile: dict[str, Any], domain: str, start: str, end: str) -> dict[str, Any]:
    d = models.ensure_domain(profile, domain)
    out = {
        "listening": {"correct": 0, "total": 0, "weighted": 0.0, "weight": 0.0},
        "minimal_pairs": {"ok": 0, "total": 0},
        "pronunciation": {"scores": [], "issues": 0},
        "recitation": {"scores": [], "coverages": []},
        "scenario": {"attempts": 0, "success": 0},
        "errors": 0,
        "active_dates": set(),
    }

    for day, b in (d.get("daily") or {}).items():
        if not (start <= str(day) <= end):
            continue
        items = list((b.get("listening") or {}).values())
        mp = b.get("minimal_pairs") or {}
        if items or int(mp.get("total") or 0) or b.get("recap"):
            out["active_dates"].add(str(day))
        for r in items:
            out["listening"]["total"] += 1
            if r.get("correct"):
                out["listening"]["correct"] += 1
            diff = max(1, int(r.get("difficulty") or 2))
            out["listening"]["weighted"] += diff * (1 if r.get("correct") else 0)
            out["listening"]["weight"] += diff
        out["minimal_pairs"]["ok"] += int(mp.get("ok") or 0)
        out["minimal_pairs"]["total"] += int(mp.get("total") or 0)

    for v in (d.get("pronunciation") or {}).values():
        if not _in(v.get("at", ""), start, end):
            continue
        if isinstance(v.get("score"), (int, float)):
            out["pronunciation"]["scores"].append(float(v["score"]))
        out["pronunciation"]["issues"] += len(v.get("issues") or [])
        out["active_dates"].add(models.local_date_of(v.get("at", "")))

    for h in (d.get("recitation", {}).get("history") or []):
        day = str(h.get("date") or "")
        if not (start <= day <= end):
            continue
        if isinstance(h.get("score"), (int, float)):
            out["recitation"]["scores"].append(float(h["score"]))
        if isinstance(h.get("coverage"), (int, float)):
            out["recitation"]["coverages"].append(float(h["coverage"]))
        out["active_dates"].add(day)

    for r in (d.get("scenario_record") or []):
        if not _in(r.get("at", ""), start, end):
            continue
        out["scenario"]["attempts"] += 1
        if r.get("success"):
            out["scenario"]["success"] += 1
        out["active_dates"].add(models.local_date_of(r.get("at", "")))

    for e in (d.get("errors") or []):
        if _in(e.get("at", ""), start, end):
            out["errors"] += 1
            out["active_dates"].add(models.local_date_of(e.get("at", "")))

    for h in (d.get("history") or []):
        if start <= str(h.get("date") or "") <= end:
            out["active_dates"].add(str(h.get("date")))

    return out


def _trend(profile: dict[str, Any], domain: str, start: str, end: str) -> list[dict[str, Any]]:
    d = models.ensure_domain(profile, domain)
    rows: list[dict[str, Any]] = []
    cur = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while cur <= last:
        day = cur.isoformat()
        items = list(((d.get("daily") or {}).get(day, {}) or {}).get("listening", {}).values())
        total = len(items)
        correct = sum(1 for r in items if r.get("correct"))
        rows.append({
            "date": day,
            "total": total,
            "correct": correct,
            "accuracy": round(correct / total * 100) if total else None,
        })
        cur += timedelta(days=1)
    return rows


def _dim(key: str, label: str, score: float | None, unit: str, n: int,
         prev: float | None, prev_n: int, note: str = "", ci: tuple | None = None,
         effort_days: int | None = None) -> dict[str, Any]:
    confidence = _confidence(n, key)
    min_n = n >= CONF_RULES.get(key, (20, 8))[1] and prev_n >= CONF_RULES.get(key, (20, 8))[1]
    delta = _delta(score, prev, unit, min_n=min_n)
    out = {
        "key": key,
        "label": label,
        "score": round(score, 1) if score is not None else None,
        "unit": unit,
        "n": n,
        "confidence": confidence,
        "confidence_label": CONF_LABEL[confidence],
        "note": note,
        **delta,
    }
    if ci:
        out["ci"] = [round(ci[0] * 100, 1), round(ci[1] * 100, 1)]
    if effort_days is not None:
        out["effort_days"] = effort_days
    return out


def compute(profile: dict[str, Any], domain: str, period: str = "week") -> dict[str, Any]:
    r = period_range(period)
    cur = _stats(profile, domain, r["start"], r["end"])
    prev = _stats(profile, domain, r["prev_start"], r["prev_end"])

    li_n = cur["listening"]["total"]
    li_score = (cur["listening"]["weighted"] / cur["listening"]["weight"] * 100) if cur["listening"]["weight"] else None
    li_prev_n = prev["listening"]["total"]
    li_prev = (prev["listening"]["weighted"] / prev["listening"]["weight"] * 100) if prev["listening"]["weight"] else None
    li_ci = wilson(cur["listening"]["correct"], li_n) if li_n else None

    ph_n = cur["minimal_pairs"]["total"]
    ph_score = (cur["minimal_pairs"]["ok"] / ph_n * 100) if ph_n else None
    ph_prev_n = prev["minimal_pairs"]["total"]
    ph_prev = (prev["minimal_pairs"]["ok"] / ph_prev_n * 100) if ph_prev_n else None
    ph_ci = wilson(cur["minimal_pairs"]["ok"], ph_n) if ph_n else None

    scores = cur["pronunciation"]["scores"]
    pr_score = _median(scores)
    pr_prev = _median(prev["pronunciation"]["scores"])

    sc_n = cur["scenario"]["attempts"]
    sc_score = (cur["scenario"]["success"] / sc_n * 100) if sc_n else None
    sc_prev_n = prev["scenario"]["attempts"]
    sc_prev = (prev["scenario"]["success"] / sc_prev_n * 100) if sc_prev_n else None
    sc_ci = wilson(cur["scenario"]["success"], sc_n) if sc_n else None

    d = models.ensure_domain(profile, domain)
    vc = models.vocab_state_counts(d)
    v_total = sum(vc.values())
    v_mastered = vc.get(models.VOCAB_AUTOMATIC, 0)
    v_score = (v_mastered / v_total * 100) if v_total else None

    active = len(cur["active_dates"])
    prev_active = len(prev["active_dates"])
    effort_note = f"覆盖 {active}/{r['days']} 天"
    effort_score = float(active)
    effort_delta = float(active - prev_active) if prev_active or active else None

    metrics = [
        _dim("listening", "听力理解", li_score, "%", li_n, li_prev, li_prev_n,
             ci=li_ci, note=f"n={li_n}"),
        _dim("phoneme", "语音感知", ph_score, "%", ph_n, ph_prev, ph_prev_n,
             ci=ph_ci, note=f"n={ph_n}"),
        _dim("vocab", "词汇自动化", v_score, "%", v_total, None, 0,
             note="累计快照；只计 automatic"),
        _dim("pronunciation", "发音可懂度", pr_score, "分", len(scores), pr_prev,
             len(prev["pronunciation"]["scores"]), note=f"n={len(scores)}"),
        _dim("interaction", "互动达成", sc_score, "%", sc_n, sc_prev, sc_prev_n,
             ci=sc_ci, note=f"n={sc_n}"),
        _dim("effort", "学习投入", effort_score, "天", active, float(prev_active),
             prev_active, note=effort_note, effort_days=r["days"]),
    ]
    # 学习投入的天数差用“天”而不是百分比阈值
    for m in metrics:
        if m["key"] == "effort" and effort_delta is not None:
            diff = effort_delta
            m["delta"] = diff
            m["delta_text"] = f"{'+' if diff > 0 else ''}{int(diff)}天" if diff else "持平"
            m["direction"] = "up" if diff > 0 else ("down" if diff < 0 else "flat")

    # 只有能力维度参与“变好/变差”；学习投入是行为，不混进能力趋势
    comparable = [m for m in metrics
                  if m["key"] not in ("effort", "vocab")
                  and m["delta"] is not None and m["n"] > 0]
    ups = [m for m in comparable if m["direction"] == "up"]
    downs = [m for m in comparable if m["direction"] == "down"]
    if not cur["active_dates"]:
        verdict = "insufficient"
        headline = "本期数据还不够，先完成一轮训练"
    elif not comparable:
        verdict = "no_baseline" if not prev_active else "no_compare"
        headline = "本期：暂无能力维度可对比数据"
    elif ups and not downs:
        verdict = "better"
        headline = f"本期：{ups[0]['label']}在涨"
    elif downs and not ups:
        verdict = "worse"
        headline = f"本期：{downs[0]['label']}在退"
    elif ups and downs:
        verdict = "mixed"
        headline = f"本期：{ups[0]['label']}在涨，{downs[0]['label']}还卡"
    else:
        verdict = "same"
        headline = "本期：整体持平"

    def _item(m: dict[str, Any]) -> dict[str, Any]:
        return {"key": m["key"], "label": m["label"], "score": m["score"],
                "unit": m["unit"], "n": m["n"], "confidence": m["confidence"],
                "delta_text": m["delta_text"], "direction": m["direction"]}

    strengths = [_item(m) for m in sorted([x for x in comparable if x["direction"] == "up"],
                                            key=lambda x: abs(x["delta"]), reverse=True)[:2]]
    gaps = [_item(m) for m in sorted([x for x in comparable if x["direction"] == "down"],
                                      key=lambda x: abs(x["delta"]), reverse=True)[:2]]
    # 没有周期变化时，用低分且有样本的维度作为短板
    if not gaps:
        low = [m for m in metrics if m["key"] not in ("effort", "vocab")
               and m["score"] is not None and m["confidence"] in ("medium", "high")]
        gaps = [_item(m) for m in sorted(low, key=lambda x: x["score"])[:1]]

    return {
        **r,
        "active_days": active,
        "period_days": r["days"],
        "coverage": {
            "listening": li_n,
            "phoneme": ph_n,
            "pronunciation": len(scores),
            "recitation": len(cur["recitation"]["scores"]),
            "scenario": sc_n,
            "errors": cur["errors"],
        },
        "metrics": metrics,
        "daily_trend": _trend(profile, domain, r["start"], r["end"]),
        "recitation": {
            "count": len(cur["recitation"]["scores"]),
            "avg_score": round(sum(cur["recitation"]["scores"]) / len(cur["recitation"]["scores"]), 1)
            if cur["recitation"]["scores"] else None,
            "avg_coverage": round(sum(cur["recitation"]["coverages"]) / len(cur["recitation"]["coverages"]), 2)
            if cur["recitation"]["coverages"] else None,
        },
        "verdict": verdict,
        "headline": headline,
        "strengths": strengths,
        "gaps": gaps,
        "confidence": _confidence(max([m["n"] for m in metrics] or [0]), "listening"),
        "limits": [
            "暂无每题反应时间，听力只按正确率与难度加权",
            "词汇为累计快照，不是本期变化",
            "发音评分来自 ASR，低样本时仅供参考",
        ],
    }
