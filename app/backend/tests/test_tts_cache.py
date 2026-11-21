"""TTS 磁盘缓存：key、读写、LRU 淘汰、统计。"""
import sys
import pathlib
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.speech.cache import DiskTtsCache


def test_key_stable_and_sensitive():
    k = DiskTtsCache.key
    a = k("stella", "plain", 0.96, "Hello there.")
    b = k("stella", "plain", 0.96, "Hello there.")
    assert a == b
    assert a != k("tide", "plain", 0.96, "Hello there.")
    assert a != k("stella", "real", 0.96, "Hello there.")
    assert a != k("stella", "plain", 1.0, "Hello there.")
    assert a != k("stella", "plain", 0.96, "Hello there!")
    # 浮点噪声归一
    assert a == k("stella", "plain", 0.9600001, "Hello there.")


def test_put_get_roundtrip(tmp_path):
    c = DiskTtsCache(tmp_path)
    key = DiskTtsCache.key("stella", "plain", 0.96, "Good morning.")
    assert c.get(key) is None
    c.put(key, b"RIFFdata", "audio/wav")
    got = c.get(key)
    assert got == (b"RIFFdata", "audio/wav")
    assert (tmp_path / f"{key}.wav").exists()


def test_mp3_extension_preserved(tmp_path):
    c = DiskTtsCache(tmp_path)
    key = DiskTtsCache.key("alloy", "real", 1.0, "Hi.")
    c.put(key, b"ID3data", "audio/mpeg")
    assert (tmp_path / f"{key}.mp3").exists()
    assert c.get(key) == (b"ID3data", "audio/mpeg")


def test_eviction_keeps_total_under_limit(tmp_path):
    c = DiskTtsCache(tmp_path, max_bytes=25)
    for i in range(10):
        c.put(f"k{i:02d}", b"x" * 10, "audio/wav")
        time.sleep(0.005)
    st = c.stats()
    assert st["bytes"] <= 25
    assert st["files"] <= 3


def test_get_touches_lru(tmp_path):
    c = DiskTtsCache(tmp_path, max_bytes=25)
    c.put("old", b"a" * 10, "audio/wav")
    time.sleep(0.01)
    c.put("new", b"b" * 10, "audio/wav")
    time.sleep(0.01)
    # 命中 old，刷新它的 mtime
    assert c.get("old") is not None
    time.sleep(0.01)
    # 再放入一个，超额后应删最旧的 new，而不是 old
    c.put("newer", b"c" * 10, "audio/wav")
    assert c.get("old") is not None
    assert not (tmp_path / "new.wav").exists()


def test_stats_and_clear(tmp_path):
    c = DiskTtsCache(tmp_path)
    c.put("a", b"12345", "audio/wav")
    c.put("b", b"12345", "audio/wav")
    st = c.stats()
    assert st["files"] == 2
    assert st["bytes"] == 10
    assert st["version"]
    assert c.clear() == 2
    assert c.stats()["files"] == 0


def test_empty_audio_ignored(tmp_path):
    c = DiskTtsCache(tmp_path)
    c.put("a", b"", "audio/wav")
    assert c.get("a") is None
    assert c.stats()["files"] == 0
