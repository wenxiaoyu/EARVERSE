import type { CSSProperties } from "react";
import type { MiraGesture, MiraMood } from "./TeacherAvatar";

/** 2D 中性 AI 萌宠形象：圆圆的身体、大眼睛、呆毛、小手臂。 */
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
        <radialGradient id="mascot-glow" cx=".5" cy=".4" r=".6">
          <stop offset="0" stopColor="#fff3d6" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="160" cy="330" rx="110" ry="20" fill="#0b0d0a" opacity=".35" />

      <g className="mascot-fig">
        {/* 呆毛 + 天线 */}
        <path className="mascot-antenna" d="M160 74c-4-30 10-46 30-52" fill="none" stroke="#b9742a" strokeWidth="8" strokeLinecap="round" />
        <circle className="mascot-tip" cx="192" cy="20" r="9" fill="#7fb069" />
        <circle cx="192" cy="20" r="4" fill="#dff0d6" />

        {/* 小手臂 */}
        <g className="mascot-arm mascot-arm-l">
          <path d="M74 214c-28-8-38 8-32 26" fill="none" stroke="#b9742a" strokeWidth="13" strokeLinecap="round" />
          <circle cx="42" cy="244" r="8" fill="#b9742a" />
        </g>
        <g className="mascot-arm mascot-arm-r">
          <path d="M246 214c28-8 38 8 32 26" fill="none" stroke="#b9742a" strokeWidth="13" strokeLinecap="round" />
          <circle cx="278" cy="244" r="8" fill="#b9742a" />
        </g>

        {/* 身体 */}
        <circle className="mascot-body" cx="160" cy="210" r="128" fill="url(#mascot-body)" />
        <circle cx="160" cy="200" r="120" fill="url(#mascot-glow)" opacity=".5" />

        {/* 眼睛 */}
        <g className="mascot-eyes">
          <ellipse cx="122" cy="176" rx="13" ry="17" fill="#241b16" />
          <ellipse cx="198" cy="176" rx="13" ry="17" fill="#241b16" />
          <circle cx="126" cy="168" r="4.5" fill="#fff8e8" />
          <circle cx="202" cy="168" r="4.5" fill="#fff8e8" />
        </g>

        {/* 腮红 */}
        <circle cx="98" cy="216" r="13" fill="#d96f5b" opacity=".3" />
        <circle cx="222" cy="216" r="13" fill="#d96f5b" opacity=".3" />

        {/* 嘴 */}
        <path className="mascot-smile" d="M140 236c13 9 27 9 40 0" fill="none" stroke="#6f3c38" strokeWidth="6" strokeLinecap="round" />
        <ellipse className="mascot-mouth" cx="160" cy="240" rx="14" ry="4" fill="#6f3c38" />

        {/* 小领结 / 徽章 */}
        <g className="mascot-badge">
          <path d="M146 280l14-10 14 10-14 12Z" fill="#7fb069" />
          <circle cx="160" cy="284" r="3" fill="#fff8e8" />
        </g>
      </g>
    </svg>
  );
}
