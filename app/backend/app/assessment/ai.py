"""AI 全程掌控的测验（出题 + 判卷/画像）。

规则在这里只做「管道」：校验、兜底、执行；判断由 AI 完成。
"""
from __future__ import annotations

import random
from typing import Any

from .. import models, seeddata
from ..llm import prompts

VALID_STATES = {models.VOCAB_UNKNOWN, models.VOCAB_DEAF,
                models.VOCAB_RECOGNIZED, models.VOCAB_AUTOMATIC}


# ---------------------------------------------------------------- 校验

def validate_pack(data: dict | None, count: int) -> list[dict[str, Any]]:
    """校验并规整题单：只保留有 w/zh 的题，然后用 zh 重建四个选项。

    关键：不再信任 AI 给的 options/answer_index（可能与其 zh 不一致），
    而是以 zh 为正确答案重建干扰项，保证「听/揭晓/正确选项」永远一致。
    """
    if not isinstance(data, dict):
        return []
    raw: list[dict[str, Any]] = []
    for it in (data.get("items") or []):
        if not isinstance(it, dict):
            continue
        w = str(it.get("w") or "").strip()
        zh = str(it.get("zh") or "").strip()
        if not w or not zh:
            continue
        try:
            difficulty = int(it.get("difficulty", 2))
        except (TypeError, ValueError):
            difficulty = 2
        raw.append({
            "w": w, "zh": zh,
            "ex": str(it.get("ex") or ""),
            "difficulty": max(1, min(3, difficulty)),
            "difficulty_reason": str(it.get("difficulty_reason") or ""),
            "tag": str(it.get("tag") or ""),
        })
        if len(raw) >= count:
            break

    if not raw:
        return []

    raw_zh = [r["zh"] for r in raw]
    seed_zh = [c["zh"] for c in seeddata.cards()]
    items: list[dict[str, Any]] = []
    for r in raw:
        zh, w = r["zh"], r["w"]
        rng = random.Random(f"opt:{w}:{zh}")
        same = [z for z in raw_zh if z != zh]
        others = [z for z in seed_zh if z != zh and z not in same]
        md = list(dict.fromkeys(same))
        if len(md) >= 3:
            distract = rng.sample(md, 3)
        else:
            need = 3 - len(md)
            distract = md + (rng.sample(others, need) if len(others) >= need else others[:need])
        if len(distract) < 3:
            continue
        opts = [zh] + distract
        rng.shuffle(opts)
        items.append({**r, "play_text": w, "options": opts, "answer_index": opts.index(zh)})
    return items


def validate_profile(data: dict | None) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    vocab = {}
    for k, v in (data.get("vocab") or {}).items():
        if v in VALID_STATES:
            vocab[str(k)] = v
    try:
        confidence = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    def _short(v, n: int) -> str:
        return " ".join(str(v or "").split())[:n].strip()

    weaknesses = []
    for w in (data.get("weaknesses") or [])[:3]:
        if not isinstance(w, dict):
            continue
        area = _short(w.get("area"), 12)
        evidence = _short(w.get("evidence"), 30)
        action = _short(w.get("action"), 30)
        if area or evidence or action:
            weaknesses.append({"area": area, "evidence": evidence, "action": action})

    return {
        "summary": _short(data.get("summary"), 80),
        "verdict": _short(data.get("verdict"), 8) or "持平",
        "vocab": vocab,
        "blind_spots": data.get("blind_spots") or [],
        "avoidance": data.get("avoidance") or [],
        "weaknesses": weaknesses,
        "pronunciation": data.get("pronunciation") or {},
        "confidence": max(0.0, min(1.0, confidence)),
        "next_plan": _short(data.get("next_plan"), 60),
    }


# ---------------------------------------------------------------- 公共视图

def public_item(item: dict[str, Any], idx: int) -> dict[str, Any]:
    """发给前端：不含答案索引、不含英文原文、不含中文正确释义。"""
    return {
        "index": idx,
        "play_text": item["play_text"],
        "options": item["options"],
        "difficulty": item["difficulty"],
    }


def reveal(item: dict[str, Any]) -> dict[str, Any]:
    return {"w": item["w"], "zh": item["zh"], "answer_index": item["answer_index"]}


# ---------------------------------------------------------------- 兜底题单

def _unique_zh(cards, exclude_zh):
    seen = set()
    out = []
    for c in cards:
        zh = c["zh"]
        if zh == exclude_zh or zh in seen:
            continue
        seen.add(zh)
        out.append(zh)
    return out


