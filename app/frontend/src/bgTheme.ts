/* 背景氛围：soft(柔光) | bold(张扬) | ultra(炸裂)。持久化到 localStorage，切换 <html> class。 */
export type BgMode = "soft" | "bold" | "ultra";
const KEY = "aicoach.bg.v2";

export function getBg(): BgMode {
  try {
    return (localStorage.getItem(KEY) as BgMode) || "ultra";
  } catch {
    return "ultra";
  }
}

export function applyBg(): void {
  const m = getBg();
  const el = document.documentElement;
  el.classList.toggle("bg-bold", m === "bold");
  el.classList.toggle("bg-ultra", m === "ultra");
}

export function setBg(m: BgMode): void {
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  applyBg();
}
