"""自适应测验引擎（task 5.2）。

核心：不做固定试卷，而是像医生问诊——
1. 能力边界二分定位：从中间难度起，答对往难探、答错往易探；
2. 短板定向追加：某类题目连续出错时，追加同类探测；
3. 反应时间记录：区分「已自动化」与「能懂但慢」。

本模块为纯逻辑（不依赖网络/DB），便于单测。
"""
from __future__ import annotations

from typing import Any

from .. import models

MIN_LEVEL = 1
MAX_LEVEL = 3

# 判定「已自动化」的反应阈值（与 models 保持一致）
REACTION_THRESHOLD_MS = models.REACTION_THRESHOLD_MS

# 某类（tag）累计错误达到此值即触发定向追加
TARGETED_FAILURE_THRESHOLD = 2

# 能力估计：某难度档正确率 >= 该值视为「掌握」
ABILITY_PASS_RATIO = 0.5


def _middle_level(items: list[dict[str, Any]]) -> int:
    levels = [it.get("difficulty", MIN_LEVEL) for it in items] or [MIN_LEVEL]
    return max(MIN_LEVEL, min(MAX_LEVEL, (min(levels) + max(levels)) // 2))


def classify_vocab(seen_known: bool, heard: bool,
                   reaction_ms: int | None = None) -> str:
    """把分层探测结果归类为四态。"""
    if not seen_known:
        return models.VOCAB_UNKNOWN
    if not heard:
        return models.VOCAB_DEAF
    if reaction_ms is not None and reaction_ms > REACTION_THRESHOLD_MS:
        return models.VOCAB_RECOGNIZED
    return models.VOCAB_AUTOMATIC


class AdaptiveProbe:
    """一次听力自适应探测会话。"""

    def __init__(self, items: list[dict[str, Any]],
                 start_level: int | None = None,
                 max_questions: int = 18):
        if not items:
            raise ValueError("题目为空，无法开始测验")
        self.items = sorted(items, key=lambda x: (x.get("difficulty", MIN_LEVEL), str(x.get("id", ""))))
        self._by_id = {str(it["id"]): it for it in self.items}
        self.max_questions = max_questions
        self.level = start_level if start_level is not None else _middle_level(self.items)
        self.level = max(MIN_LEVEL, min(MAX_LEVEL, self.level))
        self.asked: list[str] = []
        self.results: list[dict[str, Any]] = []
        self._tag_failures: dict[str, int] = {}

    # ---------------------------------------------------------------- 出题

    def _unasked(self) -> list[dict[str, Any]]:
        asked = set(self.asked)
        return [it for it in self.items if str(it["id"]) not in asked]

    def _targeted(self) -> dict[str, Any] | None:
        """短板定向：某 tag 累计失败达阈值，优先补同类未问题目。"""
        hot_tags = [t for t, n in self._tag_failures.items() if n >= TARGETED_FAILURE_THRESHOLD]
        if not hot_tags:
            return None
        for it in self._unasked():
            if it.get("tag") in hot_tags:
                return it
        return None

    def _at_level(self) -> dict[str, Any] | None:
        for it in self._unasked():
            if it.get("difficulty") == self.level:
                return it
        return None

    def _nearest(self) -> dict[str, Any] | None:
        unasked = self._unasked()
        if not unasked:
            return None
        unasked.sort(key=lambda it: abs(it.get("difficulty", MIN_LEVEL) - self.level))
        return unasked[0]

    def next_item(self) -> dict[str, Any] | None:
        if len(self.asked) >= self.max_questions:
            return None
        item = self._targeted() or self._at_level() or self._nearest()
        if item is None:
            return None
        self.asked.append(str(item["id"]))
        return item

    # ---------------------------------------------------------------- 作答

    def submit(self, item_id: str, correct: bool,
               reaction_ms: int | None = None) -> None:
        item = self._by_id.get(str(item_id))
        if item is None:
            raise KeyError(f"未知题目: {item_id}")
        self.results.append({
            "id": str(item_id),
            "difficulty": item.get("difficulty", MIN_LEVEL),
            "tag": item.get("tag", ""),
            "correct": bool(correct),
            "reaction_ms": reaction_ms,
        })
        # 能力边界移动：答对往难、答错往易
        if correct:
            self.level = min(MAX_LEVEL, self.level + 1)
        else:
            self.level = max(MIN_LEVEL, self.level - 1)
            tag = item.get("tag", "")
            if tag:
                self._tag_failures[tag] = self._tag_failures.get(tag, 0) + 1

    @property
    def finished(self) -> bool:
        return len(self.asked) >= self.max_questions or not self._unasked()

    # ---------------------------------------------------------------- 汇总

    def per_level(self) -> dict[int, dict[str, int]]:
        acc: dict[int, dict[str, int]] = {}
        for r in self.results:
            lv = r["difficulty"]
            slot = acc.setdefault(lv, {"asked": 0, "correct": 0})
            slot["asked"] += 1
            if r["correct"]:
                slot["correct"] += 1
        return acc

    def ability_level(self) -> int:
        """能力边界：正确率达到阈值的最高难度档；都没有则最低档。"""
        acc = self.per_level()
        passed = [
            lv for lv, s in acc.items()
            if s["asked"] > 0 and (s["correct"] / s["asked"]) >= ABILITY_PASS_RATIO
        ]
        return max(passed) if passed else MIN_LEVEL

    def weak_tags(self) -> list[str]:
        return [t for t, n in sorted(self._tag_failures.items(), key=lambda kv: -kv[1])]

    def summary(self) -> dict[str, Any]:
        return {
            "asked": len(self.results),
            "per_level": {str(k): v for k, v in self.per_level().items()},
            "ability_level": self.ability_level(),
            "weak_tags": self.weak_tags(),
            "accuracy": (
                sum(1 for r in self.results if r["correct"]) / len(self.results)
                if self.results else 0.0
            ),
        }


# ---------------------------------------------------------------- 画像回填

def apply_probe_to_profile(profile: dict[str, Any],
                           probe: AdaptiveProbe,
                           seen_known: dict[str, bool],
                           domain: str,
                           source: str = "first-assessment",
                           tag_to_rule: dict[str, str] | None = None) -> dict[str, Any]:
    """把一次探测的结果写回画像（词汇四态 + 听力盲区）。

    seen_known: 词 -> 「看认不认识」（来自分层探测的前一层）
    tag_to_rule: 题目标签 -> 听力盲区 rule_id（可选，用于强化 hearing 维度）
    """
    for r in probe.results:
        wid = r["id"]
        heard = r["correct"]
        known = seen_known.get(wid)
        if known is None:
            # 不知道「看」层结果时，跳过哑巴词汇判定，只记听的结果
            models.observe_vocab_seen(profile, domain, wid, known=True, source=source)
            known = True
        models.observe_vocab_seen(profile, domain, wid, known=known, source=source)
        models.observe_vocab_heard(profile, domain, wid, heard=heard,
                                   reaction_ms=r.get("reaction_ms"), source=source)
        if not heard and tag_to_rule and r.get("tag") in tag_to_rule:
            models.record_hearing(profile, domain, tag_to_rule[r["tag"]],
                                  source=source)
    return profile
