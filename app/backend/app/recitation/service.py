"""每日背诵：出篇、提示阶梯、对齐评分、复盘（独立于 Today）。

设计要点见 openspec/changes/daily-recitation/design.md。
"""
from __future__ import annotations

import difflib
import random
import re
import uuid
from typing import Any

from .. import models, seeddata
from ..llm import prompts

# 提示档位：0 无 / 1 句首词+连接词 / 2 内容词
HINT_LABELS = {
    0: "无提示",
    1: "结构提示",
    2: "关键词",
}

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "so", "then", "than", "that",
    "this", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "me", "him", "her", "us", "them", "my", "your", "his", "its", "our",
    "their", "is", "am", "are", "was", "were", "be", "been", "being",
    "do", "does", "did", "have", "has", "had", "will", "would", "can",
    "could", "should", "may", "might", "must", "to", "of", "in", "on",
    "at", "for", "with", "from", "by", "about", "as", "into", "over",
    "after", "before", "up", "down", "out", "off", "not", "no", "yes",
    "there", "here", "when", "where", "why", "how", "what", "who", "which",
    "one", "some", "any", "all", "more", "most", "very", "just", "also",
}

CONNECTORS = {
    "actually", "but", "so", "then", "and", "because", "however", "finally",
    "first", "next", "when", "if", "still", "instead", "meanwhile", "later",
}

CONTRACTIONS = {
    "i'm": "i am", "i've": "i have", "i'll": "i will", "i'd": "i would",
    "you're": "you are", "you've": "you have", "you'll": "you will",
    "he's": "he is", "she's": "she is", "it's": "it is", "that's": "that is",
    "we're": "we are", "we've": "we have", "we'll": "we will",
    "they're": "they are", "they've": "they have", "they'll": "they will",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not",
    "weren't": "were not", "don't": "do not", "doesn't": "does not",
    "didn't": "did not", "can't": "can not", "couldn't": "could not",
    "won't": "will not", "wouldn't": "would not", "shouldn't": "should not",
    "let's": "let us", "there's": "there is", "what's": "what is",
}

LEVEL_BANDS = {
    1: (80, 115),
    2: (95, 135),
    3: (105, 150),
    4: (115, 165),
    5: (125, 180),
}

LEVEL_WORDS = {1: (90, 110), 2: (110, 130), 3: (130, 150), 4: (150, 170), 5: (170, 190)}


# ---------------------------------------------------------------- 文本工具

def split_sentences(text: str) -> list[str]:
    raw = re.split(r'(?<=[.!?])\s+|(?<=[.!?]["\'”’])\s+', (text or "").strip())
    out = [s.strip() for s in raw if s.strip()]
    return out or ([text.strip()] if (text or "").strip() else [])


def normalize_tokens(text: str) -> list[str]:
    t = (text or "").lower().replace("’", "'")
    t = re.sub(r"[^a-z0-9'\s]", " ", t)
    out: list[str] = []
    for w in t.split():
        out.extend(CONTRACTIONS.get(w, w).split())
    return out


def content_words(text: str) -> list[str]:
    seen: list[str] = []
    for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", text or ""):
        low = w.lower()
        if low in STOPWORDS or len(low) < 2:
            continue
        if low not in seen:
            seen.append(low)
    return seen


def _dedupe(items: list[str]) -> list[str]:
    out: list[str] = []
    low_seen: set[str] = set()
    for it in items:
        t = str(it or "").strip()
        if not t:
            continue
        key = re.sub(r"\s+", " ", t.lower())
        if key in low_seen:
            continue
        low_seen.add(key)
        out.append(t)
    return out


