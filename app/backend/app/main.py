"""FastAPI 应用（集成层，task 1.3 / 11.1）。

把所有能力接成 HTTP API：
- 配置、健康检查、种子数据
- 首次自适应测验（start/answer/finish/confirm）
- 每日计划、训练结果回填 + 诊断
- 场景实战（start/say/review）
- 内容生成、教练报告
- 语音 TTS / ASR

会话状态（测验/场景）放内存；画像落 SQLite。
"""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import models, seeddata
from .coach import service as coach
from .assessment import ai as ai_assess
from .pronunciation import service as pronunciation
from .config import LLMConfig, load_config, public_view, save_config
from .generation import service as generation
from .llm import prompts
from .llm.client import LLMClient
from .recitation import service as recitation
from .reports import service as reports
from .scenarios import engine as scenarios
from .share import service as share
from .speech import asr as speech_asr
from .speech import tts as speech_tts
from .storage import ProfileStorage
from .training import loop as training

DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "data" / "profiles.db"
ROOT = Path(__file__).resolve().parents[2]          # app/
FRONTEND_DIST = ROOT / "frontend" / "dist"
RECITATION_AUDIO_DIR = DB_PATH.parent / "recitation_audio"

app = FastAPI(title="AI English Coach")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = ProfileStorage(DB_PATH)
_probe_sessions: dict[str, dict[str, Any]] = {}
_scenario_sessions: dict[str, dict[str, Any]] = {}
_TTS_CACHE: dict[str, tuple[bytes, str]] = {}


def _load_scenario_session(sid: str | None) -> dict[str, Any] | None:
    """内存优先；重启后从 SQLite 恢复。"""
    if not sid:
        return None
    sess = _scenario_sessions.get(sid)
    if sess is None:
        sess = storage.get_session(sid)
        if sess:
            _scenario_sessions[sid] = sess
    return sess


def _config():
    return load_config(DB_PATH.parent)


def _llm() -> LLMClient | None:
    cfg = _config()
    # 三者齐全才算可用：缺 key 时直接走降级，避免无效请求
    if cfg.llm.base_url and cfg.llm.model and cfg.llm.api_key:
        return LLMClient(cfg.llm)
    return None


def _profile(domain: str | None = None) -> dict[str, Any]:
    return storage.load_or_create("default")


# ---------------------------------------------------------------- 基础

@app.get("/api/health")
def health():
    cfg = _config()
    return {
        "ok": True,
        "llm_configured": bool(cfg.llm.base_url and cfg.llm.model and cfg.llm.api_key),
        "model": cfg.llm.model,
    }


@app.get("/api/config")
def get_config():
    return public_view(_config())


@app.post("/api/config")
async def set_config(request: Request):
    body = await request.json()
    cfg = _config()
    from .config import apply_llm_patch
    apply_llm_patch(cfg, body.get("llm") or {})
    speech = body.get("speech") or {}
    for key in ("tts_provider", "tts_voice", "asr_provider", "asr_model"):
        if key in speech:
            setattr(cfg.speech, key, str(speech.get(key) or "").strip())
    save_config(cfg, DB_PATH.parent)
    return {"ok": True, **public_view(cfg)}


@app.get("/api/seed/{name}")
def get_seed(name: str):
    try:
        return {"items": seeddata.load(name)}
    except KeyError:
        return JSONResponse({"error": f"未知种子: {name}"}, status_code=404)


@app.get("/api/profile")
def get_profile(domain: str = "work"):
    profile = _profile()
    return {
        "profile": profile,
        "domain_view": profile.get("domains", {}).get(domain, {}),
    }


# ---------------------------------------------------------------- 首次测验

def _probe_item_view(item: dict) -> dict:
    return {
        "id": str(item["id"]),
        "w": item.get("w") or item.get("text", ""),
        "zh": item.get("zh", ""),
        "difficulty": item.get("difficulty", 2),
        "tag": item.get("tag", ""),
    }


@app.post("/api/assessment/start")
async def assessment_start(request: Request):
    body = await request.json()
    domain = body.get("domain", "work")
    count = int(body.get("count", 18))
    profile = _profile()
    prev = (profile.get("assessments", {}).get(domain) or {}).get("summary") or {}
    items, source = await ai_assess.generate_pack(_llm(), domain, prev, count=count)
    sid = uuid.uuid4().hex
    _probe_sessions[sid] = {"domain": domain, "items": items, "idx": 0,
                            "log": [], "source": source}
    first = ai_assess.public_item(items[0], 0) if items else None
    return {"session_id": sid, "source": source, "total": len(items),
            "done": first is None, "item": first}


def _next_payload(sess: dict[str, Any]) -> dict[str, Any]:
    idx = sess["idx"]
    if idx >= len(sess["items"]):
        return {"done": True, "item": None}
    return {"done": False, "item": ai_assess.public_item(sess["items"][idx], idx)}


@app.post("/api/assessment/answer")
async def assessment_answer(request: Request):
    body = await request.json()
    sess = _probe_sessions.get(body.get("session_id"))
    if not sess:
        return JSONResponse({"error": "会话不存在或已结束"}, status_code=404)
    idx = sess["idx"]
    # 防重复：客户端带上它正在作答的题目序号，若已过期则忽略（避免连点导致错位）
    idx_in = body.get("item_index")
    if idx_in is not None:
        try:
            if int(idx_in) != idx:
                return {"stale": True}
        except (TypeError, ValueError):
            pass
    if idx >= len(sess["items"]):
        return {"done": True, "item": None}
    item = sess["items"][idx]
    choice = body.get("choice_index")
    correct = choice is not None and int(choice) == int(item["answer_index"])
    sess["log"].append({
        "w": item["w"], "zh": item["zh"], "tag": item["tag"],
        "difficulty": item["difficulty"], "correct": correct,
        "choice_index": choice, "reaction_ms": body.get("reaction_ms"),
        "seen_known": None, "free_text": str(body.get("free_text") or ""),
    })
    sess["idx"] = idx + 1
    payload: dict[str, Any] = {"correct": correct, "reveal": ai_assess.reveal(item)}
    if correct:
        payload.update(_next_payload(sess))
    else:
        payload.update({"ask_seen": True, "done": False, "item": None})
    return payload


