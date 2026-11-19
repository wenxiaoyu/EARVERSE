import { useEffect, useState } from "react";
import { api, onInflight } from "./api";
import Assessment from "./views/Assessment";
import Today from "./views/Today";
import Scenario from "./views/Scenario";
import Report from "./views/Report";
import Settings from "./views/Settings";
import About from "./views/About";
import NavIcon from "./components/NavIcon";
import SceneDropdown from "./components/SceneDropdown";

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
  { key: "meeting", label: "会议" },
  { key: "client", label: "客户" },
  { key: "negotiate", label: "谈判" },
  { key: "report", label: "汇报" },
  { key: "phone", label: "电话" },
  { key: "email", label: "邮件" },
  { key: "management", label: "管理" },
  { key: "collab", label: "协作" },
  { key: "interview", label: "面试" },
  { key: "travel", label: "出门" },
  { key: "hotel", label: "酒店" },
  { key: "airport", label: "机场" },
  { key: "transit", label: "交通" },
  { key: "dining", label: "餐饮" },
  { key: "shopping", label: "购物" },
  { key: "medical", label: "医疗" },
  { key: "bank", label: "银行" },
  { key: "rent", label: "租房" },
  { key: "neighbor", label: "邻里" },
  { key: "complaint", label: "投诉" },
  { key: "emergency", label: "紧急" },
  { key: "networking", label: "活动" },
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
        <button
          className={`led model-led ${health?.llm_configured ? "" : "warn"}`}
          onClick={() => setTab("settings")}
          title={health?.llm_configured ? "模型已配置" : "未配置模型，点击去配置"}
        >
          <span className={`dot ${health?.llm_configured ? "g" : "pulse"}`} />
          {health?.llm_configured ? "MODEL ✓" : "接入 AI →"}
        </button>
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
            <SceneDropdown items={SCENES} value={domain} onChange={setDomain} />
          </div>
        </nav>

        <main className="stage">
          {health && !health.llm_configured && tab !== "settings" && (
            <div className="model-warn" role="alert">
              <span className="mw-bang">!</span>
              <div className="mw-text">
                <b>还没接入 AI 教练</b>
                <span>现在看到的是演示内容，不会随你变化。填入 DeepSeek Key，AI 会读懂你的短板，为你出题、判卷、纠正发音，并在场景里陪你对话。</span>
              </div>
              <button className="btn primary sm" onClick={() => setTab("settings")}>接入 AI →</button>
            </div>
          )}

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
