"""自适应测验引擎单测（task 5.2）。"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import pytest

from app import models as m
from app.assessment import engine as e


def make_items():
    items = []
    for lv in (1, 2, 3):
        for i in range(6):
            items.append({"id": f"w{lv}_{i}", "difficulty": lv, "tag": f"tag{lv}"})
    return items


def test_classify_deaf():
    assert e.classify_vocab(seen_known=True, heard=False) == m.VOCAB_DEAF


def test_classify_unknown():
    assert e.classify_vocab(seen_known=False, heard=False) == m.VOCAB_UNKNOWN


def test_classify_automatic_fast():
    assert e.classify_vocab(True, True, reaction_ms=300) == m.VOCAB_AUTOMATIC


def test_classify_recognized_slow():
    assert e.classify_vocab(True, True, reaction_ms=5000) == m.VOCAB_RECOGNIZED


def test_starts_at_middle_level():
    p = e.AdaptiveProbe(make_items())
    assert p.level == 2


def test_correct_moves_harder():
    p = e.AdaptiveProbe(make_items())
    item = p.next_item()
    lv = item["difficulty"]
    p.submit(item["id"], correct=True)
    assert p.level == min(e.MAX_LEVEL, lv + 1)


def test_wrong_moves_easier():
    p = e.AdaptiveProbe(make_items())
    item = p.next_item()
    lv = item["difficulty"]
    p.submit(item["id"], correct=False)
    assert p.level == max(e.MIN_LEVEL, lv - 1)


def test_no_repeat_questions():
    p = e.AdaptiveProbe(make_items(), max_questions=10)
    seen = []
    for _ in range(10):
        it = p.next_item()
        if it is None:
            break
        seen.append(it["id"])
        p.submit(it["id"], correct=True)
    assert len(seen) == len(set(seen))


def test_stops_at_max_questions():
    p = e.AdaptiveProbe(make_items(), max_questions=5)
    for _ in range(5):
        it = p.next_item()
        if it:
            p.submit(it["id"], correct=True)
    assert p.next_item() is None
    assert len(p.results) == 5
    assert p.finished is True


def test_targeted_after_repeated_failures():
    """某 tag 连续错 2 次后，应优先追加同 tag 的未问题目。"""
    items = make_items()
    p = e.AdaptiveProbe(items, max_questions=20)
    # 先答错两题同 tag（第 3 档 tag3 在 level 从 2 升到 3 时会遇到）
    it = p.next_item()
    p.submit(it["id"], correct=False)
    # 直接强制两次同 tag 失败
    p._tag_failures["tag3"] = 2
    nxt = p.next_item()
    assert nxt["tag"] == "tag3"


def test_ability_level_all_correct():
    p = e.AdaptiveProbe(make_items(), max_questions=6)
    for _ in range(6):
        it = p.next_item()
        if it:
            p.submit(it["id"], correct=True)
    assert p.ability_level() >= 2


def test_ability_level_all_wrong_is_min():
    p = e.AdaptiveProbe(make_items(), max_questions=6)
    for _ in range(6):
        it = p.next_item()
        if it:
            p.submit(it["id"], correct=False)
    assert p.ability_level() == e.MIN_LEVEL


def test_weak_tags_sorted():
    p = e.AdaptiveProbe(make_items(), max_questions=6)
    for _ in range(6):
        it = p.next_item()
        if it:
            p.submit(it["id"], correct=False)
    assert p.weak_tags()  # 至少一个


def test_summary_shape():
    p = e.AdaptiveProbe(make_items(), max_questions=4)
    for _ in range(4):
        it = p.next_item()
        if it:
            p.submit(it["id"], correct=True, reaction_ms=500)
    s = p.summary()
    assert set(s) >= {"asked", "per_level", "ability_level", "weak_tags", "accuracy"}


def test_empty_items_raises():
    with pytest.raises(ValueError):
        e.AdaptiveProbe([])


def test_submit_unknown_item_raises():
    p = e.AdaptiveProbe(make_items())
    with pytest.raises(KeyError):
        p.submit("nope", correct=True)


def test_apply_probe_to_profile_marks_deaf_and_hearing():
    probe = e.AdaptiveProbe(make_items(), max_questions=3)
    seen = {}
    for _ in range(3):
        it = probe.next_item()
        if it:
            seen[it["id"]] = True   # 都「看认识」
            probe.submit(it["id"], correct=False)  # 但都「听不出」
    profile = m.empty_profile()
    e.apply_probe_to_profile(profile, probe, seen, domain="work",
                             tag_to_rule={"tag2": "r05"})
    d = profile["domains"]["work"]
    # 全部标记为哑巴词汇
    assert len(m.deaf_words(d)) == 3


def test_apply_probe_writes_hearing_for_weak_tag():
    probe = e.AdaptiveProbe(make_items(), max_questions=6)
    seen = {}
    for _ in range(6):
        it = probe.next_item()
        if it:
            seen[it["id"]] = True
            probe.submit(it["id"], correct=False)
    profile = m.empty_profile()
    e.apply_probe_to_profile(profile, probe, seen, domain="work",
                             tag_to_rule={"tag1": "r01", "tag2": "r05", "tag3": "r06"})
    assert profile["domains"]["work"]["hearing"]  # 有听力盲区记录
