import React from "react";

/**
 * 富文本：把 AI 文本里的以下标记渲染成 UI，而不是原样露出符号。
 *   「为什么听不清」 → 琥珀 chip
 *   **重点**        → 加粗
 */
export default function RichText({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  const parts = String(text).split(/(「[^」]*」|\*\*[^*]+\*\*)/g);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("「") && p.endsWith("」")) {
          return (
            <span className="ref-chip" key={i}>
              {p.slice(1, -1)}
            </span>
          );
        }
        if (p.startsWith("**") && p.endsWith("**")) {
          return <b key={i}>{p.slice(2, -2)}</b>;
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </span>
  );
}
