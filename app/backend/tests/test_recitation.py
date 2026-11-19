"""每日背诵：出篇、提示、对齐评分、画像回飞轮（不触网）。"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.recitation import service as r
from app.storage import ProfileStorage


def test_fallback_passage_matches_level_and_chunks():
    for level in range(1, 6):
        p = r.fallback_passage(level, "work")
        assert p["level"] == level
        assert p["source"] == "seed"
        assert p["word_count"] > 60
        assert len(p["sentences"]) >= 4
        assert len(p["chunks"]) >= 3
        low = p["text"].lower()
        for c in p["chunks"]:
            assert c.lower() in low


def test_hints_are_graded_and_hide_source():
    p = r.fallback_passage(3, "meeting")
    hints = p["hints"]
    assert hints["0"] == []
    assert len(hints["1"]) == len(p["sentences"])
    assert len(hints["2"]) == len(p["sentences"])
    assert set(hints.keys()) == {"0", "1", "2"}
    # L2 只给内容词，不能整句暴露
    assert hints["2"][0] != p["sentences"][0]


def test_split_sentences_handles_quotes():
    text = 'She said, "No problem." Then she left. I stayed.'
    sents = r.split_sentences(text)
    assert len(sents) == 3
    assert sents[1].endswith("left.")


def test_normalize_passage_derives_chunks_when_missing():
    raw = {
        "title": "Test",
        "sentences": [
            "We should push back politely in the meeting.",
            "The report will move to Friday.",
            "I can do a short version today.",
            "That keeps the relationship strong.",
        ],
    }
    p = r.normalize_passage(raw, 2, "work")
    assert p["title"] == "Test"
    assert p["word_count"] > 10
    assert len(p["chunks"]) >= 3
    assert len(p["target_words"]) >= 3
    assert p["hints"]["2"]


def test_score_perfect_transcript():
    p = r.fallback_passage(3, "meeting")
    s = r.score_attempt(p, p["text"], hint=0, duration_ms=60000)
    assert s["coverage"] == 1.0
    assert s["accuracy"] == 1.0
    assert s["independence"] == 100
    assert s["score"] >= 98
    assert s["missed_chunks"] == []


def test_score_partial_transcript_and_hint_penalty():
    p = r.fallback_passage(3, "meeting")
    half = " ".join(p["sentences"][: len(p["sentences"]) // 2])
    s = r.score_attempt(p, half, hint=2, duration_ms=60000)
    assert 0.3 < s["coverage"] < 0.9
    assert s["independence"] == 50
    assert s["missed_chunks"]
    # 旧数据/越界档位会被夹到 L2
    assert r.score_attempt(p, half, hint=3, duration_ms=60000)["independence"] == 50
    assert s["score"] < 95


def test_fuzzy_match_tolerates_asr_variant():
    src = r.normalize_tokens("I am going to confirm the deadline")
    spk = r.normalize_tokens("I'm gonna confirm the deadline")
    al = r.align(src, spk)
    assert al["coverage"] > 0.7


def test_fluency_band():
    assert r.fluency_score(120, 3) == 100
    assert r.fluency_score(20, 3) < 60
    assert r.fluency_score(0, 3) == 60


def test_adapt_level_up_and_down():
    up = [{"coverage": 0.9, "hint": 0}, {"coverage": 0.88, "hint": 1}]
    assert r_adapt(up, 2) == 3
    down = [{"coverage": 0.4, "hint": 0}]
    assert r_adapt(down, 3) == 2
    # 用关键词提示但完整度高，不降级
    high_hint = [{"coverage": 0.9, "hint": 2}]
    assert r_adapt(high_hint, 3) == 3


def r_adapt(history, level):
    return m.adapt_recitation_level(history, level)


def test_record_recitation_updates_profile():
    p = m.empty_profile()
    attempt = {
        "id": "a1", "recitation_id": "r1", "title": "T", "level": 2,
        "hint": 1, "coverage": 0.9, "accuracy": 0.88, "fluency": 90,
        "independence": 75, "score": 87, "wpm": 118, "words": 130,
        "missed_chunks": [{"text": "push back"}],
    }
    summary = m.record_recitation(p, "meeting", attempt)
    b = p["domains"]["meeting"]["recitation"]
    assert summary["score"] == 87
    assert b["streak"] == 1
    assert b["attempts"] == 1
    assert b["history"][-1]["title"] == "T"
    assert b["wpm_trend"] == [118.0]
    assert m.recitation_weak_chunks(p, "meeting") == ["push back"]
    # 重复同一天不重复加连续天数
    m.record_recitation(p, "meeting", attempt)
    assert b["streak"] == 1
    assert b["attempts"] == 2


def test_history_capped_at_30():
    p = m.empty_profile()
    for i in range(35):
        m.record_recitation(p, "work", {"title": str(i), "coverage": 0.8, "hint": 0,
                                        "score": 80, "wpm": 110})
    b = p["domains"]["work"]["recitation"]
    assert len(b["history"]) == 30
    assert len(b["wpm_trend"]) == 30


def test_review_local_has_actionable_fields():
    p = r.fallback_passage(3, "meeting")
    s = r.score_attempt(p, "In meetings saying no is hard", hint=2, duration_ms=20000)
    rv = r.local_review(p, "In meetings saying no is hard", s)
    assert rv["summary"]
    assert rv["wins"]
    assert rv["drill"]["items"]
    assert rv["next"]["advice"]
    assert rv["source"] == "local"


def test_storage_recitation_roundtrip():
    st = ProfileStorage(":memory:")
    p = r.fallback_passage(2, "work")
    st.save_recitation(p)
    got = st.get_recitation(p["id"])
    assert got and got["title"] == p["title"]
    assert st.find_recitation("work", 2, p["date"], "daily")
    attempt = {"id": "a1", "recitation_id": p["id"], "domain": "work",
               "title": p["title"], "score": 88, "created_at": m.now_iso()}
    st.save_attempt(attempt)
    assert st.list_attempts("work")[0]["score"] == 88
    assert st.get_attempt("a1")["title"] == p["title"]
