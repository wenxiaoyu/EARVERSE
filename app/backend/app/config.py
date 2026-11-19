"""配置管理（文本模型 llm / 语音 speech / 音频供应商 audio）。

- llm：文本对话（可 DeepSeek / OpenAI 兼容）
- audio：ASR / TTS / 发音评估（需要支持音频的供应商）
密钥只落本机、不进浏览器。
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

CONFIG_FILENAME = "env.config.json"


@dataclass
class LLMConfig:
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    temperature: float = 0.85
    max_tokens: int = 400
    disable_thinking: bool = True


@dataclass
class AudioConfig:
    """ASR / TTS / 发音评估供应商（需支持音频端点）。"""
    base_url: str = ""
    api_key: str = ""
    asr_model: str = "whisper-1"
    tts_model: str = "tts-1"
    tts_voice: str = "alloy"


@dataclass
class SpeechConfig:
    tts_provider: str = "openai"
    asr_provider: str = "whisper"


@dataclass
class AppConfig:
    llm: LLMConfig = field(default_factory=LLMConfig)
    speech: SpeechConfig = field(default_factory=SpeechConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)


def config_path(root: str | Path | None = None) -> Path:
    base = Path(root) if root else Path.cwd()
    return base / CONFIG_FILENAME


def _is_placeholder_key(key: str) -> bool:
    """判断密钥是否为空/占位（如 'sk-REAL-KEY'），用于音频配置自动回退。"""
    k = (key or "").strip()
    if not k:
        return True
    low = k.lower()
    if len(k) < 20:
        return True
    return any(t in low for t in ("real-key", "your-key", "your_key", "placeholder",
                                  "readme", "changeme", "xxxx"))


def load_config(root: str | Path | None = None) -> AppConfig:
    cfg = AppConfig()
    path = config_path(root)
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            raw = {}
        _apply_dict(cfg, raw)

    # 环境变量优先
    if os.environ.get("OPENAI_BASE_URL"):
        cfg.llm.base_url = os.environ["OPENAI_BASE_URL"].strip()
    if os.environ.get("OPENAI_API_KEY"):
        cfg.llm.api_key = os.environ["OPENAI_API_KEY"].strip()
    if os.environ.get("OPENAI_MODEL"):
        cfg.llm.model = os.environ["OPENAI_MODEL"].strip()

    # 音频供应商未单独配置、或仍是占位符时，回退用文本供应商（音频统一走同一家）
    if not cfg.audio.base_url:
        cfg.audio.base_url = cfg.llm.base_url
    if _is_placeholder_key(cfg.audio.api_key) and not _is_placeholder_key(cfg.llm.api_key):
        cfg.audio.api_key = cfg.llm.api_key
    return cfg


def _apply_dict(cfg: AppConfig, raw: dict) -> None:
    llm = raw.get("llm") or {}
    for key in ("base_url", "api_key", "model"):
        if key in llm and llm[key] is not None:
            setattr(cfg.llm, key, str(llm[key]).strip())
    if "temperature" in llm:
        try:
            cfg.llm.temperature = float(llm["temperature"])
        except (TypeError, ValueError):
            pass
    if "max_tokens" in llm:
        try:
            cfg.llm.max_tokens = int(llm["max_tokens"])
        except (TypeError, ValueError):
            pass
    if "disable_thinking" in llm:
        cfg.llm.disable_thinking = bool(llm["disable_thinking"])

    audio = raw.get("audio") or {}
    for key in ("base_url", "api_key", "asr_model", "tts_model", "tts_voice"):
        if key in audio and audio[key] is not None:
            setattr(cfg.audio, key, str(audio[key]).strip())

    speech = raw.get("speech") or {}
    for key in ("tts_provider", "asr_provider"):
        if key in speech and speech[key] is not None:
            setattr(cfg.speech, key, str(speech[key]).strip())


def apply_llm_patch(cfg: AppConfig, patch: dict) -> None:
    """应用来自设置页的 LLM 补丁。

    规则（关键）：api_key 为空/空白时视为"不修改"，避免再次保存把已存密钥覆盖成空。
    需要清除时显式传 clear_api_key=true。
    """
    patch = patch or {}
    for key in ("base_url", "model"):
        if key in patch and patch[key] is not None:
            setattr(cfg.llm, key, str(patch[key]).strip())
    if patch.get("clear_api_key"):
        cfg.llm.api_key = ""
    else:
        v = patch.get("api_key")
        if v is not None and str(v).strip():
            cfg.llm.api_key = str(v).strip()
    if "temperature" in patch:
        try:
            cfg.llm.temperature = float(patch["temperature"])
        except (TypeError, ValueError):
            pass
    if "max_tokens" in patch:
        try:
            cfg.llm.max_tokens = int(patch["max_tokens"])
        except (TypeError, ValueError):
            pass
    if "disable_thinking" in patch:
        cfg.llm.disable_thinking = bool(patch["disable_thinking"])


def save_config(cfg: AppConfig, root: str | Path | None = None) -> Path:
    path = config_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(cfg), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return path


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def public_view(cfg: AppConfig) -> dict:
    return {
        "llm": {
            "base_url": cfg.llm.base_url,
            "model": cfg.llm.model,
            "api_key_set": bool(cfg.llm.api_key),
            "api_key_masked": mask_key(cfg.llm.api_key),
        },
        "audio": {
            "base_url": cfg.audio.base_url,
            "asr_model": cfg.audio.asr_model,
            "tts_model": cfg.audio.tts_model,
            "tts_voice": cfg.audio.tts_voice,
            "api_key_set": bool(cfg.audio.api_key),
            "api_key_masked": mask_key(cfg.audio.api_key),
        },
        "speech": asdict(cfg.speech),
    }
