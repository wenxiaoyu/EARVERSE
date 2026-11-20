import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { playMira, stopMira } from "../voice";
import MascotAvatar from "../components/MascotAvatar";
import type { MiraGesture, MiraMood } from "../components/TeacherAvatar";
import { useVadRecorder } from "../components/useVadRecorder";

type Msg = { role: "user" | "assistant"; text: string; correction?: string };
type Summary = {
  summary?: string; wins?: string[]; gaps?: string[]; next_focus?: string[];
  saved?: boolean; english_only?: boolean;
};
type Brief = {
  today_goal?: { kind?: string; words?: string[]; hearing?: string[]; skills?: string[] };
  weak_hearing?: { rule: string; count: number }[];
  active_days_this_week?: number;
  recitation_level?: number;
};

export default function Coach({ domain, onExit }: { domain: string; onExit: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [brief, setBrief] = useState<Brief>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [mood, setMood] = useState<MiraMood>("warm");
  const [gesture, setGesture] = useState<MiraGesture>("wave");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ending, setEnding] = useState(false);
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const recorder = useVadRecorder();
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { liveRef.current = live; }, [live]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    let alive = true;
    api.coachStart(domain).then((r) => {
      if (!alive) return;
      setBrief(r.brief || {});
      setMessages([{ role: "assistant", text: r.greeting || "Hey, I'm Mira. Tell me about your day — in English." }]);
      setMood(r.mood || "warm");
      setGesture(r.gesture || "wave");
      // 进入 Live 直接开始收音，不需要点「开始」
      void beginListening();
    }).catch(() => {
      if (alive) {
        setMessages([{ role: "assistant", text: "Hey, I'm Mira. Tell me about your day — in English." }]);
        void beginListening();
      }
    });
    return () => { alive = false; };
  }, [domain]);

  useEffect(() => () => {
    stopMira();
    recorder.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));

  const playTeacher = async (line: string) => {
    setSpeaking(true); speakingRef.current = true;
    setAmplitude(0.2);
    try {
      await playMira(line, {
        style: "plain",
        onAmplitude: setAmplitude,
        onend: () => {
          setSpeaking(false); speakingRef.current = false; setAmplitude(0);
          setGesture("none");
          // Mira 说完后把高门限监听切回正常灵敏度
          if (liveRef.current && !busyRef.current) {
            recorder.stop();
            setListening(false); listeningRef.current = false;
            setTimeout(() => beginListening(), 220);
          }
        },
      });
    } catch {
      setSpeaking(false); speakingRef.current = false; setAmplitude(0);
      setGesture("none");
    }
  };

  const streamTurn = async (t: string, hist: any[], signal: AbortSignal, onDelta: (acc: string) => void) => {
    const res = await fetch("/api/coach/turn/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, text: t, history: hist }),
      signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let acc = "";
    let final: any = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!raw.startsWith("data:")) continue;
        const ev = JSON.parse(raw.slice(5).trim());
        if (ev.type === "delta") { acc += ev.text; onDelta(acc); }
        else if (ev.type === "done") { final = ev; }
      }
    }
    return final || { reply: acc || "Let's keep going in English.", mood: "warm", gesture: "nod", correction: "" };
  };

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busyRef.current) return;
    if (listeningRef.current) { recorder.stop(); setListening(false); }
    setText("");
    setMessages((m) => [...m, { role: "user", text: t }, { role: "assistant", text: "" }]);
    setBusy(true); busyRef.current = true;
    setMood("thinking"); setGesture("chin_tap"); setListening(false);
    const controller = new AbortController();
    abortRef.current = controller;
    // 全双工：模型还没生成时就开始监听，用户可插话并中止生成
    if (liveRef.current) await beginListening(true, true);
    const onDelta = (acc: string) => {
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, text: acc };
        return copy;
      });
    };
    try {
      const out = await streamTurn(t, history, controller.signal, onDelta);
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          role: "assistant",
          text: out.reply || "Let's keep going in English.",
          correction: out.correction || "",
        };
        return copy;
      });
      setMood(out.mood || "warm"); setGesture(out.gesture || "nod");
      setBusy(false); busyRef.current = false;
      await playTeacher(out.reply || "Let's keep going in English.");
    } catch (e) {
      const aborted = controller.signal.aborted || (e as any)?.name === "AbortError";
      setBusy(false); busyRef.current = false;
      if (!aborted) {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { role: "assistant", text: "I lost that one. Could you try again in English?" };
          return copy;
        });
        setMood("confused"); setGesture("shrug");
      }
      // 被插话打断：保留已生成的部分，等用户这句话说完自动发下一轮
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const bargeIn = () => {
    abortRef.current?.abort();
    if (speakingRef.current) stopMira();
    setSpeaking(false); speakingRef.current = false; setAmplitude(0);
    setMood("curious"); setGesture("lean_in");
  };

  const beginListening = async (high = false, allowBusy = false) => {
    if ((busyRef.current && !allowBusy) || listeningRef.current) return;
    setListening(true); listeningRef.current = true; setMood("curious"); setGesture("lean_in");
    // Mira 说话时提高门限，减少扬声器回声误触发；用户一开口就立即打断
    const threshold = high || speakingRef.current ? 0.035 : 0.018;
    try {
      await recorder.start(async (blob) => {
        setListening(false); listeningRef.current = false;
        try {
          const r = await api.speechAsr(blob);
          const said = String(r.text || "").trim();
          if (said) await send(said);
          else {
            setMood("confused"); setGesture("shrug");
            setMessages((m) => [...m, { role: "assistant", text: "I didn't catch that. Could you say it once more in English?" }]);
          }
        } catch {
          setMood("confused"); setGesture("shrug");
        }
      }, bargeIn, threshold);
    } catch {
      setListening(false); listeningRef.current = false; setLive(false); liveRef.current = false;
      setMessages((m) => [...m, { role: "assistant", text: "I need microphone access to listen. You can type in English instead." }]);
    }
  };

  const toggleMute = async () => {
    if (live) {
      setLive(false); liveRef.current = false; recorder.stop(); setListening(false); listeningRef.current = false;
      setMood("warm"); setGesture("none");
      return;
    }
    setLive(true); liveRef.current = true;
    await beginListening();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  const end = async () => {
    if (ending) return;
    setEnding(true);
    setLive(false); liveRef.current = false; recorder.stop(); setListening(false); listeningRef.current = false;
    stopMira();
    try {
      const r = await api.coachEnd(domain, history);
      setSummary(r || {});
    } catch {
      setSummary({ summary: "Thanks for talking with me. Keep practicing in English.", saved: false });
    } finally {
      setEnding(false);
    }
  };

  const focus = brief.today_goal?.words?.length
    ? brief.today_goal.words.slice(0, 2).join(" · ")
    : brief.weak_hearing?.[0]?.rule || "";

  return (
    <div className="coach-page">
      <div className="coach-head">
        <div>
          <div className="eyebrow">LIVE COACH · MIRA</div>
          <h1>和 Mira 聊聊。</h1>
          <p className="sub">她知道你的练习状态；只用英语和你说话。</p>
        </div>
        <div className="coach-head-right">
          <span className="coach-only">ENGLISH ONLY</span>
          <button className="btn sm ghost" onClick={() => setChatOpen((v) => !v)}>{chatOpen ? "收起对话" : "对话"}</button>
          <button className="btn sm" onClick={end} disabled={ending}>{ending ? "总结中…" : "结束对话"}</button>
        </div>
      </div>

      <div className={`coach-room ${chatOpen ? "talk-open" : ""}`}>
        <section className="coach-stage">
          <div className="coach-status">
            <span className={`live-dot ${listening || speaking ? "on" : ""}`} />
            {busy ? "Mira 思考中…" : speaking ? "Mira 说话中…" : listening ? "收音中…" : live ? "收音待命" : "已静音"}
          </div>
          <div className="coach-mascot">
            <MascotAvatar mood={mood} gesture={gesture} speaking={speaking} amplitude={amplitude} listening={listening} />
          </div>
          <div className="coach-context">
            {focus && <span>Focus · {focus}</span>}
            {brief.active_days_this_week != null && <span>{brief.active_days_this_week} active days this week</span>}
            {brief.recitation_level && <span>Recitation L{brief.recitation_level}</span>}
          </div>
        </section>

        {chatOpen ? (
          <section className="coach-talk">
            <div className="coach-talk-head">
              <span>对话</span>
              <button className="mini" onClick={() => setChatOpen(false)}>隐藏</button>
            </div>
            <div className="coach-messages" ref={scroller}>
              {messages.map((m, i) => (
                <div key={i} className={`coach-msg ${m.role}`}>
                  <div className="coach-bubble">
                    {m.text}
                    {m.correction && <div className="coach-better">Better: {m.correction}</div>}
                  </div>
                </div>
              ))}
              {busy && <div className="coach-typing"><i /><i /><i /></div>}
            </div>
            <div className="coach-controls">
              <button
                className={`coach-mic ${live ? "live" : ""} ${listening ? "listening" : ""}`}
                onClick={toggleMute}
                title={live ? "点击静音" : "点击恢复收音"}
              >
                <span className="mic-ico" />
                {live ? (listening ? "收音中…" : "收音待命") : "已静音"}
              </button>
              <form className="coach-input" onSubmit={submit}>
                <input
                  value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Or type in English…" aria-label="Type in English"
                />
                <button className="btn sm primary" type="submit" disabled={busy || speaking || !text.trim()}>Send</button>
              </form>
            </div>
            <p className="coach-hint">Mira only speaks English. 中文会被拒绝，并引导你用英语重说。</p>
          </section>
        ) : (
          <div className="coach-livebar">
            <button
              className={`coach-mic ${live ? "live" : ""} ${listening ? "listening" : ""}`}
              onClick={toggleMute}
              title={live ? "点击静音" : "点击恢复收音"}
            >
              <span className="mic-ico" />
              {live ? (listening ? "收音中…" : "收音待命") : "已静音"}
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="coach-summary-backdrop">
          <div className="coach-summary">
            <div className="eyebrow">SESSION DEBRIEF · {summary.saved ? "已回流学习档案" : "本地总结"}</div>
            <p className="cs-summary">{summary.summary || "Good session. Keep talking in English."}</p>
            {(summary.wins || []).length > 0 && (
              <div className="cs-block"><b>Wins</b>{summary.wins!.map((w, i) => <span key={i}>· {w}</span>)}</div>
            )}
            {(summary.gaps || []).length > 0 && (
              <div className="cs-block"><b>Gaps</b>{summary.gaps!.map((g, i) => <span key={i}>· {g}</span>)}</div>
            )}
            {(summary.next_focus || []).length > 0 && (
              <div className="cs-block"><b>Next focus</b>{summary.next_focus!.map((n, i) => <span key={i}>· {n}</span>)}</div>
            )}
            <div className="cs-actions">
              <button className="btn sm ghost" onClick={() => setSummary(null)}>继续聊聊</button>
              <button className="btn sm primary" onClick={onExit}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
