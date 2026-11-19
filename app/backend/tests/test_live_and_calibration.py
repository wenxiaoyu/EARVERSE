"""7.2 实时信号 + 8.2 难度校准 单测。"""
import sys
import pathlib
import asyncio

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.scenarios import engine as sc
from app.generation import service as gen


def run(coro):
    return asyncio.run(coro)


# ---- 7.2 实时信号

def test_short_answer_flags_avoidance():
    sigs = sc.observe_turn_signals("yes")
    assert any(s["type"] == "avoidance" for s in sigs)


def test_hesitation_marker_flagged():
    sigs = sc.observe_turn_signals("um I am not sure about that actually")
    assert any("not sure" in s["issue"] for s in sigs)


def test_rich_answer_no_avoidance():
    sigs = sc.observe_turn_signals(
        "I can commit to the 28th with a two-week buffer for integration testing")
    assert not any(s["type"] == "avoidance" for s in sigs)


def test_live_signals_accumulate_in_session():
    s = sc.start_session("w-delay")
    run(sc.actor_reply(None, s, "yes"))
    run(sc.actor_reply(None, s, "um maybe"))
    assert len(s.get("live_signals", [])) >= 2


def test_review_includes_live_signals():
    s = sc.start_session("w-delay")
    run(sc.actor_reply(None, s, "yes"))
    review = run(sc.review_session(None, s))
    assert any("回避" in (st.get("issue", "")) or st.get("type") == "avoidance"
               for st in review["stuck"])


# ---- 8.2 难度校准

def test_target_difficulty_default_mid():
    assert gen.target_difficulty(m.empty_profile(), "work") == 2


def test_target_difficulty_low_when_many_deaf():
    p = m.empty_profile()
    for i in range(10):
        m.observe_vocab_seen(p, "work", f"w{i}", known=True)
        m.observe_vocab_heard(p, "work", f"w{i}", heard=False)
    assert gen.target_difficulty(p, "work") == 1


def test_target_difficulty_from_feedback_low():
    p = m.empty_profile()
    d = m.ensure_domain(p, "work")
    d["calibration"] = {"last_accuracy": 0.3}
    assert gen.target_difficulty(p, "work") == 1


def test_target_difficulty_from_feedback_high():
    p = m.empty_profile()
    d = m.ensure_domain(p, "work")
    d["calibration"] = {"last_accuracy": 0.95}
    assert gen.target_difficulty(p, "work") == 3


def test_seed_items_respects_difficulty():
    items = gen.seed_items("cards", 10, difficulty=1)
    assert items
    assert all(it.get("difficulty") == 1 for it in items)
