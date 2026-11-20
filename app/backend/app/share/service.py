"""分享笔记：今天 vs 昨天，生成小红书风格的学习日记。

原则：
- 只使用画像里真实存在的数字，AI 不得自造；
- 只做聚合对比，不暴露具体错误原句/录音/薄弱词；
- 没配 LLM 时走本地模板，仍可分享。
"""
from __future__ import annotations

from typing import Any

from .. import models
from ..llm import prompts

HASHTAGS = ["#英语听力", "#职场英语", "#英语打卡", "#成人英语"]

METRIC_DEFS = [
    ("listening", "听辨", "%"),
    ("shadow", "跟读", "分"),
    ("minimal_pairs", "对立对", "%"),
    ("recitation", "背诵", "分"),
]

NEXT_BY_METRIC = {
    "listening": "复听 5 个没听出的词",
    "shadow": "练 5 句跟读，先顺连读",
    "minimal_pairs": "练 5 组易混音",
    "recitation": "背 1 段，先看关键词",
    "default": "1 轮听辨 + 1 段跟读",
}

VERDICT_LABELS = {
    "better": "好一点",
    "worse": "有点退步",
    "same": "差不多",
    "no_baseline": "昨天没有练习记录",
    "no_compare": "今天先找找感觉",
}


def _day_metrics(profile: dict[str, Any], domain: str, day: str) -> dict[str, Any]:
    d = models.ensure_domain(profile, domain)
    bucket = (d.get("daily") or {}).get(day) or {}

    listening = list((bucket.get("listening") or {}).values())
    li_total = len(listening)
    li_correct = sum(1 for r in listening if r.get("correct"))
    li_score = round(li_correct / li_total * 100) if li_total else None

    pron = [v for v in (d.get("pronunciation") or {}).values()
            if models.local_date_of(v.get("at", "")) == day
            and isinstance(v.get("score"), (int, float))]
    sh_score = round(sum(v["score"] for v in pron) / len(pron)) if pron else None

    mp = bucket.get("minimal_pairs") or {}
    mp_total = int(mp.get("total") or 0)
    mp_score = round(int(mp.get("ok") or 0) / mp_total * 100) if mp_total else None

    rec = [h for h in (d.get("recitation", {}).get("history") or [])
           if str(h.get("date") or "") == day and isinstance(h.get("score"), (int, float))]
    rec_score = round(sum(float(h["score"]) for h in rec) / len(rec)) if rec else None

    scen = [r for r in (d.get("scenario_record") or [])
            if models.local_date_of(r.get("at", "")) == day]
    errors = [e for e in (d.get("errors") or [])
              if models.local_date_of(e.get("at", "")) == day]

    practiced = bool(li_total or mp_total or pron or rec or scen or errors
                     or bucket.get("recap"))
    return {
        "date": day,
        "practiced": practiced,
        "listening": li_score,
        "shadow": sh_score,
        "minimal_pairs": mp_score,
        "recitation": rec_score,
        "listening_total": li_total,
        "shadow_count": len(pron),
        "recitation_count": len(rec),
        "scenario": {"done": bool(scen), "success": any(r.get("success") for r in scen)},
        "errors": len(errors),
    }


def _active_dates(profile: dict[str, Any], domain: str) -> set[str]:
    d = models.ensure_domain(profile, domain)
    dates: set[str] = set()
    for day, b in (d.get("daily") or {}).items():
        if (b.get("listening") or b.get("minimal_pairs") or b.get("recap")):
            dates.add(str(day))
    for h in (d.get("history") or []):
        if h.get("date"):
            dates.add(str(h["date"]))
    for v in (d.get("pronunciation") or {}).values():
        if v.get("at"):
            dates.add(models.local_date_of(v["at"]))
    for r in (d.get("scenario_record") or []):
        if r.get("at"):
            dates.add(models.local_date_of(r["at"]))
    for h in (d.get("recitation", {}).get("history") or []):
        if h.get("date"):
            dates.add(str(h["date"]))
    return {x for x in dates if x}


