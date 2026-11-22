import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "../toast";

type Attempt = {
  id: string;
  title: string;
  level: number;
  score: number;
  words: number;
  wpm: number;
  independence: number;
  hint: number;
};

const HASHTAGS = ["#英语背诵", "#英语口语", "#英语学习", "#每日英语", "#口语练习"];

function verdictLine(score: number): string {
  if (score >= 85) return "这篇基本背顺了，只有几个小磕绊。";
  if (score >= 70) return "背下来了，但中途断了几次。";
  if (score >= 50) return "能背出一部分，还不够连贯。";
  return "还不太熟，先看关键词再来一遍。";
}

function buildCaption(attempt: Attempt, streak: number, text: string): string {
  const first = (text || "").split(/(?<=[.!?])\s+/)[0] || "";
  const lines = [
    `今天背了一段英文。`,
    "",
    `《${attempt.title}》`,
    verdictLine(Math.round(attempt.score)),
    `综合 ${Math.round(attempt.score)} 分 · ${attempt.words} 词 · ${Math.round(attempt.wpm)} wpm · 独立度 ${Math.round(attempt.independence)}`,
    "",
  ];
  if (first) lines.push(`第一句是：「${first.trim()}」`, "");
  if (streak > 0) lines.push(`已经连续背了 ${streak} 天。`, "");
  lines.push("封面就是我背的原文，配的是我自己的录音。");
  lines.push("");
  lines.push(HASHTAGS.join(" "));
  return lines.join("\n");
}

export default function RecitationShare({
  open, onClose, passageText, attempt, streak, audioUrl,
}: {
  open: boolean;
  onClose: () => void;
  passageText: string;
  attempt: Attempt;
  streak: number;
  audioUrl: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCaption(buildCaption(attempt, streak, passageText));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, attempt, streak, passageText, onClose]);

  if (!open) return null;

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
    a.download = `earverse-recite-${attempt.id.slice(0, 8)}.png`;
    a.click();
  };

  const downloadAudio = async () => {
    if (!audioUrl) {
      toast("这次没有可下载的录音");
      return;
    }
    try {
      const blob = await (await fetch(audioUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `earverse-recite-${attempt.id.slice(0, 8)}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      toast("录音下载失败，请重试");
    }
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
      await downloadAudio();
      try { await navigator.clipboard.writeText(caption); } catch { /* ignore */ }
      toast("封面 + 语音已下载，文案已复制，去小红书发笔记吧");
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
            <h3>分享这段背诵</h3>
            <p>封面是原文，语音是你的录音；到小红书用「视频」笔记配上即可。</p>
          </div>
          <button className="share-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>

        <div className="share-layout">
          <div className="share-preview">
            <div className="rs-card" ref={cardRef}>
              <div className="sn-top">
                <div className="sn-brand">耳界 <small>EARVERSE</small></div>
                <span className="sn-day">L{attempt.level} · 背诵</span>
              </div>

              <h3 className="rs-title">{attempt.title}</h3>
              <div className="rs-text">{passageText}</div>

              <div className="rs-foot">
                <div className="rs-score">
                  <b>{Math.round(attempt.score)}</b>
                  <span>综合</span>
                </div>
                <div className="rs-meta">
                  <span>{attempt.words} 词</span>
                  <span>{Math.round(attempt.wpm)} wpm</span>
                  {streak > 0 && <span>连续 {streak} 天</span>}
                </div>
              </div>
              <div className="rs-brandline">EARVERSE · 每日英文背诵</div>
            </div>
          </div>

          <aside className="share-side">
            <label>文案（可编辑）</label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={12} />

            <div className="share-actions">
              <button className="btn primary sm" onClick={shareXhs} disabled={busy}>
                {busy ? "准备中…" : "📕 小红书"}
              </button>
              <button className="btn sm" onClick={downloadImage} disabled={busy}>下载封面</button>
              <button className="btn sm" onClick={downloadAudio} disabled={busy || !audioUrl}>下载录音</button>
              <button className="btn sm" onClick={copyCaption}>复制文案</button>
            </div>

            <p className="share-privacy">
              小红书不支持纯语音笔记：发布时选「视频」，用这张封面图 + 你的录音即可。
              {!audioUrl && "（这次没有保存到录音）"}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
