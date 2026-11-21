import AsyncButton from "../components/AsyncButton";
import { useEffect, useRef, useState } from "react";
import { api, speak } from "../api";
import { toast } from "../toast";
import RichText from "../components/RichText";
import ZhHint from "../components/ZhHint";
import { createWavRecorder } from "../wavRecorder";

type Scenario = { id: string; cat: string; title: string; goal: string; load: number };

const CAT_BY_DOMAIN: Record<string, string[]> = {
  work: ["work"],
  meeting: ["meeting"],
  client: ["client"],
  negotiate: ["negotiate"],
  report: ["report"],
  phone: ["phone"],
  email: ["email"],
  management: ["management"],
  collab: ["collab"],
  interview: ["interview"],
  travel: ["travel"],
  hotel: ["hotel"],
  airport: ["airport"],
  transit: ["transit"],
  dining: ["dining"],
  shopping: ["shopping"],
  medical: ["medical"],
  bank: ["bank"],
  rent: ["rent"],
  neighbor: ["neighbor"],
  complaint: ["complaint"],
  emergency: ["emergency"],
  networking: ["networking"],
  social: ["social"],
};
type Turn = { role: string; text: string; by_name?: string };

function initial(name?: string) {
  if (!name) return "你";
  return /[a-z]/i.test(name[0]) ? name[0].toUpperCase() : name[0];
}

function LoadLeds({ n }: { n: number }) {
  return (
    <span className="load-leds" title={`难度 ${n}`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} />
      ))}
    </span>
  );
}

