"""画像存储单测（task 2.2）。"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import models as m
from app.storage import ProfileStorage


def test_load_or_create_new_profile():
    s = ProfileStorage(":memory:")
    p = s.load_or_create("u1")
    assert p["user_id"] == "u1"
    assert p["version"] == m.SCHEMA_VERSION


def test_save_then_get_roundtrip():
    s = ProfileStorage(":memory:")
    p = s.load_or_create("u1")
    m.record_hearing(p, "work", "r05", name="of 弱读")
    s.save(p)
    loaded = s.get("u1")
    assert loaded["domains"]["work"]["hearing"]["r05"]["count"] == 1


def test_get_missing_returns_none():
    s = ProfileStorage(":memory:")
    assert s.get("nobody") is None


def test_load_or_create_idempotent():
    s = ProfileStorage(":memory:")
    p1 = s.load_or_create("u1")
    m.record_hearing(p1, "work", "r05", name="of")
    s.save(p1)
    p2 = s.load_or_create("u1")
    assert p2["domains"]["work"]["hearing"]["r05"]["count"] == 1


def test_delete_user():
    s = ProfileStorage(":memory:")
    s.load_or_create("u1")
    assert s.delete("u1") is True
    assert s.get("u1") is None


def test_list_users():
    s = ProfileStorage(":memory:")
    s.load_or_create("a")
    s.load_or_create("b")
    assert s.list_users() == ["a", "b"]


def test_persist_to_file(tmp_path):
    db = tmp_path / "profiles.db"
    s1 = ProfileStorage(db)
    p = s1.load_or_create("u1")
    m.record_avoidance(p, "work", "refuse-request", evidence="绕圈子")
    s1.save(p)

    s2 = ProfileStorage(db)
    loaded = s2.get("u1")
    assert loaded["domains"]["work"]["avoidance"]["refuse-request"]["count"] == 1


def test_unicode_preserved(tmp_path):
    db = tmp_path / "p.db"
    s = ProfileStorage(db)
    p = s.load_or_create("u1")
    m.record_error(p, "work", "listening", "我们漏了 most of it", detail="弱读")
    s.save(p)
    loaded = ProfileStorage(db).get("u1")
    assert loaded["domains"]["work"]["errors"][0]["original"] == "我们漏了 most of it"
