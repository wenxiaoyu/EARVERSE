import AsyncButton from "../components/AsyncButton";
import { ReactNode, useEffect, useRef, useState } from "react";
import { api, speak } from "../api";
import { toast } from "../toast";
import SceneSelector from "../components/SceneSelector";
import { createWavRecorder } from "../wavRecorder";
import RichText from "../components/RichText";
import { useSessionClock } from "../components/useCountdown";
import Scenario from "./Scenario";
import Tip from "../components/Tip";

type Block = { kind: string; title: string; minutes: number; focus: string };
type Item = { id: string; w: string; zh: string; difficulty: number };
type StepStatus = "idle" | "active" | "done";

/** 判断 localStorage 里的进度是否属于今天；防止跨午夜把昨天写进新一天。 */
function savedForDay(saved: any, todayKey: string): boolean {
  if (!saved) return false;
  if (saved.savedFor) return saved.savedFor === todayKey;
  if (saved.roundId) {
    return new Date(saved.roundId).toDateString() === new Date().toDateString();
  }
  return true;
}

const TABS = ["激活复习", "新内容训练", "场景实战", "复盘收尾"];
const CIRCLED = ["①", "②", "③", "④"];

const STATE_ITEMS = [
  { key: "normal", label: "一般" },
  { key: "tired", label: "疲惫" },
  { key: "fresh", label: "状态好" },
];

function Step({
  status, children, hidden, active,
}: {
  status: StepStatus; children: ReactNode; hidden?: boolean; active?: boolean;
}) {
  return (
    <section className={`step ${status} ${active ? "tab-active" : ""}`} style={{ display: hidden ? "none" : undefined }}>
      <div className="step-body">{children}</div>
    </section>
  );
}

function TaskHead({
  step, title, goal, right,
}: { step: string; title: string; goal: string; right?: ReactNode }) {
  return (
    <div className="task-head">
      <div className="th-main">
        <div className="th-eyebrow">STEP {step} · {title}</div>
        <div className="th-goal">{goal}</div>
      </div>
      {right && <div className="th-right">{right}</div>}
    </div>
  );
}

