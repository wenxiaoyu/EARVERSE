"""TTS 语音合成。

优先支持 DeepSeek 官方 TTS：POST /v1/tools/tts（JSON:
{text, voice_id: stella|tide, format: wav|pcm, filter_markdown}），返回音频流。
非 DeepSeek 时回退 OpenAI 兼容 /v1/audio/speech。
"""
from __future__ import annotations

from ..config import AudioConfig

REDUCTION_NOTES = {
    "plain": "教科书念法：每个词念满、清晰。",
    "real": "真实口语：弱读 for/of/to，连读与吞音，像真人说话。",
}

# OpenAI 音色名 -> DeepSeek 音色（stella 女 / tide 男）
_DEEPSEEK_MALE_HINTS = ("onyx", "echo", "fable", "tide", "male")


def is_deepseek(base_url: str) -> bool:
    return "deepseek" in (base_url or "").lower()


def deepseek_voice(cfg: AudioConfig, voice: str | None = None) -> str:
    """Mira 固定 stella；显式 voice 仅允许 stella/tide。"""
    if voice in ("stella", "tide"):
        return voice
    v = (cfg.tts_voice or "").lower()
    return "tide" if any(h in v for h in _DEEPSEEK_MALE_HINTS) else "stella"


def tts_endpoint(base_url: str) -> str:
    b = (base_url or "").rstrip("/")
    if not b:
        raise ValueError("base_url 为空")
    if b.endswith("/tools/tts"):
        return b
    if is_deepseek(b):
        if b.endswith("/v1") or "/v1/" in b:
            return b + "/tools/tts"
        return b + "/v1/tools/tts"
    if b.endswith("/audio/speech"):
        return b
    if b.endswith("/v1") or "/v1/" in b:
        return b + "/audio/speech"
    return b + "/v1/audio/speech"


def build_tts_payload(text: str, base_url: str, cfg: AudioConfig,
                      style: str = "real", speed: float = 1.0,
                      voice: str | None = None) -> dict:
    """按供应商构造 TTS 请求体。"""
    if is_deepseek(base_url):
        return {
            "text": text,
            "voice_id": deepseek_voice(cfg, voice),
            "format": "wav",
            "filter_markdown": True,
        }
    payload = {
        "model": cfg.tts_model or "tts-1",
        "voice": cfg.tts_voice or "alloy",
        "input": text,
        "speed": max(0.5, min(1.5, float(speed))),
        "response_format": "mp3",
    }
    if style in REDUCTION_NOTES:
        payload["instructions"] = REDUCTION_NOTES[style]
    return payload


async def synthesize(text: str, base_url: str, api_key: str,
                     cfg: AudioConfig, style: str = "real",
                     speed: float = 1.0, voice: str | None = None) -> tuple[bytes, str]:
    """调用 TTS，返回 (音频字节, content-type)。"""
    import httpx

    if not text or not text.strip():
        raise ValueError("待合成文本为空")
    url = tts_endpoint(base_url)
    payload = build_tts_payload(text, base_url, cfg, style=style, speed=speed, voice=voice)
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        ctype = "audio/wav" if is_deepseek(base_url) else "audio/mpeg"
        return resp.content, ctype