@app.post("/api/assessment/seen")
async def assessment_seen(request: Request):
    body = await request.json()
    sess = _probe_sessions.get(body.get("session_id"))
    if not sess:
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    if sess["log"]:
        sess["log"][-1]["seen_known"] = bool(body.get("seen_known"))
    payload: dict[str, Any] = {"ok": True}
    payload.update(_next_payload(sess))
    return payload


@app.post("/api/assessment/finish")
async def assessment_finish(request: Request):
    body = await request.json()
    sid = body["session_id"]
    sess = _probe_sessions.get(sid)
    if not sess:
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    profile = _profile()
    result = await ai_assess.grade(_llm(), sess["domain"], sess["log"], sess["items"])
    ai_assess.apply_profile(profile, sess["domain"], result, sess["items"])
    models.set_goal(profile, sess["domain"], _goal_from_assessment(result, profile, sess["domain"]))
    profile.setdefault("assessments", {})[sess["domain"]] = {
        "confirmed": False, "summary": result, "at": models.now_iso(),
    }
    storage.save(profile)
    log = sess["log"]
    per_level: dict[str, dict[str, int]] = {}
    for lv in (1, 2, 3):
        rows = [r for r in log if int(r.get("difficulty") or 2) == lv]
        per_level[str(lv)] = {"asked": len(rows),
                              "correct": sum(1 for r in rows if r.get("correct"))}
    correct_n = sum(1 for r in log if r.get("correct"))
    stats = {
        "asked": len(log),
        "correct": correct_n,
        "accuracy": round(correct_n / len(log) * 100) if log else 0,
        "per_level": per_level,
    }
    _probe_sessions.pop(sid, None)
    return {"domain": sess["domain"], "source": sess["source"],
            "result": result, "stats": stats}


@app.post("/api/assessment/confirm")
async def assessment_confirm(request: Request):
    body = await request.json()
    domain = body.get("domain", "work")
    profile = _profile()
    assessments = profile.setdefault("assessments", {})
    entry = assessments.get(domain) or {}
    entry["confirmed"] = True
    entry["confirmed_at"] = models.now_iso()
    if body.get("corrections"):
        entry["corrections"] = body["corrections"]
    assessments[domain] = entry
    storage.save(profile)
    return {"ok": True, "confirmed": True}


def _local_explanation(profile: dict, domain: str, summary: dict) -> dict:
    d = profile.get("domains", {}).get(domain, {})
    deaf = models.deaf_words(d)
    weak = models.weakest_hearing(d)
    weaknesses = []
    if deaf:
        weaknesses.append({"area": "哑巴词汇", "evidence": f"{len(deaf)} 个词认识但听不出",
                           "action": "每天用听音猜义专练这批词"})
    if weak:
        names = "、".join(w.get("name") or w["rule_id"] for w in weak)
        weaknesses.append({"area": "听力盲区", "evidence": f"常卡在 {names}",
                           "action": "在「为什么听不清」对应对练"})
    return {
        "summary": f"你的听力边界大约在难度 {summary.get('ability_level')} 档。"
                   + ("存在明显的哑巴词汇。" if deaf else ""),
        "strengths": [],
        "weaknesses": weaknesses,
        "deaf_word_hint": "、".join(deaf[:8]),
        "confirm_questions": ["我判断你在上面这些地方薄弱，对吗？"],
        "source": "local",
    }


# ---------------------------------------------------------------- 每日计划 / 训练

PRONOUNCE_TEXTS = {
    "work": "I think we should verify the deadline with the vendor.",
    "travel": "Could you check the reservation for three nights?",
    "interview": "I usually lead the platform team and review their work.",
    "social": "I would rather stay in and watch a film tonight.",
}


@app.get("/api/pronunciation/items")
async def pronunciation_items(domain: str = "work", count: int = 5):
    cfg = _config()
    profile = _profile()
    goal = _goal_for_today(profile, domain)
    focus_errors = models.recent_pron_issues(profile, domain)
    items, source = await pronunciation.generate_items(_llm(), domain, count, goal=goal,
                                                       focus_errors=focus_errors)
    return {"items": items, "source": source, "audio_ready": bool(cfg.audio.base_url and cfg.audio.api_key)}


@app.get("/api/minimal-pairs")
async def minimal_pairs(domain: str = "work", count: int = 8):
    profile = _profile()
    goal = _goal_for_today(profile, domain)
    focus_errors = models.recent_pron_issues(profile, domain)
    items, source = await pronunciation.generate_minimal_pairs(_llm(), domain, count, goal=goal,
                                                               focus_errors=focus_errors)
    return {"items": items, "source": source}


@app.get("/api/pronunciation/target")
async def pronunciation_target(domain: str = "work"):
    cfg = _config()
    items, source = await pronunciation.generate_items(_llm(), domain, 1)
    it = items[0] if items else {"text": "", "focus": "", "tip": ""}
    return {"target": it["text"], "focus": it.get("focus"), "tip": it.get("tip"),
            "source": source, "audio_ready": bool(cfg.audio.base_url and cfg.audio.api_key)}