def derive_chunks(sentences: list[str], limit: int = 8) -> list[str]:
    """从文章里派生 2–4 词的可复用语块（AI 没给或给少了时兜底）。"""
    cands: list[tuple[float, str]] = []
    for sent in sentences:
        words = re.findall(r"[A-Za-z][A-Za-z'’-]*", sent)
        for n in (3, 2, 4):
            for i in range(0, max(0, len(words) - n + 1)):
                gram = words[i:i + n]
                lows = [w.lower() for w in gram]
                if lows[0] in STOPWORDS and lows[-1] in STOPWORDS:
                    continue
                content = sum(1 for w in lows if w not in STOPWORDS and len(w) > 2)
                if content < 2:
                    continue
                if any(w in CONNECTORS for w in lows):
                    continue
                score = content * 2 + (1.0 if n == 3 else 0.4) - i * 0.01
                cands.append((score, " ".join(gram)))
    cands.sort(key=lambda x: -x[0])
    picked: list[str] = []
    for _, text in cands:
        low = text.lower()
        if any(low in p.lower() or p.lower() in low for p in picked):
            continue
        picked.append(text)
        if len(picked) >= limit:
            break
    return picked


# ---------------------------------------------------------------- 提示

def hints_for(passage: dict[str, Any]) -> dict[str, list[str]]:
    sentences = list(passage.get("sentences") or split_sentences(passage.get("text", "")))
    l1: list[str] = []
    l2: list[str] = []
    for i, sent in enumerate(sentences, 1):
        toks = re.findall(r"[A-Za-z][A-Za-z'’-]*", sent)
        if not toks:
            continue
        first = toks[0]
        if first.lower() in STOPWORDS and len(toks) > 1:
            head = " ".join(toks[:2])
        else:
            extras = [t for t in toks[1:3] if t.lower() in CONNECTORS]
            head = " ".join([first] + extras[:1])
        l1.append(f"{i}. {head} …")

        content = []
        for t in toks:
            if t.lower() in STOPWORDS or len(t) < 2:
                continue
            if t.lower() not in [c.lower() for c in content]:
                content.append(t)
        l2.append(f"{i}. " + " · ".join(content[:8]) if content else f"{i}. …")

    return {"0": [], "1": l1, "2": l2}


# ---------------------------------------------------------------- 文章归一化

def _clean_sentence(s: str) -> str:
    t = re.sub(r"\s+", " ", str(s or "")).strip()
    if not t:
        return ""
    if t[-1] in '"\'”’' and len(t) > 1 and t[-2] in ".!?":
        return t
    if t[-1] not in ".!?":
        t += "."
    return t


def normalize_passage(raw: dict | None, level: int, domain: str,
                      source: str = "ai") -> dict[str, Any]:
    raw = raw or {}
    raw_sents = raw.get("sentences") or []
    sentences: list[str] = []
    for s in raw_sents:
        text = s.get("text") if isinstance(s, dict) else s
        c = _clean_sentence(str(text or ""))
        if c:
            sentences.append(c)
    if not sentences:
        sentences = [_clean_sentence(s) for s in split_sentences(str(raw.get("text") or ""))]
        sentences = [s for s in sentences if s]

    text = " ".join(sentences).strip()
    if not text:
        raise ValueError("文章为空")

    raw_chunks = [str(c) for c in (raw.get("chunks") or [])]
    text_low = re.sub(r"\s+", " ", text.lower())
    chunks = [c for c in _dedupe(raw_chunks)
              if re.sub(r"\s+", " ", c.lower()) in text_low]
    if len(chunks) < 3:
        chunks = derive_chunks(sentences, 8)
    chunks = chunks[:10]

    tokens = [t for t in re.findall(r"[A-Za-z][A-Za-z'’-]*", text)]
    raw_targets = [str(w).strip().lower() for w in (raw.get("target_words") or [])]
    targets = [w for w in raw_targets if w and w in [t.lower() for t in tokens]]
    if len(targets) < 3:
        targets = content_words(text)[:6]

    lvl = max(1, min(5, int(level or 2)))
    passage = {
        "id": str(raw.get("id") or uuid.uuid4().hex),
        "domain": domain,
        "level": lvl,
        "date": str(raw.get("date") or models.local_date(0)),
        "kind": str(raw.get("kind") or "manual"),
        "source": source,
        "title": str(raw.get("title") or "Today's Passage").strip()[:60],
        "topic": str(raw.get("topic") or "").strip()[:40],
        "sentences": sentences,
        "text": text,
        "chunks": chunks,
        "target_words": _dedupe(targets)[:8],
        "why": str(raw.get("why") or "按你最近的水平和漏点，选了这一篇。").strip()[:120],
        "word_count": len(normalize_tokens(text)),
        "created_at": models.now_iso(),
    }
    passage["hints"] = hints_for(passage)
    return passage


