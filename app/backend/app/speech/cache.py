"""TTS 磁盘缓存（持久化，重启不丢）。

为什么需要：TTS 每次都是付费合成；固定台词（开场白、场景 NPC、背诵段落、
跟读短语、重播按钮）会反复用到。内存缓存重启即清空，这里落盘解决。

设计：
- 目录：<backend>/data/tts-cache/<sha256>.<wav|mp3>
- key：版本 + 音色 + 风格 + 语速 + 文本（换版本/音色自动失效）
- 写入：临时文件 + 原子 rename，避免读到半截文件
- 淘汰：按总字节数做 LRU（命中时 touch mtime），超额删最旧的
"""
from __future__ import annotations

import hashlib
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

# 改变缓存语义（如换 TTS 供应商）时 +1，旧音频自动失效
CACHE_VERSION = "v1"

_EXT_BY_CTYPE = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
}
_CTYPE_BY_EXT = {"wav": "audio/wav", "mp3": "audio/mpeg"}
_EXTS = ("wav", "mp3")


class DiskTtsCache:
    def __init__(self, directory: Path | str, max_bytes: int = 300 * 1024 * 1024):
        self.dir = Path(directory)
        self.max_bytes = int(max_bytes)
        self._lock = threading.Lock()
        self._total: int | None = None

    # ---------------- key ----------------
    @staticmethod
    def key(voice: str | None, style: str, speed: float, text: str) -> str:
        v = (voice or "").strip()
        s = (style or "").strip()
        sp = round(float(speed or 0), 3)
        raw = f"{CACHE_VERSION}|{v}|{s}|{sp}|{(text or '').strip()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    # ---------------- paths ----------------
    def _path(self, key: str, ext: str) -> Path:
        return self.dir / f"{key}.{ext}"

    def _find(self, key: str) -> Path | None:
        for ext in _EXTS:
            p = self._path(key, ext)
            if p.is_file():
                return p
        return None

    def _scan_total(self) -> int:
        total = 0
        if self.dir.is_dir():
            for p in self.dir.iterdir():
                try:
                    if p.is_file():
                        total += p.stat().st_size
                except OSError:
                    continue
        return total

    # ---------------- read / write ----------------
    def get(self, key: str) -> tuple[bytes, str] | None:
        with self._lock:
            p = self._find(key)
            if not p:
                return None
            try:
                data = p.read_bytes()
            except OSError:
                return None
            try:
                # 命中即刷新 mtime，实现 LRU
                os.utime(p, None)
            except OSError:
                pass
            return data, _CTYPE_BY_EXT.get(p.suffix.lstrip("."), "audio/wav")

    def put(self, key: str, audio: bytes, ctype: str) -> None:
        if not audio:
            return
        ext = _EXT_BY_CTYPE.get(ctype, "wav")
        self.dir.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self.dir), prefix=".tmp-", suffix=f".{ext}")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(audio)
            os.replace(tmp, self._path(key, ext))
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        with self._lock:
            self._total = None  # 下次淘汰时重新统计
            self._evict_locked()

    def _evict_locked(self) -> None:
        if self._total is None:
            self._total = self._scan_total()
        if self._total <= self.max_bytes:
            return
        files: list[tuple[float, int, Path]] = []
        for p in self.dir.iterdir():
            try:
                if p.is_file():
                    st = p.stat()
                    files.append((st.st_mtime, st.st_size, p))
            except OSError:
                continue
        files.sort(key=lambda x: x[0])  # 最旧的先删
        target = int(self.max_bytes * 0.9)
        for _, size, p in files:
            if self._total <= target:
                break
            try:
                p.unlink()
                self._total -= size
            except OSError:
                continue

    # ---------------- ops ----------------
    def stats(self) -> dict[str, Any]:
        with self._lock:
            count = 0
            total = 0
            if self.dir.is_dir():
                for p in self.dir.iterdir():
                    try:
                        if p.is_file():
                            count += 1
                            total += p.stat().st_size
                    except OSError:
                        continue
            self._total = total
            return {
                "files": count,
                "bytes": total,
                "max_bytes": self.max_bytes,
                "dir": str(self.dir),
                "version": CACHE_VERSION,
            }

    def clear(self) -> int:
        removed = 0
        with self._lock:
            if self.dir.is_dir():
                for p in self.dir.iterdir():
                    try:
                        if p.is_file():
                            p.unlink()
                            removed += 1
                    except OSError:
                        continue
            self._total = 0
        return removed
