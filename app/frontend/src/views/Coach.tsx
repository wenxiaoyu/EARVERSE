import { FormEvent, useEffect, useRef, useState } from "react";
import { api, speak } from "../api";
import TeacherAvatar, { type MiraGesture, type MiraMood } from "../components/TeacherAvatar";
import { useVadRecorder } from "../components/useVadRecorder";

type Msg = { role: "user" | "assistant"; text: string; correction?: string };
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
  const [live, setLive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [mood, setMood] = useState<MiraMood>("warm");
  const [gesture, setGesture] = useState<MiraGesture>("wave");
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const playRef = useRef<{ audio: HTMLAudioElement; ctx?: AudioContext; raf?: number; url?: string } | null>(null);
  const recorder = useVadRecorder();
  const scroller = useRef<HTMLDivElement>(null);

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
    }).catch(() => {
      if (alive) setMessages([{ role: "assistant", text: "Hey, I'm Mira. Tell me about your day — in English." }]);
    });
    return () => { alive = false; };
  }, [domain]);

  useEffect(() => () => {
    const p = playRef.current;
    if (p) {
      if (p.raf) cancelAnimationFrame(p.raf);
      p.audio.pause();
      if (p.url) URL.revokeObjectURL(p.url);
      p.ctx?.close().catch(() => {});
    }
    recorder.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));

  const playTeacher = async (line: string) => {
    setSpeaking(true); speakingRef.current = true;
    setAmplitude(0.2);
    try {
      const blob = await api.speechTts(line);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaElementSource(audio);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      an.connect(ctx.destination);
      const p = { audio, ctx, url } as NonNullable<typeof playRef.current>;
      playRef.current = p;
      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        setAmplitude(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        p.raf = requestAnimationFrame(tick);
      };
      audio.onended = () => {
        if (p.raf) cancelAnimationFrame(p.raf);
        setSpeaking(false); speakingRef.current = false; setAmplitude(0);
        setGesture("none");
        if (playRef.current === p) playRef.current = null;
        URL.revokeObjectURL(url);
        ctx.close().catch(() => {});
        if (liveRef.current && !busyRef.current) setTimeout(() => beginListening(), 220);
      };
      await audio.play();
      tick();
    } catch {
      // 服务端 TTS 不可用时回退浏览器英文音色
      speak(line, "plain");
      setSpeaking(true);
      setTimeout(() => {
        setSpeaking(false); speakingRef.current = false; setAmplitude(0); setGesture("none");
        if (liveRef.current && !busyRef.current) setTimeout(() => beginListening(), 220);
      }, Math.min(12000, line.length * 65));
    }
  };

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busyRef.current) return;
    if (listeningRef.current) { recorder.stop(); setListening(false); }
    setText("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    setBusy(true); busyRef.current = true;
    setMood("thinking"); setGesture("chin_tap"); setListening(false);
    try {
      const out = await api.coachTurn(domain, t, history);
      setMessages((m) => [...m, {
        role: "assistant", text: out.reply || "Let's keep going in English.",
        correction: out.correction || "",
      }]);
      setMood(out.mood || "warm"); setGesture(out.gesture || "nod");
      setBusy(false); busyRef.current = false;
      await playTeacher(out.reply || "Let's keep going in English.");
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I lost that one. Could you try again in English?" }]);
      setMood("confused"); setGesture("shrug"); setBusy(false); busyRef.current = false;
    }
  };

  const beginListening = async () => {
    if (busyRef.current || listeningRef.current || speakingRef.current) return;
    setListening(true); listeningRef.current = true; setMood("curious"); setGesture("lean_in");
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
      });
    } catch {
      setListening(false); listeningRef.current = false; setLive(false); liveRef.current = false;
      setMessages((m) => [...m, { role: "assistant", text: "I need microphone access to listen. You can type in English instead." }]);
    }
  };

  const toggleLive = async () => {
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

  const end = () => {
    setLive(false); liveRef.current = false; recorder.stop(); setListening(false); listeningRef.current = false;
    const p = playRef.current;
    if (p) { p.audio.pause(); if (p.raf) cancelAnimationFrame(p.raf); }
    onExit();
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
          <button className="btn sm" onClick={end}>结束对话</button>
        </div>
      </div>

      <div className="coach-room">
        <section className="coach-stage">
          <div className="coach-status">
            <span className={`live-dot ${listening || speaking ? "on" : ""}`} />
            {busy ? "Mira is thinking…" : speaking ? "Mira is speaking…" : listening ? "Listening…" : live ? "Live" : "Ready"}
          </div>
          <TeacherAvatar mood={mood} gesture={gesture} speaking={speaking} amplitude={amplitude} listening={listening} />
          <div className="coach-context">
            {focus && <span>Focus · {focus}</span>}
            {brief.active_days_this_week != null && <span>{brief.active_days_this_week} active days this week</span>}
            {brief.recitation_level && <span>Recitation L{brief.recitation_level}</span>}
          </div>
        </section>

        <section className="coach-talk">
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
              onClick={toggleLive}
              title={live ? "停止聆听" : "开始说话"}
            >
              <span className="mic-ico" />
              {live ? (listening ? "Listening…" : "Stop") : "开始说话"}
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
      </div>
    </div>
  );
}
