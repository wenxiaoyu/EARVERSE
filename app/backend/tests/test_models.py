"""画像数据模型单测（task 2.1）。"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m


def test_empty_profile_has_all_dimensions():
    p = m.empty_profile("u1")
    assert p["user_id"] == "u1"
    assert p["version"] == m.SCHEMA_VERSION
    for key in ("hearing", "vocab", "avoidance", "scenario_record", "errors", "skill_venues"):
        assert key in p["global"]
    assert p["domains"] == {}


def test_seen_known_but_not_heard_is_deaf_vocab():
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "c01", known=True)
    entry = m.observe_vocab_heard(p, "work", "c01", heard=False)
    assert entry["state"] == m.VOCAB_DEAF
    assert m.deaf_words(p["domains"]["work"]) == ["c01"]


def test_not_known_is_unknown():
    p = m.empty_profile()
    entry = m.observe_vocab_seen(p, "work", "c02", known=False)
    assert entry["state"] == m.VOCAB_UNKNOWN


def test_heard_fast_is_automatic():
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "c03", known=True)
    entry = m.observe_vocab_heard(p, "work", "c03", heard=True, reaction_ms=400)
    assert entry["state"] == m.VOCAB_AUTOMATIC


def test_heard_slow_is_recognized_not_automatic():
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "c04", known=True)
    entry = m.observe_vocab_heard(p, "work", "c04", heard=True, reaction_ms=3000)
    assert entry["state"] == m.VOCAB_RECOGNIZED


def test_vocab_state_counts():
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "a", known=True)
    m.observe_vocab_heard(p, "work", "a", heard=False)          # deaf
    m.observe_vocab_seen(p, "work", "b", known=True)
    m.observe_vocab_heard(p, "work", "b", heard=True, reaction_ms=300)  # automatic
    counts = m.vocab_state_counts(p["domains"]["work"])
    assert counts[m.VOCAB_DEAF] == 1
    assert counts[m.VOCAB_AUTOMATIC] == 1


def test_domains_are_isolated():
    """多场景并行：一个场景的短板不影响另一个场景。"""
    p = m.empty_profile()
    m.observe_vocab_seen(p, "work", "c01", known=True)
    m.observe_vocab_heard(p, "work", "c01", heard=False)
    assert m.deaf_words(p["domains"]["work"]) == ["c01"]
    assert p["domains"].get("travel") is None
    m.ensure_domain(p, "travel")
    assert m.deaf_words(p["domains"]["travel"]) == []


def test_hearing_written_to_domain_and_global():
    p = m.empty_profile()
    m.record_hearing(p, "work", "r05", name="of 弱读")
    assert p["domains"]["work"]["hearing"]["r05"]["count"] == 1
    assert p["global"]["hearing"]["r05"]["count"] == 1


def test_weakest_hearing_sorted():
    p = m.empty_profile()
    m.record_hearing(p, "work", "r05", name="of")
    m.record_hearing(p, "work", "r05", name="of")
    m.record_hearing(p, "work", "r06", name="for")
    weakest = m.weakest_hearing(p["domains"]["work"])
    assert weakest[0]["rule_id"] == "r05"
    assert weakest[0]["count"] == 2


def test_scenario_success_records_venue():
    p = m.empty_profile()
    m.record_scenario(p, "work", "w-delay", success=True, skills=["ask-delay"])
    assert m.skill_venues(p, "ask-delay") == ["work:w-delay"]


def test_failed_scenario_does_not_count_venue():
    p = m.empty_profile()
    m.record_scenario(p, "work", "w-delay", success=False, skills=["ask-delay"])
    assert m.skill_venues(p, "ask-delay") == []


def test_skill_graduation_requires_three_distinct_venues():
    p = m.empty_profile()
    m.record_scenario(p, "work", "s1", success=True, skills=["ask-delay"])
    m.record_scenario(p, "work", "s2", success=True, skills=["ask-delay"])
    assert not m.is_skill_graduated(p, "ask-delay")
    m.record_scenario(p, "work", "s3", success=True, skills=["ask-delay"])
    assert m.is_skill_graduated(p, "ask-delay")


def test_same_venue_twice_does_not_double_count():
    p = m.empty_profile()
    m.record_scenario(p, "work", "s1", success=True, skills=["ask-delay"])
    m.record_scenario(p, "work", "s1", success=True, skills=["ask-delay"])
    assert len(m.skill_venues(p, "ask-delay")) == 1


def test_graduation_across_domains_counts_venues():
    p = m.empty_profile()
    m.record_scenario(p, "work", "s1", success=True, skills=["ask-repeat"])
    m.record_scenario(p, "travel", "t1", success=True, skills=["ask-repeat"])
    m.record_scenario(p, "social", "x1", success=True, skills=["ask-repeat"])
    assert m.is_skill_graduated(p, "ask-repeat")


def test_avoidance_and_errors_recorded():
    p = m.empty_profile()
    m.record_avoidance(p, "work", "refuse-request", evidence="绕圈子不敢拒")
    m.record_error(p, "work", "listening", "Most of it is done", source="dictation")
    d = p["domains"]["work"]
    assert d["avoidance"]["refuse-request"]["count"] == 1
    assert d["errors"][0]["original"] == "Most of it is done"
    assert d["errors"][0]["kind"] == "listening"


def test_ensure_domain_backfills_missing_keys():
    profile = {"domains": {"work": {"vocab": {}}}, "global": {}}
    d = m.ensure_domain(profile, "work")
    assert "pronunciation" in d
    assert "hearing" in d
    m.record_pronunciation(profile, "work", "hello", score=80)
    assert d["pronunciation"]["hello"]["score"] == 80


def test_daily_bucket_and_records():
    profile = {"domains": {}, "global": {}, "updated_at": ""}
    m.record_daily_listening(profile, "work", "w1", True, text="deadline", difficulty=2)
    m.record_daily_listening(profile, "work", "w1", False, text="deadline", difficulty=2)
    m.record_daily_minimal_pair(profile, "work", True)
    m.record_daily_minimal_pair(profile, "work", False)
    b = m.daily_bucket(profile, "work")
    assert len(b["listening"]) == 1          # 同一词覆盖，不重复累加
    assert b["listening"]["w1"]["correct"] is False
    assert b["minimal_pairs"]["total"] == 2
    assert b["minimal_pairs"]["ok"] == 1


def test_goal_today_and_future():
    profile = {"domains": {}, "global": {}}
    m.set_goal(profile, "work", {"text": "今天目标", "for_date": m.local_date(0)})
    g = m.get_today_goal(profile, "work")
    assert g and g["text"] == "今天目标"
    m.set_goal(profile, "work", {"text": "明天目标", "for_date": m.local_date(1)})
    assert m.get_today_goal(profile, "work") is None


def test_recent_pron_issue_dedupe():
    profile = {"domains": {}, "global": {}}
    m.record_pron_issue(profile, "work", sound="θ", word="think")
    m.record_pron_issue(profile, "work", sound="θ", word="think")
    lst = m.recent_pron_issues(profile, "work")
    assert len(lst) == 1
    assert lst[0]["sound"] == "θ"
