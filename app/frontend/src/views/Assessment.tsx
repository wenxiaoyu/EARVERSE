import AsyncButton from "../components/AsyncButton";
import { useEffect, useRef, useState } from "react";
import { api, speak } from "../api";
import { createWavRecorder } from "../wavRecorder";
import { toast } from "../toast";
import RichText from "../components/RichText";
import Tip from "../components/Tip";

type Item = { index: number; play_text: string; options: string[]; difficulty: number };
type Phase = "listen" | "seen" | "feedback";

const VOCAB = [
  { key: "automatic", label: "已自动化", color: "#7FB069" },
  { key: "recognized", label: "能懂但慢", color: "#E8A33D" },
  { key: "deaf", label: "哑巴词汇", color: "#D9544D" },
  { key: "unknown", label: "不认识", color: "#6b6459" },
];

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function Assessment({ domain, onConfirmed }: { domain: string; onConfirmed: () => void }) {
  const [sid, setSid] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [asked, setAsked] = useState(0);
  const [source, setSource] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [phase, setPhase] = useState<Phase>("listen");
  const [reveal, setReveal] = useState<any>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [pending, setPending] = useState<any>(null);
  const [free, setFree] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const reactionStart = useRef<number>(0);
  const submitLock = useRef(false);

  // 发音
  const [target, setTarget] = useState("");
  const [pronFocus, setPronFocus] = useState("");
  const [pronTip, setPronTip] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [pronBusy, setPronBusy] = useState(false);
  const [pronResult, setPronResult] = useState<any>(null);
  const recorder = useRef(createWavRecorder());

  const start = async () => {
    setBusy(true);
    setResult(null);
    setPronResult(null);
    try {
      const r = await api.assessmentStart(domain);
      setSid(r.session_id);
      setTotal(r.total);
      setSource(r.source);
      setAsked(1);
      setItem(r.item);
      setPhase("listen");
      setReveal(null);
      setCorrect(null);
      setFree("");
      reactionStart.current = 0;
    } finally {
      setBusy(false);
    }
  };

  const play = () => {
    if (!item) return;
    speak(item.play_text, "real");
    reactionStart.current = Date.now();
  };

  const advance = (p: any) => {
    if (!p || p.done) {
      finish();
      return;
    }
    setItem(p.item);
    setAsked((n) => n + 1);
    setPhase("listen");
    setReveal(null);
    setCorrect(null);
    setPending(null);
    setFree("");
    reactionStart.current = 0;
  };

  const answer = async (ci: number | null) => {
    if (!sid || !item || busy || submitLock.current) return;
    submitLock.current = true;
    const reaction = reactionStart.current ? Date.now() - reactionStart.current : null;
    setBusy(true);
    try {
      const r = await api.assessmentAnswer({
        session_id: sid,
        item_index: item.index,
        choice_index: ci,
        reaction_ms: reaction,
        free_text: free,
      });
      if (r.stale) return;   // 连点/过期提交，忽略
      setReveal(r.reveal);
      setCorrect(r.correct);
      if (r.ask_seen) {
        setPhase("seen");
      } else {
        setPending(r);
        setPhase("feedback");
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const markSeen = async (known: boolean) => {
    if (!sid || busy) return;
    setBusy(true);
    try {
      const r = await api.assessmentSeen(sid, known);
      setPending(r);
      setPhase("feedback");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!sid) return;
    setBusy(true);
    try {
      const r = await api.assessmentFinish(sid);
      setResult({ ...r.result, stats: r.stats });
      const t = await api.pronunciationTarget(domain);
      setTarget(t.target);
      setPronFocus(t.focus || "");
      setPronTip(t.tip || "");
      setAudioReady(Boolean(t.audio_ready));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!recording) return;
    setRecSec(0);
    const id = window.setInterval(() => setRecSec((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const startRec = async () => {
    if (recording || pronBusy) return;
    setPronResult(null);
    try {
      await recorder.current.start();
      setRecording(true);
    } catch (e: any) {
      const n = e?.name || "";
      toast(n === "NotAllowedError" || n === "SecurityError"
        ? "麦克风被拒绝：请在地址栏允许麦克风后重试"
        : "无法打开麦克风，请检查系统权限");
    }
  };
  const stopRec = async () => {
    if (!recording) return;
    const tooShort = recSec < 1;
    setRecording(false);
    setPronBusy(true);
    try {
      const blob = await recorder.current.stop();
      if (tooShort || blob.size < 1200) {
        toast("录音太短，请完整读一遍再停");
        return;
      }
      const r = await api.pronunciationAssess(blob, domain, target);
      setPronResult(r);
      toast(r.error ? "发音评估未完成" : "发音已评估");
    } catch {
      toast("评估请求失败，请重试");
    } finally {
      setPronBusy(false);
    }
  };

  const confirm = async (ok: boolean) => {
    if (!ok) {
      setResult(null);
      await start();
      return;
    }
    await api.assessmentConfirm(domain);
    toast("画像已生效");
    onConfirmed();
  };

  useEffect(() => {
    // 场景变化：重置本次测验，并按新场景重新出题（若原本在测验中）
    const wasActive = sid !== null;
    setSid(null);
    setItem(null);
    setResult(null);
    setReveal(null);
    setCorrect(null);
    setPending(null);
    setPhase("listen");
    setAsked(0);
    setPronResult(null);
    reactionStart.current = 0;

    api.pronunciationTarget(domain)
      .then((t) => { setTarget(t.target); setPronFocus(t.focus || ""); setPronTip(t.tip || ""); setAudioReady(Boolean(t.audio_ready)); })
      .catch(() => {});

    if (wasActive) {
      toast(`已切换到「${domain}」场景，重新出题`);
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  const pct = total ? Math.min(100, ((asked - 1) / total) * 100) : 0;

  const rVocab = result?.vocab || {};
  const rCounts: Record<string, number> = {};
  Object.values(rVocab).forEach((st: any) => { rCounts[st] = (rCounts[st] || 0) + 1; });
  const rTotal = Object.keys(rVocab).length;
  const rAcc = result?.stats?.accuracy ?? 0;
  const rAutoRate = rTotal ? Math.round(((rCounts.automatic || 0) / rTotal) * 100) : 0;

  return (
    <section>
      <p className="screen-tag">Screen 02 — 首次测验 · Calibration</p>
      <h1>测验</h1>
      <p className="sub">只听发音、选中文意思；没听出才看单词。约 5–10 分钟，题目按场景与你的水平生成。</p>

      {!sid && !result && (
        <div className="panel">
          <h2>拧一下，找到你的边界。</h2>
          <p className="hint" style={{ marginTop: -2 }}>
            不是做套题打分：先只听发音选意思，没听出才给你看单词，用来分辨"认识但听不出"。
          </p>
          <AsyncButton className="start" onClick={start} loadingText="出题中…">
            <span className="play">▶</span>开始测验
          </AsyncButton>
        </div>
      )}

      {item && !result && (
        <div className="panel assess">
          <div className="tuner">
            <span>第 {asked} / {total} 题</span>
            <span className="tuner-meta">{source === "ai" ? "AI" : "种子"} · 难度 {item.difficulty}</span>
          </div>
          <div className="scale">
            <div className="needle" style={{ left: `${8 + pct * 0.84}%` }} />
            <span className="num" style={{ left: "6%" }}>易</span>
            <span className="num" style={{ left: "48%" }}>中</span>
            <span className="num" style={{ right: "8%" }}>难</span>
          </div>

          {/* 舞台区：定高，三个阶段内容只换不撑 */}
          <div className={`assess-stage ${phase}`}>
            {phase === "listen" && (
              <div className="stage-inner">
                <button className="big-play" onClick={play} aria-label="播放">▶</button>
                <div className="hint">点播放，只听发音 · 选出中文意思</div>
              </div>
            )}
            {phase === "seen" && reveal && (
              <div className="stage-inner">
                <div className="stage-word">{reveal.w}</div>
                <div className="hint">没听出 · 看到这个单词，你认识它的意思吗？</div>
              </div>
            )}
            {phase === "feedback" && reveal && (
              <div className="stage-inner">
                <div className={`verdict ${correct ? "ok" : "bad"}`}>{correct ? "听对了" : "没听对"}</div>
                <div className="stage-word sm">{reveal.w}</div>
                <div className="stage-zh">{reveal.zh}</div>
              </div>
            )}
          </div>

          {/* 操作区：定高，按钮位置不跳 */}
          <div className="assess-actions">
            {phase === "listen" && (
              <>
                <div className="opt-grid">
                  {item.options.map((opt, i) => (
                    <button key={i} className="abtn" disabled={busy} onClick={() => answer(i)}>{opt}</button>
                  ))}
                </div>
                <div className="assess-extra">
                  <input
                    value={free}
                    onChange={(e) => setFree(e.target.value)}
                    placeholder="补充：你听到的中文意思（可选）"
                  />
                  <button className="abtn ghost auto" disabled={busy} onClick={() => answer(null)}>没听出，看答案</button>
                </div>
              </>
            )}

            {phase === "seen" && (
              <div className="opt-grid">
                <button className="abtn" disabled={busy} onClick={() => markSeen(true)}>认识</button>
                <button className="abtn" disabled={busy} onClick={() => markSeen(false)}>不认识</button>
              </div>
            )}

            {phase === "feedback" && (
              <button className="abtn primary" onClick={() => advance(pending)}>
                下一题 →
              </button>
            )}
          </div>

          <div className="meter">
            <span>进度</span>
            <div className="track"><div className="needle2" style={{ width: `${pct}%` }} /></div>
            <span>{asked} / {total}</span>
          </div>
        </div>
      )}

      {result && (
        <div className="panel">
          <div className="chat-head">
            <h2 style={{ margin: 0 }}>你的初步画像</h2>
            <span className="badge">
              {result.source === "ai" ? "AI 判断" : "本地兜底"} · 置信度 {Math.round((result.confidence || 0) * 100)}%
            </span>
          </div>
          <div className="kpi-grid" style={{ marginTop: 4 }}>
            <div className="stat-card">
              <div className="k">听懂率</div>
              <div className="v" style={{ color: "var(--green)" }}>{rAcc}%</div>
            </div>
            <div className="stat-card">
              <div className="k">自动化词汇 <Tip text="听到即懂、不用想，说明已经形成听觉直觉。" /></div>
              <div className="v">{rAutoRate}%</div>
            </div>
            <div className="stat-card">
              <div className="k">哑巴词汇 <Tip text="看着认识、但听不出来的词：文字能懂，声音对不上意思。" /></div>
              <div className="v" style={{ color: "var(--red)" }}>{rCounts.deaf || 0}</div>
            </div>
            <div className="stat-card">
              <div className="k">本次题量</div>
              <div className="v">{result.stats?.asked ?? "—"}</div>
            </div>
          </div>

          <div className="two-panel" style={{ marginTop: 4 }}>
            <div className="panel" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>词汇状态分布</h3>
              {rTotal ? (
                <>
                  <div className="mastery-bar">
                    {VOCAB.map((s) => rCounts[s.key] ? (
                      <i key={s.key} style={{ width: `${(rCounts[s.key] / rTotal) * 100}%`, background: s.color }} />
                    ) : null)}
                  </div>
                  <div className="legend">
                    {VOCAB.map((s) => (
                      <span key={s.key}><i style={{ background: s.color }} />{s.label} <b>{rCounts[s.key] || 0}</b></span>
                    ))}
                  </div>
                </>
              ) : <p className="empty">暂无词汇数据</p>}
            </div>

            <div className="panel" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>各难度听懂率</h3>
              <div className="bar-list">
                {[["易", "1"], ["中", "2"], ["难", "3"]].map(([lab, k]) => {
                  const lv = result.stats?.per_level?.[k] || { asked: 0, correct: 0 };
                  const p = lv.asked ? Math.round((lv.correct / lv.asked) * 100) : 0;
                  return (
                    <div className="bar-row" key={k}>
                      <span className="lab">{lab}</span>
                      <div className="bar-track">
                        <div className={`bar-fill ${k === "1" ? "green" : ""}`} style={{ width: `${p}%` }} />
                      </div>
                      <span className="val">{lv.asked ? `${p}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="divider">需要优先补的</div>
          {(result.weaknesses || []).slice(0, 3).length ? (
            <div className="weak-cards">
              {(result.weaknesses || []).slice(0, 3).map((w: any, i: number) => (
                <div className="weak-card" key={i}>
                  <div className="wc-head">
                    <span className="wc-area">{w.area}</span>
                    <span className="wc-arrow">→</span>
                  </div>
                  {w.evidence && <div className="wc-ev"><RichText text={w.evidence} /></div>}
                  {w.action && <div className="wc-act"><RichText text={w.action} /></div>}
                </div>
              ))}
            </div>
          ) : <p className="empty">这次没发现明显短板。</p>}

          <div className="divider">AI 评语</div>
          <div className="coach-block">
            <div className="coach-head">
              <span className="coach-tag">AI 教练</span>
              {result.verdict && <span className={`trend ${result.verdict}`}>{result.verdict}</span>}
            </div>
            <p className="coach-note"><RichText text={result.summary} /></p>
            {result.next_plan && (
              <p className="coach-next"><b>下一步</b><RichText text={result.next_plan} /></p>
            )}
          </div>

          <div className="divider">发音探测</div>
          <p className="hint">朗读下面这句，系统会录音并给出「可懂度」评分。</p>
          <div className="pron-target">{target || "…"}</div>
          {(pronFocus || pronTip) && (
            <div className="row" style={{ marginBottom: 6 }}>
              {pronFocus && <span className="badge">{pronFocus}</span>}
              {pronTip && <span className="hint">{pronTip}</span>}
            </div>
          )}
          {!audioReady && <p className="hint">⚠ 未配置音频供应商（配置 DeepSeek 后即可用发音评估）。</p>}
          {!pronResult && audioReady && (
            <div className="row" style={{ alignItems: "center" }}>
              {!recording ? (
                <button className="btn" disabled={pronBusy} onClick={startRec}>
                  {pronBusy ? "分析中…" : "● 开始录音"}
                </button>
              ) : (
                <button className="btn primary rec" onClick={stopRec}>
                  <span className="rec-dot" /> 录音中 {fmtSec(recSec)} · 点此停止
                </button>
              )}
              {pronBusy && <span className="hint">正在分析录音…</span>}
            </div>
          )}
          {pronResult && (
            <div>
              {pronResult.error ? (
                <p className="hint">{pronResult.error}</p>
              ) : (
                <>
                  <div className="row" style={{ alignItems: "baseline", gap: 12 }}>
                    <span className="verdict ok" style={{ fontSize: 30 }}>{pronResult.score}</span>
                    <span className="hint">可信度 {Math.round((pronResult.confidence || 0) * 100)}%</span>
                  </div>
                  <p className="hint">转写：{pronResult.transcript}</p>
                  {pronResult.summary && <p><RichText text={pronResult.summary} /></p>}
                  <ul className="weak">
                    {(pronResult.issues || []).map((x: any, i: number) => (
                      <li key={i}>
                        <b>{x.sound || x.word}</b>{x.heard_as ? ` → ${x.heard_as}` : ""}
                        {x.word ? `（${x.word}）` : ""} · {x.tip}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setPronResult(null)}>
                再录一次
              </button>
            </div>
          )}

          <div className="divider">确认画像</div>
          <p className="hint">这个判断准吗？不准的话我重新测。</p>
          <div className="row">
            <AsyncButton className="btn primary" onClick={() => confirm(true)} loadingText="确认中…">准，开始训练</AsyncButton>
            <AsyncButton className="btn ghost" onClick={() => confirm(false)} loadingText="重测中…">不准，重测</AsyncButton>
          </div>
        </div>
      )}
    </section>
  );
}
