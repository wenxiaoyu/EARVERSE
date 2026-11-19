"""画像持久化（task 2.2）：SQLite 存整份画像 JSON。

单用户自托管起步（design D2），表结构预留 user_id 以便将来多用户。
画像的复杂维度以 JSON 字段整体存储，适配维度灵活演化。
"""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from . import models

_SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    user_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recitations (
    id         TEXT PRIMARY KEY,
    domain     TEXT NOT NULL,
    level      INTEGER NOT NULL,
    date       TEXT NOT NULL,
    kind       TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recitations_daily
    ON recitations(domain, level, date, kind);
CREATE TABLE IF NOT EXISTS recitation_attempts (
    id            TEXT PRIMARY KEY,
    recitation_id TEXT NOT NULL,
    domain        TEXT NOT NULL,
    data          TEXT NOT NULL,
    audio_path    TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recitation_attempts_domain
    ON recitation_attempts(domain, created_at);
"""


class ProfileStorage:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._mem_conn: sqlite3.Connection | None = None
        if self.db_path == ":memory:":
            # 内存库需保持同一连接，否则数据丢失
            self._mem_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._mem_conn.row_factory = sqlite3.Row
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        if self._mem_conn is not None:
            return self._mem_conn
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.executescript(_SCHEMA)
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()

    # ------------------------------------------------------------ 读

    def get(self, user_id: str = "default") -> dict[str, Any] | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT data FROM profiles WHERE user_id = ?", (user_id,)
                ).fetchone()
            finally:
                if self._mem_conn is None:
                    conn.close()
        if row is None:
            return None
        return json.loads(row["data"])

    def load_or_create(self, user_id: str = "default") -> dict[str, Any]:
        profile = self.get(user_id)
        if profile is None:
            profile = models.empty_profile(user_id)
            self.save(profile)
        return profile

    # ------------------------------------------------------------ 写

    def save(self, profile: dict[str, Any]) -> None:
        user_id = profile.get("user_id", "default")
        payload = json.dumps(profile, ensure_ascii=False)
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, "
                    "updated_at = excluded.updated_at",
                    (user_id, payload, profile.get("updated_at", models.now_iso())),
                )
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()

    def delete(self, user_id: str = "default") -> bool:
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute("DELETE FROM profiles WHERE user_id = ?", (user_id,))
                conn.commit()
                return cur.rowcount > 0
            finally:
                if self._mem_conn is None:
                    conn.close()

    # ------------------------------------------------------------ 场景会话

    def save_session(self, sid: str, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False)
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO sessions (id, data, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET data = excluded.data, "
                    "updated_at = excluded.updated_at",
                    (sid, payload, models.now_iso()),
                )
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()

    def get_session(self, sid: str) -> dict[str, Any] | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute("SELECT data FROM sessions WHERE id = ?", (sid,)).fetchone()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return json.loads(row["data"]) if row else None

    def delete_session(self, sid: str) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()

    # ------------------------------------------------------------ 背诵

    def save_recitation(self, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO recitations (id, domain, level, date, kind, data, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                    (item["id"], item.get("domain", "work"), int(item.get("level", 2)),
                     item.get("date", ""), item.get("kind", "manual"),
                     json.dumps(item, ensure_ascii=False), item.get("created_at", models.now_iso())),
                )
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return item

    def get_recitation(self, rid: str) -> dict[str, Any] | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute("SELECT data FROM recitations WHERE id = ?", (rid,)).fetchone()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return json.loads(row["data"]) if row else None

    def find_recitation(self, domain: str, level: int, day: str,
                        kind: str = "daily") -> dict[str, Any] | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT data FROM recitations WHERE domain = ? AND level = ? AND date = ? "
                    "AND kind = ? ORDER BY created_at DESC LIMIT 1",
                    (domain, int(level), day, kind),
                ).fetchone()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return json.loads(row["data"]) if row else None

    def save_attempt(self, item: dict[str, Any], keep: int = 30) -> dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO recitation_attempts "
                    "(id, recitation_id, domain, data, audio_path, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                    (item["id"], item.get("recitation_id", ""), item.get("domain", "work"),
                     json.dumps(item, ensure_ascii=False), item.get("audio_path", ""),
                     item.get("created_at", models.now_iso())),
                )
                # 每个场景只保留最近 N 次
                conn.execute(
                    "DELETE FROM recitation_attempts WHERE domain = ? AND id NOT IN ("
                    "  SELECT id FROM recitation_attempts WHERE domain = ? "
                    "  ORDER BY created_at DESC LIMIT ?)",
                    (item.get("domain", "work"), item.get("domain", "work"), int(keep)),
                )
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return item

    def get_attempt(self, aid: str) -> dict[str, Any] | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT data FROM recitation_attempts WHERE id = ?", (aid,)
                ).fetchone()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return json.loads(row["data"]) if row else None

    def list_attempts(self, domain: str, limit: int = 30) -> list[dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT data FROM recitation_attempts WHERE domain = ? "
                    "ORDER BY created_at DESC LIMIT ?",
                    (domain, int(limit)),
                ).fetchall()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return [json.loads(r["data"]) for r in rows]

    def delete_attempt(self, aid: str) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM recitation_attempts WHERE id = ?", (aid,))
                conn.commit()
            finally:
                if self._mem_conn is None:
                    conn.close()

    def list_users(self) -> list[str]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute("SELECT user_id FROM profiles ORDER BY user_id").fetchall()
            finally:
                if self._mem_conn is None:
                    conn.close()
        return [r["user_id"] for r in rows]
