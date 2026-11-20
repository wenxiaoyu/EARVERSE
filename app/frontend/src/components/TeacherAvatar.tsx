import type { CSSProperties } from "react";

export type MiraMood = "warm" | "curious" | "thinking" | "encouraging" |
  "correcting" | "celebrating" | "concerned" | "confused";
export type MiraGesture = "none" | "nod" | "lean_in" | "open_palm" | "point_up" |
  "hand_on_chest" | "shrug" | "thumbs_up" | "wave" | "chin_tap";

/** 侧栏入口用的小肖像。 */
/** 侧栏入口用的小肖像（新萌宠 Manbo）。 */
export function MiraFace({ listening = false }: { listening?: boolean }) {
  return (
    <svg className={`mira-face ${listening ? "listening" : ""}`} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="mf-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2c87d" />
          <stop offset="1" stopColor="#e8a94e" />
        </linearGradient>
        <linearGradient id="mf-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a4030" />
          <stop offset="1" stopColor="#3a281c" />
        </linearGradient>
      </defs>
      {/* 低双马尾 */}
      <path d="M13 46c-8 0-12 15-6 23 4 6 10 5 12-1 3-6-1-14-6-22Z" fill="url(#mf-hair)" />
      <path d="M107 46c8 0 12 15 6 23-4 6-10 5-12-1-3-6 1-14 6-22Z" fill="url(#mf-hair)" />
      {/* 头 */}
      <circle cx="60" cy="60" r="45" fill="url(#mf-body)" />
      {/* 眼睛 + 高光 */}
      <ellipse cx="46" cy="53" rx="4.5" ry="6" fill="#241b16" />
      <ellipse cx="74" cy="53" rx="4.5" ry="6" fill="#241b16" />
      <circle cx="48" cy="50" r="1.6" fill="#fff8e8" />
      <circle cx="76" cy="50" r="1.6" fill="#fff8e8" />
      {/* 腮红 */}
      <circle cx="35" cy="69" r="5" fill="#e8927c" opacity=".4" />
      <circle cx="85" cy="69" r="5" fill="#e8927c" opacity=".4" />
      {/* 微笑 */}
      <path d="M50 73c6 4 14 4 20 0" fill="none" stroke="#a25045" strokeWidth="3" strokeLinecap="round" />
      {/* 声波能量核 */}
      <circle cx="60" cy="85" r="2.6" fill="#62e7d0" />
    </svg>
  );
}

