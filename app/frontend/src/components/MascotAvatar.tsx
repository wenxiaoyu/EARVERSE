import type { MiraGesture, MiraMood } from "./TeacherAvatar";

/** 一键恢复开关：false = 原版（粉耳机圆脸），true = 全息 AI 科技版。 */
const TECH_MODE = true;

type Props = {
  mood?: MiraMood;
  gesture?: MiraGesture;
  speaking?: boolean;
  amplitude?: number;
  listening?: boolean;
};

export default function MascotAvatar(props: Props) {
  return TECH_MODE ? <MascotTech {...props} /> : <MascotCute {...props} />;
}

/* ---------------- 原版：圆脸 + 霓虹粉耳机 ---------------- */
function MascotCute({
  mood = "warm", gesture = "none", speaking = false, listening = false,
}: Props) {
  return (
    <svg
      className={`mascot-avatar mood-${mood} gesture-${gesture} ${speaking ? "speaking" : ""} ${listening ? "listening" : ""}`}
      viewBox="0 0 320 360" role="img" aria-label="Manbo AI mascot"
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
        <circle className="mascot-body" cx="160" cy="210" r="128" fill="url(#mascot-body)" />
        <circle cx="160" cy="200" r="120" fill="url(#mascot-glow)" opacity=".5" />

        <g className="mascot-headphones">
          <rect className="mascot-cup" x="22" y="170" width="36" height="48" rx="16" fill="#ff5fa2" />
          <rect className="mascot-cup" x="262" y="170" width="36" height="48" rx="16" fill="#ff5fa2" />
          <circle cx="40" cy="194" r="10" fill="#ffb3d4" opacity=".85" />
          <circle cx="280" cy="194" r="10" fill="#ffb3d4" opacity=".85" />
          <path className="mascot-band" d="M40 170a124 124 0 0 1 240 0" fill="none" stroke="#ff5fa2" strokeWidth="14" strokeLinecap="round" />
        </g>

        <g className="mascot-eyes">
          <ellipse cx="122" cy="176" rx="13" ry="17" fill="#241b16" />
          <ellipse cx="198" cy="176" rx="13" ry="17" fill="#241b16" />
          <circle cx="126" cy="168" r="4.5" fill="#fff8e8" />
          <circle cx="202" cy="168" r="4.5" fill="#fff8e8" />
        </g>
        <g className="mascot-lashes" stroke="#241b16" strokeWidth="3" strokeLinecap="round">
          <path d="M108 162l-6-6M108 168l-7-2M212 162l6-6M212 168l7-2" />
        </g>

        <g className="mascot-happy" stroke="#241b16" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M109 178c4-7 14-7 18 0" />
          <path d="M193 178c4-7 14-7 18 0" />
        </g>

        <circle cx="94" cy="218" r="15" fill="#e8927c" opacity=".35" />
        <circle cx="226" cy="218" r="15" fill="#e8927c" opacity=".35" />

        <path className="mascot-smile" d="M138 238c14 10 30 10 44 0" fill="none" stroke="#a25045" strokeWidth="6" strokeLinecap="round" style={speaking ? { opacity: 0 } : undefined} />
        <path className="mascot-o" d="M160 246a10 10 0 1 0 .1 0Z" fill="#8a413a" style={speaking ? { opacity: 0 } : undefined} />

        <g className="mascot-talk">
          <circle className="mascot-talk-dot d1" cx="150" cy="247" r="3.5" />
          <circle className="mascot-talk-dot d2" cx="160" cy="247" r="3.5" />
          <circle className="mascot-talk-dot d3" cx="170" cy="247" r="3.5" />
        </g>
      </g>
    </svg>
  );
}

