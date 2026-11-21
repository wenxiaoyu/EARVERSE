import { useState } from "react";
import { api } from "../api";

/** 英文 → 中文翻译提示：默认隐藏，点「查看中文」才请求并显示，字号更小。 */
const cache = new Map<string, string>();

export default function ZhHint({ text, className = "" }: { text: string; className?: string }) {
  const key = (text || "").trim();
  const [zh, setZh] = useState(cache.get(key) || "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!key) return null;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    const hit = cache.get(key);
    if (hit) { setZh(hit); setOpen(true); return; }
    setLoading(true);
    try {
      const r = await api.translate(key);
      const val = String(r?.zh || "").trim();
      if (val) cache.set(key, val);
      setZh(val);
      setOpen(true);
    } catch {
      setZh("");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className={`zh-hint ${className}`}>
      <button type="button" className="zh-toggle" onClick={toggle} disabled={loading}>
        {loading ? "翻译中…" : open ? "收起中文" : "查看中文"}
      </button>
      {open && (
        <span className="zh-text">{zh || "暂无中文（未配置 AI 翻译）"}</span>
      )}
    </span>
  );
}
