"""教练报告服务（task 9.1–9.2）。

优先 LLM 生成周报/月报；不可用时用本地确定性摘要兜底。
每条结论都要求带证据（错误原句）与行动（design/spec 要求）。
"""
from __future__ import annotations

from typing import Any

from .. import models
from ..llm import prompts
from ..training import loop


def _clip(s, n: int) -> str:
    s = str(s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def normalize_report(data: dict) -> dict:
    """把 AI/本地报告压到极简：2-3 条、每条短。"""
    secs = []
    for s in (data.get("sections") or [])[:3]:
        if not isinstance(s, dict):
            continue
        secs.append({
            "title": _clip(s.get("title"), 12),
            "finding": _clip(s.get("finding"), 60),
            "evidence": _clip(s.get("evidence"), 40),
            "action": _clip(s.get("action"), 50),
        })
    data["sections"] = secs
    data["next_week"] = [_clip(x, 40) for x in (data.get("next_week") or [])[:3]]
    data["headline"] = _clip(data.get("headline"), 24)
    return data


def _trend_word(verdict: str) -> str:
    return {"better": "变好", "worse": "变差", "same": "持平"}.get(verdict, "无对比")


def _metric_line(m: dict[str, Any]) -> str:
    if m.get("score") is None:
        return f"{m['label']}：无数据"
    d = f"，{m['delta_text']}" if m.get("delta_text") else ""
    return f"{m['label']} {round(m['score'])}{m['unit']}（n={m['n']}，{m['confidence_label']}{d}）"


def local_report(domain: str, period: str, profile: dict[str, Any],
                 facts: dict[str, Any] | None = None) -> dict[str, Any]:
    """基于周期 facts 的本地报告：结论、短板、下一步，全部带样本量。"""
    from . import metrics as metrics_mod

    facts = facts or metrics_mod.compute(profile, domain, period)
    ms = [m for m in facts.get("metrics", []) if m.get("n")]
    gaps = facts.get("gaps") or []
    strengths = facts.get("strengths") or []
    coverage = facts.get("coverage") or {}
    active = facts.get("active_days", 0)
    days = facts.get("period_days", 0)

    if not ms:
        sections = [
            {"title": "数据不足", "finding": "本期还没有足够的练习记录，暂不下能力结论。",
             "evidence": f"覆盖 {active}/{days} 天，n=0",
             "action": "先完成一轮听辨或跟读，再来复盘。"},
        ]
        return normalize_report({
            **facts, "domain": domain, "period": period,
            "trend": "持平", "headline": facts.get("headline", "本期数据还不够"),
            "sections": sections, "next_week": ["先完成一轮听辨 + 1 段跟读"],
            "source": "local",
        })

    top = ms[:2]
    conclusion = "；".join(_metric_line(m) for m in top)
    evidence = f"覆盖 {active}/{days} 天 · 听辨 {coverage.get('listening', 0)} · 跟读 {coverage.get('pronunciation', 0)} · 对立对 {coverage.get('phoneme', 0)}"
    sections = [{
        "title": "本期结论",
        "finding": conclusion,
        "evidence": evidence,
        "action": "先看样本量：低置信的维度不急着下结论。",
    }]

    gap = gaps[0] if gaps else None
    if gap:
        sections.append({
            "title": "关键短板",
            "finding": f"{gap['label']}偏弱：{round(gap['score'])}{gap['unit']}，n={gap['n']}，{gap['confidence']}。",
            "evidence": f"相对上一周期：{gap.get('delta_text') or '无可比基线'}",
            "action": f"下周优先补 {gap['label']}，每次只练一个点。",
        })
    else:
        sections.append({
            "title": "关键短板",
            "finding": "本期没有足够数据判定短板。",
            "evidence": "需要至少 8 个听辨或 4 次跟读。",
            "action": "继续积累样本，不做过度判断。",
        })

    next_actions = []
    if gap:
        map_action = {
            "listening": "听辨 20 题，正确率目标 ≥80%",
            "phoneme": "最小对立对 20 组，正确率目标 ≥80%",
            "pronunciation": "跟读 10 句，先练连读和词尾",
            "interaction": "完成 2 个场景，至少办成 1 个",
            "vocab": "复习 20 个哑巴词，听到能反应",
            "effort": "本周练满 4 天，每次 ≥10 分钟",
        }
        next_actions.append(map_action.get(gap["key"], "下周先补最弱维度"))
    if strengths:
        next_actions.append(f"保持 {strengths[0]['label']}，每周复测一次")
    if not next_actions:
        next_actions = ["先完成一轮听辨 + 1 段跟读"]
    sections.append({
        "title": "下周计划",
        "finding": "只做 2 件事，避免摊大饼。",
        "evidence": f"当前覆盖 {active}/{days} 天",
        "action": "；".join(next_actions[:2]),
    })

    return normalize_report({
        **facts, "domain": domain, "period": period,
        "trend": _trend_word(facts.get("verdict", "same")),
        "headline": facts.get("headline", "本期能力画像"),
        "sections": sections,
        "next_week": next_actions[:2],
        "source": "local",
    })

def _profile_excerpt(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    d = profile.get("domains", {}).get(domain, {})
    return {
        "hearing": models.weakest_hearing(d, limit=5) if d else [],
        "deaf_words": models.deaf_words(d) if d else [],
        "stats": models.vocab_state_counts(d) if d else {},
        "avoidance": (d.get("avoidance") or {}) if d else {},
    }


def _coach_excerpt(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    """把 Manbo 最近一次复盘/评语带进报告。"""
    c = (models.ensure_domain(profile, domain).get("coach") or {})
    return {
        "coach_comment": (c.get("last_summary") or "")[:200],
        "coach_next": [str(x)[:60] for x in (c.get("next_focus") or [])][:2],
    }


def _graduation(profile: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for domain in profile.get("domains", {}).values():
        for skill_id, venues in (domain.get("skill_venues") or {}).items():
            out[skill_id] = {
                "venues": venues,
                "graduated": models.is_skill_graduated(profile, skill_id),
            }
    return out


async def build_report(llm, domain: str, period: str,
                       profile: dict[str, Any]) -> dict[str, Any]:
    from . import metrics as metrics_mod

    facts = metrics_mod.compute(profile, domain, period)
    facts.update(_coach_excerpt(profile, domain))
    if llm is None:
        return local_report(domain, period, profile, facts)
    try:
        text = await llm.chat(
            prompts.report_v2_messages(domain, facts),
            temperature=0.4, max_tokens=1100,
        )
        data = prompts.parse_json_reply(text)
        if data and data.get("sections"):
            data = normalize_report(data)
            out = dict(facts)
            out.update({
                "domain": domain,
                "period": period,
                "trend": _trend_word(facts.get("verdict", "same")),
                "headline": data.get("headline") or facts.get("headline"),
                "sections": data.get("sections"),
                "next_week": data.get("next_week") or [],
                "source": "llm",
            })
            return out
    except Exception:
        pass
    return local_report(domain, period, profile, facts)
