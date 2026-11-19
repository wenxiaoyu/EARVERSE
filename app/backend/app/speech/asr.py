"""ASR 语音识别。

优先支持 DeepSeek 官方 ASR：POST /v1/tools/asr（multipart, 字段 file，
16-bit PCM WAV 或 Ogg Opus；返回 {request_id, text, duration_ms}）。
非 DeepSeek 时回退 OpenAI 兼容 /v1/audio/transcriptions。
"""
from __future__ import annotations


def is_deepseek(base_url: str) -> bool:
    return "deepseek" in (base_url or "").lower()


def asr_endpoint(base_url: str) -> str:
    b = (base_url or "").rstrip("/")
    if not b:
        raise ValueError("base_url 为空")
    if b.endswith("/tools/asr"):
        return b
    if is_deepseek(b):
        if b.endswith("/v1") or "/v1/" in b:
            return b + "/tools/asr"
        return b + "/v1/tools/asr"
    # OpenAI 兼容
    if b.endswith("/audio/transcriptions"):
        return b
    if b.endswith("/v1") or "/v1/" in b:
        return b + "/audio/transcriptions"
    return b + "/v1/audio/transcriptions"


def build_transcription_form(model: str = "whisper-1", language: str = "en") -> dict:
    return {"model": model, "language": language, "response_format": "json"}


async def transcribe(audio_bytes: bytes, base_url: str, api_key: str,
                     model: str = "whisper-1", language: str = "en",
                     filename: str = "audio.wav") -> str:
    """转写录音，返回文本。"""
    import httpx

    if not audio_bytes:
        raise ValueError("音频为空")
    url = asr_endpoint(base_url)
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    files = {"file": (filename, audio_bytes, "application/octet-stream")}
    data = {} if is_deepseek(base_url) else build_transcription_form(model=model, language=language)
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, headers=headers, files=files, data=data)
        resp.raise_for_status()
        body = resp.json()
    return (body or {}).get("text", "").strip()