def validate_passage(passage: dict[str, Any], level: int) -> bool:
    lo, hi = LEVEL_WORDS.get(level, LEVEL_WORDS[2])
    wc = int(passage.get("word_count") or 0)
    sents = len(passage.get("sentences") or [])
    return (lo - 10) <= wc <= (hi + 15) and 4 <= sents <= 15 \
        and len(passage.get("chunks") or []) >= 3


def fallback_passage(level: int, domain: str, kind: str = "daily") -> dict[str, Any]:
    pool = [p for p in seeddata.recitations() if int(p.get("level", 0)) == int(level)]
    if not pool:
        pool = sorted(seeddata.recitations(),
                      key=lambda p: abs(int(p.get("level", 2)) - int(level)))
        pool = pool[:1]
    pick = random.Random(f"{domain}:{level}:{models.local_date(0)}").choice(pool)
    data = dict(pick)
    data["domain"] = domain
    data["kind"] = kind
    data["date"] = models.local_date(0)
    data["source"] = "seed"
    data["why"] = data.get("why") or "先按这个难度把语流稳住。"
    return normalize_passage(data, level, domain, source="seed")


async def generate_passage(llm, domain: str, level: int,
                           profile_excerpt: dict | None = None,
                           goal: dict | None = None,
                           avoid_titles: list | None = None,
                           kind: str = "manual") -> dict[str, Any]:
    """AI 出篇；失败或不合格时回退种子。"""
    level = max(1, min(5, int(level or 2)))
    if llm is None:
        p = fallback_passage(level, domain, kind)
        return p
    last: dict[str, Any] | None = None
    for _ in range(2):
        try:
            text = await llm.chat(
                prompts.recitation_passage_messages(domain, level, profile_excerpt or {},
                                                    goal=goal, avoid_titles=avoid_titles),
                temperature=0.85, max_tokens=1100,
            )
            data = prompts.parse_json_reply(text) or {}
            if not (data.get("sentences") or data.get("text")):
                continue
            p = normalize_passage(data, level, domain, source="ai")
            p["kind"] = kind
            p["date"] = models.local_date(0)
            last = p
            if validate_passage(p, level):
                return p
        except Exception:
            continue
    if last and validate_passage(last, level):
        return last
    return fallback_passage(level, domain, kind)


# ---------------------------------------------------------------- 评分

def _fuzzy(a: str, b: str) -> bool:
    if a == b:
        return True
    if abs(len(a) - len(b)) > 2:
        return False
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.75


def align(source: list[str], spoken: list[str]) -> dict[str, Any]:
    """按词对齐，返回匹配统计 + 可展示 diff。"""
    sm = difflib.SequenceMatcher(a=source, b=spoken, autojunk=False)
    matched = fuzzy = subs = deletes = inserts = 0
    diff: list[dict[str, str]] = []
    substitutions: list[dict[str, str]] = []

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        a = source[i1:i2]
        b = spoken[j1:j2]
        if tag == "equal":
            matched += len(a)
            if a:
                diff.append({"type": "ok", "source": " ".join(a), "spoken": " ".join(b)})
        elif tag == "replace":
            pairs = min(len(a), len(b))
            for k in range(pairs):
                if _fuzzy(a[k], b[k]):
                    fuzzy += 1
                else:
                    subs += 1
                    if len(substitutions) < 10:
                        substitutions.append({"source": a[k], "spoken": b[k]})
            if len(a) > len(b):
                deletes += len(a) - len(b)
            elif len(b) > len(a):
                inserts += len(b) - len(a)
            if a or b:
                diff.append({"type": "sub", "source": " ".join(a), "spoken": " ".join(b)})
        elif tag == "delete":
            deletes += len(a)
            if a:
                diff.append({"type": "miss", "source": " ".join(a), "spoken": ""})
        elif tag == "insert":
            inserts += len(b)
            if b:
                diff.append({"type": "extra", "source": "", "spoken": " ".join(b)})

    total = max(1, len(source))
    coverage = min(1.0, (matched + 0.5 * fuzzy) / total)
    accuracy = max(0.0, 1.0 - (subs + deletes + inserts + 0.5 * fuzzy) / total)
    return {
        "matched": matched,
        "fuzzy": fuzzy,
        "subs": subs,
        "deletes": deletes,
        "inserts": inserts,
        "coverage": round(coverage, 4),
        "accuracy": round(accuracy, 4),
        "diff": diff[:80],
        "diff_truncated": len(diff) > 80,
        "substitutions": substitutions,
    }


