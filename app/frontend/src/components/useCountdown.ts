import { useEffect, useState } from "react";

/* 今日 60 分钟参考钟：可开始/暂停，只做进度参考，不强制、不锁定任何操作。
   按日期持久化，刷新/切页不丢。 */

type Saved = { startedAt?: number; accSec?: number; running?: boolean };

function load(key: string): Saved {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {
    return {};
  }
}

function save(key: string, v: Saved) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export function useSessionClock(key: string, totalMinutes: number) {
  const total = Math.max(60, Math.round((totalMinutes || 60) * 60));
  const [c, setC] = useState<Saved>(() => load(key));
  const [now, setNow] = useState(() => Date.now());

  const running = Boolean(c.running);

  // 跨天/换 key 时重新加载，避免把昨天的累计时间带到新一天
  useEffect(() => {
    setC(load(key));
    setNow(Date.now());
  }, [key]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsed = Math.min(
    total,
    (c.accSec || 0) + (c.running && c.startedAt ? Math.floor((now - c.startedAt) / 1000) : 0),
  );
  const left = Math.max(0, total - elapsed);
  const finished = left <= 0;

  // 满 60 分钟后自动停表（仅参考，不阻止继续学习）
  useEffect(() => {
    if (running && left <= 0) {
      const v: Saved = { accSec: total, running: false };
      save(key, v);
      setC(v);
    }
  }, [running, left, key, total]);

  const start = () => {
    const v: Saved = { startedAt: Date.now(), accSec: c.accSec || 0, running: true };
    save(key, v);
    setC(v);
    setNow(Date.now());
  };
  const pause = () => {
    const v: Saved = { accSec: elapsed, running: false };
    save(key, v);
    setC(v);
  };
  const reset = () => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    setC({});
    setNow(Date.now());
  };

  return { total, elapsed, left, running, finished, start, pause, reset };
}
