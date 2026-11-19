import { useEffect, useRef, useState } from "react";

export type SceneItem = { key: string; label: string };

/** 左侧「训练场景」：单个下拉框，默认第一项。 */
export default function SceneDropdown({
  items, value, onChange, label = "训练场景",
}: {
  items: SceneItem[]; value: string; onChange: (key: string) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = items.find((i) => i.key === value) || items[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="sdrop" ref={wrapRef}>
      <label>{label}</label>
      <button
        className="sdrop-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.label || "选择"}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="sdrop-pop" role="listbox" aria-label={label}>
          {items.map((it) => (
            <button
              key={it.key}
              role="option"
              aria-selected={it.key === value}
              className={`sdrop-opt ${it.key === value ? "on" : ""}`}
              onClick={() => { onChange(it.key); setOpen(false); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