def _token_set(text: str) -> set[str]:
    return set(normalize_tokens(text))


def _coverage_of(text: str, spoken_set: set[str]) -> float:
    toks = normalize_tokens(text)
    if not toks:
        return 1.0
    return sum(1 for t in toks if t in spoken_set) / len(toks)


def fluency_score(wpm: float, level: int) -> float:
    lo, hi = LEVEL_BANDS.get(level, LEVEL_BANDS[2])
    if wpm <= 0:
        return 60.0
    if lo <= wpm <= hi:
        return 100.0
    gap = lo - wpm if wpm < lo else wpm - hi
    return max(20.0, 100.0 - min(80.0, gap * 1.5))


def score_attempt(passage: dict[str, Any], transcript: str,
                  hint: int = 0, duration_ms: int = 0) -> dict[str, Any]:
    hint = max(0, min(2, int(hint or 0)))
    src = normalize_tokens(passage.get("text", ""))
    spk = normalize_tokens(transcript)
    al = align(src, spk)
    level = int(passage.get("level") or 2)
    duration_min = max(0.001, float(duration_ms) / 60000.0) if duration_ms else 0.0
    wpm = round(len(spk) / duration_min, 1) if duration_min else 0.0
    if wpm > 300:
        wpm = 300.0
    fluency = round(fluency_score(wpm, level), 1)
    independence = float(max(0, min(100, 100 - 25 * int(hint))))
    composite = round(
        0.4 * al["coverage"] * 100 + 0.3 * al["accuracy"] * 100
        + 0.15 * fluency + 0.15 * independence, 1
    )

    spoken_set = set(spk)
    missed_sentences = []
    for s in (passage.get("sentences") or []):
        cov = _coverage_of(s, spoken_set)
        if cov < 0.6:
            missed_sentences.append({"text": s, "coverage": round(cov, 2)})

    missed_chunks = []
    for c in (passage.get("chunks") or []):
        cov = _coverage_of(c, spoken_set)
        if cov < 0.6:
            missed_chunks.append({"text": c, "coverage": round(cov, 2)})

    return {
        "coverage": al["coverage"],
        "accuracy": al["accuracy"],
        "fluency": fluency,
        "independence": independence,
        "score": composite,
        "wpm": wpm,
        "duration_ms": int(duration_ms or 0),
        "words": len(spk),
        "source_words": len(src),
        "matched": al["matched"],
        "fuzzy": al["fuzzy"],
        "subs": al["subs"],
        "deletes": al["deletes"],
        "inserts": al["inserts"],
        "diff": al["diff"],
        "diff_truncated": al["diff_truncated"],
        "missed_sentences": missed_sentences[:8],
        "missed_chunks": missed_chunks[:8],
        "substitutions": al["substitutions"],
        "hint": int(hint),
    }


# ---------------------------------------------------------------- 复盘

