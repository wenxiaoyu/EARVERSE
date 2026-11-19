import { useEffect, useState } from "react";
import { api, onInflight } from "./api";
import Assessment from "./views/Assessment";
import Today from "./views/Today";
import Scenario from "./views/Scenario";
import Report from "./views/Report";
import Settings from "./views/Settings";
import About from "./views/About";
import NavIcon from "./components/NavIcon";
import SceneSelector from "./components/SceneSelector";

type Tab = "today" | "assess" | "scenario" | "report" | "settings" | "about";

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "assess", label: "测验" },
  { key: "scenario", label: "实战" },
  { key: "report", label: "报告" },
  { key: "settings", label: "设置" },
  { key: "about", label: "关于" },
];

const SCENES = [
  { key: "work", label: "职场" },
  { key: "travel", label: "出门" },
  { key: "interview", label: "面试" },
  { key: "social", label: "日常" },
];

const BARS = Array.from({ length: 44 }, (_, i) => ({
  h: 18 + Math.abs(Math.sin(i * 1.7)) * 72,
  delay: (i % 7) * 0.11,
  dur: 0.85 + (i % 5) * 0.16,
}));

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [domain, setDomain] = useState<string>("work");
  const [health, setHealth] = useState<{ llm_configured: boolean; model: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [inflight, setInflight] = useState(0);

  useEffect(() => onInflight(setInflight), []);

  // 鼠标聚光：记录光标位置到 CSS 变量
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = document.documentElement;
      el.style.setProperty("--mx", `${e.clientX}px`);
      el.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const refresh = () => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api
      .profile(domain)
      .then((p) => setConfirmed(Boolean(p?.profile?.assessments?.[domain]?.confirmed)))
      .catch(() => {});
  };
  useEffect(refresh, [domain, tab]);

  return (
    <>
      <div className={`reqbar ${inflight > 0 ? "active" : ""}`} />
      <div className="grain" />
      <div className="grill" />
      <div className="pulse" />
      <div className="spotlight" />
      <div className="glitch" />
      <div className="eq" aria-hidden>
        {BARS.map((b, i) => (
          <i key={i} style={{ height: `${b.h}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />
        ))}
      </div>

      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/logo.svg" alt="" />
          <span className="brand-text">
            耳界
            <small>EARVERSE · daily ear training · 1h</small>
          </span>
        </div>
        <div className="spacer" />
        <span className={`led req ${inflight > 0 ? "on" : ""}`}>
          <span className={`dot ${inflight > 0 ? "pulse" : ""}`} />
          {inflight > 0 ? "请求中…" : "就绪"}
        </span>
        <span className="led">
          <span className={`dot ${health?.llm_configured ? "g" : ""}`} />
          {health?.llm_configured ? "MODEL ✓" : "MODEL —"}
        </span>
        <span className="led">DAY {confirmed ? "ON" : "NEW"}</span>
      </header>

      <div className="shell">
        <nav className="rail">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`nav ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <span className="ico"><NavIcon name={t.key} /></span>
              {t.label}
              {t.key === "assess" && !confirmed && <span className="nd" />}
            </button>
          ))}
          <div className="rail-foot">
            <SceneSelector items={SCENES} value={domain} onChange={setDomain} maxInline={4} />
          </div>
        </nav>

        <main className="stage">
          {tab === "today" && (
            <Today domain={domain} confirmed={confirmed} goto={(t) => setTab(t as Tab)} />
          )}
          {tab === "assess" && (
            <Assessment domain={domain} onConfirmed={() => { setConfirmed(true); setTab("today"); }} />
          )}
          {tab === "scenario" && <Scenario domain={domain} />}
          {tab === "report" && <Report domain={domain} />}
          {tab === "settings" && <Settings onSaved={refresh} />}
          {tab === "about" && <About onStart={() => setTab("today")} />}
        </main>
      </div>
    </>
  );
}