/* ---------------- 全息 AI 科技版 ---------------- */
function MascotTech({
  mood = "warm", gesture = "none", speaking = false, listening = false,
}: Props) {
  return (
    <svg
      className={`mascot-avatar tech mood-${mood} gesture-${gesture} ${speaking ? "speaking" : ""} ${listening ? "listening" : ""}`}
      viewBox="0 0 320 360" role="img" aria-label="Manbo AI mascot"
    >
      <defs>
        <linearGradient id="tech-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8f4ff" />
          <stop offset="0.5" stopColor="#38c6f0" />
          <stop offset="1" stopColor="#185a9e" />
        </linearGradient>
        <radialGradient id="tech-glow" cx=".5" cy=".4" r=".6">
          <stop offset="0" stopColor="#dffbff" stopOpacity=".9" />
          <stop offset="1" stopColor="#dffbff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 全息投影地台 */}
      <g className="tech-base-wrap">
        <ellipse className="tech-base" cx="160" cy="326" rx="108" ry="22" fill="none" stroke="#35c3f0" strokeWidth="2" strokeDasharray="12 8" opacity=".8" />
        <ellipse className="tech-base2" cx="160" cy="326" rx="80" ry="16" fill="none" stroke="#7fe7f0" strokeWidth="1.5" opacity=".5" />
      </g>

      <g className="mascot-fig">
        {/* 身体：全息渐变 + 青色霓虹描边 */}
        <circle className="tech-body" cx="160" cy="210" r="128" fill="url(#tech-body)" stroke="#7fe7f0" strokeWidth="3" />
        <circle cx="160" cy="200" r="120" fill="url(#tech-glow)" opacity=".5" />

        {/* 通讯头戴：深灰耳罩 + 青色灯环 + 麦克风臂 */}
        <g className="mascot-headphones">
          <rect className="mascot-cup" x="22" y="170" width="36" height="48" rx="16" fill="#12233a" stroke="#35c3f0" strokeWidth="2" />
          <rect className="mascot-cup" x="262" y="170" width="36" height="48" rx="16" fill="#12233a" stroke="#35c3f0" strokeWidth="2" />
          <circle cx="40" cy="194" r="10" fill="none" stroke="#7fe7f0" strokeWidth="2" />
          <circle cx="280" cy="194" r="10" fill="none" stroke="#7fe7f0" strokeWidth="2" />
          <path className="mascot-band" d="M40 170a124 124 0 0 1 240 0" fill="none" stroke="#1b3a5c" strokeWidth="14" strokeLinecap="round" />
          <path d="M40 170a124 124 0 0 1 240 0" fill="none" stroke="#35c3f0" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          <path className="tech-mic" d="M286 204c14 4 18 18 8 30-8 9-20 8-26 0" fill="none" stroke="#1b3a5c" strokeWidth="4" strokeLinecap="round" />
          <circle cx="266" cy="232" r="4" fill="#7fe7f0" />
        </g>

        {/* LED 数字眼 */}
        <g className="mascot-eyes">
          <ellipse cx="122" cy="176" rx="13" ry="17" fill="#06233a" />
          <ellipse cx="198" cy="176" rx="13" ry="17" fill="#06233a" />
          <ellipse cx="122" cy="178" rx="6" ry="8" fill="#7fe7f0" />
          <ellipse cx="198" cy="178" rx="6" ry="8" fill="#7fe7f0" />
          <circle cx="124" cy="174" r="3" fill="#eaffff" />
          <circle cx="200" cy="174" r="3" fill="#eaffff" />
        </g>

        {/* 腮红：青色柔光 */}
        <circle cx="94" cy="218" r="13" fill="#7fe7f0" opacity=".18" />
        <circle cx="226" cy="218" r="13" fill="#7fe7f0" opacity=".18" />

        {/* 胸口能量核心 */}
        <g className="tech-core">
          <circle cx="160" cy="272" r="14" fill="none" stroke="#7fe7f0" strokeWidth="2" opacity=".8" />
          <circle cx="160" cy="272" r="7" fill="#aef6ff" />
        </g>

        {/* 嘴 */}
        <path className="mascot-smile" d="M138 238c14 10 30 10 44 0" fill="none" stroke="#7fe7f0" strokeWidth="6" strokeLinecap="round" style={speaking ? { opacity: 0 } : undefined} />

        {/* 说话：迷你频谱条 */}
        <g className="mascot-talk">
          <rect className="tech-eq e1" x="148" y="238" width="4" height="10" rx="2" />
          <rect className="tech-eq e2" x="154" y="234" width="4" height="16" rx="2" />
          <rect className="tech-eq e3" x="160" y="230" width="4" height="20" rx="2" />
          <rect className="tech-eq e4" x="166" y="234" width="4" height="16" rx="2" />
          <rect className="tech-eq e5" x="172" y="238" width="4" height="10" rx="2" />
        </g>
      </g>
    </svg>
  );
}