def _streak(dates: set[str], today: str) -> int:
    from datetime import date, timedelta
    n = 0
    cur = date.fromisoformat(today)
    while cur.isoformat() in dates:
        n += 1
        cur -= timedelta(days=1)
    return n


def _fmt_value(key: str, value: float | None) -> str:
    if value is None:
        return "—"
    return f"{round(value)}%" if key in ("listening", "minimal_pairs") else f"{round(value)}分"


def _delta_text(key: str, today: float, yesterday: float) -> tuple[str, str, float]:
    delta = round(today - yesterday, 1)
    if delta == 0:
        return "0", "flat", 0.0
    sign = "+" if delta > 0 else ""
    unit = "%" if key in ("listening", "minimal_pairs") else ""
    text = f"{sign}{round(delta, 1)}{unit}"
    return text, ("up" if delta > 0 else "down"), delta


def _verdict(comparable: list[dict[str, Any]]) -> str:
    ups = sum(1 for m in comparable if m["delta"] > 0)
    downs = sum(1 for m in comparable if m["delta"] < 0)
    if ups > downs:
        return "better"
    if downs > ups:
        return "worse"
    return "same"


def _next_for(key: str | None) -> str:
    return NEXT_BY_METRIC.get(key or "", NEXT_BY_METRIC["default"])


