"""LLM 客户端纯逻辑单测（task 3.1）。不触网。"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import pytest

from app.llm import client as c


def test_endpoint_v1_suffix():
    assert c.endpoint_for("https://api.deepseek.com/v1") == "https://api.deepseek.com/v1/chat/completions"


def test_endpoint_bare_host():
    assert c.endpoint_for("https://api.openai.com") == "https://api.openai.com/v1/chat/completions"


def test_endpoint_already_full():
    url = "https://x.example/v1/chat/completions"
    assert c.endpoint_for(url) == url


def test_endpoint_compatible_mode_path():
    got = c.endpoint_for("https://dashscope.aliyuncs.com/compatible-mode/v1")
    assert got == "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"


def test_endpoint_empty_raises():
    with pytest.raises(ValueError):
        c.endpoint_for("")


def test_headers_with_key():
    h = c.build_headers("sk-123")
    assert h["Authorization"] == "Bearer sk-123"
    assert h["Content-Type"] == "application/json"


def test_headers_without_key():
    assert "Authorization" not in c.build_headers("")


def test_build_payload():
    p = c.build_payload("m", [{"role": "user", "content": "hi"}], stream=True,
                        temperature=0.2, max_tokens=10)
    assert p["model"] == "m"
    assert p["stream"] is True
    assert p["temperature"] == 0.2
    assert p["max_tokens"] == 10


def test_parse_sse_content():
    line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
    done, content = c.parse_sse_line(line)
    assert done is False
    assert content == "Hello"


def test_parse_sse_done():
    done, content = c.parse_sse_line("data: [DONE]")
    assert done is True
    assert content == ""


def test_parse_sse_ignores_blank_and_non_data():
    assert c.parse_sse_line("") == (False, "")
    assert c.parse_sse_line(": keep-alive") == (False, "")


def test_parse_sse_bad_json():
    assert c.parse_sse_line("data: {not json") == (False, "")


def test_parse_sse_no_content():
    assert c.parse_sse_line('data: {"choices":[{"delta":{}}]}') == (False, "")


def test_extract_message_content():
    obj = {"choices": [{"message": {"content": "world"}}]}
    assert c.extract_message_content(obj) == "world"


def test_extract_message_content_empty():
    assert c.extract_message_content({}) == ""


def test_client_ensure_ready_raises_without_config():
    cli = c.LLMClient(c.LLMConfig())
    with pytest.raises(RuntimeError):
        cli._ensure_ready()


def test_provider_extras_disables_thinking_for_deepseek():
    cfg = c.LLMConfig(base_url="https://api.deepseek.com/v1", model="deepseek-flash")
    extras = c.provider_extras(cfg)
    assert extras == {"thinking": {"type": "disabled"}}


def test_provider_extras_none_for_other_provider():
    cfg = c.LLMConfig(base_url="https://api.openai.com/v1", model="gpt-4o-mini")
    assert c.provider_extras(cfg) == {}


def test_provider_extras_respects_flag_off():
    cfg = c.LLMConfig(base_url="https://api.deepseek.com", model="deepseek-flash",
                      disable_thinking=False)
    assert c.provider_extras(cfg) == {}


def test_build_payload_merges_extras():
    p = c.build_payload("m", [], stream=False, extras={"thinking": {"type": "disabled"}})
    assert p["thinking"] == {"type": "disabled"}
