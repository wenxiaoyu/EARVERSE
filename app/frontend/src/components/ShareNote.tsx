import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { api } from "../api";
import { toast } from "../toast";
import { MiraFace } from "./TeacherAvatar";

type Template = "score" | "quote" | "xhs";

function metricDelta(m: any) {
  if (!m?.delta_text) return null;
  return <em className={`sn-delta ${m.dir}`}>{m.delta_text}</em>;
}

export default function ShareNote({
  domain, open, onClose,
}: { domain: string; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [template, setTemplate] = useState<Template>("score");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.shareNote(domain);
      setData(r);
      setCaption(r.caption || "");
    } catch (e: any) {
      setErr(`生成失败：${e?.message || "请重试"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, domain]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast("文案已复制");
    } catch {
      toast("复制失败，请手动选择文本");
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
      toast("图片导出失败，请重试");
      return null;
    }
  };

  const download = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const url = await exportPng();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = `earverse-${data.date}-${template}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const url = await exportPng();
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `earverse-${data.date}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
      } else {
        toast("当前浏览器不支持系统分享，请用「下载图片」");
      }
    } catch {
      /* 用户取消分享不提示 */
    } finally {
      setBusy(false);
    }
  };

  /* 小红书专属：生成共鸣型文案 + 切金句卡 + 复制文案 + 下载图片 */
  const shareXhs = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const r = await api.shareNote(domain, "xhs");
      if (r?.practiced_today === false) {
        toast("今天还没有练习记录，先练一轮再来");
        return;
      }
      setData(r);
      setCaption(r.caption || "");
      setTemplate("xhs");
      await new Promise((res) => setTimeout(res, 120));
      try { await navigator.clipboard.writeText(r.caption || ""); } catch { /* ignore */ }
      const url = await exportPng();
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `earverse-xhs-${r.date}.png`;
        a.click();
      }
      toast("小红书图文已就绪：图片已下载，文案已复制");
    } catch {
      toast("生成小红书文案失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.canShare);
  const done = data?.practiced_today !== false;
  const metricList = data?.metrics || [];
  const bigMetric = metricList.length
    ? metricList.slice().sort((a: any, b: any) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0))[0]
    : null;

  return (
    <div className="share-mask" onMouseDown={onClose}>
      <div className="share-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享笔记">
        <div className="share-head">
          <div>
            <div className="share-kicker">SHARE NOTE · 今日学习日记</div>
            <h3>分享笔记</h3>
            <p>今天 vs 昨天，生成一张可以直接发的小红书卡片。</p>
          </div>
          <button className="share-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>

        {loading && <div className="share-loading"><span className="rc-spin" />正在生成今天的笔记…</div>}
        {err && !loading && (
          <div className="share-error">
            <b>没有生成出来</b>
            <span>{err}</span>
            <button className="btn sm" onClick={load}>重试</button>
          </div>
        )}

        {data && !loading && !err && !done && (
          <div className="share-error">
            <b>今天还没有练习记录</b>
            <span>先完成一轮听辨或跟读，再来生成今天的学习日记。</span>
            <button className="btn sm" onClick={onClose}>先去练</button>
          </div>
        )}

        {data && !loading && !err && done && (
          <div className="share-layout">
            <div className="share-preview">
              <div className={`sn-card ${template}`} ref={cardRef}>
                <div className="sn-top">
                  <div className="sn-brand">耳界 <small>EARVERSE</small></div>
                  <span className="sn-day">DAY {data.day_no}</span>
                </div>

                <div className={`sn-verdict ${data.verdict}`}>{data.verdict_label}</div>

                {template === "xhs" ? (
                  <div className="xhs-body">
                    <div className="xhs-hook">“{data.quote}”</div>
                    {bigMetric && (
                      <div className="xhs-big">
                        <b>{bigMetric.today_text}</b>
                        <span>{bigMetric.label}</span>
                        {metricDelta(bigMetric)}
                      </div>
                    )}
                    <div className="xhs-notes">
                      <div><b>卡在</b><span>{data.worse}</span></div>
                      <div><b>明天</b><span>{data.next}</span></div>
                    </div>
                    {data.discuss && <div className="xhs-discuss">{data.discuss}</div>}
                  </div>
                ) : template === "score" ? (
                  <>
                    <div className="sn-metrics">
                      {(data.metrics || []).map((m: any) => (
                        <div className="sn-metric" key={m.key}>
                          <span className="sn-metric-lab">{m.label}</span>
                          <b>{m.today_text}</b>
                          {metricDelta(m)}
                        </div>
                      ))}
                    </div>
                    <div className="sn-lines">
                      <div><b>{data.better_label || "好一点"}</b><span>{data.better}</span></div>
                      <div><b>{data.worse_label || "卡一下"}</b><span>{data.worse}</span></div>
                      <div><b>明天只练</b><span>{data.next}</span></div>
                    </div>
                    <div className="sn-score-quote">“{data.quote}”</div>
                  </>
                ) : (
                  <>
                    <div className="sn-quote">“{data.quote}”</div>
                    <div className="sn-quote-notes">
                      <span><b>{data.better_label || "做到"}</b>{data.better}</span>
                      <span><b>卡一下</b>{data.worse}</span>
                      <span><b>明天只练</b>{data.next}</span>
                    </div>
                    <div className="sn-quote-metrics">
                      {(data.metrics || []).slice(0, 2).map((m: any) => (
                        <span key={m.key}>
                          {m.label} <b>{m.today_text}</b>
                          {metricDelta(m)}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {data.coach_comment && (
                  <div className="sn-coach">
                    <div className="sn-coach-avatar"><MiraFace /></div>
                    <div className="sn-coach-body">
                      <b>MANBO 老师说{data.coach_when && data.coach_when !== "today" ? ` · ${data.coach_when}` : ""}</b>
                      <span>{data.coach_comment}</span>
                    </div>
                  </div>
                )}
                <div className="sn-foot">{data.date} · 今日练习记录</div>
              </div>
            </div>

            <aside className="share-side">
              <div className="share-tabs">
                <button className={template === "score" ? "on" : ""} onClick={() => setTemplate("score")}>成绩单</button>
                <button className={template === "quote" ? "on" : ""} onClick={() => setTemplate("quote")}>金句</button>
                <button className={`xhs-tab ${template === "xhs" ? "on" : ""}`} onClick={shareXhs} disabled={busy}>
                  {busy ? "准备中…" : "📕 小红书"}
                </button>
              </div>

              <label>文案（可编辑）</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={10} />

              <div className="share-actions">
                <button className="btn primary sm" onClick={download} disabled={busy}>
                  {busy ? "导出中…" : "下载图片"}
                </button>
                <button className="btn sm" onClick={copy}>复制文案</button>
                {canShare && <button className="btn sm" onClick={share} disabled={busy}>系统分享</button>}
              </div>

              <p className="share-privacy">
                图片只包含学习统计，不含录音、错误原句和 DeepSeek Key。分享前可以再检查一遍文案。
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
