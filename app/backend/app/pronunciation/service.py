"""发音评估（可懂度优先，ASR + AI 推断；预留音素级升级口）。"""
from __future__ import annotations

import re
from typing import Any

from ..config import AudioConfig
from ..llm import prompts
from ..speech import asr


def _norm_words(text: str) -> list[str]:
    return re.findall(r"[a-z']+", (text or "").lower())


def heuristic_score(target: str, transcript: str) -> dict[str, Any]:
    """无模型时的兜底：按词重合度给分，并列出缺失/替换的词。"""
    t = _norm_words(target)
    s = _norm_words(transcript)
    if not t:
        return {"score": 0, "issues": [], "confidence": 0.1, "summary": "目标文本为空"}
    ts = set(s)
    hit = sum(1 for w in t if w in ts)
    score = round(hit / len(t) * 100)
    issues = []
    for w in t:
        if w not in ts:
            issues.append({"sound": "", "heard_as": "", "word": w,
                           "tip": "这次没被转写识别到，可能读得不清楚或漏读"})
    return {
        "score": score,
        "issues": issues[:8],
        "confidence": 0.3,
        "summary": f"与目标文本相比，{hit}/{len(t)} 个词能被识别。",
        "source": "local",
    }


async def assess(audio: bytes, target: str, audio_cfg: AudioConfig,
                 llm, domain: str = "work",
                 filename: str = "oral.webm") -> dict[str, Any]:
    """转写 + 评分。返回 {transcript, score, issues, confidence, summary, source}。"""
    if not audio_cfg.base_url or not audio_cfg.api_key:
        raise RuntimeError("未配置音频供应商（ASR 需要 base_url + api_key）")
    transcript = await asr.transcribe(
        audio, audio_cfg.base_url, audio_cfg.api_key,
        model=audio_cfg.asr_model, filename=filename,
    )

    if llm is not None:
        try:
            text = await llm.chat(
                prompts.pronunciation_messages(domain, target, transcript),
                temperature=0.3, max_tokens=700,
            )
            data = prompts.parse_json_reply(text)
            if data:
                try:
                    score = round(float(data.get("score", 0)))
                except (TypeError, ValueError):
                    score = 0
                try:
                    conf = float(data.get("confidence", 0.5))
                except (TypeError, ValueError):
                    conf = 0.5
                return {
                    "transcript": transcript,
                    "score": max(0, min(100, score)),
                    "issues": data.get("issues") or [],
                    "confidence": max(0.0, min(1.0, conf)),
                    "summary": str(data.get("summary") or ""),
                    "source": "ai",
                }
        except Exception:
            pass

    out = heuristic_score(target, transcript)
    out["transcript"] = transcript
    return out


# ---------------------------------------------------------------- 朗读/跟读素材

FALLBACK_ITEMS: list[dict[str, Any]] = [
    {"text": "I think they will thank us for the third attempt.",
     "focus": "θ /ð/", "tip": "舌尖轻触上下齿间，别读成 s/z/th 混", "difficulty": 2},
    {"text": "We should verify the value of every version.",
     "focus": "/v/ vs /w/", "tip": "v 用上齿咬下唇；w 圆唇、不碰齿", "difficulty": 2},
    {"text": "Please collect the correct list from the client.",
     "focus": "/l/ vs /r/", "tip": "l 舌尖抵上齿龈；r 舌尖悬空略卷", "difficulty": 3},
    {"text": "He asked for the next day after the big test.",
     "focus": "词尾辅音", "tip": "next day 的 t 只做口型；句尾 t/d 别丢", "difficulty": 3},
    {"text": "We should keep it short and simple for them.",
     "focus": "连读", "tip": "keep it → kee-pit；short and → shor-n", "difficulty": 2},
    {"text": "I would like to confirm the deadline on Friday.",
     "focus": "重音", "tip": "实词重读：confirm / deadline / Friday", "difficulty": 1},
    {"text": "Give me a lot of details about the plan.",
     "focus": "弱读", "tip": "a lot of → a-lot-ta；about the → bau-thuh", "difficulty": 3},
]


