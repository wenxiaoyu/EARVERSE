import type { ReactElement } from "react";

type Name = "today" | "assess" | "recite" | "scenario" | "coach" | "report" | "settings" | "about";

const PATHS: Record<Name, ReactElement> = {
  // 今天：日出 / 当天
  today: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  // 测验：仪表盘 / 校准
  assess: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4.4-5.2" />
      <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // 背诵：书页 + 声波
  recite: (
    <>
      <path d="M4.5 5.5h5.2a2.3 2.3 0 0 1 2.3 2.3v11a1.8 1.8 0 0 0-1.8-1.8H4.5Z" />
      <path d="M19.5 5.5h-5.2A2.3 2.3 0 0 0 12 7.8v11a1.8 1.8 0 0 1 1.8-1.8h5.7Z" />
      <path d="M7.2 9h2M7.2 12h2M14.8 9h2M14.8 12h2" />
    </>
  ),
  // 实战：群聊气泡
  scenario: (
    <>
      <path d="M3.5 7.5h9a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H8l-3 2v-2H3.5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z" />
      <path d="M17 9.5h2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H19v2l-2.6-1.7" />
    </>
  ),
  // 陪练：麦克风
  coach: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  // 报告：柱状图
  report: (
    <>
      <path d="M4 20h16" />
      <path d="M6.5 20v-5.5M11 20V9M15.5 20v-8M20 20V4.5" />
    </>
  ),
  // 设置：滑杆
  settings: (
    <>
      <path d="M3.5 7h8M17 7h3.5M3.5 12h3M11 12h9.5M3.5 17h9M18 17h2.5" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  // 关于：信息
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
};

export default function NavIcon({ name }: { name: Name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
