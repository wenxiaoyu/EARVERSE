import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SceneItem = { key: string; label: string };
export type SceneGroup = { label: string; keys: string[] };

type ResolvedGroup = { label: string; items: SceneItem[] };

/** 左侧「训练场景」：从导航右侧滑出的抽屉，层级高于页面与弹层。 */
export default function SceneDrawer({
  items, groups, value, onChange, label = "训练场景",
}: {
  items: SceneItem[];
  groups?: SceneGroup[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 80, maxHeight: 600 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const current = items.find((i) => i.key === value) || items[0];

  const close = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      btnRef.current?.focus();
    }, 160);
  }, [open, closing]);

  const openDrawer = () => {
    if (open) return;
    const btn = btnRef.current;
    const rect = btn?.getBoundingClientRect();
    const rail = btn?.closest(".rail")?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = vw <= 760;
    const width = Math.min(470, vw - 24);
    const left = mobile ? 12 : Math.min((rail?.right ?? rect?.right ?? 240) + 12, vw - width - 12);
    const top = mobile ? 76 : Math.max(16, rail?.top ?? rect?.top ?? 80);
    setPos({ left, top, maxHeight: Math.max(260, vh - top - 20) });
    setOpen(true);
    setClosing(false);
    window.setTimeout(() => panelRef.current?.focus(), 30);
  };

  // Esc 关闭 + 打开时锁滚动 + 焦点管理
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  // 视口变化时关闭，避免抽屉漂到屏幕外
  useEffect(() => {
    if (!open) return;
    const onResize = () => close();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, close]);

  useEffect(() => () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
  }, []);

  const choose = (key: string) => {
    onChange(key);
    close();
  };

  const byKey = new Map(items.map((i) => [i.key, i]));
  const used = new Set<string>();
  const resolved: ResolvedGroup[] = [];
  for (const g of groups || []) {
    const list = g.keys.map((k) => byKey.get(k)).filter((x): x is SceneItem => Boolean(x));
    list.forEach((i) => used.add(i.key));
    if (list.length) resolved.push({ label: g.label, items: list });
  }
  const rest = items.filter((i) => !used.has(i.key));
  if (rest.length) resolved.push({ label: groups?.length ? "其他" : "全部场景", items: rest });

  return (
    <>
      <button
        ref={btnRef}
        className={`scene-trigger ${open ? "on" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openDrawer())}
      >
        <span className="st-top">
          <span>{label}</span>
          <span className="st-count">{items.length} 个场景</span>
        </span>
        <span className="st-value">
          {current?.label || "选择场景"}
          <span className="st-chev" aria-hidden>›</span>
        </span>
      </button>

      {open && createPortal(
        <>
          <div
            className={`scene-mask ${closing ? "closing" : ""}`}
            onMouseDown={close}
            aria-hidden
          />
          <aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`scene-drawer ${closing ? "closing" : ""}`}
            style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
          >
            <div className="sd-head">
              <div>
                <div className="sd-kicker">TRAINING SCENE</div>
                <h3>{label}</h3>
                <p>选一个场景，今天的练习和实战都围着它。</p>
              </div>
              <button className="sd-close" aria-label="关闭场景抽屉" onClick={close}>×</button>
            </div>

            <div className="sd-body">
              {resolved.map((g) => (
                <section className="sd-group" key={g.label}>
                  <div className="sd-glabel">
                    <span>{g.label}</span>
                    <i>{g.items.length}</i>
                  </div>
                  <div className="sd-grid" role="listbox" aria-label={g.label}>
                    {g.items.map((it) => {
                      const on = it.key === value;
                      return (
                        <button
                          key={it.key}
                          role="option"
                          aria-selected={on}
                          className={`sd-opt ${on ? "on" : ""}`}
                          onClick={() => choose(it.key)}
                        >
                          <span>{it.label}</span>
                          {on && <span className="sd-check" aria-hidden>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="sd-foot">
              <span>当前：<b>{current?.label || "未选择"}</b></span>
              <span className="sd-kbd">Esc 关闭</span>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
