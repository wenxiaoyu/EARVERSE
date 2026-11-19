"""内容生成服务（task 8.1–8.3）。

优先用 LLM 按画像生成；LLM 不可用时回退到种子语料（冷启动/降级），
保证「AI 生成」与「种子底座」两条路径都可用（design D7）。
"""
from __future__ import annotations

import random
from typing import Any

from .. import seeddata
from ..llm import prompts


def target_difficulty(profile: dict, domain: str) -> int:
    """根据画像当前水平给出目标难度（8.2 动态校准）。"""
    from .. import models

    d = profile.get("domains", {}).get(domain, {})
    counts = models.vocab_state_counts(d) if d else {}
    total = sum(counts.values()) or 0
    # 用户反馈校准优先：最近一次练习正确率低 → 降难度；高 → 升难度
    calib = (d.get("calibration") or {}).get("last_accuracy")
    if calib is not None:
        if calib < 0.5:
            return 1
        if calib > 0.8:
            return 3
    if total == 0:
        return 2
    deaf = counts.get(models.VOCAB_DEAF, 0)
    automatic = counts.get(models.VOCAB_AUTOMATIC, 0)
    if deaf / total > 0.4:
        return 1
    if automatic / total > 0.6:
        return 3
    return 2


def seed_items(kind: str = "cards", count: int = 10,
               difficulty: int | None = None,
               domain: str = "",
               goal: dict | None = None) -> list[dict[str, Any]]:
    """从种子语料取题（冷启动/降级）；按 domain 打散，切换场景内容不同。"""
    pool = seeddata.cards() if kind == "cards" else seeddata.sentences()
    if difficulty is not None:
        filtered = [it for it in pool if it.get("difficulty") == difficulty]
        if filtered:
            pool = filtered
    pool = list(pool)
    random.Random(f"seed:{domain}:{kind}:{difficulty}").shuffle(pool)
    if goal:
        words = [str(w).lower() for w in (goal.get("words") or []) if str(w).strip()]
        if words:
            hits = [it for it in pool if any(w in str(it.get("w", "")).lower() for w in words)]
            rest = [it for it in pool if it not in hits]
            pool = hits + rest
    return pool[:count]

def normalize_items(raw: list[dict], kind: str = "cards") -> list[dict[str, Any]]:
    """把 LLM 返回的条目规整成统一结构，并夹紧难度到 1-3。"""
    out: list[dict[str, Any]] = []
    for i, it in enumerate(raw or []):
        w = (it.get("w") or it.get("text") or "").strip()
        if not w:
            continue
        try:
            difficulty = int(it.get("difficulty", 2))
        except (TypeError, ValueError):
            difficulty = 2
        difficulty = max(1, min(3, difficulty))
        out.append({
            "id": it.get("id") or f"gen-{kind}-{i}",
            "w": w,
            "zh": (it.get("zh") or "").strip(),
            "ex": (it.get("ex") or "").strip(),
            "difficulty": difficulty,
            "tag": (it.get("tag") or "").strip(),
            "source": "generated",
        })
    return out


async def generate_items(llm, domain: str, profile_excerpt: dict,
                         kind: str = "cards", count: int = 10) -> list[dict[str, Any]]:
    """按画像生成素材；失败回退种子。"""
    diff = profile_excerpt.get("target_difficulty")
    goal = profile_excerpt.get("today_goal")
    if llm is None:
        return seed_items(kind, count, difficulty=diff, domain=domain, goal=goal)
    messages = prompts.generator_messages(domain, profile_excerpt, kind=kind, count=count)
    try:
        text = await llm.chat(messages, temperature=0.7, max_tokens=900)
    except Exception:
        return seed_items(kind, count, difficulty=diff, domain=domain, goal=goal)
    data = prompts.parse_json_reply(text) or {}
    items = normalize_items(data.get("items") or [], kind=kind)
    return items or seed_items(kind, count, difficulty=diff, domain=domain, goal=goal)
