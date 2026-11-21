import sys, pathlib, asyncio
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app import models as m
from app.coach import context, guard, prompts, service


class FakeLLM:
    def __init__(self, text):
        self.text = text
        self.calls = 0
    async def chat(self, messages, **kw):
        self.calls += 1
        return self.text


def run(c):
    return asyncio.run(c)


def test_guard_chinese_and_english():
    assert guard.has_cjk("你好")
    assert not guard.is_english_input("你好")
    assert guard.is_english_input("Hello there")
    r = guard.redirect()
    assert r["blocked"] is True
    assert not guard.has_cjk(r["reply"])


def test_brief_is_english_only_and_has_context():
    p = m.empty_profile()
    b = context.brief(p, "work")
    raw = str(b)
    assert not guard.has_cjk(raw)
    assert "domain" in b and "metrics" in b and "today_goal" in b
    assert not guard.has_cjk(context.greeting(b))


def test_start_returns_english_greeting():
    p = m.empty_profile()
    out = run(service.start(p, "work"))
    assert out["english_only"] is True
    assert not guard.has_cjk(out["greeting"])


def test_turn_chinese_is_blocked_without_llm():
    p = m.empty_profile()
    llm = FakeLLM('{"reply":"你好"}')
    out = run(service.turn(llm, p, "work", "你好，今天怎么样？", []))
    assert out["blocked"] is True
    assert llm.calls == 0
    assert not guard.has_cjk(out["reply"])


def test_turn_structured_english():
    p = m.empty_profile()
    llm = FakeLLM('{"reply":"That sounds interesting. What happened next?",'
                  '"correction":"I was swamped.","mood":"curious","gesture":"lean_in"}')
    out = run(service.turn(llm, p, "work", "I am busy today", []))
    assert out["reply"].startswith("That sounds")
    assert out["correction"] == "I was swamped."
    assert out["gesture"] == "lean_in"
    assert out["blocked"] is False
    assert not guard.has_cjk(out["reply"])


def test_turn_llm_chinese_falls_back_to_english():
    p = m.empty_profile()
    llm = FakeLLM('{"reply":"你好，我是Mira","mood":"warm","gesture":"nod"}')
    out = run(service.turn(llm, p, "work", "hello", []))
    assert not guard.has_cjk(out["reply"])
    assert out["reply"]


def test_prompt_hard_rules():
    p = m.empty_profile()
    b = context.brief(p, "work")
    msgs = prompts.coach_messages(b, [], "hello")
    assert "ONLY English" in msgs[0]["content"]
    assert "Chinese" in msgs[0]["content"]
    assert "reply" in msgs[0]["content"]


def test_turn_retries_after_chinese_output():
    class SeqLLM:
        def __init__(self): self.calls = 0
        async def chat(self, *a, **k):
            self.calls += 1
            if self.calls == 1:
                return '{"reply":"你好，很高兴见到你","mood":"warm","gesture":"nod"}'
            return '{"reply":"Hi, good to see you. What would you like to talk about?","mood":"warm","gesture":"nod"}'
    p = m.empty_profile(); llm = SeqLLM()
    out = run(service.turn(llm, p, "work", "hello", []))
    assert llm.calls == 2
    assert not guard.has_cjk(out["reply"])
    assert "good to see you" in out["reply"]


def test_guard_fullwidth_punctuation():
    assert guard.has_cjk("Hello，Mira")
    assert not guard.is_english_input("Hello，Mira")


def test_no_llm_local_fallback():
    p = m.empty_profile()
    out = run(service.turn(None, p, "work", "Hello", []))
    assert out["english_only"] is True
    assert not guard.has_cjk(out["reply"])