@app.post("/api/pronunciation")
async def pronunciation_assess(file: UploadFile = File(...),
                               domain: str = Form("work"),
                               target: str = Form("")):
    """朗读发音评估：录音 → DeepSeek ASR 转写 → AI/启发式评分（可懂度）。"""
    cfg = _config()
    text = target.strip() or PRONOUNCE_TEXTS.get(domain, PRONOUNCE_TEXTS["work"])
    data = await file.read()
    try:
        result = await pronunciation.assess(data, text, cfg.audio, _llm(),
                                            domain=domain,
                                            filename=file.filename or "speech.wav")
    except RuntimeError as e:
        return JSONResponse({"error": str(e), "target": text, "audio_ready": False},
                            status_code=409)
    except Exception as e:
        msg = str(e)
        low = msg.lower()
        if "401" in msg or "unauthorized" in low:
            msg = "音频密钥无效，请在设置里填写有效的 DeepSeek Key"
        elif "402" in msg or "quota" in low or "insufficient" in low:
            msg = "音频额度不足，请检查账户余额"
        elif "429" in msg:
            msg = "请求太频繁，请稍后重试"
        elif "550" in msg or "reset" in low:
            msg = "音频服务连接被重置，请重试（或检查密钥）"
        else:
            msg = f"评估失败：{msg}"
        return JSONResponse({"error": msg, "target": text}, status_code=502)
    profile = _profile()
    for iss in (result.get("issues") or []):
        if isinstance(iss, dict):
            models.record_pron_issue(profile, domain,
                                     sound=str(iss.get("sound") or ""),
                                     heard_as=str(iss.get("heard_as") or ""),
                                     word=str(iss.get("word") or ""),
                                     tip=str(iss.get("tip") or ""))
    models.record_pronunciation(profile, domain, text, score=result.get("score"),
                                issues=result.get("issues"),
                                confidence=result.get("confidence"),
                                transcript=result.get("transcript", ""))
    storage.save(profile)
    return {"target": text, **result}


def _goal_from_assessment(result: dict[str, Any], profile: dict[str, Any],
                          domain: str) -> dict[str, Any]:
    """把首次测验/复测结果沉淀成「明日目标」。"""
    focus = training.plan_focus(profile, domain)
    words = [w for w, st in (result.get("vocab") or {}).items() if st == "deaf"][:5]
    hearing = []
    for b in (result.get("blind_spots") or []):
        rid = b.get("rule") if isinstance(b, dict) else str(b)
        if rid:
            hearing.append(models.HEARING_LABELS.get(rid, rid))
    return {
        "text": str(result.get("next_plan") or result.get("summary") or "补首次测验暴露的短板")[:40],
        "kind": "assessment",
        "words": words,
        "hearing": hearing[:2],
        "skills": (focus.get("ungraduated_skills") or [])[:2],
        "source": "assessment",
        "from_date": models.local_date(0),
        "for_date": models.local_date(1),
    }


