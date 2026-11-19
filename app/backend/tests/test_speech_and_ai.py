"""DeepSeek ASR/TTS 适配 + AI 测验纯逻辑 单测。"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.speech import asr, tts
from app.config import AudioConfig
from app.assessment import ai
from app import models
from app.pronunciation import service as pron


def test_asr_endpoint_deepseek():
    assert asr.asr_endpoint("https://api.deepseek.com/v1") == "https://api.deepseek.com/v1/tools/asr"
    assert asr.asr_endpoint("https://api.deepseek.com") == "https://api.deepseek.com/v1/tools/asr"


def test_asr_endpoint_openai():
    assert asr.asr_endpoint("https://api.openai.com/v1") == "https://api.openai.com/v1/audio/transcriptions"


def test_tts_endpoint_deepseek():
    assert tts.tts_endpoint("https://api.deepseek.com/v1") == "https://api.deepseek.com/v1/tools/tts"


def test_tts_payload_deepseek():
    cfg = AudioConfig(tts_voice="alloy")
    p = tts.build_tts_payload("hello", "https://api.deepseek.com/v1", cfg)
    assert p["voice_id"] == "stella"
    assert p["format"] == "wav"
    assert p["text"] == "hello"
    assert "model" not in p


def test_tts_payload_deepseek_male_voice():
    cfg = AudioConfig(tts_voice="onyx")
    p = tts.build_tts_payload("hi", "https://api.deepseek.com/v1", cfg)
    assert p["voice_id"] == "tide"


def test_tts_payload_openai():
    cfg = AudioConfig(tts_voice="alloy")
    p = tts.build_tts_payload("hi", "https://api.openai.com/v1", cfg)
    assert p["model"] == "tts-1" and p["input"] == "hi"


def test_validate_pack_drops_empty_and_rebuilds_options():
    data = {"items": [
        {"w": "available", "zh": "有空的", "options": ["x"], "answer_index": 9},
        {"w": "", "zh": "y"},
        {"w": "x", "zh": ""},
    ]}
    out = ai.validate_pack(data, 10)
    assert len(out) == 1
    it = out[0]
    assert it["play_text"] == "available"
    assert len(set(it["options"])) == 4
    assert it["options"][it["answer_index"]] == "有空的"


def test_fallback_pack_has_four_options():
    pack = ai.build_fallback_pack("work", 3)
    assert len(pack) == 3
    for it in pack:
        assert len(it["options"]) == 4
        assert it["options"][it["answer_index"]] == it["zh"]


def test_public_item_hides_answer():
    item = ai.build_fallback_pack("work", 1)[0]
    pub = ai.public_item(item, 0)
    assert "answer_index" not in pub and "w" not in pub
    assert len(pub["options"]) == 4


def test_local_grade_marks_deaf_and_automatic():
    items = [{"w": "a", "zh": "A", "tag": "弱读"}, {"w": "b", "zh": "B", "tag": "连读"}]
    log = [
        {"w": "a", "correct": False, "seen_known": True, "reaction_ms": 2000},
        {"w": "b", "correct": True, "seen_known": None, "reaction_ms": 300},
    ]
    res = ai._local_grade("work", log, items)
    assert res["vocab"]["a"] == models.VOCAB_DEAF
    assert res["vocab"]["b"] == models.VOCAB_AUTOMATIC
    assert res["confidence"] <= 1.0


def test_apply_profile_sets_states_and_hearing():
    p = models.empty_profile()
    items = [{"w": "a", "zh": "A", "tag": "弱读"}]
    res = {"source": "ai", "vocab": {"a": "deaf"},
           "blind_spots": [{"rule": "r05"}], "weaknesses": []}
    ai.apply_profile(p, "work", res, items)
    assert p["domains"]["work"]["vocab"]["a"]["state"] == models.VOCAB_DEAF
    assert p["domains"]["work"]["hearing"]["r05"]["count"] == 1


def test_heuristic_score_full_match():
    assert pron.heuristic_score("I think so", "i think so")["score"] == 100


def test_heuristic_score_missing_word():
    r = pron.heuristic_score("think", "sink")
    assert r["score"] == 0
    assert r["issues"]


def test_record_pronunciation():
    p = models.empty_profile()
    models.record_pronunciation(p, "work", "think", score=60, issues=[{"sound": "θ"}], confidence=0.7)
    assert p["domains"]["work"]["pronunciation"]["think"]["score"] == 60


def test_pron_validate_items_filters_short():
    data = {"items": [
        {"text": "I think so", "focus": "θ", "difficulty": 2},
        {"text": "hi", "focus": "x"},
        {"text": "", "focus": "y"},
    ]}
    out = pron.validate_items(data, 5)
    assert len(out) == 1 and out[0]["text"] == "I think so"


def test_pron_fallback_items_cover_coverage():
    items = pron.FALLBACK_ITEMS
    joined = " ".join(i["focus"] for i in items)
    for kw in ("θ", "v", "w", "l", "r", "尾", "连读", "重音"):
        assert kw in joined


def test_pron_generate_items_without_llm():
    import asyncio
    items, src = asyncio.run(pron.generate_items(None, "work", 3))
    assert src == "fallback"
    assert len(items) == 3


def test_fallback_pack_domain_differs():
    w = [x["w"] for x in ai.build_fallback_pack("work", 8)]
    t = [x["w"] for x in ai.build_fallback_pack("travel", 8)]
    assert w != t


def test_fallback_pack_options_vary_and_answer_valid():
    pack = ai.build_fallback_pack("work", 6)
    opts = [tuple(x["options"]) for x in pack]
    assert len(set(opts)) > 1
    for x in pack:
        assert len(x["options"]) == 4
        assert len(set(x["options"])) == 4
        assert x["options"][x["answer_index"]] == x["zh"]


def test_seed_items_domain_differs():
    from app.generation import service as gen
    a = [x["w"] for x in gen.seed_items("cards", 8, domain="work")]
    b = [x["w"] for x in gen.seed_items("cards", 8, domain="travel")]
    assert a != b


def test_apply_llm_patch_keeps_key_on_empty():
    from app.config import AppConfig, apply_llm_patch
    cfg = AppConfig()
    cfg.llm.api_key = "sk-X"
    apply_llm_patch(cfg, {"base_url": "https://api.deepseek.com/v1", "api_key": ""})
    assert cfg.llm.api_key == "sk-X"
    apply_llm_patch(cfg, {"api_key": "   "})
    assert cfg.llm.api_key == "sk-X"


def test_apply_llm_patch_sets_and_clears_key():
    from app.config import AppConfig, apply_llm_patch
    cfg = AppConfig()
    apply_llm_patch(cfg, {"api_key": "sk-Y"})
    assert cfg.llm.api_key == "sk-Y"
    apply_llm_patch(cfg, {"clear_api_key": True})
    assert cfg.llm.api_key == ""


def test_validate_pairs_filters_invalid():
    data = {"items": [
        {"a": "ship", "b": "sheep", "focus": "/ɪ/ vs /iː/"},
        {"a": "", "b": "y"},
        {"a": "same", "b": "same"},
    ]}
    out = pron.validate_pairs(data, 5)
    assert len(out) == 1 and out[0]["a"] == "ship"


def test_generate_minimal_pairs_fallback():
    import asyncio
    items, src = asyncio.run(pron.generate_minimal_pairs(None, "work", 4))
    assert src == "fallback" and len(items) == 4
    assert all(i["a"] and i["b"] for i in items)


def test_validate_pack_forces_play_text_and_answer_alignment():
    data = {"items": [
        {"w": "approximately", "zh": "大约",
         "play_text": "It takes approximately two weeks.",
         "options": ["昂贵", "大约", "临时", "具体"], "answer_index": 0, "difficulty": 2},
        {"w": "schedule", "zh": "日程",
         "options": ["计划", "会议", "日程", "预算"], "answer_index": 0, "difficulty": 1},
    ]}
    out = ai.validate_pack(data, 5)
    assert len(out) == 2
    a, b = out
    assert a["play_text"] == "approximately"
    assert a["options"][a["answer_index"]] == "大约"
    assert b["options"][b["answer_index"]] == "日程"


def test_audio_key_falls_back_to_llm_when_placeholder(tmp_path):
    import json
    from app.config import load_config
    from app.config import config_path
    p = config_path(tmp_path)
    p.write_text(json.dumps({
        "llm": {"base_url": "https://api.deepseek.com/v1",
                "api_key": "sk-" + "a" * 32, "model": "deepseek-flash"},
        "audio": {"base_url": "https://api.deepseek.com/v1",
                  "api_key": "sk-REAL-KEY"},
    }), encoding="utf-8")
    cfg = load_config(tmp_path)
    assert cfg.audio.api_key == cfg.llm.api_key
    assert len(cfg.audio.api_key) > 20


def test_audio_key_kept_when_valid(tmp_path):
    import json
    from app.config import load_config, config_path
    p = config_path(tmp_path)
    p.write_text(json.dumps({
        "llm": {"base_url": "https://x/v1", "api_key": "sk-" + "a" * 32, "model": "m"},
        "audio": {"base_url": "https://y/v1", "api_key": "sk-" + "b" * 32},
    }), encoding="utf-8")
    cfg = load_config(tmp_path)
    assert cfg.audio.api_key == "sk-" + "b" * 32


def test_validate_profile_trims_and_limits():
    data = {
        "summary": "结论" * 100,
        "verdict": "变好",
        "weaknesses": [
            {"area": "a" * 20, "evidence": "e" * 60, "action": "x" * 60}
            for _ in range(5)
        ],
        "next_plan": "p" * 200,
    }
    out = ai.validate_profile(data)
    assert len(out["summary"]) <= 80
    assert len(out["weaknesses"]) <= 3
    assert all(len(w["area"]) <= 12 and len(w["evidence"]) <= 30 and len(w["action"]) <= 30
               for w in out["weaknesses"])
    assert len(out["next_plan"]) <= 60
