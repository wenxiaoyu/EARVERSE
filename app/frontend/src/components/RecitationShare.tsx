import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "../toast";

type Neutral = { title: string; text: string; word_count?: number; level?: number };
type Scored = { score: number; words: number; wpm: number; independence: number };

const HASHTAGS = ["#英语背诵", "#英语口语", "#英语学习", "#每日英语", "#英语听力"];

function verdictLine(score: number): string {
  if (score >= 85) return "这篇基本背顺了，只有几个小磕绊。";
  if (score >= 70) return "背下来了，但中途断了几次。";
  if (score >= 50) return "能背出一部分，还不够连贯。";
  return "还不太熟，先看关键词再来一遍。";
}

function buildCaption(neutral: Neutral, scored: Scored | null, streak: number): string {
  const lines = ["今天听了一段英文，跟着读了几遍。", "", `《${neutral.title}》`];
  if (scored) {
    lines.push(verdictLine(Math.round(scored.score)));
    lines.push(`综合 ${Math.round(scored.score)} 分 · ${scored.words} 词 · ${Math.round(scored.wpm)} wpm`);
  } else {
    lines.push(`${neutral.word_count || 0} 词，先听懂，再开口。`);
  }
  lines.push("");
  const first = (neutral.text || "").split(/(?<=[.!?])\s+/)[0] || "";
  if (first) lines.push(`第一句是：「${first.trim()}」`, "");
  if (streak > 0) lines.push(`已经连续练了 ${streak} 天。`, "");
  lines.push("封面是这段原文，语音是 AI 老师的朗读。");
  lines.push("");
  lines.push(HASHTAGS.join(" "));
  return lines.join("\n");
}

export default function RecitationShare({
  open, onClose, passage, attempt, streak,
}: {
  open: boolean;
  onClose: () => void;
  passage: Neutral;
  attempt: Scored | null;
  streak: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const audioBlob = useRef<Blob | null>(null);

  useEffect(() => {
    if (!open) return;
    setCaption(buildCaption(passage, attempt, streak));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, passage, attempt, streak, onClose]);

  // 关闭时释放音频 objectURL
  useEffect(() => {
    if (open) return;
    if (audioSrc) URL.revokeObjectURL(audioSrc);
    setAudioSrc("");
    audioBlob.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const ensureAiAudio = async (): Promise<Blob | null> => {
    if (audioBlob.current) return audioBlob.current;
    setAudioBusy(true);
    try {
      const res = await fetch("/api/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: passage.text, style: "plain", speed: 0.96, voice: "stella" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      if (!blob.size) throw new Error("empty");
      audioBlob.current = blob;
      const url = URL.createObjectURL(blob);
      setAudioSrc((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      return blob;
    } catch {
      toast("AI 朗读生成失败，请检查模型配置");
      return null;
    } finally {
      setAudioBusy(false);
    }
  };

  const exportPng = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      await document.fonts?.ready;
      return await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#F4EBDD",
        width: 540,
        height: 720,
        style: { transform: "none", marginBottom: "0" },
      });
    } catch {
      toast("封面导出失败，请重试");
      return null;
    }
  };

  const downloadImage = async () => {
    const url = await exportPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "earverse-recite-cover.png";
    a.click();
  };

  const downloadAudio = async (): Promise<boolean> => {
    const blob = await ensureAiAudio();
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "earverse-recite-ai.wav";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast("文案已复制");
    } catch {
      toast("复制失败，请手动选择文本");
    }
  };

  const shareXhs = async () => {
    setBusy(true);
    try {
      await downloadImage();
      const ok = await downloadAudio();
      try { await navigator.clipboard.writeText(caption); } catch { /* ignore */ }
      toast(ok
        ? "封面 + AI 朗读已下载，文案已复制，去小红书发笔记吧"
        : "封面已下载、文案已复制；AI 朗读生成失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="share-mask" onMouseDown={onClose}>
      <div className="share-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享背诵">
        <div className="share-head">
          <div>
            <div className="share-kicker">RECITE NOTE · 背诵分享</div>
            <h3>分享这段英文</h3>
            <p>封面是原文，语音是 Manbo 的 AI 朗读；到小红书用「视频」笔记配上即可。</p>
          </div>
          <button className="share-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>

        <div className="share-layout">
          <div className="share-preview">
            <div className="rs-card" ref={cardRef}>
              <div className="sn-top">
                <div className="sn-brand">耳界 <small>EARVERSE</small></div>
                <span className="sn-day">L{passage.level || 2} · 背诵</span>
              </div>

              <h3 className="rs-title">{passage.title}</h3>
              <div className="rs-text">{passage.text}</div>

              <div className="rs-foot">
                {attempt ? (
                  <div className="rs-score">
                    <b>{Math.round(attempt.score)}</b>
                    <span>综合</span>
                  </div>
                ) : (
                  <div className="rs-score">
                    <b>{passage.word_count || 0}</b>
                    <span>词</span>
                  </div>
                )}
                <div className="rs-meta">
                  <span>AI 朗读</span>
                  {attempt && <span>{Math.round(attempt.wpm)} wpm</span>}
                  {streak > 0 && <span>连续 {streak} 天</span>}
                </div>
              </div>
              <div className="rs-brandline">EARVERSE · 每日英文背诵</div>
            </div>
          </div>

          <aside className="share-side">
            <label>文案（可编辑）</label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={11} />

            <div className="share-actions">
              <button className="btn primary sm" onClick={shareXhs} disabled={busy || audioBusy}>
                {busy || audioBusy ? "准备中…" : "📕 小红书"}
              </button>
              <button className="btn sm" onClick={downloadImage} disabled={busy}>下载封面</button>
              <button className="btn sm" onClick={() => downloadAudio()} disabled={busy || audioBusy}>
                下载朗读
              </button>
              <button className="btn sm" onClick={copyCaption}>复制文案</button>
            </div>

            {audioSrc && <audio className="rc-audio" controls src={audioSrc} />}

            <p className="share-privacy">
              小红书不支持纯语音笔记：发布时选「视频」，用这张封面图 + Manbo 的朗读音频即可。
              朗读由本机合成，可反复下载、不额外收费。
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
