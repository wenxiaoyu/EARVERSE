import { useState, type CSSProperties } from "react";
import type { MiraGesture, MiraMood } from "./TeacherAvatar";

/** 2D 萌系 AI 少女助手 Mira：低双马尾、大眼睛；支持悬停/点击互动与情绪表情。 */
export default function MascotAvatar({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const style = { "--mouth": Math.min(1.5, 0.15 + amplitude * 1.4) } as CSSProperties;
  const [react, setReact] = useState<"hover" | "click" | null>(null);

  return (
    <div
      className={`mascot-wrap ${react ? `react-${react}` : ""}`}
      onPointerEnter={() => setReact("hover")}
      onPointerLeave={() => setReact((v) => (v === "click" ? "click" : null))}
      onClick={() => { setReact((v) => (v === "click" ? null : "click")); }}
    >
      <svg
        className={`mascot-avatar mood-${mood} gesture-${gesture} ${speaking ? "speaking" : ""} ${listening ? "listening" : ""}`}
        viewBox="0 0 320 360" style={style} role="img" aria-label="Mira AI mascot"
      >
        <defs>
          <linearGradient id="mascot-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2c87d" />
            <stop offset="0.55" stopColor="#e8a94e" />
            <stop offset="1" stopColor="#b9742a" />
          </linearGradient>
          <linearGradient id="mascot-hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a4030" />
            <stop offset="1" stopColor="#3a281c" />
          </linearGradient>
          <radialGradient id="mascot-glow" cx=".5" cy=".4" r=".6">
            <stop offset="0" stopColor="#fff3d6" stopOpacity=".9" />
            <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="160" cy="330" rx="110" ry="20" fill="#0b0d0a" opacity=".35" />

        <g className="mascot-fig">
          {/* 低双马尾 */}
          <g className="mascot-tails">
            <path d="M60 160c-34 4-44 46-30 84 8 22 24 28 36 18 14-12 12-34 2-56-8-18-20-34-8-46Z" fill="url(#mascot-hair)" />
            <path d="M260 160c34 4 44 46 30 84-8 22-24 28-36 18-14-12-12-34-2-56 8-18 20-34 8-46Z" fill="url(#mascot-hair)" />
            <circle cx="74" cy="196" r="8" fill="#d7a04a" />
            <circle cx="246" cy="196" r="8" fill="#d7a04a" />
          </g>

          {/* 身体 */}
          <circle className="mascot-body" cx="160" cy="210" r="128" fill="url(#mascot-body)" />
          <circle cx="160" cy="200" r="120" fill="url(#mascot-glow)" opacity=".5" />

          {/* 眼睛 + 睫毛 */}
          <g className="mascot-eyes">
            <ellipse cx="122" cy="176" rx="13" ry="17" fill="#241b16" />
            <ellipse cx="198" cy="176" rx="13" ry="17" fill="#241b16" />
            <circle cx="126" cy="168" r="4.5" fill="#fff8e8" />
            <circle cx="202" cy="168" r="4.5" fill="#fff8e8" />
          </g>
          <g className="mascot-lashes" stroke="#241b16" strokeWidth="3" strokeLinecap="round">
            <path d="M108 162l-6-6M108 168l-7-2M212 162l6-6M212 168l7-2" />
          </g>

          {/* 开心眼（celebrating 时显示） */}
          <g className="mascot-happy" stroke="#241b16" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M109 178c4-7 14-7 18 0" />
            <path d="M193 178c4-7 14-7 18 0" />
          </g>
          {/* 腮红 */}
          <circle cx="94" cy="218" r="15" fill="#e8927c" opacity=".35" />
          <circle cx="226" cy="218" r="15" fill="#e8927c" opacity=".35" />

          {/* 嘴 */}
          <path className="mascot-smile" d="M140 238c13 9 27 9 40 0" fill="none" stroke="#a25045" strokeWidth="6" strokeLinecap="round" />
          <path className="mascot-o" d="M160 246a9 9 0 1 0 .1 0Z" fill="#8a413a" />
          <ellipse className="mascot-mouth" cx="160" cy="242" rx="14" ry="9" fill="#8a413a" />
        </g>
      </svg>
    </div>
  );
}
