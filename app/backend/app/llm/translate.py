"""按需英文→中文翻译（学习辅助）。

只用于「点一下看中文」的翻译提示，不改变 Manbo 只说英语的规则：
- 只有用户点击时才翻译一条消息；
- 结果做内存缓存，重复消息不再请求模型；
- 未配置模型时返回空串，前端给「暂无中文」提示。
"""
from __future__ import annotations

_CACHE: dict[str, str] = {}
_MAX_CACHE = 600

SYSTEM = (
    "You are a translation aid inside an English-learning app for Chinese learners. "
    "Translate the user's English into natural, concise Simplified Chinese. "
    "Output ONLY the Chinese translation — no pinyin, no quotes, no explanations. "
    "If the input contains no meaningful English, output an empty string."
)


def clear_cache() -> None:
    _CACHE.clear()


async def to_chinese(llm, text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if t in _CACHE:
        return _CACHE[t]
    if llm is None:
        return ""
    try:
        out = await llm.chat(
            [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": t[:600]},
            ],
            temperature=0.2,
            max_tokens=300,
        )
    except Exception:
        return ""
    zh = (out or "").strip().strip("\"").strip()
    if not zh:
        return ""
    if len(_CACHE) < _MAX_CACHE:
        _CACHE[t] = zh
    return zh