def _filter_by_errors(items: list[dict[str, Any]], errors: list | None,
                      key: str) -> list[dict[str, Any]]:
    sounds = [str(e.get("sound") or "") for e in (errors or []) if e.get("sound")]
    if not sounds:
        return items
    hit = [it for it in items if any(s and s in str(it.get(key, "")) for s in sounds)]
    return hit or items


def validate_items(data: dict | None, count: int) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    out: list[dict[str, Any]] = []
    for it in (data.get("items") or []):
        if not isinstance(it, dict):
            continue
        text = str(it.get("text") or "").strip()
        if len(text.split()) < 3:
            continue
        try:
            difficulty = int(it.get("difficulty", 2))
        except (TypeError, ValueError):
            difficulty = 2
        out.append({
            "text": text,
            "focus": str(it.get("focus") or ""),
            "tip": str(it.get("tip") or ""),
            "difficulty": max(1, min(3, difficulty)),
        })
        if len(out) >= count:
            break
    return out


async def generate_items(llm, domain: str, count: int = 5,
                         goal: dict | None = None,
                         focus_errors: list | None = None) -> tuple[list[dict[str, Any]], str]:
    """AI 生成朗读/跟读句；失败或为空回退固定素材。"""
    if llm is not None:
        try:
            text = await llm.chat(
                prompts.pronunciation_items_messages(domain, count, goal=goal, focus_errors=focus_errors),
                temperature=0.8, max_tokens=900,
            )
            items = validate_items(prompts.parse_json_reply(text), count)
            if items:
                return items, "ai"
        except Exception:
            pass
    return _filter_by_errors(FALLBACK_ITEMS, focus_errors, "focus")[:count], "fallback"


# ---------------------------------------------------------------- 最小对立对

FALLBACK_PAIRS: list[dict[str, Any]] = [
    {"a": "ship", "b": "sheep", "focus": "/ɪ/ vs /iː/"},
    {"a": "full", "b": "fool", "focus": "/ʊ/ vs /uː/"},
    {"a": "live", "b": "leave", "focus": "/ɪ/ vs /iː/"},
    {"a": "vest", "b": "west", "focus": "/v/ vs /w/"},
    {"a": "light", "b": "right", "focus": "/l/ vs /r/"},
    {"a": "think", "b": "sink", "focus": "/θ/ vs /s/"},
    {"a": "bad", "b": "bed", "focus": "/æ/ vs /e/"},
    {"a": "sin", "b": "sing", "focus": "/n/ vs /ŋ/"},
    {"a": "cap", "b": "cab", "focus": "词尾清浊"},
    {"a": "peer", "b": "pear", "focus": "/ɪə/ vs /eə/"},
]


def validate_pairs(data: dict | None, count: int) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    out: list[dict[str, Any]] = []
    for it in (data.get("items") or []):
        if not isinstance(it, dict):
            continue
        a = str(it.get("a") or "").strip()
        b = str(it.get("b") or "").strip()
        if not a or not b or a.lower() == b.lower():
            continue
        out.append({"a": a, "b": b, "focus": str(it.get("focus") or "")})
        if len(out) >= count:
            break
    return out


async def generate_minimal_pairs(llm, domain: str, count: int = 8,
                                    goal: dict | None = None,
                                    focus_errors: list | None = None) -> tuple[list[dict[str, Any]], str]:
    if llm is not None:
        try:
            text = await llm.chat(
                prompts.minimal_pairs_messages(domain, count, goal=goal, focus_errors=focus_errors),
                temperature=0.8, max_tokens=800,
            )
            items = validate_pairs(prompts.parse_json_reply(text), count)
            if items:
                return items, "ai"
        except Exception:
            pass
    return _filter_by_errors(FALLBACK_PAIRS, focus_errors, "focus")[:count], "fallback"
