"""种子数据加载（task 2.3 / 2.4）。

把 app/seed/*.json 读进内存（带缓存）。种子仅作冷启动与风格参照（design D7）。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

SEED_DIR = Path(__file__).resolve().parents[2] / "seed"

_FILES = {
    "cards": "cards.json",
    "sentences": "sentences.json",
    "reductions": "reductions.json",
    "skills": "skills.json",
    "listening_sources": "listening-sources.json",
    "scenarios": "scenarios.json",
    "cat_names": "cat-names.json",
    "recitations": "recitations.json",
}


@lru_cache(maxsize=None)
def load(name: str) -> Any:
    if name not in _FILES:
        raise KeyError(f"未知种子: {name}")
    path = SEED_DIR / _FILES[name]
    if not path.exists():
        return [] if name != "cat_names" else {}
    return json.loads(path.read_text(encoding="utf-8"))


def cards() -> list[dict]:
    return load("cards")


def sentences() -> list[dict]:
    return load("sentences")


def reductions() -> list[dict]:
    return load("reductions")


def skills() -> list[dict]:
    return load("skills")


def scenarios() -> list[dict]:
    return load("scenarios")


def recitations() -> list[dict]:
    return load("recitations")


def scenario_by_id(scenario_id: str) -> dict | None:
    for s in scenarios():
        if s.get("id") == scenario_id:
            return s
    return None


def skill_label(skill_id: str) -> str:
    for s in skills():
        if s.get("id") == skill_id:
            return s.get("label", skill_id)
    return skill_id


def tag_to_rule() -> dict[str, str]:
    """听写句 tag -> 连读弱读规则 id 的近似映射（用于测验回填 hearing 维度）。"""
    mapping = {
        "连读": "r01", "闪音": "r02", "弱读": "r05",
        "缩略": "r04", "变形": "r08", "情态": "r11", "失去爆破": "r10",
    }
    return mapping
