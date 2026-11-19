import { useEffect, useRef, useState } from "react";

export type SceneItem = { key: string; label: string };

/**
 * 输入源通道选择器（方案一 Plus）。
 * - 内联最多显示 maxInline 个通道；超出收进末尾「更多 ⌄」，弹出主题化浮层。
 * - 当前项永远可见：若选中项在溢出区，末尾按钮显示当前场景名。
 * - 键盘：←/→ 在通道间移动；Esc 关闭浮层。
 */
export default function SceneSelector({
  items,
  value,
  onChange,
  maxInline = 4,
  label = "训练场景",
}: {
  items: SceneItem[];
  value: string;
  onChange: (key: string) => void;
  maxInline?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const overflow = items.length > maxInline;
  const visible = overflow ? items.slice(0, maxInline - 1) : items;
  const hidden = overflow ? items.slice(maxInline - 1) : [];
  const hiddenActive = hidden.some((i) => i.key === value);
  const current = items.find((i) => i.key === value);

  // 点外关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div className="scene" ref={wrapRef}>
      <label>{label}</label>
      <div className="scene-sel" role="radiogroup" aria-label={label}>
        {visible.map((it) => (
          <button
            key={it.key}
            role="radio"
            aria-checked={value === it.key}
            className={`scene-chip ${value === it.key ? "on" : ""}`}
            onClick={() => pick(it.key)}
          >
            <span className="led" />
            {it.label}
          </button>
        ))}

        {overflow && (
          <div className="scene-more">
            <button
              role="radio"
              aria-checked={hiddenActive}
              aria-expanded={open}
              className={`scene-chip ${hiddenActive ? "on" : ""}`}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="led" />
              {hiddenActive ? current?.label : `更多 ${hidden.length}`}
              <span className="chev">⌄</span>
            </button>

            {open && (
              <div className="scene-pop" role="radiogroup" aria-label={label}>
                {hidden.map((it) => (
                  <button
                    key={it.key}
                    role="radio"
                    aria-checked={value === it.key}
                    className={`scene-opt ${value === it.key ? "on" : ""}`}
                    onClick={() => pick(it.key)}
                  >
                    <span className="led" />
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