def build_fallback_pack(domain: str, count: int = 18) -> list[dict[str, Any]]:
    """无模型时的兜底题单：按场景打散选词，干扰项每题随机且同类别，位置随机。"""
    cards = seeddata.cards()
    # 按 domain 打散题池 → 切换场景会出现不同词
    pool = cards[:]
    random.Random(f"pool:{domain}").shuffle(pool)
    pool = pool[:count] if len(pool) >= count else pool

    by_cat: dict[str, list[dict]] = {}
    for c in cards:
        by_cat.setdefault(c.get("cat", ""), []).append(c)

    items: list[dict[str, Any]] = []
    for i, c in enumerate(pool):
        correct = c["zh"]
        rng = random.Random(f"{domain}:{i}:{c['id']}")
        # 同类别里挑 3 个不同释义做干扰项（更可信、且每题不同）
        same = _unique_zh(by_cat.get(c.get("cat", ""), cards), correct)
        if len(same) < 3:
            same = _unique_zh(cards, correct)
        distractors = rng.sample(same, 3) if len(same) >= 3 else same[:3]
        opts = [correct] + distractors
        rng.shuffle(opts)
        items.append({
            "w": c["w"], "zh": correct, "ex": c.get("ex", ""),
            "difficulty": int(c.get("difficulty", 2)),
            "difficulty_reason": "种子标定",
            "play_text": c["w"], "options": opts,
            "answer_index": opts.index(correct), "tag": c.get("cat", ""),
        })
    return items


# ---------------------------------------------------------------- 服务

async def generate_pack(llm, domain: str, prev_summary: dict,
                        count: int = 18) -> tuple[list[dict[str, Any]], str]:
    """返回 (题单, 来源)。AI 优先，失败/为空则种子兜底。"""
    if llm is not None:
        try:
            text = await llm.chat(
                prompts.assessment_pack_messages(domain, prev_summary, count=count),
                temperature=0.7, max_tokens=2500,
            )
            data = prompts.parse_json_reply(text)
            items = validate_pack(data, count)
            if items:
                return items, "ai"
        except Exception:
            pass
    return build_fallback_pack(domain, count), "seed"


def _local_grade(domain: str, log: list[dict], items: list[dict]) -> dict[str, Any]:
    by_id = {str(it["w"]): it for it in items}
    vocab: dict[str, str] = {}
    blind: dict[str, int] = {}
    for e in log:
        w = str(e.get("w") or "")
        if not w:
            continue
        heard = bool(e.get("correct"))
        reaction = e.get("reaction_ms")
        if heard:
            slow = reaction is not None and int(reaction) > models.REACTION_THRESHOLD_MS
            vocab[w] = models.VOCAB_RECOGNIZED if slow else models.VOCAB_AUTOMATIC
        else:
            vocab[w] = models.VOCAB_DEAF if e.get("seen_known") else models.VOCAB_UNKNOWN
            tag = (by_id.get(w) or {}).get("tag")
            if tag:
                blind[tag] = blind.get(tag, 0) + 1
    n = len(log)
    deaf = [w for w, s in vocab.items() if s == models.VOCAB_DEAF]
    weaknesses = []
    if deaf:
        weaknesses.append({"area": "哑巴词汇", "evidence": f"{len(deaf)} 个词认识但听不出",
                           "action": "每天用听音猜义专练这批词"})
    if blind:
        top = max(blind, key=blind.get)
        weaknesses.append({"area": "听力盲区", "evidence": f"最常卡在 {top}",
                           "action": "在「为什么听不清」对应对练"})
    return {
        "summary": f"本次测验 {n} 题，识别出 {len(deaf)} 个哑巴词汇。",
        "verdict": "持平",
        "vocab": vocab,
        "blind_spots": [{"rule": t, "evidence": f"{c} 次"} for t, c in blind.items()],
        "avoidance": [],
        "weaknesses": weaknesses,
        "pronunciation": {},
        "confidence": round(min(1.0, n / 12) * 0.8, 2),
        "next_plan": "优先补今天识别出的哑巴词汇与盲区。",
        "source": "local",
    }


async def grade(llm, domain: str, log: list[dict],
                items: list[dict]) -> dict[str, Any]:
    if llm is not None:
        try:
            text = await llm.chat(
                prompts.assessment_grade_messages(domain, log, items),
                temperature=0.4, max_tokens=1600,
            )
            data = validate_profile(prompts.parse_json_reply(text))
            if data:
                data["source"] = "ai"
                return data
        except Exception:
            pass
    return _local_grade(domain, log, items)


# ---------------------------------------------------------------- 写回画像

def apply_profile(profile: dict[str, Any], domain: str,
                  result: dict[str, Any], items: list[dict]) -> dict[str, Any]:
    """把 AI 判定写进画像：词汇四态 + 盲区/错误（证据保留）。"""
    source = result.get("source", "ai")
    for w, state in (result.get("vocab") or {}).items():
        models.set_vocab_state(profile, domain, w, state, source=source)
    rule_of_tag = seeddata.tag_to_rule()
    for bs in (result.get("blind_spots") or []):
        rule = bs.get("rule") if isinstance(bs, dict) else str(bs)
        if rule:
            models.record_hearing(profile, domain, rule, name=rule, source=source)
    for wf in (result.get("weaknesses") or []):
        if isinstance(wf, dict) and wf.get("evidence"):
            models.record_error(profile, domain, "listening", str(wf.get("evidence")),
                                detail=str(wf.get("area") or ""), source=source)
    return profile
