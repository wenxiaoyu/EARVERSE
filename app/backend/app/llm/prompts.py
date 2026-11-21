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
        "LANGUAGE RULE (absolute): reply ONLY in English. Never output Chinese characters, "
        "pinyin, or translations — even if the user writes or speaks Chinese. "
        "If the user uses Chinese, still answer in character, in English.\n"
        "Speak natural spoken English with realistic reductions (gonna, wanna, fer, kinda). "
        "Keep each turn to 1-3 sentences. Stay in character. Never mention you are an AI. "
        "Never correct the user's English during the conversation. "
        "Never start your reply with your name, a speaker label, or 'Name:' — "
        "output only the spoken words."
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


# ---------------------------------------------------------------- 背诵

RECITATION_LENGTH = {
    1: (90, 110, 6, 8),
    2: (110, 130, 8, 9),
    3: (130, 150, 9, 10),
    4: (150, 170, 10, 11),
    5: (170, 190, 11, 13),
}


def recitation_passage_messages(domain: str, level: int,
                                profile_excerpt: dict,
                                goal: dict | None = None,
                                avoid_titles: list | None = None) -> list[dict]:
    lo, hi, smin, smax = RECITATION_LENGTH.get(int(level), RECITATION_LENGTH[2])
    system = (
        SHARED_RULES + "\n\n角色：背诵材料作者。写一篇可以直接开口背出来的英文短文。\n"
        "硬性要求：\n"
        "- 口语体，不是书面散文；一句话一个意思，长短交错；\n"
        "- 允许自然口语缩减（gonna / kinda / I'd / that's），但不要俚语堆砌；\n"
        "- 不要出现人名、公司名、真实品牌、政治/宗教内容；\n"
        "- 必须自然包含给定的 weak_chunks（漏过的语块）和 focus_words（错音词）；\n"
        "- 语块要能在会议/客户/日常里直接复用，不要为了塞词而造句；\n"
        f"- 长度是硬性指标：{lo}–{hi} 词，{smin}–{smax} 句；不足 {lo} 词视为不合格；\n"
        "- 写完自己数一遍：词数少了就补一个具体细节，多了就删重复；\n"
        "- chunks 必须是文中真实出现的连续短语（2–5 词），6–8 条；\n"
        "- target_words 是文中 4–6 个值得练发音/重音的词。\n"
        '输出 JSON: {"title":"≤6 个英文词","topic":"2-3 个英文词",'
        '"sentences":["句子1","句子2"],"chunks":["..."],'
        '"target_words":["..."],"why":"一句中文，说明为什么今天选这篇"}'
    )
    user = (
        f"场景: {domain}\n等级: L{level}（1 最易，5 最难）\n"
        f"今日目标: {_dump(goal)}\n"
        f"画像摘要: {_dump(profile_excerpt)}\n"
        f"避免重复的近期标题: {_dump(avoid_titles or [])}\n"
        f"请优先复用 weak_chunks，并把 focus_words 放进自然句子里。\n"
        f"硬性要求：必须 {lo}–{hi} 词、{smin}–{smax} 句，少于此范围会被退回。"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def recitation_review_messages(domain: str, passage: dict, transcript: str,
                               scores: dict, missed: dict) -> list[dict]:
    system = (
        SHARED_RULES + "\n\n角色：背诵教练。用户刚背完一段英文，你要给具体、可执行的复盘。\n"
        "规则：\n"
        "- summary ≤40 个汉字，先说结果，再说一个最关键的原因；\n"
        "- wins 1–2 条，必须引用用户真的说对的内容；\n"
        "- misses 1–3 条，每条带原文片段和一句说明，优先漏掉的语块；\n"
        "- pron_issues 0–2 条，只在转写差异能支撑时给（如 think→sink）；\n"
        "- drill 只给一个练习，items 是可直接朗读的短语；\n"
        "- next 给下一次的重点语块和建议，不要空泛。\n"
        '输出 JSON: {"summary":"...","wins":["..."],'
        '"misses":[{"source":"...","note":"..."}],'
        '"pron_issues":[{"sound":"θ","heard_as":"s","word":"think","tip":"..."}],'
        '"drill":{"focus":"...","items":["..."]},'
        '"next":{"focus_chunks":["..."],"advice":"..."}}'
    )
    user = (
        f"场景: {domain}\n文章: {_dump({'title': passage.get('title'), 'text': passage.get('text')})}\n"
        f"ASR 转写: {transcript}\n"
        f"评分: {_dump(scores)}\n"
        f"漏点: {_dump(missed)}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 分享笔记

def share_note_messages(domain: str, facts: dict, channel: str = "default") -> list[dict]:
    payload = {
        "day_no": facts.get("day_no"),
        "verdict": facts.get("verdict_label"),
        "metrics": facts.get("metrics"),
        "better": facts.get("better"),
        "worse": facts.get("worse"),
        "next": facts.get("next"),
        "quote": facts.get("quote"),
        "today": facts.get("today"),
        "coach_comment": facts.get("coach_comment"),
        "coach_next": facts.get("coach_next"),
    }
    if channel == "xhs":
        system = (
            "你就是这个英语学习者本人在写一篇真实的小红书日记，目的是让人有共鸣、愿意在评论区聊起来。\n"
            "硬性要求：\n"
            "- 只使用给定 facts 里的数字和结论，绝不编造分数、天数、效果；\n"
            "- 开头一句要戳中共鸣（真实的挫败、意外、自嘲都可以），但必须和 verdict 一致：说退步时不能写“有进步/变好”；\n"
            "- 中间 2–3 句：写一个具体的小进步 + 一个具体的卡点，都要落到真实数字或事实，不说空话；\n"
            "- 结尾抛一个真诚的开放问题，邀请评论区讨论（不要用固定口号，要让人真的有话可说）；\n"
            "- 另给一句适合放封面的开放问题 discuss（≤24 字），与正文结尾的问题一致或更短；\n"
            "- 口语化、短句、有画面感，全文 120–220 字；\n"
            "- 如果 facts.coach_comment 非空，可自然提一句 Manbo 老师的点评（中文转述，不要照搬英文），不超过 40 字；\n"
            "- 不写“英语大神”“30 天流利”“逆袭”这类夸张承诺；\n"
            "- 不出现具体错误原句、录音、公司名、真实姓名；\n"
            "- 正文自然带上品牌「耳界」一次；\n"
            "- 最后另起一行附 4–6 个话题标签，至少包含 #英语学习。\n"
            '输出 JSON: {"quote":"一句陈述式金句（≤28字，不要用问句）",'
            '"discuss":"一句开放问题（≤24字）",'
            '"caption":"完整小红书文案（含标签）","hashtags":["#英语学习",...]}'
        )
    else:
        system = (
            "你是英语学习者的朋友，不是营销号。写一条小红书风格的学习日记。\n"
            "硬性要求：\n"
            "- 只使用给定 facts 里的数字和结论，绝不编造分数、天数、效果；\n"
            "- 文案必须和 verdict 一致：说退步时不要写“有进步/变好”，说变好时不要写“退步”；\n"
            "- 第一行固定：用耳界练英语的第 N 天。N 用 facts.day_no；\n"
            "- 正文 3–5 行：一个真实进步、一个具体卡点、一个明天动作；\n"
            "- 如果 facts.coach_comment 非空，加一句 Manbo 老师今天的中文转述点评（如“Manbo 老师提醒我：…”），不超过 40 字；不要照搬英文；\n"
            "- 每条不超过 20 个汉字，避免长句；\n"
            "- 口语化、具体、有共鸣，不写“英语大神”“30 天流利”这类夸张承诺；\n"
            "- 不出现具体错误原句、录音、公司名、真实姓名；\n"
            "- 最后一句固定：有一起练的吗？评论区打卡，我们互相盯着。\n"
            "- 再附话题标签：英语听力 / 职场英语 / 英语打卡 / 成人英语。\n"
            '输出 JSON: {"quote":"一句（≤28字）",'
            '"caption":"完整小红书文案","hashtags":["#英语听力",...]}'
        )
    user = f"场景: {domain}\n事实: {_dump(payload)}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- 报告 v2

def report_v2_messages(domain: str, facts: dict) -> list[dict]:
    payload = {
        "period": facts.get("label"),
        "range": [facts.get("start"), facts.get("end")],
        "prev_range": [facts.get("prev_start"), facts.get("prev_end")],
        "active_days": facts.get("active_days"),
        "period_days": facts.get("period_days"),
        "coverage": facts.get("coverage"),
        "verdict": facts.get("verdict"),
        "headline": facts.get("headline"),
        "metrics": [
            {k: m.get(k) for k in ("key", "label", "score", "unit", "n",
                                   "confidence", "confidence_label", "delta_text", "direction")}
            for m in (facts.get("metrics") or [])
        ],
        "strengths": facts.get("strengths"),
        "gaps": facts.get("gaps"),
        "recitation": facts.get("recitation"),
        "coach_comment": facts.get("coach_comment"),
        "coach_next": facts.get("coach_next"),
    }
    system = (
        "你是严谨的英语学习评估师，不是营销号。根据给定的周期 facts 写报告。\\n"
        "硬性规则：\\n"
        "- 只能使用 facts 中的指标、样本量、置信度和变化，不得编造数字；\\n"
        "- 每条结论必须能对应到某个指标；低置信/小样本必须明确说“样本不足/低置信”，不得下强结论；\\n"
        "- 不要把累计词汇快照说成本周变化；不要用“英语大神/流利”等承诺；\\n"
        "- 不出现具体错误原句、录音、公司名、真实姓名；\\n"
        "- 如果 facts.coach_comment 非空，可作为教练点评参考并用中文概括（不要照搬英文），可并入本期结论或下周计划；\\n"
        "- 最多 3 个 section：本期结论、关键短板、下周计划；\\n"
        "- 下周计划只给 1–2 个可验证动作，带目标数字（目标也应来自合理设定，不要声称已达成）；\\n"
        "- 全部用中文。\\n"
        '输出 JSON: {"headline":"≤24字","trend":"变好|持平|变差",'
        '"sections":[{"title":"≤12字","finding":"≤60字","evidence":"≤40字","action":"≤50字"}],'
        '"next_week":["≤40字"]}'
    )
    user = f"场景: {domain}\\n周期事实: {_dump(payload)}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