def compute_facts(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    today = models.local_date(0)
    yesterday = models.local_date(-1)
    t = _day_metrics(profile, domain, today)
    y = _day_metrics(profile, domain, yesterday)
    dates = _active_dates(profile, domain)
    day_no = len([d for d in dates if d <= today])
    streak = _streak(dates, today)

    rows: list[dict[str, Any]] = []
    for key, label, unit in METRIC_DEFS:
        tv = t.get(key)
        yv = y.get(key)
        row = {"key": key, "label": label, "today": tv, "yesterday": yv,
               "today_text": _fmt_value(key, tv), "unit": unit,
               "delta": None, "delta_text": "", "dir": "flat"}
        if tv is not None and yv is not None:
            row["delta_text"], row["dir"], row["delta"] = _delta_text(key, tv, yv)
        if tv is not None:
            rows.append(row)

    comparable = [r for r in rows if r["delta"] is not None]
    if not y["practiced"]:
        verdict = "no_baseline"
    elif not comparable:
        verdict = "no_compare"
    else:
        verdict = _verdict(comparable)

    # 卡片只展示 2 个：有对比时取变化最大的；没有对比时取前两个
    if comparable:
        shown = sorted(comparable, key=lambda r: abs(r["delta"]), reverse=True)[:2]
    else:
        shown = rows[:2]

    better = ""
    worse = ""
    if comparable:
        positives = [r for r in comparable if r["delta"] > 0]
        negatives = [r for r in comparable if r["delta"] < 0]
        if positives:
            b = max(positives, key=lambda r: r["delta"])
            better = f"{b['label']}比昨天高 {abs(b['delta'])}{'%' if b['key'] in ('listening', 'minimal_pairs') else '分'}"
        else:
            better = "今天完成了一轮练习"
        if negatives:
            w = min(negatives, key=lambda r: r["delta"])
            worse = f"{w['label']}比昨天低 {abs(w['delta'])}{'%' if w['key'] in ('listening', 'minimal_pairs') else '分'}"
        else:
            worse = "没有明显退步"
    else:
        better = "今天完成了一轮练习" if t["practiced"] else ""
        worse = "昨天没有练习记录，今天重新开始" if not t["practiced"] else "今天先找找感觉"

    worst_metric = None
    if comparable:
        worst_metric = min(comparable, key=lambda r: r["delta"])["key"]
    elif rows:
        worst_metric = min(rows, key=lambda r: r["today"] if r["today"] is not None else 999)["key"]
    next_action = _next_for(worst_metric)

    if verdict == "better":
        quote = "不是突然变厉害，是终于听顺了一点。"
    elif verdict == "worse":
        quote = "今天有点卡，但至少知道卡在哪。"
    elif verdict == "same":
        quote = "没退步，就是还在磨。"
    elif verdict == "no_compare":
        quote = "先练起来，数据会慢慢对齐。"
    else:
        quote = "重新开始的第一天，先把自己捡起来。"

    facts = {
        "date": today,
        "yesterday": yesterday,
        "domain": domain,
        "day_no": max(1, day_no),
        "streak": streak,
        "practiced_today": t["practiced"],
        "yesterday_practiced": y["practiced"],
        "verdict": verdict,
        "verdict_label": VERDICT_LABELS[verdict],
        "metrics": shown,
        "all_metrics": rows,
        "today": t,
        "yesterday_stats": y,
        "better": better,
        "better_label": "好一点" if any(r["delta"] > 0 for r in comparable) else "做到",
        "worse": worse,
        "worse_label": "卡一下",
        "next": next_action,
        "quote": quote,
        "hashtags": list(HASHTAGS),
    }
    facts["caption"] = local_caption(facts)
    return facts


def local_caption(facts: dict[str, Any]) -> str:
    n = facts["day_no"]
    lines = [f"用耳界练英语的第 {n} 天。", ""]
    if facts["verdict"] == "no_baseline":
        lines.append("昨天没有练习记录，今天重新开始。")
    elif facts["verdict"] == "no_compare":
        lines.append(f"今天{facts['better']}。")
    else:
        lines.append(f"今天{facts['better']}，{facts['worse']}。")
    lines.append(f"{facts['next']}。")
    lines.append("")
    lines.append("有一起练的吗？评论区打卡，我们互相盯着。")
    lines.append("")
    lines.append(" ".join(facts.get("hashtags") or HASHTAGS))
    return "\n".join(lines)


def _clip(s: Any, n: int) -> str:
    t = str(s or "").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def _normalize_ai(data: dict | None, facts: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        return facts
    out = dict(facts)
    # 卡片上的「好在/差在/下一步」保持后端短句，避免 AI 写长后卡片换行重叠；
    # AI 负责 quote 和完整的小红书文案。
    if data.get("quote"):
        out["quote"] = _clip(data["quote"], 28)
    if data.get("caption"):
        out["caption"] = str(data["caption"]).strip()
    tags = data.get("hashtags")
    if isinstance(tags, list) and tags:
        out["hashtags"] = [_clip(x, 20) for x in tags[:6] if str(x).strip()]
    # 保证品牌开场句存在；AI 漏了或和结论冲突就用本地文案
    cap = out["caption"]
    wrong_way = (
        out["verdict"] == "worse" and any(w in cap for w in ("有进步", "变好", "提升"))
    ) or (
        out["verdict"] == "better" and any(w in cap for w in ("有退步", "变差"))
    )
    if "耳界" not in cap or wrong_way:
        out["caption"] = local_caption(out)
    elif out["hashtags"] and "#" not in cap:
        out["caption"] = cap + "\n\n" + " ".join(out["hashtags"])
    out["source"] = "ai"
    return out


async def build_note(llm, domain: str, profile: dict[str, Any]) -> dict[str, Any]:
    facts = compute_facts(profile, domain)
    # 今天没练就不调用 AI，前端会提示先练一轮
    if llm is None or not facts.get("practiced_today"):
        facts["source"] = "local"
        return facts
    try:
        text = await llm.chat(
            prompts.share_note_messages(domain, facts),
            temperature=0.7, max_tokens=800,
        )
        data = prompts.parse_json_reply(text)
        if data:
            return _normalize_ai(data, facts)
    except Exception:
        pass
    facts["source"] = "local"
    return facts
