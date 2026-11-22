import { useEffect, useRef, useState } from "react";
import { api, speak } from "../api";
import { prefetchSpeech } from "../voice";
import { toast } from "../toast";
import { createWavRecorder } from "../wavRecorder";
import RecitationShare from "../components/RecitationShare";

type Passage = {
  id: string;
  title: string;
  topic?: string;
  text: string;
  sentences: string[];
  chunks: string[];
  target_words: string[];
  why: string;
  hints: Record<string, string[]>;
  word_count: number;
  level: number;
  source: string;
};

type Attempt = {
  id: string;
  title: string;
  level: number;
  hint: number;
  score: number;
  coverage: number;
  accuracy: number;
  fluency: number;
  independence: number;
  wpm: number;
  words: number;
  duration_ms: number;
  transcript: string;
  diff: { type: string; source: string; spoken: string }[];
  diff_truncated?: boolean;
  missed_sentences: { text: string; coverage: number }[];
  missed_chunks: { text: string; coverage: number }[];
  review: {
    summary: string;
    wins: string[];
    misses: { source: string; note: string }[];
    pron_issues: { sound: string; heard_as: string; word: string; tip: string }[];
    drill: { focus: string; items: string[] };
    next: { focus_chunks: string[]; advice: string };
    source?: string;
  };
};

const HINTS = [
  { level: 0, label: "无提示", desc: "裸背" },
  { level: 1, label: "结构", desc: "句首词 + 连接词" },
  { level: 2, label: "关键词", desc: "每句内容词" },
];

function hintLabel(h: number) {
  return h >= 2 ? "关键词" : h === 1 ? "结构" : "无提示";
}