def test_end_saves_english_summary_and_records_corrections():
    class LLM:
        async def chat(self, messages, **kw):
            return ('{"summary":"You spoke about your workday in English.",'
                    '"wins":["You kept going"],"gaps":["Verb tense slipped"],'
                    '"next_focus":["Try past tense"],'
                    '"corrections":[{"original":"I goed home","better":"I went home"}]}')
    p = m.empty_profile()
    out = run(service.end(LLM(), p, "work",
               [{"role": "user", "text": "I goed home"},
                {"role": "assistant", "text": "I went home. Good!"}]))
    assert out["saved"] is True
    assert not guard.has_cjk(str(out))
    assert "I went home" in out["corrections"][0]["better"]
    d = m.ensure_domain(p, "work")
    assert d["coach"]["sessions"][-1]["summary"].startswith("You spoke")
    assert any(e["kind"] == "speaking" for e in d["errors"])


def test_end_empty_history_does_not_fake_feedback():
    p = m.empty_profile()
    out = run(service.end(None, p, "work", []))
    assert out["saved"] is False
    assert not guard.has_cjk(out["summary"])


def test_brief_includes_coach_feedback():
    p = m.empty_profile()
    d = m.ensure_domain(p, "work")
    d["coach"] = {"sessions": [], "weak_points": [], "next_focus": ["Try past tense"],
                  "last_summary": "Good session.", "updated_at": ""}
    b = context.brief(p, "work")
    assert b["coach_next_focus"] == ["Try past tense"]
    assert b["coach_last_summary"] == "Good session."


def test_end_sets_tomorrow_goal_from_next_focus():
    class LLM:
        async def chat(self, messages, **kw):
            return ('{"summary":"Good.","wins":[],"gaps":[],'
                    '"next_focus":["Practice past tense"],"corrections":[]}')
    p = m.empty_profile()
    out = run(service.end(LLM(), p, "work",
               [{"role": "user", "text": "I goed home"}]))
    assert out["tomorrow_goal"] == "Practice past tense"
    d = m.ensure_domain(p, "work")
    assert d["goal"]["text"] == "Practice past tense"
    assert d["goal"]["for_date"] == m.local_date(1)


def test_opening_first_time_vs_returning_with_memory():
    p = m.empty_profile()
    b = context.brief(p, "work")
    assert b["first_time"] is True
    assert "focus" in b
    first = context.opening(b)
    assert "Nice to meet you" in first
    assert not guard.has_cjk(first)

    d = m.ensure_domain(p, "work")
    d["coach"]["sessions"] = [{"at": "x", "summary": "first"}]
    d["coach"]["facts"] = [{"text": "I work in marketing", "at": "x"}]
    b2 = context.brief(p, "work")
    assert b2["first_time"] is False
    second = context.opening(b2)
    assert "Nice to meet you" not in second
    assert "marketing" in second
    assert not guard.has_cjk(second)


def test_turn_remembers_conversation():
    p = m.empty_profile()
    out = run(service.turn(None, p, "work", "Hello there", []))
    d = m.ensure_domain(p, "work")
    conv = d["coach"].get("conversation", [])
    assert any(x["role"] == "user" and x["text"] == "Hello there" for x in conv)
    assert any(x["role"] == "assistant" for x in conv)
    assert not guard.has_cjk(out["reply"])


def test_end_persists_facts_and_answer_log():
    class LLM:
        async def chat(self, messages, **kw):
            return ('{"summary":"Good talk.","wins":[],"gaps":[],'
                    '"next_focus":["Practice past tense"],'
                    '"corrections":[{"original":"I goed home","better":"I went home"}],'
                    '"facts":["I work in marketing"]}')
    p = m.empty_profile()
    run(service.end(LLM(), p, "work",
        [{"role": "user", "text": "I goed home"},
         {"role": "assistant", "text": "I went home. Good!"}]))
    d = m.ensure_domain(p, "work")
    assert d["coach"]["facts"][-1]["text"] == "I work in marketing"
    assert any(a["answer"] == "I goed home" and a["correct"] is False
               and a["correction"] == "I went home"
               for a in d["coach"]["answer_log"])
    assert any(t["role"] == "user" for t in d["coach"]["conversation"])
