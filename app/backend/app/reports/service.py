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
            "title": _clip(s.get("title"), 8),
            "finding": _clip(s.get("finding"), 30),
            "evidence": _clip(s.get("evidence"), 20),
            "action": _clip(s.get("action"), 20),
        })
    data["sections"] = secs
    data["next_week"] = [_clip(x, 20) for x in (data.get("next_week") or [])[:3]]
    data["headline"] = _clip(data.get("headline"), 16)
    return data


def local_report(domain: str, period: str, profile: dict[str, Any]) -> dict[str, Any]:
    """本地兜底报告：从画像直接推导，确保引用具体错误。"""
    d = profile.get("domains", {}).get(domain, {})
    errors = (d.get("errors") or [])[-5:]
    focus = loop.plan_focus(profile, domain)
    weak = focus["hearing"]
    deaf = focus["deaf_words"]

    sections: list[dict[str, Any]] = []
    if deaf:
        evidence = errors[0]["original"] if errors else "（暂无原句，训练后自动累积）"
        sections.append({
            "title": "哑巴词汇",
            "finding": f"有 {len(deaf)} 个词看到认识、听到反应不出。",
            "evidence": evidence,
            "action": "接下来 3 天每天用听音猜义专练这批词，只听声音说中文。",
        })
    if weak:
        names = "、".join(w.get("name") or w["rule_id"] for w in weak[:2])
        evidence = errors[0]["original"] if errors else "（暂无原句）"
        sections.append({
            "title": "听力盲区",
            "finding": f"最常卡在：{names}。",
            "evidence": evidence,
            "action": "去「为什么听不清」对应对练，再回听写验证同类句子。",
        })
    if not sections:
        sections.append({
            "title": "基线",
            "finding": "训练数据还少，暂无稳定结论。",
            "evidence": errors[0]["original"] if errors else "（暂无原句）",
            "action": "再练 3 天，报告会开始引用你的具体错误。",
        })

    trend = "持平"
    if d.get("scenario_record"):
        recent = d["scenario_record"][-5:]
        succ = sum(1 for r in recent if r.get("success"))
        trend = "变好" if succ > len(recent) / 2 else "变差"

    return normalize_report({
        "domain": domain,
        "period": period,
        "trend": trend,
        "headline": f"{domain} 场景：{trend}",
        "sections": sections,
        "next_week": [s["action"] for s in sections],
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
    if llm is None:
        return local_report(domain, period, profile)
    d = profile.get("domains", {}).get(domain, {})
    recent_errors = (d.get("errors") or [])[-5:]
    messages = prompts.coach_messages(
        domain, period, _profile_excerpt(profile, domain),
        recent_errors, _graduation(profile),
    )
    try:
        text = await llm.chat(messages, temperature=0.5, max_tokens=1000)
    except Exception:
        return local_report(domain, period, profile)
    data = prompts.parse_json_reply(text)
    if not data or "sections" not in data:
        return local_report(domain, period, profile)
    data.setdefault("domain", domain)
    data.setdefault("period", period)
    data["source"] = "llm"
    return normalize_report(data)