function pct(v: number) {
  const n = (v || 0) > 1 ? (v || 0) / 100 : (v || 0);
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function MiniBar({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rc-bar">
      <span className="rc-bar-lab">{label}</span>
      <div className="rc-bar-track">
        <i className={tone || ""} style={{ width: `${pct(value)}%` }} />
      </div>
      <span className="rc-bar-val">{pct(value)}</span>
    </div>
  );
}

export default function Recitation({ domain }: { domain: string }) {
  const [passage, setPassage] = useState<Passage | null>(null);

  useEffect(() => {
    if (passage?.text) prefetchSpeech(passage.text, "real");
  }, [passage?.id]);
  const [meta, setMeta] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [stage, setStage] = useState<"ready" | "recite" | "scoring" | "result">("ready");
  const [hint, setHint] = useState(0);
  const [recording, setRecording] = useState(false);
  const [sec, setSec] = useState(0);
  const [result, setResult] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioOpen, setAudioOpen] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const rec = useRef(createWavRecorder());
  const startedAt = useRef(0);

  const releaseAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    releaseAudio();
    try {
      const r = await api.recitationToday(domain);
      setMeta(r);
      setPassage(r.passage);
      setHistory(r.history || []);
      setStage("ready");
      setResult(null);
      setHint(0);
    } catch (e: any) {
      setErr(`加载失败：${e?.message || "请重试"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSec((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const refreshHistory = async () => {
    try {
      const r = await api.recitationHistory(domain);
      setHistory(r.items || []);
      setMeta((m: any) => ({ ...(m || {}), level: r.level, streak: r.streak, attempts: r.attempts }));
    } catch {
      /* ignore */
    }
  };

  const startRecite = () => {
    releaseAudio();
    setHint(0);
    setSec(0);
    setErr("");
    setStage("recite");
  };

  const backToText = () => {
    setStage("ready");
    setHint(0);
    setSec(0);
  };

  const again = () => {
    releaseAudio();
    setResult(null);
    setHint(0);
    setSec(0);
    setStage("recite");
  };

  const nextPassage = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    releaseAudio();
    try {
      const r = await api.recitationGenerate(domain);
      setPassage(r.passage);
      setMeta((m: any) => ({ ...(m || {}), level: r.level }));
      setStage("ready");
      setResult(null);
      setHint(0);
      setSec(0);
    } catch (e: any) {
      toast("换一篇失败，请重试");
      setErr(`换一篇失败：${e?.message || ""}`);
    } finally {
      setBusy(false);
    }
  };

  const startRec = async () => {
    if (recording || busy) return;
    try {
      await rec.current.start();
      startedAt.current = Date.now();
      setSec(0);
      setRecording(true);
      setErr("");
    } catch {
      toast("无法打开麦克风，请检查权限");
    }
  };

  const stopRec = async () => {
    if (!recording || !passage) return;
    setRecording(false);
    const elapsed = Date.now() - startedAt.current;
    setStage("scoring");
    setBusy(true);
    try {
      const blob = await rec.current.stop();
      if (blob.size < 1200) {
        toast("录音太短，请完整背完再提交");
        setStage("recite");
        return;
      }
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);
      const r = await api.recitationScore(blob, passage.id, domain, hint, elapsed);
      if (r?.error) {
        setErr(String(r.error));
        setStage("recite");
        toast(String(r.error));
        return;
      }
      setResult(r.attempt);
      setStage("result");
      setMeta((m: any) => ({ ...(m || {}), level: r.level, streak: r.streak }));
      await refreshHistory();
      toast(`完成 · ${Math.round(r.attempt.score)} 分`);
    } catch (e: any) {
      setErr(`评分失败：${e?.message || "请重试"}`);
      setStage("recite");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section>
        <p className="screen-tag">Screen 03 — 背诵 · Recital</p>
        <div className="panel rc-empty">
          <span className="rc-spin" />
          正在按你的水平准备今天的文章…
        </div>
      </section>
    );
  }

  if (!passage) {
    return (
      <section>
        <p className="screen-tag">Screen 03 — 背诵 · Recital</p>
        <div className="panel rc-empty">
          <b>这篇文章没准备好</b>
          <p className="hint">{err || "请稍后重试。"}</p>
          <button className="btn primary" onClick={load}>重试</button>
        </div>
      </section>
    );
  }

  const level = meta?.level || passage.level || 2;
  const lines = passage.hints?.[String(hint)] || [];

  return (
    <section className="rc-page">
      <p className="screen-tag">Screen 03 — 背诵 · Recital</p>
      <div className="rc-title-row">
        <div>
          <h1>每天一篇，开口成篇。</h1>
          <p className="sub">原文会藏起来。先用提示把语块串起来，再录音。</p>
        </div>
        <div className="rc-status">
          <span className="rc-level">L{level} <small>自动</small></span>
          <span className="rc-streak">连续 {meta?.streak || 0} 天</span>
          <span className="rc-streak">共 {meta?.attempts || 0} 次</span>
        </div>
      </div>

      {meta?.audio_ready === false && (
        <div className="rc-warn">
          <b>还没配置语音识别</b>
          <span>可以听、看、用提示背；录音评分需要到设置里填写音频 Key。</span>
        </div>
      )}
      {err && stage !== "scoring" && <div className="rc-warn"><b>提示</b><span>{err}</span></div>}

      {stage === "ready" && (
        <div className="panel rc-card">
          <div className="rc-kicker">
            {passage.source === "seed" ? "演示文章" : "今日推荐"} · {passage.topic || "daily"}
            <span className="rc-wc">{passage.word_count} 词</span>
          </div>
          <h2 className="rc-passage-title">{passage.title}</h2>
          <div className="rc-why">{passage.why}</div>

          <div className="row rc-actions">
            <button className="btn primary" onClick={startRecite}>开始背诵</button>
            <button className="btn ghost" onClick={() => speak(passage.text, "real")}>▶ 听全文</button>
            <button className="btn ghost" onClick={nextPassage} disabled={busy}>
              {busy ? "生成中…" : "换一篇"}
            </button>
          </div>

          <div className="divider">原文 · 先听懂</div>
          <div className="rc-text">
            {passage.sentences.map((s, i) => (
              <button key={i} className="rc-sent" onClick={() => speak(s, "real")} title="点击朗读这句">
                {s}
              </button>
            ))}
          </div>
          <div className="rc-chunks">
            {passage.chunks.map((c, i) => <span key={i} className="rc-chunk">{c}</span>)}
          </div>
          <p className="hint rc-tip">先听两遍，再开始背。背的时候原文会隐藏。</p>
        </div>
      )}

      {stage === "recite" && (
        <div className="panel rc-card rc-recite">
          <div className="rc-kicker">背诵中 · {passage.title}</div>
          <div className="rc-hintbar" role="group" aria-label="提示等级">
            {HINTS.map((h) => (
              <button
                key={h.level}
                className={`rc-hint-pill ${hint === h.level ? "on" : ""}`}
                onClick={() => setHint(h.level)}
                title={h.desc}
              >
                <b>{h.level === 0 ? "L0" : `L${h.level}`}</b>
                <span>{h.label}</span>
              </button>
            ))}
          </div>

          {hint === 0 ? (
            <div className="rc-hintbox bare">
              <b>裸背模式</b>
              <span>没有提示。卡住时再升一档，不用硬撑。</span>
            </div>
          ) : (
            <div className="rc-hintbox">
              {lines.map((line, i) => <div key={i} className="rc-hint-line">{line}</div>)}
            </div>
          )}

          <div className="rc-recbox">
            {recording ? (
              <button className="btn primary rec" onClick={stopRec}>
                <span className="rec-dot" /> 录音中 {fmt(sec)} · 点此结束
              </button>
            ) : (
              <button className="btn primary" onClick={startRec} disabled={busy}>
                🎤 开始背诵
              </button>
            )}
            <span className="rc-recmeta">
              {recording ? "正在录音，背完点上面的按钮" : `提示：${HINTS[hint].label}`}
            </span>
          </div>

          <div className="row rc-subactions">
            <button className="btn link" onClick={backToText}>看不下去？回原文重来</button>
            <button className="btn ghost sm" onClick={() => speak(passage.text, "real")}>▶ 再听一遍</button>
          </div>
          <p className="hint">这次不计时、不打断；录完统一评分。</p>
        </div>
      )}

      {stage === "scoring" && (
        <div className="panel rc-empty">
          <span className="rc-spin" />
          正在对齐你的转写和原文…
        </div>
      )}

      {stage === "result" && result && (
        <div className="panel rc-card">
          <div className="rc-result-head">
            <div>
              <div className="rc-kicker">完成 · L{result.level} · 提示 {hintLabel(result.hint)}</div>
              <h2 className="rc-passage-title">{result.title}</h2>
              <div className="rc-result-sub">
                {result.words} 词 · {fmt(Math.round((result.duration_ms || 0) / 1000))} · {Math.round(result.wpm)} wpm
              </div>
            </div>
            <div className="rc-big-score">
              <b>{Math.round(result.score)}</b>
              <span>综合</span>
            </div>
          </div>

          <div className="rc-bars">
            <MiniBar label="完整度" value={result.coverage} tone="green" />
            <MiniBar label="准确度" value={result.accuracy} />
            <MiniBar label="流利度" value={result.fluency} />
            <MiniBar label="独立性" value={result.independence} />
          </div>

          <div className="rc-review">
            <div className="rc-review-sum">{result.review?.summary}</div>
            <div className="rc-review-grid">
              <div>
                <div className="rc-rlabel">做到了</div>
                <ul>{(result.review?.wins || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
              <div>
                <div className="rc-rlabel">漏掉了</div>
                <ul>
                  {(result.review?.misses || []).length
                    ? result.review.misses.map((m, i) => (
                      <li key={i}><b>{m.source}</b>{m.note ? ` — ${m.note}` : ""}</li>
                    ))
                    : <li>没有明显漏点，保持这个节奏。</li>}
                </ul>
              </div>
            </div>

            {result.review?.pron_issues?.length > 0 && (
              <div className="rc-pron">
                <div className="rc-rlabel">发音提示</div>
                {result.review.pron_issues.map((p, i) => (
                  <div key={i} className="rc-pron-row">
                    <b>{p.word || p.sound}</b>
                    {p.heard_as ? <span>听成了 {p.heard_as}</span> : null}
                    <em>{p.tip}</em>
                  </div>
                ))}
              </div>
            )}

            {result.review?.drill?.items?.length > 0 && (
              <div className="rc-drill">
                <div className="rc-rlabel">再练一次</div>
                <div className="rc-drill-items">
                  {result.review.drill.items.map((d, i) => (
                    <button key={i} className="rc-chunk" onClick={() => speak(d, "real")}>▶ {d}</button>
                  ))}
                </div>
              </div>
            )}
            {result.review?.next?.advice && (
              <div className="rc-next"><b>下一次</b> {result.review.next.advice}</div>
            )}
          </div>

          <div className="divider">原文 × 你的转写</div>
          {result.coverage >= 0.98 ? (
            <div className="rc-done-text">{passage.text}</div>
          ) : (
          <div className="rc-diff">
            {result.diff?.map((d, i) => {
              if (d.type === "ok") return <span key={i} className="rc-seg ok">{d.source} </span>;
              if (d.type === "miss") return <span key={i} className="rc-seg miss" title="这次漏掉了">{d.source} </span>;
              if (d.type === "extra") return <span key={i} className="rc-seg extra" title="多说的">{d.spoken} </span>;
              return (
                <span key={i} className="rc-seg sub" title="替换">
                  <s>{d.source}</s> <em>{d.spoken}</em>{" "}
                </span>
              );
            })}
            {result.diff_truncated && <span className="rc-seg extra">…</span>}
          </div>
          )}
          <details className="rc-transcript">
            <summary>看完整转写</summary>
            <p>{result.transcript || "（没有识别到内容）"}</p>
          </details>

          <div className="row rc-actions">
            <button className="btn primary" onClick={again}>再背一次</button>
            <button className="btn ghost" onClick={nextPassage} disabled={busy}>{busy ? "生成中…" : "换一篇"}</button>
            <button className="btn" onClick={() => setShareOpen(true)}>📕 分享到小红书</button>
            {audioUrl && <audio className="rc-audio" controls src={audioUrl} />}
          </div>
        </div>
      )}

      <div className="panel rc-history">
        <div className="rc-hist-head">
          <b>最近背诵</b>
          <span>连续 {meta?.streak || 0} 天 · 共 {meta?.attempts || 0} 次</span>
        </div>
        {history.length === 0 ? (
          <p className="hint">还没有记录。背完第一篇，这里会出现趋势。</p>
        ) : (
          <>
            <div className="rc-trend">
              {history.slice().reverse().map((h, i) => (
                <i key={i} style={{ height: `${Math.max(6, Math.min(48, (Number(h.score) || 0) * 0.48))}px` }}
                   title={`${h.date} · ${Math.round(h.score)}`} />
              ))}
            </div>
            {history.slice(0, 8).map((h) => (
              <div className="rc-hrow" key={h.id}>
                <span className="rc-hdate">{String(h.date || "").slice(5)}</span>
                <span className="rc-htitle">{h.title}</span>
                <span className="rc-hmeta">L{h.level} · {hintLabel(h.hint)} · {Math.round(h.wpm || 0)} wpm</span>
                <span className={`rc-hscore ${h.score >= 80 ? "good" : h.score < 60 ? "bad" : ""}`}>
                  {Math.round(h.score)}
                </span>
                {h.audio_url && (
                  <button className="mini" onClick={() => setAudioOpen(audioOpen === h.id ? "" : h.id)}>
                    {audioOpen === h.id ? "收起" : "▶ 回放"}
                  </button>
                )}
                {audioOpen === h.id && h.audio_url && (
                  <audio className="rc-audio sm" controls autoPlay src={h.audio_url} />
                )}
              </div>
            ))}
          </>
        )}
      </div>
    
      {result && (
        <RecitationShare
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          passageText={passage?.text || result.title}
          attempt={result}
          streak={Number(meta?.streak) || 0}
          audioUrl={audioUrl}
        />
      )}

    </section>
  );
}