function fmtClock(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const r = Math.max(0, sec) % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function Today({
  domain, confirmed, goto,
}: {
  domain: string;
  confirmed: boolean;
  goto: (t: string) => void;
}) {
  const [schedule, setSchedule] = useState<Block[]>([]);
  const [focus, setFocus] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
  const [state, setState] = useState("normal");
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [roundId, setRoundId] = useState<number>(() => Date.now());
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [recapStale, setRecapStale] = useState(false);

  const [shadowItems, setShadowItems] = useState<any[]>([]);
  const [shadowIdx, setShadowIdx] = useState(0);
  const [shadowGroup, setShadowGroup] = useState(1);
  const [shadowSeen, setShadowSeen] = useState(1);
  const [shadowResult, setShadowResult] = useState<any>(null);
  const [shadowDetail, setShadowDetail] = useState(false);
  const [shadowScores, setShadowScores] = useState<number[]>([]);
  const [shadowRecording, setShadowRecording] = useState(false);
  const [shadowBusy, setShadowBusy] = useState(false);
  const [shadowAudioReady, setShadowAudioReady] = useState(true);
  const [shadowLoading, setShadowLoading] = useState(false);
  const shadowRec = useRef(createWavRecorder());

  const [mpPair, setMpPair] = useState<any>(null);
  const [mpTarget, setMpTarget] = useState<"a" | "b">("a");
  const [mpPick, setMpPick] = useState<null | "a" | "b">(null);
  const [mpStat, setMpStat] = useState({ ok: 0, total: 0 });
  const [mpItems, setMpItems] = useState<any[]>([]);
  const [mpSource, setMpSource] = useState("");
  const [mpIdx, setMpIdx] = useState(0);
  const [scenarioDone, setScenarioDone] = useState(false);
  const [scenarioRecord, setScenarioRecord] = useState<any>(null);
  const [scenarioReview, setScenarioReview] = useState<any>(null);
  const [tab, setTab] = useState(0);
  const tabPicked = useRef(false);
  const tabMounted = useRef(false);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  const load = () => {
    api.plan(domain, state).then((r) => {
      setSchedule(r.schedule);
      setFocus(r.focus);
      setGoal(r.goal || null);
    });
  };
  useEffect(load, [domain, state, todayKey]);

  // 切换场景/跨天：优先恢复今天的进度，否则重新生成
  useEffect(() => {
    const key = `aicoach.today.v1:${todayKey}:${domain}`;
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch { saved = null; }
    if (!savedForDay(saved, todayKey)) saved = null;

    setScenarioReview(null); setScenarioRecord(null);
    tabPicked.current = false; setTab(0);

    if (saved && (saved.items?.length || saved.shadowItems?.length || saved.mpItems?.length)) {
      setItems((saved.items || []).slice(0, 8));
      setResults(saved.results || {});
      setRevealed(saved.revealed || {});
      setRoundId(saved.roundId || Date.now());
      setShadowItems(saved.shadowItems || []);
      setShadowIdx(saved.shadowIdx || 0);
      setShadowGroup(saved.shadowGroup || 1);
      setShadowSeen(saved.shadowSeen || 1);
      setShadowScores(saved.shadowScores || []);
      setShadowAudioReady(saved.shadowAudioReady !== false);
      setShadowResult(null);
      setDiagnosis(null);
      setRecapStale(Boolean(saved.recapStale));
      return;
    }

    setItems([]); setResults({}); setRevealed({}); setDiagnosis(null);
    setShadowItems([]); setShadowResult(null); setShadowIdx(0); setShadowScores([]); setShadowGroup(1); setShadowSeen(1);
    setRoundId(Date.now());
    let alive = true;
    api.generate(domain, "cards", 8)
      .then((r) => { if (alive) setItems(r.items || []); })
      .catch(() => {});
    api.pronunciationItems(domain, 5)
      .then((r) => { if (alive) { setShadowItems(r.items || []); setShadowAudioReady(Boolean(r.audio_ready)); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [domain, todayKey]);

  // 今天已生成过复盘：刷新后继续显示
  useEffect(() => {
    api.dailyDetail(domain, todayKey)
      .then((d) => { if (d?.recap?.diagnosis) setDiagnosis(d.recap.diagnosis); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, todayKey]);

  // 今天是否已完成过场景实战（用于复盘收尾判断）
  const refreshScenarioDone = () => {
    api.profile(domain).then((r) => {
      const recs = r.domain_view?.scenario_record || [];
      const today = new Date().toDateString();
      const todays = recs.filter((x: any) => x.at && new Date(x.at).toDateString() === today);
      setScenarioDone(todays.length > 0);
      setScenarioRecord(todays.length ? todays[todays.length - 1] : null);
    }).catch(() => {});
  };
  useEffect(() => {
    refreshScenarioDone();
    window.addEventListener("focus", refreshScenarioDone);
    return () => window.removeEventListener("focus", refreshScenarioDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, todayKey]);

  const total = schedule.reduce((s, b) => s + b.minutes, 0);
  const mins = (kind: string) => schedule.find((b) => b.kind === kind)?.minutes;

  const session = useSessionClock(`aicoach.session.v2:${todayKey}`, total || 60);
  const [clockNow, setClockNow] = useState(() => new Date());
  const autoClockStarted = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // 跨天时允许新一天重新自动起表
  useEffect(() => {
    autoClockStarted.current = false;
  }, [todayKey]);

  // 首次进入「今天」自动起表；暂停/重置仍由用户控制
  useEffect(() => {
    if (autoClockStarted.current) return;
    if (session.running || session.finished || session.elapsed > 0) return;
    autoClockStarted.current = true;
    session.start();
  }, [todayKey, session.running, session.finished, session.elapsed]);

  const practice = async () => {
    const r = await api.generate(domain, "cards", 8);
    setItems(r.items);
    setResults({});
    setRevealed({});
    setRoundId(Date.now());
    setRecapStale(true);
    toast("已开始新一轮，练完可重新复盘");
  };

  // 第 1 步：边做边存（不生成诊断，诊断在第 4 步汇总）
  const markItem = (it: Item, correct: boolean) => {
    setResults((r) => ({ ...r, [it.id]: correct }));
    setRevealed((r) => ({ ...r, [it.id]: true }));
    api.trainingRecord({
      domain, kind: "listening", item_key: `${roundId}-${it.id}`, text: it.w,
      correct, detail: `难度${it.difficulty}`, difficulty: it.difficulty,
    }).catch(() => {});
  };

  const genRecap = async () => {
    const r = await api.dailyRecap(domain);
    setDiagnosis(r.diagnosis);
    setRecapStale(false);
    refreshScenarioDone();
    toast("今日复盘已生成");
  };

  const weakName = focus?.hearing?.[0]?.name || focus?.hearing?.[0]?.rule_id;

  const loadShadow = async () => {
    setShadowLoading(true); setShadowResult(null); setShadowIdx(0);
    setShadowGroup((g) => g + 1);
    setShadowSeen((n) => n + 1);
    try {
      const r = await api.pronunciationItems(domain, 5);
      setShadowItems(r.items || []);
      setShadowAudioReady(Boolean(r.audio_ready));
    } finally { setShadowLoading(false); }
  };
  const startShadow = async () => {
    try { await shadowRec.current.start(); setShadowRecording(true); }
    catch { toast("无法打开麦克风"); }
  };
  const stopShadow = async () => {
    setShadowRecording(false); setShadowBusy(true);
    try {
      const blob = await shadowRec.current.stop();
      const it = shadowItems[shadowIdx];
      const r = await api.pronunciationAssess(blob, domain, it?.text || "");
      setShadowResult(r);
      if (!r.error) setShadowScores((a) => [...a, Number(r.score) || 0]);
    } finally { setShadowBusy(false); }
  };
  const nextShadow = () => {
    setShadowResult(null);
    setShadowDetail(false);
    if (shadowIdx + 1 < shadowItems.length) {
      setShadowIdx(shadowIdx + 1);
      setShadowSeen((n) => n + 1);
    } else {
      toast("本组 5 句完成，开始下一组");
      loadShadow();
    }
  };

  // 首次进入不自动播放；用户点过播放/做过选择后，后续新题自动播放
  const mpArmed = useRef(false);
  const mpAutoTimer = useRef<number | null>(null);
  const clearMpAuto = () => {
    if (mpAutoTimer.current !== null) {
      window.clearTimeout(mpAutoTimer.current);
      mpAutoTimer.current = null;
    }
  };
  const pickMp = (p: any, autoplay = false) => {
    const t = Math.random() < 0.5 ? "a" : "b";
    setMpPair(p); setMpTarget(t); setMpPick(null);
    if (autoplay) setTimeout(() => speak(p[t], "real"), 60);
  };
  const loadMp = async (first = false) => {
    clearMpAuto();
    const r = await api.minimalPairs(domain, 8);
    const items = r.items || [];
    setMpItems(items);
    setMpSource(r.source || "");
    setMpIdx(0);
    if (items.length) pickMp(items[0], !first && mpArmed.current);
    else setMpPair(null);
  };
  const nextMp = async () => {
    clearMpAuto();
    if (!mpItems.length) { await loadMp(); return; }
    const next = mpIdx + 1;
    if (next >= mpItems.length) { await loadMp(); return; }
    setMpIdx(next);
    pickMp(mpItems[next], mpArmed.current);
  };
  // 进入页面/切换场景/跨天时按场景生成（首屏静默）
  useEffect(() => {
    const key = `aicoach.today.v1:${todayKey}:${domain}`;
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch { saved = null; }
    if (!savedForDay(saved, todayKey)) saved = null;
    if (saved?.mpItems?.length) {
      setMpItems(saved.mpItems);
      setMpIdx(saved.mpIdx || 0);
      setMpPair(saved.mpPair || null);
      setMpTarget(saved.mpTarget === "b" ? "b" : "a");
      setMpPick(saved.mpPick === "a" || saved.mpPick === "b" ? saved.mpPick : null);
      setMpStat(saved.mpStat || { ok: 0, total: 0 });
      setMpSource(saved.mpSource || "");
      mpArmed.current = Boolean(saved.mpPick);
      return;
    }
    mpArmed.current = false;
    loadMp(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, todayKey]);

  // 持久化今天的练习进度（刷新恢复）
  useEffect(() => {
    const key = `aicoach.today.v1:${todayKey}:${domain}`;
    try {
      localStorage.setItem(key, JSON.stringify({
        savedFor: todayKey,
        items, results, revealed, roundId, recapStale,
        shadowItems, shadowIdx, shadowGroup, shadowSeen, shadowScores, shadowAudioReady,
        mpItems, mpIdx, mpPair, mpTarget, mpPick, mpStat, mpSource,
      }));
    } catch { /* ignore */ }
  // 注意：不要把 todayKey 放进依赖；否则跨午夜时会先把昨天的 items 写进新一天。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, items, results, revealed, roundId, recapStale, shadowItems, shadowIdx,
      shadowGroup, shadowSeen, shadowScores, shadowAudioReady, mpItems, mpIdx,
      mpPair, mpTarget, mpPick, mpStat, mpSource]);

  const playMp = () => {
    if (!mpPair) return;
    mpArmed.current = true; speak(mpPair[mpTarget], "real");
  };
  const guessMp = (c: "a" | "b") => {
    if (mpPick) return;
    mpArmed.current = true;   // 做过选择即视为已开始，后续自动播放
    setMpPick(c);
    setMpStat((s) => ({ ok: s.ok + (c === mpTarget ? 1 : 0), total: s.total + 1 }));
    api.dailyMinimalPair(domain, c === mpTarget, mpPair.focus, mpPair[mpTarget]).catch(() => {});
    // 答对：短暂停留展示结果后，自动进入下一题并播放；答错：停留，便于重听
    if (c === mpTarget) {
      mpAutoTimer.current = window.setTimeout(() => {
        mpAutoTimer.current = null;
        nextMp();
      }, 950);
    }
  };

  const marked = items.filter((it) => results[it.id] !== undefined).length;
  const allMarked = items.length > 0 && marked === items.length;
  const s1: StepStatus = allMarked ? "done" : items.length ? "active" : "idle";
  const s2: StepStatus = (shadowScores.length > 0 && mpStat.total > 0)
    ? "done" : (shadowItems.length || mpPair) ? "active" : "idle";
  const s3: StepStatus = scenarioDone ? "done" : "idle";
  const s4: StepStatus = diagnosis ? "done"
    : (s1 === "done" && s2 === "done" && s3 === "done") ? "active" : "idle";
  const stepStates: StepStatus[] = [s1, s2, s3, s4];

  const shadow = shadowItems[Math.min(shadowIdx, Math.max(shadowItems.length - 1, 0))];
  const sceneSuccess = scenarioReview ? Boolean(scenarioReview.success)
    : scenarioRecord ? Boolean(scenarioRecord.success) : null;
  const sceneMark = sceneSuccess === null ? (scenarioDone ? "—" : "—") : sceneSuccess ? "✓" : "✗";
  const correctCount = items.filter((it) => results[it.id] === true).length;
  const avgScore = shadowScores.length
    ? Math.round(shadowScores.reduce((a, b) => a + b, 0) / shadowScores.length) : null;
  useEffect(() => {
    if (!tabMounted.current) { tabMounted.current = true; return; }
    document.querySelector(".tabbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab]);

  useEffect(() => {
    if (tabPicked.current) return;
    if (!items.length && !shadowItems.length) return;
    const first = s1 !== "done" ? 0 : s2 !== "done" ? 1 : s3 !== "done" ? 2 : 3;
    setTab(first);
    tabPicked.current = true;
  }, [s1, s2, s3, s4, items.length, shadowItems.length]);


  const clockMinuteDeg = (clockNow.getMinutes() + clockNow.getSeconds() / 60) * 6;
  const clockHourDeg = ((clockNow.getHours() % 12) + clockNow.getMinutes() / 60 + clockNow.getSeconds() / 3600) * 30;
  const clockText = `${String(clockNow.getHours()).padStart(2, "0")}:${String(clockNow.getMinutes()).padStart(2, "0")}`;

  return (
    <section>
      <p className="screen-tag">Screen 01 — 今天</p>

      {/* ===== 总览 ===== */}
      <div className="console">
        <div className="panel rail-box">
          <div className="knob clock-knob" title={`本地时间 ${clockText}`}>
            <div className="hour-hand" style={{ ["--deg" as any]: `${clockHourDeg}deg` }} />
            <div className="pointer" style={{ ["--deg" as any]: `${clockMinuteDeg}deg` }} />
            <div className="cap">
              <b>{clockText}</b>
              <span>LOCAL</span>
            </div>
          </div>
          <div className="readout">今日已练</div>
          <div className="big" title={`${fmtClock(session.elapsed)} / ${fmtClock(session.total)}`}>
            {fmtClock(session.elapsed)}<small> / {Math.round(session.total / 60)} min</small>
          </div>
          <div className="vu"><i /><i /><i /><i /><i /><i /></div>
          <div className="state-switch">
            <SceneSelector items={STATE_ITEMS} value={state} onChange={setState} maxInline={3} label="状态" />
          </div>
        </div>

        <div className="panel hero">
          <h1>不用翻译，<br />听见就<em>懂</em>。</h1>
          <p className="tagline">每天 1 小时 · 听得懂 · 接得上 · 说得出</p>
          <p className="coach">
            {!confirmed ? (
              <>先做完首次测验，AI 才能按你的短板排今天的课。</>
            ) : goal?.text ? (
              <>今天的目标：<b>{String(goal.text).replace(/[。.!！]$/, "")}</b>，再去把一件真实的事办成。</>
            ) : weakName ? (
              <>今天先补 <b>{weakName}</b>（你的高频盲区），再去把一件真实的事办成。</>
            ) : (
              <>先做完首次测验，AI 才能按你的短板排今天的课。</>
            )}
            <span className="caret" />
          </p>

          <div className="phases">
            {schedule.map((b, i) => (
              <div className="phase" key={b.kind}>
                <div className="n">0{i + 1} · {b.minutes}m</div>
                <div className="t">{b.title}</div>
                <div className="m">{b.minutes}′</div>
                <div className="f">{b.focus}</div>
                {(() => {
                  const st = stepStates[i] || "idle";
                  return (
                    <div
                      className={`bar ${st}`}
                      title={st === "done" ? "已完成" : st === "active" ? "进行中" : "未开始"}
                      style={{ ["--w" as any]: st === "done" ? "100%" : st === "active" ? "50%" : "0%" }}
                    />
                  );
                })()}
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 16, alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              className="start"
              onClick={() => {
                if (!confirmed) { goto("assess"); return; }
                if (!session.running && !session.finished) session.start();
                setTab(0);
                document.querySelector(".tabbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="play">▶</span>
              {confirmed ? "开始今天的 1 小时" : "先做首次测验"}
            </button>
            {!confirmed && (
              <span className="hint" style={{ margin: 0 }}>测完并确认画像后，训练才会针对你</span>
            )}
          </div>
        </div>
      </div>


      {/* ===== 工作台 ===== */}
      <div className="work-head">
        <h2>今日工作台</h2>
        <div className="session-clock">
          <span className="sc-label">已练 {fmtClock(session.elapsed)}</span>
          <div className="sc-track">
            <i style={{ width: `${Math.min(100, (session.elapsed / session.total) * 100)}%` }} />
          </div>
          <span className="sc-time">{fmtClock(session.left)} 剩余</span>
          {session.finished ? (
            <>
              <span className="sc-done">已满 1 小时</span>
              <button className="mini" onClick={session.reset}>重置</button>
            </>
          ) : (
            <button className="mini" onClick={session.running ? session.pause : session.start}>
              {session.running ? "暂停" : session.elapsed > 0 ? "继续" : "开始计时"}
            </button>
          )}
        </div>
      </div>

      {/* 标签栏 */}
      <div className="tabbar" role="tablist" aria-label="今日学习步骤">
        {TABS.map((title, i) => {
          const st: StepStatus = [s1, s2, s3, s4][i];
          return (
            <button
              key={title}
              role="tab"
              aria-selected={tab === i}
              aria-controls={`panel-${i}`}
              className={`tab ${tab === i ? "on" : ""} ${st}`}
              onClick={() => setTab(i)}
            >
              <span className={`tab-n ${st}`}>{CIRCLED[i]}</span>
              <span className="tab-title">{title}</span>
            </button>
          );
        })}
      </div>

      {/* ① 激活复习 */}
      <Step status={s1} hidden={tab !== 0} active={tab === 0}>
        <TaskHead
          step="01" title="激活复习"
          goal="先听发音，选择是否听出来"
          right={<>
            <span className="th-progress">已标 {marked}/{items.length || "—"}</span>
            <AsyncButton className="btn sm" onClick={practice} loadingText="生成中…">再来一轮</AsyncButton>
          </>}
        />
        {items.length > 0 ? (
          <>
            <div className="practice-grid">
              {items.map((it) => {
                const rev = revealed[it.id];
                const res = results[it.id];
                const showAnswer = Boolean(rev) || res !== undefined;
                return (
                  <div className={`p-card ${res === true ? "ok" : res === false ? "bad" : ""}`} key={it.id}>
                    <div className="p-top">
                      <button className="p-play" onClick={() => speak(it.w, "real")} aria-label="播放">▶</button>
                    </div>
                    <div className="p-body">
                      {showAnswer ? (<><div className="w">{it.w}</div><div className="z">{it.zh || "—"}</div></>) : (<span className="mask">听发音，判断听没听出</span>)}
                    </div>
                    <div className="p-mark">
                      <button className={res === true ? "on" : ""} onClick={() => markItem(it, true)}>听出</button>
                      <button className={res === false ? "on bad" : ""} onClick={() => markItem(it, false)}>没听出</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="practice-foot">
              <div className="prog">
                <div className="prog-track"><i style={{ width: `${(marked / items.length) * 100}%` }} /></div>
                <span>已标 {marked} / {items.length}</span>
              </div>
              <span className="hint">{allMarked ? "本轮已自动保存" : `还有 ${items.length - marked} 张没标`}</span>
            </div>
          </>
        ) : (
          <div className="empty loading-line"><span className="spin" />生成中…</div>
        )}
      </Step>

      {/* ② 新内容训练 */}
      <Step status={s2} hidden={tab !== 1} active={tab === 1}>
        <TaskHead
          step="02" title="新内容训练"
          goal="跟读 + 最小对立对，各练一组"
          right={<span className="th-progress">跟读 {shadowScores.length} · 对立对 {mpStat.ok}/{mpStat.total}</span>}
        />
        <div className="two-col">
          {/* 跟读 */}
          <div className="sub-card">
            <div className="block-head" style={{ marginBottom: 8 }}>
              <b>跟读练习</b>
              <AsyncButton className="btn sm" onClick={loadShadow} loadingText="生成中…">换一组</AsyncButton>
            </div>
            {shadow ? (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="hint">第 {shadowSeen} 句（第 {shadowGroup} 组 · {shadowIdx + 1}/{shadowItems.length}）</span>
                  <div className="row">
                    {shadow.focus && <span className="badge">{shadow.focus}</span>}
                    <button className="p-play" onClick={() => speak(shadow.text, "real")}>▶</button>
                  </div>
                </div>
                <div
                  className="pron-target clickable"
                  role="button"
                  tabIndex={0}
                  title="点击朗读"
                  onClick={() => speak(shadow.text, "real")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      speak(shadow.text, "real");
                    }
                  }}
                >
                  {shadow.text}
                </div>
                {shadow.tip && <p className="hint">{shadow.tip}</p>}
                {!shadowAudioReady && <p className="hint">⚠ 需配置音频供应商（DeepSeek）才能评分。</p>}
                {!shadowResult && shadowAudioReady && (
                  <div className="row">
                    {!shadowRecording ? (
                      <button className="btn" disabled={shadowBusy} onClick={startShadow}>{shadowBusy ? "评估中…" : "开始跟读"}</button>
                    ) : (
                      <button className="btn primary" onClick={stopShadow}>停止并评分</button>
                    )}
                  </div>
                )}
                {shadowResult && (
                  <div className="score-mini">
                    {shadowResult.error ? (
                      <p className="hint">{shadowResult.error}</p>
                    ) : (
                      <>
                        <div className="score-line">
                          <span className="verdict ok">{shadowResult.score}</span>
                          <span className="hint">可信度 {Math.round((shadowResult.confidence || 0) * 100)}%</span>
                        </div>
                        <p className="hint">转写：{shadowResult.transcript || "—"}</p>
                        {(shadowResult.issues || [])[0] ? (
                          <p className="hint">
                            首要问题：<b>{(shadowResult.issues[0].sound || shadowResult.issues[0].word)}</b>
                            {shadowResult.issues[0].heard_as ? ` → ${shadowResult.issues[0].heard_as}` : ""}
                            {" · "}{shadowResult.issues[0].tip}
                          </p>
                        ) : <p className="hint">这次没有明显问题。</p>}
                        <div className="score-actions">
                          {(shadowResult.issues || []).length > 0 && (
                            <button className="mini" onClick={() => setShadowDetail(true)}>
                              看详情（{(shadowResult.issues || []).length}）→
                            </button>
                          )}
                          {(shadowResult.issues || []).length > 0 && (
                            <button className="mini" onClick={() => { setShadowResult(null); loadShadow(); }}>
                              针对这个音再练一组
                            </button>
                          )}
                          <button className="btn sm" onClick={nextShadow}>下一句 →</button>
                        </div>
                      </>
                    )}
                    {shadowResult.error && (
                      <div className="score-actions">
                        <button className="btn sm" onClick={nextShadow}>下一句 →</button>
                      </div>
                    )}
                  </div>
                )}
                {shadowDetail && shadowResult && (
                  <div className="modal-mask" onClick={() => setShadowDetail(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-head">
                        <b>发音详情</b>
                        <button className="mini" onClick={() => setShadowDetail(false)}>关闭</button>
                      </div>
                      <div className="score-line">
                        <span className="verdict ok">{shadowResult.score}</span>
                        <span className="hint">可信度 {Math.round((shadowResult.confidence || 0) * 100)}%</span>
                      </div>
                      <p className="hint">转写：{shadowResult.transcript || "—"}</p>
                      <ul className="weak">
                        {(shadowResult.issues || []).map((x: any, i: number) => (
                          <li key={i}>
                            <b>{x.sound || x.word}</b>{x.heard_as ? ` → ${x.heard_as}` : ""}
                            {x.word ? `（${x.word}）` : ""} · {x.tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="empty">点「换一组」生成跟读句。</p>
            )}
          </div>

          {/* 最小对立对 */}
          <div className="sub-card">
            <div className="block-head" style={{ marginBottom: 8 }}>
              <b>最小对立对 <Tip text="两个只差一个音的词（如 ship/sheep、think/sink）。专练听出关键音差，避免把词听成另一个。" /> {mpSource && <span className="badge">{mpSource === "ai" ? "AI" : "内置"}</span>}</b>
              <div className="row">
                <span className="hint">对了 {mpStat.ok}/{mpStat.total}</span>
                <AsyncButton className="btn sm" onClick={() => loadMp(false)} loadingText="出题中…">换一组</AsyncButton>
                <AsyncButton className="btn sm" onClick={nextMp} loadingText="出题中…">{mpPair ? "下一题" : "开始"}</AsyncButton>
              </div>
            </div>
            {!mpPair ? (
              <p className="empty">听一个词，选出你听到的是哪个。</p>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="badge">{mpPair.focus}</span>
                  <button className="p-play" onClick={playMp} aria-label="重听" title="重听">▶</button>
                </div>
                <div className="mp-grid">
                  {(["a", "b"] as const).map((k) => {
                    const chosen = mpPick === k;
                    const cls = !mpPick ? "" : chosen ? (k === mpTarget ? "ok" : "bad") : "";
                    return <button key={k} className={`mp-opt ${cls}`} onClick={() => guessMp(k)}>{mpPair[k]}</button>;
                  })}
                </div>
                {mpPick && (
                  <>
                    <p className="hint" style={{ marginTop: 8 }}>
                      {mpPick === mpTarget ? "听对了。" : `听错了——实际是 ${mpPair[mpTarget]}。`}
                    </p>
                    {mpPick !== mpTarget && (
                      <button className="mini" style={{ marginTop: 6 }} onClick={() => { mpArmed.current = true; loadMp(false); }}>
                        针对 {mpPair.focus} 再练一组
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Step>

      {/* ③ 场景实战 */}
      <Step status={s3} hidden={tab !== 2} active={tab === 2}>
        <TaskHead
          step="03" title="场景实战"
          goal="进一个现场，把一件事办成"
          right={<span className="th-progress">{scenarioDone ? "已复盘" : "未开始"}</span>}
        />
        <Scenario domain={domain} embedded onReviewed={(rev) => { setScenarioReview(rev); refreshScenarioDone(); }} />
      </Step>

      {/* ④ 复盘收尾 */}
      <Step status={s4} hidden={tab !== 3} active={tab === 3}>
        <TaskHead
          step="04" title="复盘收尾"
          goal="汇总今天四块，生成今日诊断"
          right={<span className="th-progress">{diagnosis ? (recapStale ? "待更新" : "已生成") : "待生成"}</span>}
        />
        <div className="recap-grid">
          <div className="recap-item"><b>{correctCount}/{items.length || "—"}</b><span>听辨</span></div>
          <div className="recap-item"><b>{avgScore ?? "—"}</b><span>跟读均分</span></div>
          <div className="recap-item"><b>{mpStat.total ? `${mpStat.ok}/${mpStat.total}` : "—"}</b><span>最小对立对</span></div>
          <div className="recap-item">
            <b style={{ color: sceneSuccess === false ? "var(--red)" : sceneSuccess === true ? "var(--green)" : undefined }}>{sceneMark}</b>
            <span>场景实战</span>
          </div>
        </div>

        <div className="divider">场景实战复盘</div>
        {scenarioReview ? (
          <div className="scene-review">
            <div className="row" style={{ gap: 10, marginBottom: 6 }}>
              <span className={`verdict ${scenarioReview.success ? "ok" : "bad"}`}>
                {scenarioReview.success ? "办成了" : "没办成"}
              </span>
              <span className="badge">{scenarioReview.source === "llm" ? "AI 复盘" : "本地复盘"}</span>
            </div>
            {scenarioReview.advice && <p className="hint"><RichText text={scenarioReview.advice} /></p>}
            {(scenarioReview.stuck || []).length > 0 && (
              <ul className="weak">
                {(scenarioReview.stuck || []).map((x: any, i: number) => (
                  <li key={i}><b>{x.type || "卡点"}</b>：{x.issue}{x.quote ? `（${x.quote}）` : ""}</li>
                ))}
              </ul>
            )}
            {(scenarioReview.achieved_skills || []).length > 0 && (
              <div className="row" style={{ marginTop: 6 }}>
                {scenarioReview.achieved_skills.map((k: string) => <span className="skill-chip" key={k}>{k}</span>)}
              </div>
            )}
          </div>
        ) : scenarioRecord ? (
          <div className="scene-review">
            <div className="row" style={{ gap: 10 }}>
              <span className={`verdict ${scenarioRecord.success ? "ok" : "bad"}`}>
                {scenarioRecord.success ? "办成了" : "没办成"}
              </span>
              {(scenarioRecord.skills || []).map((k: string) => <span className="skill-chip" key={k}>{k}</span>)}
            </div>
            {scenarioRecord.stuck_at && <p className="hint">卡点：{scenarioRecord.stuck_at}</p>}
          </div>
        ) : (
          <p className="hint">今天还没有完成场景实战复盘。</p>
        )}

        {diagnosis ? (
          <>
            <h3 style={{ marginTop: 0 }}>今日诊断 · {diagnosis.verdict}</h3>
            <p><RichText text={diagnosis.why} /></p>
            {(diagnosis.evidence || []).length > 0 && (
              <ul className="weak">
                {diagnosis.evidence.map((e: any, i: number) => (
                  <li key={i}><span className="evidence">{e.original}</span> — <RichText text={e.issue} /></li>
                ))}
              </ul>
            )}
            <p className="hint">明天重点：{(diagnosis.next_focus || []).join("、") || "—"}</p>
            <p className="hint"><RichText text={diagnosis.tomorrow_plan} /></p>
            <div className="row" style={{ marginTop: 10 }}>
              {recapStale && <span className="badge warn">上一轮复盘</span>}
              <AsyncButton className="btn sm" onClick={genRecap} loadingText="重新生成中…">
                重新生成复盘
              </AsyncButton>
              <span className="hint">新一轮练习后，重新汇总今天的数据</span>
            </div>
          </>
        ) : (
          <div className="task-bar">
            <AsyncButton className="btn recap-cta" onClick={genRecap} loadingText="生成中…">
              生成今日复盘
            </AsyncButton>
            <p className="hint">完成今天的练习，将给出今日诊断和明日计划。</p>
          </div>
        )}
      </Step>

      {/* ===== 参考 ===== */}
      <div className="work-head"><h2>参考</h2><span className="hint">当前画像重点</span></div>
      <div className="panel">
        <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="stat-card">
            <div className="k">听力盲区 <Tip text="你最常听错的语音现象，如弱读、连读、吞音。" /></div>
            <div className="hearing-chips">
              {(() => {
                const seen = new Set<string>();
                const list = (focus?.hearing || []).filter((h: any) => {
                  const k = h.name || h.rule_id;
                  if (!k || seen.has(k)) return false;
                  seen.add(k);
                  return true;
                }).slice(0, 3);
                return list.length ? list.map((h: any, i: number) => (
                  <span className="hchip" key={i}>
                    {h.name || h.rule_id}
                    {h.count ? <b>×{h.count}</b> : null}
                  </span>
                )) : <span className="hint">—</span>;
              })()}
            </div>
          </div>
          <div className="stat-card">
            <div className="k">哑巴词汇 <Tip text="看着认识、但听不出来的词：文字能懂，声音对不上意思。" /></div>
            <div className="v" style={{ fontSize: 16 }}>{(focus?.deaf_words || []).length} 个</div>
          </div>
          <div className="stat-card">
            <div className="k">待毕业 <Tip text="一项技能要在 3 个不同真实场合用成功，才算真正掌握（毕业）。" /></div>
            <div className="v" style={{ fontSize: 16 }}>{(focus?.ungraduated_skills || []).length} 项</div>
          </div>
        </div>
      </div>
    </section>
  );
}
