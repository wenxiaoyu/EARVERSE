"""多角色 prompt 模板（task 3.3）。

五个 AI 角色（design D5）：
- 评估器 assessor：把分层探测 + 口语转写综合成画像判断
- 诊断器 diagnoser：每日复盘，引用具体错误
- 生成器 generator：按画像出训练素材
- 场景演员 actor：群聊实战，多角色各持隐藏立场
- 教练报告 coach：周报/月报

所有 builder 返回 OpenAI messages 列表，便于直接喂给 LLMClient。
输出统一要求 JSON（便于程序解析），并在 prompt 中明确 schema。
"""
from __future__ import annotations

import json
from typing import Any

SHARED_RULES = (
    "你是英语交流教练系统里的一个专业角色。用户是中文母语的职场人士，"
    "目标是 3~6 个月内能独立应付工作会议里的听说。"
    "判断要具体、可验证、可行动，禁止空泛鼓励。"
    "严格按要求的 JSON 输出，不要输出多余文字。"
)


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


# ---------------------------------------------------------------- 评估器

def assessor_messages(probe_summary: dict, seen_known: dict[str, bool],
                      oral_transcript: str | None = None,
                      domain: str = "work") -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：评估器。你负责把测验数据翻译成一份对用户诚实、"
        "可行动的短板画像。重点区分三类问题：①不认识（词汇量）②认识但听不出（哑巴词汇）"
        "③能懂但反应慢（未自动化）。"
        '\n输出 JSON: {"summary": "给用户看的一段话", '
        '"strengths": [..], "weaknesses": [{"area": "..", "evidence": "..", '
        '"action": ".."}], "deaf_word_hint": "..", "confirm_questions": [..]}'
    )
    user = (
        f"场景: {domain}\n"
        f"自适应探测汇总: {_dump(probe_summary)}\n"
        f"看词认识结果: {_dump(seen_known)}\n"
        f"口语转写: {oral_transcript or '（无）'}"
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": user}]


# ---------------------------------------------------------------- 诊断器

def diagnoser_messages(domain: str, today_results: list[dict],
                       profile_excerpt: dict) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：诊断器。基于今天的训练结果写一份复盘，"
        "必须引用至少一条今天的原始错误句子作为证据。"
        '\n输出 JSON: {"verdict": "变好/持平/变差", "why": "..", '
        '"evidence": [{"original": "..", "issue": ".."}], '
        '"next_focus": [".."], "tomorrow_plan": ".."}'
    )
    user = (
        f"场景: {domain}\n"
        f"今日结果: {_dump(today_results)}\n"
        f"当前画像摘要: {_dump(profile_excerpt)}"
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": user}]


# ---------------------------------------------------------------- 生成器

def generator_messages(domain: str, profile_excerpt: dict,
                       kind: str = "cards", count: int = 10) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：内容生成器。按用户短板生成针对性的训练素材，"
        "必须带难度（1-3）。素材要贴近真实职场口语，包含语流变形（连读/弱读/吞音）。"
        '\n输出 JSON: {"items": [{"w": "英文", "zh": "中文", '
        '"ex": "例句", "difficulty": 1, "tag": "对应短板"}]}'
    )
    user = (
        f"场景: {domain}\n类型: {kind}\n数量: {count}\n"
        f"用户短板画像: {_dump(profile_excerpt)}\n"
        "请优先围绕 today_goal（今日目标）出题，覆盖其中的词/语音点。"
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": user}]


# ---------------------------------------------------------------- 场景演员

def actor_messages(goal: str, role_name: str, role_role: str, stance: str,
                   others: list[dict], history: list[dict],
                   user_text: str) -> list[dict]:
    others_desc = ", ".join(f"{o['name']}（{o.get('role','')}）" for o in others) or "无"
    system = (
        "You are roleplaying a character in a realistic workplace English conversation. "
        f"YOU ARE: {role_name} — {role_role}.\n"
        f"YOUR HIDDEN STANCE (never reveal directly, act it out): {stance}\n"
        f"Other people present: {others_desc}\n"
        f"The user's goal in this scene: {goal}\n"
        "Speak natural spoken English with realistic reductions (gonna, wanna, fer, kinda). "
        "Keep each turn to 1-3 sentences. Stay in character. Never mention you are an AI. "
        "Never correct the user's English during the conversation."
    )
    messages = [{"role": "system", "content": system}]
    for turn in history:
        if turn.get("role") == "user":
            messages.append({"role": "user", "content": turn["text"]})
        else:
            messages.append({"role": "assistant",
                             "content": f"{turn.get('by_name','')}: {turn['text']}"})
    messages.append({"role": "user", "content": user_text})
    return messages


def scenario_review_messages(goal: str, scenario_title: str,
                             turns: list[dict],
                             skill_ids: list[str]) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：场景复盘观察者。判断用户是否办成了目标的事，"
        "并指出他卡住/回避/用错的地方。sk­ills 只能从给定清单里选。"
        '\n输出 JSON: {"success": true/false, "achieved_skills": [..], '
        '"stuck": [{"quote": "用户原话或卡点", "issue": "..", "type": "ear|word|pattern|avoidance"}], '
        '"advice": ".."}'
    )
    user = (
        f"场景: {scenario_title}\n目标: {goal}\n"
        f"可用言语功能: {_dump(skill_ids)}\n"
        f"完整对话: {_dump(turns)}"
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": user}]


# ---------------------------------------------------------------- 教练报告

def coach_messages(domain: str, period: str, profile_excerpt: dict,
                   recent_errors: list[dict],
                   skill_graduation: dict) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：教练报告撰写者。回答「你在变好还是变差、为什么、"
        "下一步补哪」。极简：sections 只给 2-3 条；每条 finding ≤ 30 字（一句结论），"
        "evidence ≤ 20 字（引原句或数字），action ≤ 20 字（可立即执行）。"
        "不要套话、不要重复、不要罗列。next_week ≤ 3 条，各 ≤ 20 字。"
        '\n输出 JSON: {"trend": "变好/持平/变差", "headline": "≤16字", '
        '"sections": [{"title": "≤8字", "finding": "≤30字", "evidence": "≤20字", "action": "≤20字"}], '
        '"next_week": ["≤20字"]}'
    )
    user = (
        f"场景: {domain}\n周期: {period}\n"
        f"画像摘要: {_dump(profile_excerpt)}\n"
        f"近期错误: {_dump(recent_errors)}\n"
        f"功能毕业情况: {_dump(skill_graduation)}"
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": user}]


# ---------------------------------------------------------------- 工具

def parse_json_reply(text: str) -> dict | None:
    """从模型回复里稳健地取出 JSON（容忍 ```json 包裹或前后噪声）。"""
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:]
        t = t.strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(t[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None


# ---------------------------------------------------------------- 测验：出题

def assessment_pack_messages(domain: str, prev_summary: dict,
                             count: int = 18) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：听力测验出题官。为中文母语的职场人士出「听音辨义」题。\n"
        "难度 rubric（必须据此标 difficulty）：\n"
        "  1 = 高频词/短词、无连读弱读；2 = 多词短语/语块、含 1 处弱读或连读；"
        "3 = 语流变形密集（弱读+连读+吞音）或长语块。\n"
        "每题的 w 必须是【单词或短语（≤3 个词）】，不要出整句；play_text 必须与 w 完全相同；\n"
        "每题给 4 个互不相同的中文释义选项，其中只有 1 个正确（answer_index 指向正确项，且该选项必须等于 zh）。\n"
        "题目要贴合场景，包含各难度档以支持自适应。\n"
        '输出 JSON: {"plan_note":"策略说明","items":[{"w":"英文","zh":"正确中文","ex":"例句",'
        '"difficulty":1,"difficulty_reason":"为何这个难度","play_text":"要播放的文本",'
        '"options":["中文A","中文B","中文C","中文D"],"answer_index":0,"tag":"能力标签"}]}'
    )
    user = (
        f"场景: {domain}\n数量: {count}\n"
        f"用户上一版画像摘要(用于校准难度): {_dump(prev_summary)}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 测验：判卷/画像

def assessment_grade_messages(domain: str, log: list[dict],
                              items: list[dict]) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：判卷官 + 画像官。根据作答日志判定每个测试词的掌握状态并产出画像。\n"
        "四态定义：unknown=不认识；deaf=哑巴词汇(认识但听不出)；"
        "recognized=能懂但反应慢；automatic=听到即懂反应快。\n"
        "必须基于日志证据判断（选择题对错、反应时间、没听出后是否认识）。"
        "样本不足时降低 confidence。\n"
        '输出 JSON（必须简洁，不要寒暄/解释/Markdown）: '
        '{"summary":"一句话结论，≤40字，直接说最该补什么", "verdict":"变好/持平/变差",'
        '"vocab":{"英文词":"unknown|deaf|recognized|automatic"},'
        '"blind_spots":[{"rule":"弱读/连读等","evidence":"哪题"}],'
        '"avoidance":[], "weaknesses":[{"area":"≤6字","evidence":"≤16字","action":"≤16字，动词开头"}],'
        '"pronunciation":{}, "confidence":0.0, "next_plan":"≤30字"}'
        "weaknesses 最多 3 条，只留最关键的。"
    )
    user = (
        f"场景: {domain}\n"
        f"作答日志: {_dump(log)}\n"
        f"题目与正确释义: {_dump([{'w': it.get('w'), 'zh': it.get('zh'), 'tag': it.get('tag')} for it in items])}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 今日复盘（汇总三块）

def daily_recap_messages(domain: str, blocks: dict, listening: list[dict],
                         excerpt: dict) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：今日复盘官。综合「听辨 / 跟读 / 最小对立对 / 场景实战」四块，"
        "给出今日诊断与明日计划。简洁、直接、不寒暄、不用 Markdown。\n"
        '输出 JSON: {"verdict":"变好/持平/变差","why":"≤60字，指出今天最关键的问题",'
        '"evidence":[{"original":"原词/句","issue":"≤20字问题"}],'
        '"next_focus":["≤6字",".."],"tomorrow_plan":"≤40字，明天先做什么"}'
    )
    user = (
        f"场景: {domain}\n"
        f"四块数据: {_dump(blocks)}\n"
        f"听辨作答: {_dump(listening)}\n"
        f"画像摘要: {_dump(excerpt)}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 实战提词

def scenario_hint_messages(domain: str, goal: str, covers: list, focus: dict,
                           history: list[dict]) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：口语提词官。用户在真实场景对话里卡住、不知道该说什么，"
        "给一句他此刻可以直接说出口的英文。\n"
        "要求：贴合场景目标与当前对话；尽量用上今天的学习重点（听力盲区/哑巴词/待毕业功能）；"
        "口语自然、简短（≤18 词）；不要长段落、不要列选项。\n"
        '输出 JSON: {"en":"可直接说的英文","zh":"中文意思","tip":"≤20字，用了哪个表达/为什么"}'
    )
    user = (
        f"场景: {domain}\n目标: {goal}\n可练功能: {_dump(covers)}\n"
        f"今天重点: {_dump(focus)}\n最近对话: {_dump(history)}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 发音评估

def pronunciation_messages(domain: str, target: str,
                           transcript: str) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：发音评估官（以「母语者能不能听懂」为准，非音素级）。\n"
        "对比「目标文本」与「ASR 转写」，推断可能的发音问题"
        "（如 think 转成 sink 说明 θ→s；very 转成 wery 说明 v→w；"
        "词尾辅音丢失、辅音丛、连读/重音）。"
        "只在有转写差异时下结论；无差异则给高分。\n"
        '输出 JSON: {"score":0-100,"issues":[{"sound":"θ","heard_as":"s","word":"think","tip":"舌尖轻触齿间"}],'
        '"confidence":0.0,"summary":".."}'
    )
    user = f"场景: {domain}\n目标文本: {target}\nASR 转写: {transcript}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 发音练习素材

def pronunciation_items_messages(domain: str, count: int = 5,
                                 goal: dict | None = None,
                                 focus_errors: list | None = None) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：发音练习素材生成官。生成用于「朗读/跟读」的英文句子。\n"
        "必须覆盖中国学习者的典型难点：/θ//ð/、/v/ vs /w/、/l/ vs /r/、"
        "词尾辅音、辅音丛、连读、弱读、重音。\n"
        "每句 6–14 个词，自然口语（职场/日常），每句聚焦一个难点。\n"
        '输出 JSON: {"items":[{"text":"英文句子","focus":"主要难点(如 θ/ð)","tip":"一句中文发音要点","difficulty":1}]}'
    )
    user = (f"场景: {domain}\n数量: {count}\n"
            f"今日目标: {_dump(goal)}\n"
            f"最近错音/错词（最高优先）: {_dump(focus_errors)}\n"
            "必须优先出包含这些错音/错词的句子；其余再覆盖今日目标与多样难点。")
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 最小对立对

def minimal_pairs_messages(domain: str, count: int = 8,
                           goal: dict | None = None,
                           focus_errors: list | None = None) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：最小对立对出题官。生成听辨易混音素的英文最小对立对。\n"
        "覆盖中国学习者难点：/ɪ/-/iː/(ship/sheep)、/v/-/w/、/l/-/r/、/θ/-/s/、"
        "/æ/-/e/、/ʊ/-/uː/、/n/-/ŋ/、词尾清浊等。\n"
        "每对两个词只差一个音素，都是常用词。\n"
        '输出 JSON: {"items":[{"a":"词1","b":"词2","focus":"/ɪ/ vs /iː/"}]}'
    )
    user = (f"场景: {domain}\n数量: {count}\n"
            f"今日目标: {_dump(goal)}\n"
            f"最近错音（最高优先）: {_dump(focus_errors)}\n"
            "必须优先针对这些错音出最小对立对；其余再覆盖不同音素对比。")
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
