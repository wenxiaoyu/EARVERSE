"""场景/生成/报告服务单测（降级路径，不触网）。"""
import sys
import pathlib
import asyncio

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.scenarios import engine as sc
from app.generation import service as gen
from app.reports import service as rep


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------- seed

def test_seed_cards_loaded():
    assert len(__import__("app.seeddata", fromlist=["cards"]).cards()) == 117


def test_scenario_session_start():
    s = sc.start_session("w-delay")
    assert s["goal"]
    assert s["cast"]
    assert s["history"][0]["role"] == "assistant"


def test_offline_actor_reply_advances_beats():
    s = sc.start_session("w-delay")
    r1 = run(sc.actor_reply(None, s, "I need to push the launch."))
    assert r1["text"]
    assert s["user_turns"] == 1


def test_review_local_marks_success_with_enough_turns():
    s = sc.start_session("w-delay")
    for _ in range(3):
        run(sc.actor_reply(None, s, "some answer"))
    review = run(sc.review_session(None, s))
    assert review["success"] is True


def test_apply_review_records_scenario():
    p = m.empty_profile()
    s = sc.start_session("w-delay")
    review = {"success": True, "achieved_skills": [s["covers"][0]], "stuck": []}
    sc.apply_review_to_profile(p, s, review)
    assert p["domains"]["work"]["scenario_record"]
    assert models_venues(p, s["covers"][0]) >= 1


def models_venues(profile, skill_id):
    return len(m.skill_venues(profile, skill_id))


def test_apply_review_avoidance_recorded():
    p = m.empty_profile()
    s = sc.start_session("w-delay")
    review = {"success": False, "achieved_skills": [],
              "stuck": [{"quote": "绕圈子", "issue": "不敢直接拒绝", "type": "avoidance"}]}
    sc.apply_review_to_profile(p, s, review)
    d = p["domains"]["work"]
    assert d["avoidance"]  # 有回避记录


# ---------------------------------------------------------------- generation

def test_seed_items_fallback():
    items = gen.seed_items("cards", 5)
    assert len(items) == 5
    assert items[0]["w"]


def test_normalize_items_clamps_difficulty():
    raw = [{"w": "alpha", "zh": "阿尔法", "difficulty": 9},
           {"w": "beta", "difficulty": -3},
           {"w": "", "difficulty": 1}]
    out = gen.normalize_items(raw)
    assert len(out) == 2
    assert out[0]["difficulty"] == 3
    assert out[1]["difficulty"] == 1


def test_generate_items_without_llm_uses_seed():
    items = run(gen.generate_items(None, "work", {}, "cards", 4))
    assert len(items) == 4


# ---------------------------------------------------------------- reports

def test_local_report_has_sections_and_evidence():
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "c01", known=True)
    m.observe_vocab_heard(p, "work", "c01", heard=False)
    m.record_error(p, "work", "listening", "Most of it is done")
    r = rep.local_report("work", "week", p)
    assert r["sections"]
    assert r["source"] == "local"
    assert any(s["evidence"] for s in r["sections"])


def test_build_report_without_llm():
    p = m.empty_profile()
    r = run(rep.build_report(None, "work", "week", p))
    assert r["trend"] in ("变好", "持平", "变差", "无对比")
    assert r["sections"]
