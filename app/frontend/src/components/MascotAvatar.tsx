import type { CSSProperties } from "react";
import type { MiraGesture, MiraMood } from "./TeacherAvatar";

/** 2D 萌系 AI 少女助手 Mira：低双马尾、齐刘海、大眼睛、蝴蝶结。 */
export default function MascotAvatar({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const style = { "--mouth": Math.max(0.12, Math.min(1, amplitude)) } as CSSProperties;
  return (
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

        {/* 小手臂：交叠在身前 */}
        <g className="mascot-arm mascot-arm-l">
          <path d="M96 262c-16 8-20 22-14 34 4 8 14 10 22 6" fill="none" stroke="#b9742a" strokeWidth="13" strokeLinecap="round" />
        </g>
        <g className="mascot-arm mascot-arm-r">
          <path d="M224 262c16 8 20 22 14 34-4 8-14 10-22 6" fill="none" stroke="#b9742a" strokeWidth="13" strokeLinecap="round" />
        </g>

        {/* 身体 */}
        <circle className="mascot-body" cx="160" cy="210" r="128" fill="url(#mascot-body)" />
        <circle cx="160" cy="200" r="120" fill="url(#mascot-glow)" opacity=".5" />

        {/* 齐刘海 */}
        <path className="mascot-bangs" d="M58 150c2-46 28-70 58-70 24 0 46 12 60 32 14-16 34-22 50-14-8-30-30-46-62-46-40 0-70 28-72 66Z" fill="url(#mascot-hair)" />
        <path d="M82 128c18-24 40-34 70-34 32 0 54 14 70 38-8-10-18-14-28-12-22 4-46-2-62 14-18-2-34 0-50-6Z" fill="#6b4a36" opacity=".5" />

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

        {/* 腮红 */}
        <circle cx="94" cy="218" r="15" fill="#e8927c" opacity=".35" />
        <circle cx="226" cy="218" r="15" fill="#e8927c" opacity=".35" />

        {/* 嘴 */}
        <path className="mascot-smile" d="M140 238c13 9 27 9 40 0" fill="none" stroke="#a25045" strokeWidth="6" strokeLinecap="round" />
        <ellipse className="mascot-mouth" cx="160" cy="242" rx="14" ry="4" fill="#8a413a" />

        {/* 蝴蝶结 */}
        <g className="mascot-bow">
          <path d="M196 40c-14-2-22 6-22 18 0-12-8-20-22-18 10 6 12 16 6 26 6 10-4 20 16 18 20-2 16-8 16-18-6-10-4-20 6-26Z" fill="#d7a04a" />
          <circle cx="180" cy="70" r="6" fill="#b9742a" />
        </g>

        {/* 天线 */}
        <path className="mascot-antenna" d="M160 74c-4-30 10-46 30-52" fill="none" stroke="#b9742a" strokeWidth="8" strokeLinecap="round" />
        <circle className="mascot-tip" cx="192" cy="20" r="9" fill="#7fb069" />
        <circle cx="192" cy="20" r="4" fill="#dff0d6" />
      </g>
    </svg>
  );
}
