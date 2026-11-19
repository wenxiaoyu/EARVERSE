import AsyncButton from "../components/AsyncButton";
import { useEffect, useState } from "react";
import { api } from "../api";
import RichText from "../components/RichText";
import Tip from "../components/Tip";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function mondayOf(date: string) {
  const d = new Date(date + "T00:00:00");
  return addDays(date, -((d.getDay() + 6) % 7));
}

const VOCAB = [
  { key: "automatic", label: "已自动化", color: "#7FB069" },
  { key: "recognized", label: "能懂但慢", color: "#E8A33D" },
  { key: "deaf", label: "哑巴词汇", color: "#D9544D" },
  { key: "unknown", label: "不认识", color: "#6b6459" },
];

function Bars({
  rows, max, suffix, color,
}: { rows: { label: string; value: number }[]; max?: number; suffix?: string; color?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-list">
      {rows.map((r, i) => (
        <div className="bar-row" key={i} title={`${r.label} ${r.value}`}>
          <span className="lab">{r.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${color || ""}`} style={{ width: `${Math.min(100, (r.value / m) * 100)}%` }} />
          </div>
          <span className="val">{r.value}{suffix || ""}</span>
        </div>
      ))}
    </div>
  );
}

export default function Report({ domain }: { domain: string }) {
  const [period, setPeriod] = useState("week");
  const [report, setReport] = useState<any>(null);
  const [view, setView] = useState<any>({});
  const [skillLabel, setSkillLabel] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const now0 = new Date();
  const todayStr = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, "0")}-${String(now0.getDate()).padStart(2, "0")}`;
  const [calMonth, setCalMonth] = useState(todayStr.slice(0, 7));
  const [calDays, setCalDays] = useState<Record<string, any>>({});
  const [selDate, setSelDate] = useState(todayStr);
  const [detail, setDetail] = useState<any>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [subTab, setSubTab] = useState<"overview" | "calendar">("overview");
  const [calMode, setCalMode] = useState<"day" | "week" | "month">("month");
  const [weekMap, setWeekMap] = useState<Record<string, any>>({});

  const loadReport = async () => {
    setLoading(true);
    try { setReport(await api.report(domain, period)); }
    finally { setLoading(false); }
  };
  const loadProfile = () => {
    api.profile(domain).then((p) => setView(p?.domain_view || {})).catch(() => {});
  };

  useEffect(() => {
    loadReport();
    loadProfile();
  }, [domain, period]);

  useEffect(() => {
    api.dailyCalendar(domain, calMonth).then((r) => {
      const map: Record<string, any> = {};
      (r.days || []).forEach((d: any) => { map[d.date] = d; });
      setCalDays(map);
    }).catch(() => setCalDays({}));
  }, [domain, calMonth]);

  useEffect(() => {
    setDetailBusy(true);
    api.dailyDetail(domain, selDate).then(setDetail).catch(() => setDetail(null))
      .finally(() => setDetailBusy(false));
  }, [domain, selDate]);

  useEffect(() => {
    if (calMode !== "week") return;
    const start = mondayOf(selDate);
    const end = addDays(start, 6);
    api.dailyRange(domain, start, end).then((r) => {
      const map: Record<string, any> = {};
      (r.days || []).forEach((d: any) => { map[d.date] = d; });
      setWeekMap(map);
    }).catch(() => setWeekMap({}));
  }, [domain, selDate, calMode]);

  useEffect(() => {
    api.seed("skills").then((r) => {
      const map: Record<string, string> = {};
      (r.items || []).forEach((s: any) => { map[s.id] = s.label || s.id; });
      setSkillLabel(map);
    }).catch(() => {});
  }, []);

  const vocab = view.vocab || {};
  const counts: Record<string, number> = { automatic: 0, recognized: 0, deaf: 0, unknown: 0 };
  Object.values(vocab).forEach((e: any) => { const s = e?.state || "unknown"; counts[s] = (counts[s] || 0) + 1; });
  const vTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const masteryRate = vTotal ? Math.round(((counts.automatic + counts.recognized) / vTotal) * 100) : 0;

  const hearing = Object.entries(view.hearing || {})
    .map(([id, info]: any) => ({ label: info?.name || id, value: info?.count || 0 }))
    .sort((a, b) => b.value - a.value).slice(0, 6);
  const avoidance = Object.entries(view.avoidance || {})
    .map(([id, info]: any) => ({ label: skillLabel[id] || id, value: info?.count || 0 }))
    .sort((a, b) => b.value - a.value).slice(0, 6);
  const pronRows = Object.values(view.pronunciation || {})
    .filter((p: any) => p && typeof p.score === "number")
    .map((p: any) => ({ label: (p.target || "").slice(0, 18) + (p.target?.length > 18 ? "…" : ""), value: Math.round(p.score) }))
    .slice(0, 6);

  const skillVenues = view.skill_venues || {};
  const grad = Object.entries(skillVenues).map(([id, venues]: any) => ({
    id, label: skillLabel[id] || id, n: Array.isArray(venues) ? venues.length : 0,
  })).sort((a, b) => b.n - a.n);
  const graduated = grad.filter((g) => g.n >= 3).length;
  const ungraduated = grad.length - graduated;

  const errors = (view.errors || []).slice(-8).reverse();

  const [calY, calM] = calMonth.split("-").map(Number);
  const lead = (new Date(calY, calM - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calY, calM, 0).getDate();
  const calCells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${calMonth}-${String(i + 1).padStart(2, "0")}`),
  ];
  const shiftMonth = (delta: number) => {
    const d = new Date(calY, calM - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const history = (view.history || []).slice(-7).map((h: any) => ({
    date: String(h.date || "").slice(5),
    acc: Math.round((h.accuracy || 0) * 100),
    total: h.total || 0,
  }));

  const weekStartDate = mondayOf(selDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const calTitle = calMode === "month" ? calMonth : calMode === "week" ? `${weekDates[0]} ~ ${weekDates[6]}` : selDate;
  const navCal = (delta: number) => {
    if (calMode === "month") shiftMonth(delta);
    else if (calMode === "week") setSelDate(addDays(selDate, delta * 7));
    else setSelDate(addDays(selDate, delta));
  };

  const dayDetail = (
      <div className="panel cal-detail">
        <div className="block-head">
          <h2 style={{ margin: 0 }}>{selDate} · 当日复盘</h2>
          <span className="hint">{detailBusy ? "加载中…" : detail?.practiced ? "已练习" : "无记录"}</span>
        </div>
        {detail?.practiced ? (
          <>
            <div className="recap-grid" style={{ marginTop: 10 }}>
              <div className="recap-item"><b>{detail.blocks.listening.correct}/{detail.blocks.listening.total}</b><span>听辨</span></div>
              <div className="recap-item"><b>{detail.blocks.shadow.avg ?? "—"}</b><span>跟读均分</span></div>
              <div className="recap-item"><b>{detail.blocks.minimal_pairs.total ? `${detail.blocks.minimal_pairs.ok}/${detail.blocks.minimal_pairs.total}` : "—"}</b><span>对立对</span></div>
              <div className="recap-item"><b>{detail.blocks.scenario.done ? (detail.blocks.scenario.success ? "✓" : "✗") : "—"}</b><span>场景实战</span></div>
            </div>

            {detail.recap?.diagnosis ? (
              <>
                <div className="divider">AI 复盘</div>
                <p className="hint">判断：{detail.recap.diagnosis.verdict}</p>
                <p><RichText text={detail.recap.diagnosis.why} /></p>
                {(detail.recap.diagnosis.next_focus || []).length > 0 && (
                  <p className="hint">重点：{detail.recap.diagnosis.next_focus.join("、")}</p>
                )}
                {detail.recap.diagnosis.tomorrow_plan && (
                  <p className="hint">明日计划：<RichText text={detail.recap.diagnosis.tomorrow_plan} /></p>
                )}
              </>
            ) : (
              <>
                <div className="divider">当日建议</div>
                {(detail.advice || []).length ? (
                  <ul className="weak">
                    {detail.advice.map((a: string, i: number) => <li key={i}><RichText text={a} /></li>)}
                  </ul>
                ) : <p className="hint">这天没有足够记录生成建议。</p>}
              </>
            )}

            {(detail.blocks.errors || []).length > 0 && (
              <>
                <div className="divider">错误 / 卡点</div>
                <ul className="weak">
                  {detail.blocks.errors.slice(0, 8).map((e: any, i: number) => (
                    <li key={i}><span className="evidence">{e.original}</span> — {e.issue || e.detail || "答错"}</li>
                  ))}
                </ul>
              </>
            )}

            {(detail.blocks.shadow.issues || []).length > 0 && (
              <>
                <div className="divider">发音问题</div>
                <ul className="weak">
                  {detail.blocks.shadow.issues.slice(0, 6).map((x: any, i: number) => (
                    <li key={i}><b>{x.sound || x.word}</b>{x.heard_as ? ` → ${x.heard_as}` : ""} · {x.tip}</li>
                  ))}
                </ul>
              </>
            )}

            {detail.blocks.scenario.done && (
              <>
                <div className="divider">场景实战</div>
                {detail.blocks.scenario.records.map((r: any, i: number) => (
                  <p className="hint" key={i}>
                    {r.success ? "办成了" : "没办成"} · {(r.skills || []).join("、") || "—"}
                    {r.stuck_at ? ` · 卡点：${r.stuck_at}` : ""}
                  </p>
                ))}
              </>
            )}
          </>
        ) : (
          <p className="empty">这一天还没有练习记录。</p>
        )}
      </div>
  );

  return (
    <section>
      <p className="screen-tag">Screen 04 — 教练报告 · Field Print</p>
      <h1>你在变好吗？</h1>
      <p className="sub">掌握构成、盲区、发音、毕业进度，一眼看清。</p>

      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={subTab === "overview" ? "on" : ""} onClick={() => setSubTab("overview")}>概览</button>
        <button className={subTab === "calendar" ? "on" : ""} onClick={() => setSubTab("calendar")}>日历</button>
      </div>

      {subTab === "overview" && (
      <>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">
          <button className={period === "week" ? "on" : ""} onClick={() => setPeriod("week")}>本周</button>
          <button className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>本月</button>
        </div>
        <AsyncButton className="btn sm" onClick={async () => { await loadReport(); loadProfile(); }} loadingText="生成中…">
          刷新
        </AsyncButton>
      </div>

      {/* KPI */}
      <div className="kpi-grid">
        <div className="stat-card">
          <div className="k">趋势</div>
          <div className="v" style={{ fontSize: 22 }}>
            {report ? <span className={`trend ${report.trend}`}>{report.trend}</span> : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="k">词汇掌握率</div>
          <div className="v" style={{ color: "var(--green)" }}>{masteryRate}%</div>
        </div>
        <div className="stat-card">
          <div className="k">哑巴词汇 <Tip text="看着认识、但听不出来的词：文字能懂，声音对不上意思。" /></div>
          <div className="v" style={{ color: "var(--red)" }}>{counts.deaf}</div>
        </div>
        <div className="stat-card">
          <div className="k">待毕业技能 <Tip text="一项技能要在 3 个不同真实场合用成功，才算真正掌握（毕业）。" /></div>
          <div className="v" style={{ color: "var(--amber)" }}>{ungraduated}</div>
        </div>
      </div>

      {/* 近 7 天趋势 */}
      <div className="panel">
        <div className="block-head">
          <h2 style={{ margin: 0 }}>近 7 天掌握率</h2>
          <span className="hint">每天交卷后的正确率</span>
        </div>
        {history.length ? (
          <div className="trend7">
            {history.map((h: any, i: number) => (
              <div className="t7-col" key={i} title={`${h.date} · ${h.acc}%（${h.total} 题）`}>
                <span className="t7-val">{h.acc}%</span>
                <div className="t7-bar" style={{ height: `${Math.max(2, h.acc)}%` }} />
                <span className="t7-x">{h.date}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">练几天后，这里会出现你的掌握率趋势。</p>
        )}
      </div>

      {/* 掌握构成 + 听力盲区 */}
      <div className="two-panel">
        <div className="panel">
          <h2>词汇掌握构成</h2>
          {vTotal ? (
            <>
              <div className="mastery-bar">
                {VOCAB.map((s) => counts[s.key] ? (
                  <i key={s.key} style={{ width: `${(counts[s.key] / vTotal) * 100}%`, background: s.color }} />
                ) : null)}
              </div>
              <div className="legend">
                {VOCAB.map((s) => (
                  <span key={s.key}><i style={{ background: s.color }} />{s.label} <b>{counts[s.key]}</b></span>
                ))}
              </div>
            </>
          ) : <p className="empty">还没有词汇数据，先做一次测验。</p>}
        </div>

        <div className="panel">
          <h2>听力盲区 Top <Tip text="你最常听错的语音现象，如弱读、连读、吞音。" /></h2>
          {hearing.length ? <Bars rows={hearing} suffix=" 次" /> : <p className="empty">暂无盲区记录。</p>}
        </div>
      </div>

      {/* 发音 + 表达回避 */}
      <div className="two-panel">
        <div className="panel">
          <h2>发音评分</h2>
          {pronRows.length ? <Bars rows={pronRows} max={100} color="green" /> : <p className="empty">还没做过发音练习。去「今天 · 跟读」试试。</p>}
        </div>
        <div className="panel">
          <h2>表达回避</h2>
          {avoidance.length ? <Bars rows={avoidance} suffix=" 次" /> : <p className="empty">暂无回避记录。</p>}
        </div>
      </div>

      {/* 毕业进度 */}
      <div className="panel">
        <div className="block-head">
          <h2 style={{ margin: 0 }}>技能毕业进度</h2>
          <span className="hint">{graduated} 已毕业 / {grad.length} 在练 · 每项需 3 个不同场合</span>
        </div>
        {grad.length ? (
          <div style={{ marginTop: 8 }}>
            {grad.map((g) => (
              <div className="grad-row" key={g.id}>
                <span>{g.label}</span>
                <span className="grad-dots">
                  {[0, 1, 2].map((i) => <i key={i} className={i < g.n ? "on" : ""} />)}
                </span>
                <span className="hint">{Math.min(g.n, 3)}/3</span>
              </div>
            ))}
          </div>
        ) : <p className="empty">还没有办成过的技能。去「实战」把一件事办成。</p>}
      </div>

      {/* 错误原句表 */}
      <div className="panel">
        <h2>最近的错误原句</h2>
        {errors.length ? (
          <table className="err-table">
            <thead><tr><th>类型</th><th>原句</th><th>备注</th></tr></thead>
            <tbody>
              {errors.map((e: any, i: number) => (
                <tr key={i}>
                  <td className="hint">{e.kind || "—"}</td>
                  <td className="q">{e.original || "—"}</td>
                  <td className="hint"><RichText text={e.detail || ""} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">暂无错误记录。</p>}
      </div>

      {/* AI 结论（精简） */}
      {report && (
        <div className="panel">
          <div className="block-head">
            <h2 style={{ margin: 0 }}>{report.headline}</h2>
            <span className="badge">{report.source === "llm" ? "AI" : "本地"}</span>
          </div>
          <div className="findings">
            {(report.sections || []).map((s: any, i: number) => (
              <div className="finding" key={i}>
                <div className="finding-t">{s.title}</div>
                <div className="finding-b">
                  <RichText text={s.finding} />
                  {s.evidence && <span className="ev"><RichText text={s.evidence} /></span>}
                  {s.action && <span className="act">→ <RichText text={s.action} /></span>}
                </div>
              </div>
            ))}
          </div>
          {(report.next_week || []).length > 0 && (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
              {report.next_week.map((n: string, i: number) => (
                <span className="skill-chip" key={i}><RichText text={n} /></span>
              ))}
            </div>
          )}
        </div>
      )}

      </>
      )}

      {subTab === "calendar" && (
      <>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <div className="seg">
            <button className={calMode === "day" ? "on" : ""} onClick={() => setCalMode("day")}>日</button>
            <button className={calMode === "week" ? "on" : ""} onClick={() => setCalMode("week")}>周</button>
            <button className={calMode === "month" ? "on" : ""} onClick={() => setCalMode("month")}>月</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="mini" onClick={() => navCal(-1)}>‹</button>
            <span className="cal-month">{calTitle}</span>
            <button className="mini" onClick={() => navCal(1)}>›</button>
          </div>
        </div>

        {calMode === "month" && (
          <div className="panel">
            <div className="cal-week">
              {["一", "二", "三", "四", "五", "六", "日"].map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="cal-grid">
              {calCells.map((date, i) => {
                if (!date) return <span key={`e${i}`} />;
                const info = calDays[date];
                return (
                  <button
                    key={date}
                    className={`cal-cell ${info?.practiced ? "practiced" : ""} ${date === todayStr ? "today" : ""} ${date === selDate ? "sel" : ""}`}
                    onClick={() => setSelDate(date)}
                    title={info?.practiced ? `${date} · 已练习` : date}
                  >
                    <span className="cal-d">{Number(date.slice(8))}</span>
                    {info?.practiced && <span className="cal-dot" />}
                  </button>
                );
              })}
            </div>
            <div className="cal-legend">
              <span><i className="l-done" /> 已练习</span>
              <span><i className="l-today" /> 今天</span>
            </div>
          </div>
        )}

        {calMode === "week" && (
          <div className="panel">
            <div className="wk-grid">
              {weekDates.map((date) => {
                const info = weekMap[date];
                const dow = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][(new Date(date + "T00:00:00").getDay() + 6) % 7];
                return (
                  <button
                    key={date}
                    className={`wk-day ${info?.practiced ? "practiced" : ""} ${date === selDate ? "sel" : ""}`}
                    onClick={() => { setSelDate(date); setCalMode("day"); }}
                  >
                    <span className="wk-dow">{dow}</span>
                    <span className="wk-num">{Number(date.slice(8))}</span>
                    {info?.practiced ? (
                      <span className="wk-stats">{info.correct}/{info.listening} · {info.shadow}句{info.scenario ? " · 实战" : ""}</span>
                    ) : <span className="wk-none">未练习</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {dayDetail}
      </>
      )}
    </section>
  );
}