def _clip(s: Any, n: int) -> str:
    t = str(s or "").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def local_review(passage: dict[str, Any], transcript: str,
                 scores: dict[str, Any]) -> dict[str, Any]:
    cov = float(scores.get("coverage") or 0)
    acc = float(scores.get("accuracy") or 0)
    chunks = [c.get("text") for c in (scores.get("missed_chunks") or [])][:3]
    subs = (scores.get("substitutions") or [])[:2]

    if scores.get("score", 0) >= 85:
        summary = "整体很稳，语流连贯；把漏掉的语块再读顺就更自然。"
    elif scores.get("score", 0) >= 70:
        summary = "大意背下来了，个别句子接不上；先补漏掉的语块。"
    else:
        summary = "这次断得比较多，先降到短句，把关键词串起来再背。"

    wins: list[str] = []
    if cov >= 0.85:
        wins.append(f"完整度 {round(cov * 100)}%，几乎每句都接上了。")
    if acc >= 0.8:
        wins.append("用词准确，ASR 转写基本对得上原文。")
    if not wins:
        wins.append("完成了一次完整录音，先把「敢开口」这一步拿住。")

    misses = [{"source": c, "note": "这块漏了或换成了别的说法。"} for c in chunks]
    if not misses and scores.get("missed_sentences"):
        misses = [{"source": s.get("text", ""), "note": "这句断得比较多。"}
                  for s in scores["missed_sentences"][:2]]

    pron = [{"sound": "", "heard_as": sub.get("spoken", ""),
             "word": sub.get("source", ""),
             "tip": f"你读成了 {sub.get('spoken')}，慢速再读一遍。"}
            for sub in subs]

    return {
        "summary": _clip(summary, 40),
        "wins": [_clip(w, 60) for w in wins[:2]],
        "misses": [{"source": _clip(m["source"], 90), "note": _clip(m["note"], 60)}
                   for m in misses[:3]],
        "pron_issues": pron[:2],
        "drill": {
            "focus": "把漏掉的语块读顺",
            "items": [_clip(c, 90) for c in chunks] or [_clip(passage.get("title", ""), 60)],
        },
        "next": {
            "focus_chunks": [_clip(c, 60) for c in chunks],
            "advice": "下次先听一遍，再只看关键词背；卡住时用 L2，不要直接看整句。",
        },
        "source": "local",
    }


def normalize_review(data: dict | None, passage: dict, transcript: str,
                     scores: dict) -> dict[str, Any]:
    if not isinstance(data, dict):
        return local_review(passage, transcript, scores)
    misses = []
    for m in (data.get("misses") or [])[:3]:
        if isinstance(m, dict):
            misses.append({"source": _clip(m.get("source"), 90),
                           "note": _clip(m.get("note"), 60)})
        elif m:
            misses.append({"source": _clip(m, 90), "note": ""})
    pron = []
    for p in (data.get("pron_issues") or [])[:2]:
        if isinstance(p, dict):
            pron.append({"sound": _clip(p.get("sound"), 12),
                         "heard_as": _clip(p.get("heard_as"), 20),
                         "word": _clip(p.get("word"), 30),
                         "tip": _clip(p.get("tip"), 80)})
    drill = data.get("drill") if isinstance(data.get("drill"), dict) else {}
    nxt = data.get("next") if isinstance(data.get("next"), dict) else {}
    return {
        "summary": _clip(data.get("summary") or "这次先稳住节奏。", 40),
        "wins": [_clip(w, 60) for w in (data.get("wins") or [])[:2] if w],
        "misses": misses,
        "pron_issues": pron,
        "drill": {
            "focus": _clip(drill.get("focus") or "把漏掉的语块读顺", 40),
            "items": [_clip(x, 90) for x in (drill.get("items") or [])[:4] if x],
        },
        "next": {
            "focus_chunks": [_clip(x, 60) for x in (nxt.get("focus_chunks") or [])[:4] if x],
            "advice": _clip(nxt.get("advice") or "下次先听一遍，再用关键词提示背。", 80),
        },
        "source": "ai",
    }


async def review_attempt(llm, domain: str, passage: dict[str, Any],
                         transcript: str, scores: dict[str, Any]) -> dict[str, Any]:
    if llm is None:
        return local_review(passage, transcript, scores)
    try:
        text = await llm.chat(
            prompts.recitation_review_messages(
                domain, passage, transcript, scores,
                {"missed_sentences": scores.get("missed_sentences"),
                 "missed_chunks": scores.get("missed_chunks")},
            ),
            temperature=0.4, max_tokens=800,
        )
        data = prompts.parse_json_reply(text)
        if data:
            return normalize_review(data, passage, transcript, scores)
    except Exception:
        pass
    return local_review(passage, transcript, scores)
