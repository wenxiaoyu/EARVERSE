"""训练编排单测（task 6.4 / 6.3）。"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.training import loop


def test_schedule_sums_to_total():
    p = m.empty_profile()
    blocks = loop.build_schedule(p, "work")
    assert sum(b["minutes"] for b in blocks) == loop.DEFAULT_TOTAL_MINUTES
    assert [b["kind"] for b in blocks] == [
        loop.BLOCK_REVIEW, loop.BLOCK_TRAIN, loop.BLOCK_SCENARIO, loop.BLOCK_RECAP
    ]


def test_schedule_custom_total():
    p = m.empty_profile()
    blocks = loop.build_schedule(p, "work", total_minutes=45)
    assert sum(b["minutes"] for b in blocks) == 45


def test_tired_user_gets_shorter_scenario():
    p = m.empty_profile()
    normal = {b["kind"]: b["minutes"] for b in loop.build_schedule(p, "work", "normal")}
    tired = {b["kind"]: b["minutes"] for b in loop.build_schedule(p, "work", "tired")}
    assert tired[loop.BLOCK_SCENARIO] < normal[loop.BLOCK_SCENARIO]


def test_many_deaf_words_boosts_review():
    p = m.empty_profile()
    for i in range(10):
        m.observe_vocab_seen(p, "work", f"w{i}", known=True)
        m.observe_vocab_heard(p, "work", f"w{i}", heard=False)
    blocks = {b["kind"]: b["minutes"] for b in loop.build_schedule(p, "work")}
    base = {b["kind"]: b["minutes"] for b in loop.build_schedule(m.empty_profile(), "work")}
    assert blocks[loop.BLOCK_REVIEW] >= base[loop.BLOCK_REVIEW]


def test_all_blocks_have_focus_text():
    p = m.empty_profile()
    for b in loop.build_schedule(p, "work"):
        assert b["focus"]


def test_plan_focus_prefers_weakest_hearing():
    p = m.empty_profile()
    m.record_hearing(p, "work", "r05", name="of 弱读")
    m.record_hearing(p, "work", "r05", name="of 弱读")
    m.record_hearing(p, "work", "r06", name="for 弱读")
    focus = loop.plan_focus(p, "work")
    assert focus["hearing"][0]["rule_id"] == "r05"


def test_plan_focus_includes_deaf_words():
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "c01", known=True)
    m.observe_vocab_heard(p, "work", "c01", heard=False)
    focus = loop.plan_focus(p, "work")
    assert "c01" in focus["deaf_words"]


def test_ungraduated_skills_listed():
    p = m.empty_profile()
    m.record_scenario(p, "work", "s1", success=True, skills=["ask-delay"])
    focus = loop.plan_focus(p, "work")
    assert "ask-delay" in focus["ungraduated_skills"]


def test_graduated_skill_excluded():
    p = m.empty_profile()
    for sid in ("s1", "s2", "s3"):
        m.record_scenario(p, "work", sid, success=True, skills=["ask-delay"])
    focus = loop.plan_focus(p, "work")
    assert "ask-delay" not in focus["ungraduated_skills"]


def test_summarize_day_empty():
    s = loop.summarize_day([])
    assert s["total"] == 0


def test_summarize_day_accuracy():
    results = [
        {"correct": True}, {"correct": False}, {"correct": True}, {"correct": True},
    ]
    s = loop.summarize_day(results)
    assert s["total"] == 4
    assert s["correct"] == 3
    assert abs(s["accuracy"] - 0.75) < 1e-9
    assert len(s["errors"]) == 1


def test_rebalance_never_loses_minutes():
    for total in (30, 45, 60, 90):
        alloc = loop._rebalance({loop.BLOCK_REVIEW: 12, loop.BLOCK_TRAIN: 16,
                                 loop.BLOCK_SCENARIO: 22, loop.BLOCK_RECAP: 10}, total)
        assert sum(alloc.values()) == total