/** Manbo 半身形象：状态、手势、口型全部由对话驱动。 */
export default function TeacherAvatar({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const style = { "--mouth": Math.max(0.12, Math.min(1, amplitude)) } as CSSProperties;
  return (
    <svg
      className={`mira-avatar mood-${mood} gesture-${gesture} ${speaking ? "speaking" : ""} ${listening ? "listening" : ""}`}
      viewBox="0 0 360 500" style={style} role="img" aria-label="Manbo, your English coach"
    >
      <defs>
        <linearGradient id="mira-jacket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#394434" />
          <stop offset="1" stopColor="#222b24" />
        </linearGradient>
        <linearGradient id="mira-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3e8d5" />
          <stop offset="1" stopColor="#d9c8ac" />
        </linearGradient>
        <radialGradient id="mira-glow" cx=".5" cy=".35" r=".65">
          <stop offset="0" stopColor="#e8b566" stopOpacity=".18" />
          <stop offset="1" stopColor="#e8b566" stopOpacity="0" />
        </radialGradient>
        <filter id="mira-soft"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>

      <ellipse cx="180" cy="458" rx="150" ry="34" fill="#0b0d0a" opacity=".45" filter="url(#mira-soft)" />
      <ellipse cx="180" cy="230" rx="170" ry="210" fill="url(#mira-glow)" />

      <g className="tv-figure">
        {/* 桌面 / 笔记本，给手势一个落点 */}
        <path d="M36 468h288" stroke="#71583b" strokeWidth="3" strokeLinecap="round" opacity=".8" />
        <path d="M72 468l22-34h172l22 34Z" fill="#2b2a22" stroke="#544a38" strokeWidth="2" />
        <path d="M104 441h152" stroke="#b98a48" strokeWidth="2" opacity=".6" />
        <rect x="240" y="405" width="52" height="34" rx="4" fill="#31352c" stroke="#65563e" strokeWidth="2" />

        <g className="tv-torso">
          <path d="M84 468c4-84 28-124 96-124s92 40 96 124Z" fill="url(#mira-jacket)" />
          <path d="M145 350h70l-8 118h-54Z" fill="url(#mira-shirt)" />
          <path d="M145 350l35 34 35-34 18 18-53 52-53-52Z" fill="#efe1c8" opacity=".95" />
          <path d="M124 372l-25 88M236 372l25 88" stroke="#202820" strokeWidth="10" strokeLinecap="round" />
          <circle cx="180" cy="404" r="3" fill="#d7a04a" />
          <path d="M166 404h28" stroke="#d7a04a" strokeWidth="1.5" />
        </g>

        <g className="tv-arm tv-arm-l">
          <path d="M108 386c-22 18-31 44-28 72" fill="none" stroke="#2c362b" strokeWidth="27" strokeLinecap="round" />
          <path d="M80 454c-7-1-12 4-10 11 2 6 9 8 15 5" fill="#d8a77e" stroke="#b98561" strokeWidth="1.5" />
          <path d="M85 462c-5 1-8 4-7 8" fill="none" stroke="#b98561" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="tv-arm tv-arm-r">
          <path d="M252 386c22 18 31 44 28 72" fill="none" stroke="#2c362b" strokeWidth="27" strokeLinecap="round" />
          <g className="tv-hand-r">
            <path d="M280 454c7-1 12 4 10 11-2 6-9 8-15 5" fill="#d8a77e" stroke="#b98561" strokeWidth="1.5" />
            <path d="M275 462c5 1 8 4 7 8" fill="none" stroke="#b98561" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>

        <g className="tv-head">
          <path d="M119 270c-8 28-5 58 7 84l-17 5c-10-27-12-61 1-88Z" fill="#2c211b" />
          <path d="M241 270c8 28 5 58-7 84l17 5c10-27 12-61-1-88Z" fill="#2c211b" />
          <circle cx="121" cy="300" r="3.2" fill="#d7a04a" />
          <circle cx="239" cy="300" r="3.2" fill="#d7a04a" />
          <path d="M118 284c-6-20 2-35 13-41l8 27Z" fill="#d8a77e" stroke="#b98561" strokeWidth="1.5" />
          <path d="M242 284c6-20-2-35-13-41l-8 27Z" fill="#d8a77e" stroke="#b98561" strokeWidth="1.5" />
          <path d="M125 287c-4-20 0-40 13-55 11-14 26-22 42-22s31 8 42 22c13 15 17 35 13 55l-5 32c-3 21-22 35-50 35s-47-14-50-35Z" fill="#d8a77e" />
          <path d="M124 283c-2-33 10-56 30-66 17-9 35-9 52 0 20 10 32 33 30 66-7-10-13-17-22-21-8 8-24 13-38 13-17 0-30-3-40-12-5 5-9 12-12 20Z" fill="#2c211b" />
          <path d="M132 248c10-22 25-32 48-32 24 0 40 10 48 32" fill="none" stroke="#211813" strokeWidth="4" strokeLinecap="round" opacity=".8" />
          <path d="M141 271c7-4 14-4 21 0M198 271c7-4 14-4 21 0" fill="none" stroke="#3c2b22" strokeWidth="3.2" strokeLinecap="round" />
          <g className="tv-eyes">
            <ellipse cx="156" cy="286" rx="4.4" ry="5.2" fill="#2c211b" />
            <ellipse cx="204" cy="286" rx="4.4" ry="5.2" fill="#2c211b" />
            <circle cx="157.5" cy="284" r="1.2" fill="#fff8e8" />
            <circle cx="205.5" cy="284" r="1.2" fill="#fff8e8" />
          </g>
          <path className="tv-brow-l" d="M143 264c8-5 16-5 24-1" fill="none" stroke="#3c2b22" strokeWidth="2.6" strokeLinecap="round" />
          <path className="tv-brow-r" d="M193 263c8-4 16-4 24 1" fill="none" stroke="#3c2b22" strokeWidth="2.6" strokeLinecap="round" />
          <g className="tv-glasses" fill="none" stroke="#d7a04a" strokeWidth="1.8" opacity=".75">
            <rect x="145" y="278" width="23" height="17" rx="8" />
            <rect x="192" y="278" width="23" height="17" rx="8" />
            <path d="M168 285h24M145 283l-8-3M215 283l8-3" />
          </g>
          <path d="M180 295v13c0 3-2 5-5 5" fill="none" stroke="#b98561" strokeWidth="2" strokeLinecap="round" />
          <path className="tv-smile" d="M163 325c10 6 24 6 34 0" fill="none" stroke="#8b4e44" strokeWidth="3.4" strokeLinecap="round" />
          <ellipse className="tv-mouth" cx="180" cy="326" rx="12" ry="3" fill="#6f3c38" />
          <circle cx="144" cy="309" r="7" fill="#c96b5b" opacity=".16" />
          <circle cx="216" cy="309" r="7" fill="#c96b5b" opacity=".16" />
        </g>
        <circle cx="180" cy="371" r="5" fill="#d7a04a" opacity=".9" />
        <path d="M180 376v14" stroke="#d7a04a" strokeWidth="2" opacity=".7" />
      </g>
    </svg>
  );
}