def _goal_for_today(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    """今日目标：未首次校准 -> 先测验；已校准 -> 昨日复盘目标；否则规则兜底。"""
    entry = (profile.get("assessments") or {}).get(domain) or {}
    if not entry.get("confirmed"):
        return {"text": "完成首次测验", "kind": "assess", "words": [], "hearing": [],
                "skills": [], "source": "assess", "for_date": models.local_date(0)}
    g = models.get_today_goal(profile, domain)
    if g:
        return g
    focus = training.plan_focus(profile, domain)
    words = [str(w) for w in (focus.get("deaf_words") or [])][:5]
    hearing = [(w.get("name") or w["rule_id"]) for w in (focus.get("hearing") or [])][:2]
    skills = (focus.get("ungraduated_skills") or [])[:2]
    parts = []
    if words:
        parts.append(f"补 {len(words)} 个哑巴词")
    if hearing:
        parts.append("练" + hearing[0])
    if skills:
        parts.append("实战练" + skills[0])
    text = " + ".join(parts) if parts else "先复习再实战，把一件事办成"
    return {"text": text, "kind": "rules", "words": words, "hearing": hearing,
            "skills": skills, "source": "rules", "for_date": models.local_date(0)}


@app.get("/api/plan")
def plan(domain: str = "work", state: str = "normal"):
    profile = _profile()
    return {
        "domain": domain,
        "schedule": training.build_schedule(profile, domain, user_state=state),
        "focus": training.plan_focus(profile, domain),
        "goal": _goal_for_today(profile, domain),
    }


@app.post("/api/training/result")
async def training_result(request: Request):
    body = await request.json()
    domain = body.get("domain", "work")
    results = body.get("results") or []
    profile = _profile()
    # 回填错误史
    for r in results:
        if not r.get("correct"):
            models.record_error(profile, domain, r.get("kind", "listening"),
                                r.get("text", ""), detail=r.get("detail", ""),
                                source="training")
    summary = training.summarize_day(results)
    # 用户反馈校准 + 每日历史（供报告 7 天趋势）
    d = models.ensure_domain(profile, domain)
    d["calibration"] = {"last_accuracy": summary["accuracy"], "at": models.now_iso()}
    hist = d.setdefault("history", [])
    hist.append({
        "date": models.local_date(0),
        "accuracy": round(summary["accuracy"], 3),
        "total": summary["total"],
    })
    d["history"] = hist[-30:]
    diagnosis = await _diagnose(domain, results, profile)
    storage.save(profile)
    return {"day_summary": summary, "diagnosis": diagnosis}


async def _diagnose(domain: str, results: list, profile: dict) -> dict:
    d = profile.get("domains", {}).get(domain, {})
    excerpt = {"weak_hearing": models.weakest_hearing(d),
               "deaf_words": models.deaf_words(d)[:10]}
    llm = _llm()
    if llm is not None:
        try:
            text = await llm.chat(prompts.diagnoser_messages(domain, results, excerpt),
                                  temperature=0.5, max_tokens=800)
            parsed = prompts.parse_json_reply(text)
            if parsed:
                parsed["source"] = "llm"
                return parsed
        except Exception:
            pass
    summary = training.summarize_day(results)
    focus = training.plan_focus(profile, domain)
    return {
        "verdict": "持平",
        "why": f"今天 {summary['total']} 题，对 {summary['correct']}。",
        "evidence": [{"original": e.get("text", ""), "issue": "错了"} for e in summary["errors"][:3]],
        "next_focus": [w.get("name") or w["rule_id"] for w in focus["hearing"]],
        "tomorrow_plan": "优先补今天错的同类，再练哑巴词汇。",
        "source": "local",
    }


# ---------------------------------------------------------------- 每日日历 / 详情

def _day_blocks(d: dict[str, Any], date: str) -> dict[str, Any]:
    bucket = (d.get("daily") or {}).get(date) or {}
    listening = list((bucket.get("listening") or {}).values())
    mp = bucket.get("minimal_pairs") or {"ok": 0, "total": 0}
    pron = [v for v in (d.get("pronunciation") or {}).values()
            if models.local_date_of(v.get("at", "")) == date]
    scores = [v.get("score") for v in pron if isinstance(v.get("score"), (int, float))]
    scen = [r for r in (d.get("scenario_record") or [])
            if models.local_date_of(r.get("at", "")) == date]
    errors = [e for e in (d.get("errors") or [])
              if models.local_date_of(e.get("at", "")) == date]
    issues = [x for v in pron for x in (v.get("issues") or []) if isinstance(x, dict)]
    correct = sum(1 for r in listening if r.get("correct"))
    return {
        "listening": {"total": len(listening), "correct": correct, "items": listening},
        "shadow": {"count": len(scores),
                   "avg": round(sum(scores) / len(scores)) if scores else None,
                   "issues": issues},
        "minimal_pairs": {"ok": int(mp.get("ok", 0)), "total": int(mp.get("total", 0))},
        "scenario": {"done": bool(scen),
                     "success": any(r.get("success") for r in scen),
                     "records": scen[-3:]},
        "errors": errors,
    }


def _collect_days(d: dict[str, Any], start: str, end: str) -> list[dict[str, Any]]:
    days: dict[str, dict[str, Any]] = {}

    def touch(date: str) -> dict[str, Any]:
        return days.setdefault(date, {
            "date": date, "practiced": False, "has_recap": False,
            "listening": 0, "correct": 0, "shadow": 0, "minimal_pairs": 0,
            "scenario": False,
        })

    for date, b in (d.get("daily") or {}).items():
        if not (start <= date <= end):
            continue
        li = b.get("listening") or {}
        it = touch(date)
        it["practiced"] = bool(li or b.get("minimal_pairs") or b.get("recap"))
        it["listening"] = len(li)
        it["correct"] = sum(1 for r in li.values() if r.get("correct"))
        it["minimal_pairs"] = int((b.get("minimal_pairs") or {}).get("total", 0))
        it["has_recap"] = bool(b.get("recap"))

    for h in (d.get("history") or []):
        date = str(h.get("date") or "")
        if start <= date <= end:
            touch(date)["practiced"] = True

    for v in (d.get("pronunciation") or {}).values():
        date = models.local_date_of(v.get("at", ""))
        if start <= date <= end:
            it = touch(date)
            it["practiced"] = True
            it["shadow"] += 1

    for r in (d.get("scenario_record") or []):
        date = models.local_date_of(r.get("at", ""))
        if start <= date <= end:
            it = touch(date)
            it["practiced"] = True
            it["scenario"] = True

    for e in (d.get("errors") or []):
        date = models.local_date_of(e.get("at", ""))
        if start <= date <= end:
            touch(date)["practiced"] = True

    return sorted(days.values(), key=lambda x: x["date"])


@app.get("/api/daily/calendar")
def daily_calendar(domain: str = "work", month: str = ""):
    d = models.ensure_domain(_profile(), domain)
    month = month or models.local_date(0)[:7]
    return {"month": month, "days": _collect_days(d, f"{month}-01", f"{month}-31")}


@app.get("/api/daily/range")
def daily_range(domain: str = "work", start: str = "", end: str = ""):
    d = models.ensure_domain(_profile(), domain)
    start = start or models.local_date(0)
    end = end or start
    return {"start": start, "end": end, "days": _collect_days(d, start, end)}


@app.get("/api/daily/detail")
def daily_detail(domain: str = "work", date: str = ""):
    date = date or models.local_date(0)
    d = models.ensure_domain(_profile(), domain)
    blocks = _day_blocks(d, date)
    bucket = (d.get("daily") or {}).get(date) or {}
    recap = bucket.get("recap")
    advice: list[str] = []
    wrong = [r for r in blocks["listening"]["items"] if not r.get("correct")]
    if wrong:
        words = "、".join(str(r.get("text") or "") for r in wrong[:5])
        advice.append(f"重点复盘 {len(wrong)} 个没听出的词：{words}")
    sounds = sorted({str(i.get("sound") or i.get("word") or "")
                     for i in blocks["shadow"]["issues"]
                     if (i.get("sound") or i.get("word"))})
    if sounds:
        advice.append("跟读需纠正：" + "、".join(sounds[:4]))
    mp = blocks["minimal_pairs"]
    if mp["total"] and mp["ok"] < mp["total"]:
        advice.append("最小对立对正确率偏低，下一组继续专练易混音。")
    if blocks["scenario"]["done"] and not blocks["scenario"]["success"]:
        advice.append("实战没办成，回看卡点并重练同一场景。")
    practiced = bool(blocks["listening"]["total"] or blocks["shadow"]["count"]
                     or blocks["scenario"]["done"] or recap or blocks["errors"])
    return {"date": date, "practiced": practiced, "blocks": blocks,
            "recap": recap, "advice": advice}


# ---------------------------------------------------------------- 今日复盘（汇总）

@app.post("/api/training/record")
async def training_record(request: Request):
    """第 1 步：单张卡片边做边存（不生成诊断）。"""
    body = await request.json()
    domain = body.get("domain", "work")
    profile = _profile()
    key = str(body.get("item_key") or body.get("text") or "")
    correct = bool(body.get("correct"))
    if key:
        models.record_daily_listening(profile, domain, key, correct,
                                      text=str(body.get("text") or ""),
                                      detail=str(body.get("detail") or ""),
                                      difficulty=int(body.get("difficulty") or 2))
    if not correct:
        models.record_error(profile, domain, body.get("kind", "listening"),
                            body.get("text", ""), detail=body.get("detail", ""),
                            source="training")
    storage.save(profile)
    return {"ok": True}


@app.post("/api/daily/minimal-pair")
async def daily_minimal_pair(request: Request):
    body = await request.json()
    domain = body.get("domain", "work")
    profile = _profile()
    correct = bool(body.get("correct"))
    models.record_daily_minimal_pair(profile, domain, correct)
    if not correct:
        focus = str(body.get("focus") or "")
        target = str(body.get("target") or "")
        models.record_pron_issue(profile, domain, sound=focus, word=target,
                                 tip="最小对立对听错，下一组优先练这个音")
    storage.save(profile)
    return {"ok": True}


@app.post("/api/daily/recap")
async def daily_recap(request: Request):
    """第 4 步：汇总今天四块，生成今日诊断 + 明日计划。"""
    body = await request.json()
    domain = body.get("domain", "work")
    profile = _profile()
    d = models.ensure_domain(profile, domain)
    day = models.local_date(0)
    bucket = models.daily_bucket(profile, domain, day)
    listening = list((bucket.get("listening") or {}).values())
    mp = bucket.get("minimal_pairs") or {"ok": 0, "total": 0}

    pron = [v for v in (d.get("pronunciation") or {}).values()
            if str(v.get("at", ""))[:10] == day]
    scores = [v.get("score") for v in pron if isinstance(v.get("score"), (int, float))]
    scen = [r for r in (d.get("scenario_record") or [])
            if str(r.get("at", ""))[:10] == day]

    correct_n = sum(1 for r in listening if r.get("correct"))
    blocks = {
        "listening": {"total": len(listening), "correct": correct_n},
        "shadow": {"count": len(scores),
                   "avg": round(sum(scores) / len(scores)) if scores else None},
        "minimal_pairs": {"ok": int(mp.get("ok", 0)), "total": int(mp.get("total", 0))},
        "scenario": {
            "done": bool(scen),
            "success": any(r.get("success") for r in scen),
            "records": [
                {"scenario_id": r.get("scenario_id"), "success": r.get("success"),
                 "skills": r.get("skills") or [], "stuck": r.get("stuck_at") or ""}
                for r in scen[-3:]
            ],
        },
    }
    excerpt = {"weak_hearing": models.weakest_hearing(d),
               "deaf_words": models.deaf_words(d)[:10]}
    diagnosis = await _daily_diagnose(domain, blocks, listening, excerpt)

    # 把 AI 复盘的「明日计划」落成结构化今日目标（供明天使用）
    focus = training.plan_focus(profile, domain)
    next_goal = {
        "text": str(diagnosis.get("tomorrow_plan") or diagnosis.get("why") or "补今天的薄弱点")[:40],
        "kind": "recap",
        "words": [str(w) for w in (excerpt.get("deaf_words") or [])][:5],
        "hearing": [(w.get("name") or w["rule_id"]) for w in (excerpt.get("weak_hearing") or [])][:2],
        "skills": (focus.get("ungraduated_skills") or [])[:2],
        "source": "recap",
        "from_date": models.local_date(0),
        "for_date": models.local_date(1),
    }
    models.set_goal(profile, domain, next_goal)

    acc = (correct_n / len(listening)) if listening else 0
    d["calibration"] = {"last_accuracy": acc, "at": models.now_iso()}
    hist = d.setdefault("history", [])
    if not hist or hist[-1].get("date") != day:
        hist.append({"date": day, "accuracy": round(acc, 3), "total": len(listening)})
    d["history"] = hist[-30:]
    bucket["recap"] = {"blocks": blocks, "diagnosis": diagnosis, "at": models.now_iso()}
    storage.save(profile)
    return {"blocks": blocks, "diagnosis": diagnosis, "next_goal": next_goal}


async def _daily_diagnose(domain: str, blocks: dict, listening: list[dict],
                          excerpt: dict) -> dict:
    llm = _llm()
    if llm is not None:
        try:
            text = await llm.chat(
                prompts.daily_recap_messages(domain, blocks, listening, excerpt),
                temperature=0.5, max_tokens=700,
            )
            parsed = prompts.parse_json_reply(text)
            if parsed:
                parsed["source"] = "llm"
                return parsed
        except Exception:
            pass
    li = blocks["listening"]
    why_bits = [f"听辨 {li['correct']}/{li['total']}"]
    sh = blocks["shadow"]
    if sh["count"]:
        why_bits.append(f"跟读均分 {sh['avg']}")
    mp = blocks["minimal_pairs"]
    if mp["total"]:
        why_bits.append(f"对立对 {mp['ok']}/{mp['total']}")
    if blocks["scenario"]["done"]:
        why_bits.append("实战已复盘")
    return {
        "verdict": "持平",
        "why": " · ".join(why_bits),
        "evidence": [{"original": r.get("text", ""), "issue": "没听出"}
                     for r in listening if not r.get("correct")][:3],
        "next_focus": [w.get("name") or w["rule_id"] for w in excerpt["weak_hearing"][:3]],
        "tomorrow_plan": "先补今天错的同类，再练哑巴词汇与连读。",
        "source": "local",
    }


# ---------------------------------------------------------------- 每日背诵

def _recitation_excerpt(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    d = profile.get("domains", {}).get(domain, {})
    return {
        "level": models.recitation_level(profile, domain),
        "weak_chunks": models.recitation_weak_chunks(profile, domain, limit=8),
        "recent_pron_issues": models.recent_pron_issues(profile, domain, limit=5),
        "deaf_words": models.deaf_words(d)[:10],
        "weak_hearing": models.weakest_hearing(d, limit=3),
    }


def _recitation_public(p: dict[str, Any]) -> dict[str, Any]:
    keys = ("id", "title", "topic", "text", "sentences", "chunks", "target_words",
            "why", "hints", "word_count", "level", "date", "kind", "source")
    return {k: p.get(k) for k in keys}


def _recitation_summary(attempt: dict[str, Any]) -> dict[str, Any]:
    keys = ("id", "date", "title", "level", "hint", "score", "coverage", "accuracy",
            "fluency", "independence", "wpm", "words", "created_at")
    out = {k: attempt.get(k) for k in keys}
    out["audio_url"] = f"/api/recitation/attempts/{attempt.get('id')}/audio" \
        if attempt.get("audio_path") else ""
    return out


def _prune_recitation_audio(max_age_days: int = 7) -> None:
    import time
    if not RECITATION_AUDIO_DIR.exists():
        return
    cutoff = time.time() - max_age_days * 86400
    for f in RECITATION_AUDIO_DIR.glob("*.wav"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass


@app.get("/api/recitation/today")
async def recitation_today(domain: str = "work"):
    cfg = _config()
    profile = _profile()
    level = models.recitation_level(profile, domain)
    day = models.local_date(0)
    passage = storage.find_recitation(domain, level, day, "daily")
    if not passage:
        goal = _goal_for_today(profile, domain)
        titles = [a.get("title", "") for a in storage.list_attempts(domain, 5)]
        passage = await recitation.generate_passage(
            _llm(), domain, level, _recitation_excerpt(profile, domain),
            goal=goal, avoid_titles=titles, kind="daily",
        )
        passage["date"] = day
        storage.save_recitation(passage)
    b = models.recitation_bucket(profile, domain)
    return {
        "passage": _recitation_public(passage),
        "level": level,
        "streak": int(b.get("streak") or 0),
        "attempts": int(b.get("attempts") or 0),
        "history": [_recitation_summary(a) for a in storage.list_attempts(domain, 10)],
        "weak_chunks": models.recitation_weak_chunks(profile, domain, limit=5),
        "audio_ready": bool(cfg.audio.base_url and cfg.audio.api_key),
        "llm_ready": _llm() is not None,
        "source": passage.get("source", "seed"),
    }


@app.post("/api/recitation/generate")
async def recitation_generate(request: Request):
    body = await request.json()
    domain = str(body.get("domain") or "work")
    profile = _profile()
    level = models.recitation_level(profile, domain)
    titles = [a.get("title", "") for a in storage.list_attempts(domain, 5)]
    passage = await recitation.generate_passage(
        _llm(), domain, level, _recitation_excerpt(profile, domain),
        goal=_goal_for_today(profile, domain), avoid_titles=titles, kind="manual",
    )
    storage.save_recitation(passage)
    return {"passage": _recitation_public(passage), "level": level}


@app.post("/api/recitation/score")
async def recitation_score(file: UploadFile = File(...),
                           recitation_id: str = Form(...),
                           domain: str = Form("work"),
                           hint_level: int = Form(0),
                           duration_ms: int = Form(0)):
    cfg = _config()
    passage = storage.get_recitation(recitation_id)
    if not passage:
        return JSONResponse({"error": "文章不存在或已过期，请换一篇"}, status_code=404)
    _prune_recitation_audio(7)
    if not cfg.audio.base_url or not cfg.audio.api_key:
        return JSONResponse({"error": "还没配置语音识别，请到设置里填写音频 Key"}, status_code=409)

    data = await file.read()
    if len(data) < 1200 or int(duration_ms or 0) < 2000:
        return JSONResponse({"error": "录音太短，请完整背完再提交"}, status_code=400)
    try:
        transcript = await speech_asr.transcribe(
            data, cfg.audio.base_url, cfg.audio.api_key,
            model=cfg.audio.asr_model, filename=file.filename or "recitation.wav",
        )
    except Exception as e:
        msg = str(e)
        low = msg.lower()
        if "401" in msg or "unauthorized" in low:
            msg = "语音识别密钥无效，请到设置里检查 DeepSeek Key"
        elif "402" in msg or "quota" in low or "insufficient" in low:
            msg = "语音识别额度不足，请检查账户余额"
        elif "429" in msg:
            msg = "请求太频繁，请稍后重试"
        elif "550" in msg or "reset" in low:
            msg = "语音服务连接被重置，请重试"
        else:
            msg = f"语音识别失败：{msg}"
        return JSONResponse({"error": msg}, status_code=502)

    hint = max(0, min(2, int(hint_level or 0)))
    scores = recitation.score_attempt(passage, transcript, hint=hint,
                                      duration_ms=max(0, int(duration_ms or 0)))
    review = await recitation.review_attempt(_llm(), passage.get("domain", domain),
                                             passage, transcript, scores)

    aid = uuid.uuid4().hex
    RECITATION_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    audio_path = RECITATION_AUDIO_DIR / f"{aid}.wav"
    audio_ok = True
    try:
        audio_path.write_bytes(data)
    except OSError:
        audio_ok = False

    attempt = {
        "id": aid,
        "recitation_id": recitation_id,
        "domain": passage.get("domain", domain),
        "date": models.local_date(0),
        "title": passage.get("title", ""),
        "level": int(passage.get("level") or 2),
        "hint": hint,
        "duration_ms": scores["duration_ms"],
        "wpm": scores["wpm"],
        "words": scores["words"],
        "transcript": transcript,
        "coverage": scores["coverage"],
        "accuracy": scores["accuracy"],
        "fluency": scores["fluency"],
        "independence": scores["independence"],
        "score": scores["score"],
        "diff": scores["diff"],
        "diff_truncated": scores["diff_truncated"],
        "missed_sentences": scores["missed_sentences"],
        "missed_chunks": scores["missed_chunks"],
        "substitutions": scores["substitutions"],
        "review": review,
        "audio_path": str(audio_path) if audio_ok else "",
        "created_at": models.now_iso(),
    }
    storage.save_attempt(attempt, keep=30)
    _prune_recitation_audio(7)

    profile = _profile()
    target_domain = attempt["domain"]
    models.record_recitation(profile, target_domain, attempt)
    for iss in (review.get("pron_issues") or []):
        if isinstance(iss, dict):
            models.record_pron_issue(profile, target_domain,
                                     sound=str(iss.get("sound") or ""),
                                     heard_as=str(iss.get("heard_as") or ""),
                                     word=str(iss.get("word") or ""),
                                     tip=str(iss.get("tip") or ""))
    storage.save(profile)
    b = models.recitation_bucket(profile, target_domain)
    return {
        "attempt": attempt,
        "level": models.recitation_level(profile, target_domain),
        "streak": int(b.get("streak") or 0),
    }


@app.get("/api/recitation/history")
def recitation_history(domain: str = "work", limit: int = 30):
    profile = _profile()
    items = [_recitation_summary(a) for a in storage.list_attempts(domain, limit)]
    b = models.recitation_bucket(profile, domain)
    return {
        "items": items,
        "level": models.recitation_level(profile, domain),
        "streak": int(b.get("streak") or 0),
        "attempts": int(b.get("attempts") or 0),
        "weak_chunks": models.recitation_weak_chunks(profile, domain, limit=8),
        "wpm_trend": (b.get("wpm_trend") or [])[-30:],
    }


@app.get("/api/recitation/attempts/{aid}/audio")
def recitation_audio(aid: str):
    attempt = storage.get_attempt(aid)
    if not attempt:
        return JSONResponse({"error": "记录不存在"}, status_code=404)
    raw = str(attempt.get("audio_path") or "")
    path = Path(raw)
    if not raw or not path.exists() or not path.is_file():
        return JSONResponse({"error": "录音已过期"}, status_code=404)
    return FileResponse(str(path), media_type="audio/wav", filename=f"{aid}.wav")


# ---------------------------------------------------------------- 场景实战

@app.get("/api/scenarios")
def list_scenarios(cat: str | None = None, domain: str | None = None):
    items = seeddata.scenarios()
    profile = _profile()
    goal = _goal_for_today(profile, domain or cat or "work")
    want = set(goal.get("skills") or [])
    if want:
        items = sorted(items, key=lambda sc: -len(want & set(sc.get("covers") or [])))
    if cat:
        items = [s for s in items if s.get("cat") == cat]
    return {"items": [{"id": s["id"], "cat": s["cat"], "title": s["title"],
                       "goal": s["goal"], "load": s["load"]} for s in items],
            "cats": seeddata.load("cat_names")}


@app.post("/api/scenario/start")
async def scenario_start(request: Request):
    body = await request.json()
    session = scenarios.start_session(body["scenario_id"], body.get("domain"))
    sid = uuid.uuid4().hex
    _scenario_sessions[sid] = session
    storage.save_session(sid, session)
    return {"session_id": sid, "session": _public_session(session)}


@app.post("/api/scenario/hint")
async def scenario_hint(request: Request):
    """实战卡住时：结合场景目标 + 今天重点，给一句可直接说的英文。"""
    body = await request.json()
    sid = body.get("session_id")
    sess = _load_scenario_session(sid)
    if not sess:
        return JSONResponse({"error": "会话不存在或已结束"}, status_code=404)
    domain = sess.get("domain", "work")
    profile = _profile()
    focus = training.plan_focus(profile, domain, limit=2)
    history = [{"role": t.get("role"), "text": t.get("text")}
               for t in (sess.get("history") or [])[-6:]]
    llm = _llm()
    if llm is not None:
        try:
            text = await llm.chat(
                prompts.scenario_hint_messages(domain, sess.get("goal", ""),
                                               sess.get("covers") or [], focus, history),
                temperature=0.7, max_tokens=300,
            )
            data = prompts.parse_json_reply(text)
            if data and data.get("en"):
                return {"en": str(data["en"]).strip(),
                        "zh": str(data.get("zh") or ""),
                        "tip": str(data.get("tip") or "")}
        except Exception:
            pass
    phrases = sess.get("phrases") or []
    en = phrases[0] if phrases else "Could you tell me a bit more about that?"
    return {"en": en, "zh": "", "tip": "先用这句把对话接下去。"}


@app.post("/api/scenario/say")
async def scenario_say(request: Request):
    body = await request.json()
    sid = body["session_id"]
    session = _load_scenario_session(sid)
    if not session:
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    reply = await scenarios.actor_reply(_llm(), session, body.get("text", ""))
    storage.save_session(sid, session)
    return {"reply": reply, "session": _public_session(session)}


@app.post("/api/scenario/say/stream")
async def scenario_say_stream(request: Request):
    body = await request.json()
    sid = body["session_id"]
    session = _load_scenario_session(sid)
    if not session:
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    llm = _llm()

    async def gen():
        import json as _json
        if llm is None:
            reply = await scenarios.actor_reply(None, session, body.get("text", ""))
            storage.save_session(sid, session)
            yield f"data: {_json.dumps({'type': 'reply', 'reply': reply}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        session["history"].append({"role": "user", "text": body.get("text", "")})
        session["user_turns"] = session.get("user_turns", 0) + 1
        speaker = scenarios.pick_next_speaker(session)
        if speaker is None:
            yield "data: [DONE]\n\n"
            return
        messages = scenarios.build_actor_messages(session, speaker, body.get("text", ""))
        collected = []
        async for delta in llm.stream_chat(messages, max_tokens=160):
            collected.append(delta)
            yield f"data: {_json.dumps({'type': 'delta', 'text': delta}, ensure_ascii=False)}\n\n"
        full = "".join(collected)
        session["history"].append({"role": "assistant", "by": speaker.get("id"),
                                    "by_name": speaker.get("name", ""), "text": full})
        storage.save_session(sid, session)
        yield f"data: {_json.dumps({'type': 'done', 'text': full}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/api/scenario/review")
async def scenario_review(request: Request):
    body = await request.json()
    sid = body["session_id"]
    session = _load_scenario_session(sid)
    if not session:
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    review = await scenarios.review_session(_llm(), session)
    profile = _profile()
    scenarios.apply_review_to_profile(profile, session, review)
    storage.save(profile)
    _scenario_sessions.pop(sid, None)
    storage.delete_session(sid)
    return {"review": review}


def _public_session(session: dict) -> dict:
    return {
        "scenario_id": session["scenario_id"],
        "title": session.get("title", ""),
        "goal": session.get("goal", ""),
        "phrases": session.get("phrases", []),
        "history": session.get("history", []),
        "user_turns": session.get("user_turns", 0),
    }


# ---------------------------------------------------------------- 生成 / 报告 / 语音

@app.post("/api/generate")
async def generate(request: Request):
    body = await request.json()
    domain = body.get("domain", "work")
    profile = _profile()
    d = profile.get("domains", {}).get(domain, {})
    excerpt = {"weak_hearing": models.weakest_hearing(d),
               "deaf_words": models.deaf_words(d),
               "target_difficulty": generation.target_difficulty(profile, domain),
               "today_goal": _goal_for_today(profile, domain)}
    items = await generation.generate_items(_llm(), domain, excerpt,
                                             kind=body.get("kind", "cards"),
                                             count=body.get("count", 10))
    return {"items": items}


@app.get("/api/report")
async def report(domain: str = "work", period: str = "week"):
    profile = _profile()
    return await reports.build_report(_llm(), domain, period, profile)


@app.post("/api/share/note")
async def share_note(request: Request):
    body = await request.json()
    domain = str(body.get("domain") or "work")
    return await share.build_note(_llm(), domain, _profile())


@app.post("/api/coach/start")
async def coach_start(request: Request):
    body = await request.json()
    return await coach.start(_profile(), str(body.get("domain") or "work"))


@app.post("/api/coach/turn")
async def coach_turn(request: Request):
    body = await request.json()
    return await coach.turn(
        _llm(), _profile(), str(body.get("domain") or "work"),
        str(body.get("text") or ""), body.get("history") or [],
    )


@app.post("/api/speech/tts")
async def speech_tts_endpoint(request: Request):
    body = await request.json()
    cfg = _config()
    text = str(body.get("text", "") or "").strip()
    style = str(body.get("style", "real") or "real")
    speed = float(body.get("speed", 1.0) or 1.0)
    voice = body.get("voice") or "stella"
    key = hashlib.sha256(
        f"{voice}|{style}|{speed}|{text}".encode("utf-8")
    ).hexdigest()
    if key in _TTS_CACHE:
        audio, ctype = _TTS_CACHE[key]
        return Response(content=audio, media_type=ctype,
                        headers={"X-TTS-Cache": "hit"})
    try:
        audio, ctype = await speech_tts.synthesize(
            text, cfg.audio.base_url, cfg.audio.api_key, cfg.audio,
            style=style, speed=speed, voice=voice,
        )
        if len(_TTS_CACHE) >= 200:
            _TTS_CACHE.pop(next(iter(_TTS_CACHE)))
        _TTS_CACHE[key] = (audio, ctype)
        return Response(content=audio, media_type=ctype,
                        headers={"X-TTS-Cache": "miss"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/api/speech/asr")
async def speech_asr_endpoint(file: UploadFile = File(...)):
    cfg = _config()
    data = await file.read()
    try:
        text = await speech_asr.transcribe(
            data, cfg.audio.base_url, cfg.audio.api_key,
            model=cfg.audio.asr_model, filename=file.filename or "audio.wav",
        )
        return {"text": text}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


# ---------------------------------------------------------------- 静态托管

if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
