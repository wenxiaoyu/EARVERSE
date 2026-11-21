"""分享笔记：今天 vs 昨天的指标、文案与降级。"""
import sys
import pathlib
import asyncio

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.share import service as share


def _profile(today_listen=(4, 5), yday_listen=(2, 5)):
    p = m.empty_profile()
    d = m.ensure_domain(p, "work")
    today = m.local_date(0)
    yday = m.local_date(-1)

    def bucket(correct, total):
        return {
            "listening": {
                f"k{i}": {"key": f"k{i}", "correct": i < correct, "text": "x",
                           "detail": "", "difficulty": 2, "at": m.now_iso()}
                for i in range(total)
            },
            "minimal_pairs": {"ok": correct, "total": total},
        }

    d["daily"][today] = bucket(*today_listen)
    d["daily"][yday] = bucket(*yday_listen)
    d["recitation"]["history"] = [
        {"date": today, "score": 88, "coverage": 0.9, "hint": 0, "title": "T"},
        {"date": yday, "score": 70, "coverage": 0.7, "hint": 1, "title": "Y"},
    ]
    d["recitation"]["last_date"] = today
    d["recitation"]["streak"] = 2
    d["scenario_record"] = [
        {"scenario_id": "w-delay", "success": True, "at": m.now_iso()},
    ]
    return p


def test_metrics_and_verdict():
    facts = share.compute_facts(_profile(), "work")
    assert facts["practiced_today"] is True
    assert facts["day_no"] >= 2
    assert len(facts["metrics"]) <= 2
    assert facts["verdict"] in ("better", "worse", "same")
    # 今天听辨 80% vs 昨天 40% → 变好
    assert facts["verdict"] == "better"
    assert "听辨" in facts["better"]
    assert facts["next"]


def test_no_baseline():
    p = m.empty_profile()
    d = m.ensure_domain(p, "work")
    d["daily"][m.local_date(0)] = {"listening": {"a": {"correct": True}}}
    facts = share.compute_facts(p, "work")
    assert facts["verdict"] == "no_baseline"
    assert "昨天没有练习记录" in facts["caption"]


def test_local_caption_has_brand_and_invite():
    facts = share.compute_facts(_profile(), "work")
    cap = share.local_caption(facts)
    assert "用耳界练英语的第" in cap
    assert "有一起练的吗" in cap
    assert "#英语听力" in cap


def test_build_note_falls_back_without_llm():
    note = asyncio.run(share.build_note(None, "work", _profile()))
    assert note["source"] == "local"
    assert note["metrics"]
    assert note["quote"]


def test_build_note_uses_ai_copy():
    class FakeLLM:
        async def chat(self, *a, **k):
            return (
                '{"better":"听辨稳了","worse":"连读还断",'
                '"next":"明天只练 5 组连读","quote":"终于听顺了一点。",'
                '"caption":"用耳界练英语的第 2 天。\\n今天听辨稳了，连读还断。\\n'
                '明天只练 5 组连读。\\n有一起练的吗？评论区打卡，我们互相盯着。\\n'
                '#英语听力 #职场英语","hashtags":["#英语听力","#职场英语"]}'
            )

    note = asyncio.run(share.build_note(FakeLLM(), "work", _profile()))
    assert note["source"] == "ai"
    assert note["quote"] == "终于听顺了一点。"
    assert "听辨稳了" in note["caption"]
    assert note["metrics"]  # 指标仍来自后端，不交给 AI
    assert "用耳界" in note["caption"]


def test_xhs_local_caption_is_conversational():
    facts = share.compute_facts(_profile(), "work")
    cap = share.xhs_local_caption(facts)
    assert "用耳界练英语的第" in cap
    assert "评论区" in cap
    assert "精听还是泛听" in cap


def test_build_note_xhs_channel_uses_xhs_prompt_and_caption():
    captured = {}

    class FakeLLM:
        async def chat(self, messages, **k):
            captured["system"] = messages[0]["content"]
            return (
                '{"quote":"听顺一点，就很值得。",'
                '"caption":"用耳界练英语的第 2 天。\\n今天听辨突然通了。\\n'
                '你们练听力是精听还是泛听？\\n#英语学习","hashtags":["#英语学习"]}'
            )

    p = _profile()
    note = asyncio.run(share.build_note(FakeLLM(), "work", p, "xhs"))
    assert note["channel"] == "xhs"
    assert "共鸣" in captured["system"]
    assert "开放问题" in captured["system"]
    assert "精听还是泛听" in note["caption"]
    assert "用耳界" in note["caption"]


def test_build_note_xhs_without_llm_uses_local_xhs():
    note = asyncio.run(share.build_note(None, "work", _profile(), "xhs"))
    assert note["source"] == "local"
    assert note["channel"] == "xhs"
    assert "精听还是泛听" in note["caption"]


def test_xhs_discuss_default_and_ai():
    facts = share.compute_facts(_profile(), "work")
    assert "评论区" in facts["discuss"]

    class FakeLLM:
        async def chat(self, *a, **k):
            return ('{"quote":"听顺了一点。","discuss":"精听还是泛听？",'
                    '"caption":"用耳界练英语的第 2 天。\\n#英语学习",'
                    '"hashtags":["#英语学习"]}')

    note = asyncio.run(share.build_note(FakeLLM(), "work", _profile(), "xhs"))
    assert note["discuss"] == "精听还是泛听？"