export default function Scenario({
  domain, embedded = false, onReviewed,
}: {
  domain: string; embedded?: boolean; onReviewed?: (review: any) => void;
}) {
  const [list, setList] = useState<Scenario[]>([]);
  const [session, setSession] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [pronIdx, setPronIdx] = useState<number | null>(null);
  const [pronRec, setPronRec] = useState(false);
  const [pronBusy, setPronBusy] = useState(false);
  const [pronRes, setPronRes] = useState<Record<number, any>>({});
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const scenRec = useRef(createWavRecorder());
  const chatRecorder = useRef(createWavRecorder());
  const [chatRec, setChatRec] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatSec, setChatSec] = useState(0);
  const [chatErr, setChatErr] = useState("");

  useEffect(() => {
    api.scenarios(domain).then((r) => setList(r.items));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session]);

  useEffect(() => {
    if (!chatRec) return;
    setChatSec(0);
    const id = window.setInterval(() => setChatSec((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [chatRec]);

  const startWith = async (id: string) => {
    if (starting) return;
    setStarting(id);
    setReview(null);
    setShown({});
    setChatErr("");
    try {
      const r = await api.scenarioStart(id, domain);
      (window as any).__sid = r.session_id;
      setSession(r.session);
      const opener = r.session.history?.[0];
      if (opener) speak(opener.text, "real");
      toast("已进入场景");
    } finally {
      setStarting(null);
    }
  };

  const sessionGone = (e: any) => {
    const m = String(e?.message || "");
    return m.includes("404") || m.includes("会话");
  };
  const resetBroken = (msg: string) => {
    toast(msg);
    setSession(null);
    setReview(null);
    setChatErr("");
    (window as any).__sid = null;
  };

  const sendText = async (text: string) => {
    const t = text.trim();
    if (!t || !session || busy) return;
    setBusy(true);
    setSession((s: any) => ({ ...s, history: [...s.history, { role: "user", text: t }] }));
    try {
      const r = await api.scenarioSay((window as any).__sid, t);
      if (r?.error) { resetBroken("会话已失效，请重新选择场景"); return; }
      setSession(r.session);
      if (r.reply?.text) speak(r.reply.text, "real");
    } catch (e) {
      if (sessionGone(e)) resetBroken("会话已失效（服务可能重启过），请重新选择场景");
      else toast("发送失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const startChatRec = async () => {
    if (busy || chatBusy || chatRec) return;
    setChatErr("");
    try {
      await chatRecorder.current.start();
      setChatRec(true);
    } catch {
      toast("无法打开麦克风");
    }
  };
  const stopChatRec = async () => {
    if (!chatRec) return;
    setChatRec(false);
    setChatBusy(true);
    try {
      const blob = await chatRecorder.current.stop();
      if (blob.size < 1200) { toast("录音太短，请说完再停"); return; }
      const r = await api.speechAsr(blob);
      if (r?.error) { setChatErr(String(r.error)); toast("语音识别失败"); return; }
      const text = String(r?.text || "").trim();
      if (!text) { toast("没听清，再说一遍"); return; }
      await sendText(text);
    } catch {
      toast("语音发送失败，请重试");
    } finally {
      setChatBusy(false);
    }
  };

  const finish = async () => {
    try {
      const r = await api.scenarioReview((window as any).__sid);
      if (r?.error) { resetBroken("会话已失效，请重新选择场景"); return; }
      setReview(r.review);
      onReviewed?.(r.review);
      toast("已复盘");
    } catch (e) {
      if (sessionGone(e)) resetBroken("会话已失效（服务可能重启过），请重新选择场景");
      else toast("复盘失败，请重试");
    }
  };

  const startPhraseRec = async (i: number) => {
    try {
      await scenRec.current.start();
      setPronIdx(i);
      setPronRec(true);
    } catch {
      toast("无法打开麦克风");
    }
  };
  const stopPhraseRec = async () => {
    setPronRec(false);
    setPronBusy(true);
    try {
      const blob = await scenRec.current.stop();
      const i = pronIdx;
      if (i == null) return;
      const phrase = (session?.phrases || [])[i] || "";
      const r = await api.pronunciationAssess(blob, domain, phrase);
      setPronRes((p) => ({ ...p, [i]: r }));
    } finally {
      setPronBusy(false);
    }
  };

  return (
    <section className={embedded ? "embedded-scenario" : ""}>
      {!embedded && <p className="screen-tag">Screen 03 — 实战 · Broadcast</p>}

      {!session && (
        <>
          {!embedded && (
            <>
              <p className="screen-tag">Screen 03 — 实战 · Broadcast</p>
              <h1>进一个现场，把事办成。</h1>
              <p className="sub">在场的人各有立场，没人替你说话。挑一个场景进去。</p>
            </>
          )}
          <div className="scenario-grid">
            {list.filter((s) => (CAT_BY_DOMAIN[domain] || []).includes(s.cat)).map((s) => (
              <button className="panel sc-card" key={s.id} disabled={starting !== null} onClick={() => startWith(s.id)}>
                <div className="sc-top">
                  <b>{s.title}</b>
                  <LoadLeds n={s.load} />
                </div>
                <div className="sc-goal">{s.goal}</div>
                <span className="sc-enter">{starting === s.id ? "进入中…" : "进入 →"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {session && (
        <div className="panel">
          <div className="chat-head">
            <b>{session.title}</b>
            <span className="hint">目标：{session.goal}</span>
          </div>

          <div className="turns">
            {(session.history || []).map((t: Turn, i: number) => {
              const mine = t.role === "user";
              const open = mine || Boolean(shown[i]);
              return (
                <div className={`turn-row ${t.role}`} key={i}>
                  <span className="avatar">{initial(t.by_name)}</span>
                  <div className={`bubble ${t.role}`}>
                    {t.by_name && <span className="who">{t.by_name}</span>}
                    {open ? (
                      <span className="bubble-text">{t.text}</span>
                    ) : (
                      <span className="bubble-mask">英文已隐藏 · 先听再说</span>
                    )}
                    {!mine && <ZhHint text={t.text} />}
                    {!mine && (
                      <span className="turn-tools">
                        <button className="mini" onClick={() => speak(t.text, "real")}>▶ 重播</button>
                        <button
                          className="mini"
                          onClick={() => setShown((v) => ({ ...v, [i]: !v[i] }))}
                        >
                          {open ? "隐藏英文" : "显示英文"}
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="compose voice-compose">
            {chatRec ? (
              <button className="btn primary rec" onClick={stopChatRec}>
                <span className="rec-dot" /> 录音中 {Math.floor(chatSec / 60)}:{String(chatSec % 60).padStart(2, "0")} · 点此结束
              </button>
            ) : (
              <button className="btn primary" disabled={busy || chatBusy} onClick={startChatRec}>
                {chatBusy ? "识别中…" : busy ? "发送中…" : "🎤 点击说话"}
              </button>
            )}
            <AsyncButton className="btn ghost" onClick={finish} loadingText="复盘中…">结束复盘</AsyncButton>
          </div>
          {chatErr && <p className="hint" style={{ color: "var(--red)" }}>{chatErr}</p>}
          <p className="hint" style={{ marginTop: 6 }}>直接说英语，再点一次结束并发送。</p>
        </div>
      )}

      {review && (
        <div className="panel">
          <div className="chat-head">
            <div className={`verdict ${review.success ? "ok" : "bad"}`}>
              {review.success ? "办成了" : "没办成"}
            </div>
            <span className="badge">{review.source === "llm" ? "AI 复盘" : "本地复盘"}</span>
          </div>
          {review.advice && <p><RichText text={review.advice} /></p>}

          {(review.stuck || []).length > 0 && (
            <>
              <div className="divider">卡点</div>
              <ul className="stuck">
                {review.stuck.map((s: any, i: number) => (
                  <li key={i}>
                    <span className={`tag-${s.type}`}>{s.type}</span>
                    <span className="q">{s.quote}</span>
                    <span className="issue">{s.issue}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="divider">办成的功能</div>
          <div className="row">
            {(review.achieved_skills || []).length ? (
              review.achieved_skills.map((k: string) => (
                <span className="skill-chip" key={k}>{k}</span>
              ))
            ) : (
              <span className="hint">这次没有办成任何功能，再试一次。</span>
            )}
          </div>

          {(session?.phrases || []).length > 0 && (
            <>
              <div className="divider">练这句发音</div>
              <ul className="phrase-list">
                {(session.phrases as string[]).map((p, i) => (
                  <li key={i}>
                    <span className="q"><RichText text={p} /></span>
                    <button className="p-play" onClick={() => speak(p, "real")}>▶</button>
                    {pronRec && pronIdx === i ? (
                      <button className="btn sm" onClick={stopPhraseRec}>停止评分</button>
                    ) : (
                      <button className="btn sm" disabled={pronBusy} onClick={() => startPhraseRec(i)}>🎤 跟读</button>
                    )}
                    {pronRes[i] && !pronRes[i].error && <span className="score">{pronRes[i].score}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => { setSession(null); setReview(null); }}>
              再挑一个场景
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
