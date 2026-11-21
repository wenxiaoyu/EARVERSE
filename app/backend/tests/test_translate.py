import sys, pathlib, asyncio
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.llm import translate


class FakeLLM:
    def __init__(self, text):
        self.text = text
        self.calls = 0

    async def chat(self, messages, **kw):
        self.calls += 1
        return self.text


def run(c):
    return asyncio.run(c)


def test_translate_returns_chinese():
    translate.clear_cache()
    llm = FakeLLM("我今天很忙")
    out = run(translate.to_chinese(llm, "I am busy today."))
    assert out == "我今天很忙"
    assert llm.calls == 1


def test_translate_caches():
    translate.clear_cache()
    llm = FakeLLM("你好")
    run(translate.to_chinese(llm, "Hello there, my friend."))
    run(translate.to_chinese(llm, "Hello there, my friend."))
    assert llm.calls == 1


def test_translate_without_llm_returns_empty():
    translate.clear_cache()
    assert run(translate.to_chinese(None, "Something in English")) == ""


def test_translate_strips_quotes_and_empty_input():
    translate.clear_cache()
    llm = FakeLLM('"你好啊"')
    assert run(translate.to_chinese(llm, "Hi there")) == "你好啊"
    assert run(translate.to_chinese(llm, "   ")) == ""
