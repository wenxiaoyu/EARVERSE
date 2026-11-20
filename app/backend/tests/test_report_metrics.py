"""报告 v2：周期、六维、样本量与置信度。"""
import sys
import pathlib
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.reports import metrics as mt
from app.reports import service as rep


def _profile(cur=(8, 10), prev=(4, 10)):
    p = m.empty_profile()
    d = m.ensure_domain(p, "work")
    r = mt.period_range("week", date(2026, 11, 20))
    for day, (correct, total) in ((r["start"], cur), (r["prev_start"], prev)):
        d["daily"][day] = {
            "listening": {
                f"k{i}": {"key": f"k{i}", "correct": i < correct, "difficulty": 2, "at": m.now_iso()}
                for i in range(total)
            },
            "minimal_pairs": {"ok": correct, "total": total},
        }
    d["vocab"] = {
        "a": {"state": m.VOCAB_AUTOMATIC},
        "b": {"state": m.VOCAB_RECOGNIZED},
        "c": {"state": m.VOCAB_DEAF},
        "d": {"state": m.VOCAB_UNKNOWN},
    }
    return p


def test_period_range_week_and_previous():
    r = mt.period_range("week", date(2026, 11, 20))  # Friday
    assert r["start"] == "2026-11-16"
    assert r["end"] == "2026-11-20"
    assert r["prev_start"] == "2026-11-09"
    assert r["prev_end"] == "2026-11-13"


def test_period_range_month_previous_clamps():
    r = mt.period_range("month", date(2026, 3, 31))
    assert r["start"] == "2026-03-01"
    assert r["prev_start"] == "2026-02-01"
    assert r["prev_end"] == "2026-02-28"


def test_wilson_bounds():
    lo, hi = mt.wilson(8, 10)
    assert 0 <= lo < 0.8 < hi <= 1
    assert mt.wilson(0, 0) == (0.0, 0.0)


def test_metrics_and_delta():
    p = _profile()
    f = mt.compute(p, "work", "week")
    by = {x["key"]: x for x in f["metrics"]}
    assert by["listening"]["score"] == 80
    assert by["listening"]["n"] == 10
    assert by["listening"]["confidence"] == "medium"
    assert by["listening"]["direction"] == "up"
    assert by["listening"]["delta"] == 40
    assert by["phoneme"]["score"] == 80
    assert f["active_days"] >= 1


def test_vocab_mastery_excludes_recognized():
    p = _profile()
    f = mt.compute(p, "work", "week")
    v = next(x for x in f["metrics"] if x["key"] == "vocab")
    assert v["score"] == 25  # 1 automatic / 4 total
    assert v["note"].startswith("累计")


def test_small_sample_is_low_confidence():
    p = _profile(cur=(1, 2), prev=(0, 2))
    f = mt.compute(p, "work", "week")
    li = next(x for x in f["metrics"] if x["key"] == "listening")
    assert li["confidence"] == "low"
    assert li["delta_text"] == ""


def test_empty_metrics_no_fake_scores():
    f = mt.compute(m.empty_profile(), "work", "week")
    assert f["active_days"] == 0
    assert all(x["score"] is None for x in f["metrics"] if x["key"] != "effort")
    assert next(x for x in f["metrics"] if x["key"] == "effort")["score"] == 0
    assert all(x["confidence"] == "none" for x in f["metrics"] if x["key"] != "effort")


def test_local_report_uses_period_facts():
    p = _profile()
    r = rep.local_report("work", "week", p)
    assert r["sections"]
    assert "本期" in r["sections"][0]["title"] or "数据" in r["sections"][0]["title"]
    assert r["metrics"]
    assert r["source"] == "local"
