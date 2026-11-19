"""每日训练编排（task 6.1–6.4）。

- build_schedule：把 1 小时编排成 4 块（激活复习/新内容/实战/复盘）；
- 块时长按用户状态与画像动态调整（AI 可在此基础上进一步微调）；
- plan_focus：给出次日该重点补什么（最薄弱维度优先）。

确定性基线（便于测试），AI 只在其上做微调，不改变总时长。
"""
from __future__ import annotations

from typing import Any

from .. import models

BLOCK_REVIEW = "review"          # 激活复习
BLOCK_TRAIN = "training"         # 新内容训练
BLOCK_SCENARIO = "scenario"      # 场景实战
BLOCK_RECAP = "recap"            # 复盘收尾

DEFAULT_TOTAL_MINUTES = 60

# 默认配比（分钟）
_DEFAULT = {
    BLOCK_REVIEW: 12,
    BLOCK_TRAIN: 16,
    BLOCK_SCENARIO: 22,
    BLOCK_RECAP: 10,
}

BLOCK_TITLES = {
    BLOCK_REVIEW: "激活复习",
    BLOCK_TRAIN: "新内容训练",
    BLOCK_SCENARIO: "场景实战",
    BLOCK_RECAP: "复盘收尾",
}


def _rebalance(weights: dict[str, int], total: int) -> dict[str, int]:
    """把权重等比缩放到总和 == total（按最大余数法分配，保证整数且不丢分钟）。"""
    s = sum(weights.values())
    if s <= 0:
        # 均分
        base = total // len(weights)
        out = {k: base for k in weights}
        out[next(iter(out))] += total - base * len(weights)
        return out
    raw = {k: v * total / s for k, v in weights.items()}
    out = {k: int(v) for k, v in raw.items()}
    remainder = total - sum(out.values())
    # 余数按小数部分从大到小补
    order = sorted(raw, key=lambda k: raw[k] - int(raw[k]), reverse=True)
    for k in order[:remainder]:
        out[k] += 1
    return out


def build_schedule(profile: dict[str, Any], domain: str,
                   user_state: str = "normal",
                   total_minutes: int = DEFAULT_TOTAL_MINUTES) -> list[dict[str, Any]]:
    """生成当天训练计划块。

    user_state: normal | tired | fresh
    """
    d = profile.get("domains", {}).get(domain, {})
    weights = dict(_DEFAULT)

    # 画像驱动：哑巴词汇多 → 加复习；未毕业功能多 → 加实战
    deaf = len(models.deaf_words(d)) if d else 0
    if deaf >= 8:
        weights[BLOCK_REVIEW] += 4
        weights[BLOCK_TRAIN] += 2

    ungraduated = _ungraduated_skills(profile)
    if len(ungraduated) >= 5:
        weights[BLOCK_SCENARIO] += 4

    # 状态驱动：疲惫 → 实战减、复习增；状态好 → 实战增
    if user_state == "tired":
        weights[BLOCK_SCENARIO] = max(8, weights[BLOCK_SCENARIO] - 8)
        weights[BLOCK_REVIEW] += 4
        weights[BLOCK_RECAP] += 2
    elif user_state == "fresh":
        weights[BLOCK_SCENARIO] += 4
        weights[BLOCK_RECAP] = max(6, weights[BLOCK_RECAP] - 2)

    alloc = _rebalance(weights, total_minutes)

    order = [BLOCK_REVIEW, BLOCK_TRAIN, BLOCK_SCENARIO, BLOCK_RECAP]
    return [
        {
            "kind": k,
            "title": BLOCK_TITLES[k],
            "minutes": alloc[k],
            "focus": _block_focus(profile, domain, k),
        }
        for k in order
    ]


def _block_focus(profile: dict[str, Any], domain: str, kind: str) -> str:
    d = profile.get("domains", {}).get(domain, {})
    if kind == BLOCK_REVIEW or kind == BLOCK_TRAIN:
        weak = models.weakest_hearing(d) if d else []
        deaf = models.deaf_words(d) if d else []
        if deaf:
            return f"补 {len(deaf)} 个哑巴词汇（认识但听不出）"
        if weak:
            return "重点听 " + "、".join(w.get("name") or w["rule_id"] for w in weak)
        return "到期复习 + 反应速度"
    if kind == BLOCK_SCENARIO:
        skills = _ungraduated_skills(profile)
        if skills:
            return f"实战练：{skills[0]}"
        return "实战：把一件事办成"
    return "复盘今天 + 定明天"


def _ungraduated_skills(profile: dict[str, Any]) -> list[str]:
    """在所有已出现的言语功能里，找出尚未毕业的。"""
    seen: list[str] = []
    for d in profile.get("domains", {}).values():
        for skill_id in (d.get("skill_venues") or {}):
            if skill_id not in seen:
                seen.append(skill_id)
    return [s for s in seen if not models.is_skill_graduated(profile, s)]


def plan_focus(profile: dict[str, Any], domain: str, limit: int = 3) -> dict[str, Any]:
    """次日训练重点：最薄弱维度优先。"""
    d = profile.get("domains", {}).get(domain, {})
    weak = models.weakest_hearing(d, limit=limit) if d else []
    deaf = models.deaf_words(d) if d else []
    avoid = sorted(
        (d.get("avoidance") or {}).items(), key=lambda kv: kv[1].get("count", 0), reverse=True
    )[:limit]
    return {
        "hearing": [{"rule_id": w["rule_id"], "name": w.get("name", ""), "count": w.get("count", 0)}
                    for w in weak],
        "deaf_words": deaf[:limit * 3],
        "avoided_skills": [{"skill_id": k, "count": v.get("count", 0)} for k, v in avoid],
        "ungraduated_skills": _ungraduated_skills(profile)[:limit],
    }


def summarize_day(results: list[dict]) -> dict[str, Any]:
    """汇总当天训练结果，供诊断器引用。"""
    if not results:
        return {"total": 0, "correct": 0, "accuracy": 0.0, "errors": []}
    correct = sum(1 for r in results if r.get("correct"))
    errors = [r for r in results if not r.get("correct")]
    return {
        "total": len(results),
        "correct": correct,
        "accuracy": correct / len(results),
        "errors": errors,
    }
