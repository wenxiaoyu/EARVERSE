/* 语音引擎 —— 从旧版 app.js 原样移植（浏览器 Web Speech API）。
   提供：音色优选、语速、音高、口语化（弱读改写）、试听。
   设置存 localStorage，改动即时生效。 */

export type VoiceSettings = {
  voiceURI: string;
  rate: number;
  pitch: number;
  reduce: number; // 0 = 教科书念法，1 = 口语化念法
};

const STORE_KEY = "aicoach.tts";

const DEFAULT_SETTINGS: VoiceSettings = { voiceURI: "", rate: 1, pitch: 1, reduce: 1 };

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

const VOICE_QUALITY = /natural|premium|enhanced|neural|siri/i;
const VOICE_GOOD =
  /^(samantha|ava|allison|susan|zoe|serena|karen|moira|tessa|daniel|tom|nicky|google)/i;
const VOICE_BAD =
  /\b(bad news|good news|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;

export const TTS_SAMPLE =
  "Actually, I think we should wait for the rest of them, and then figure out what to do.";

let voiceList: SpeechSynthesisVoice[] = [];
let speakGen = 0;
const listeners = new Set<() => void>();

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

let settings: VoiceSettings = loadSettings();

export function getSettings(): VoiceSettings {
  return { ...settings };
}

export function saveSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
  return { ...settings };
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------------- 音色 ---------------- */
function voiceMeta(v: SpeechSynthesisVoice): string {
  return (v?.name || "") + " " + (v?.voiceURI || "");
}

function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name || "";
  const meta = voiceMeta(v);
  let s = 0;
  if (VOICE_QUALITY.test(meta)) s += 60;
  if (/google/i.test(n)) s += 45;
  if (VOICE_GOOD.test(n)) s += 30;
  if (/^en[-_]us/i.test(v.lang)) s += 12;
  else if (/^en[-_]gb/i.test(v.lang)) s += 8;
  else s += 2;
  if (v.localService === false) s += 6;
  if (VOICE_BAD.test(n)) s -= 200;
  return s;
}

export function voiceIsQuality(v: SpeechSynthesisVoice): boolean {
  const n = (v?.name || "");
  return VOICE_QUALITY.test(voiceMeta(v)) || /google/i.test(n) || !v.localService;
}

export function voiceTag(v: SpeechSynthesisVoice): string {
  if (!v) return "";
  if (VOICE_BAD.test(v.name || "")) return "机器人";
  return voiceIsQuality(v) ? "高质量" : "";
}

export function getVoices(): SpeechSynthesisVoice[] {
  return voiceList.slice();
}

export function loadVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  const all = window.speechSynthesis
    .getVoices()
    .filter((v) => /^en(-|_|$)/i.test(v.lang));
  voiceList = all
    .slice()
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
  listeners.forEach((fn) => fn());
  return getVoices();
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceList.length) loadVoices();
  if (settings.voiceURI) {
    const found = voiceList.find((v) => v.voiceURI === settings.voiceURI);
    // 跳过 Whisper / Bells 这类几乎听不清或纯音效的音色，避免“调用成功但没声音”
    if (found && !VOICE_BAD.test(voiceMeta(found))) return found;
  }
  return voiceList.find((v) => !VOICE_BAD.test(voiceMeta(v))) || voiceList[0] || null;
}

/* ---------------- 口语化改写 ---------------- */
const RULES_CONTRACT: Array<[RegExp, string]> = [
  [/\bi am\b/gi, "i'm"],
  [/\byou are\b/gi, "you're"],
  [/\bwe are\b/gi, "we're"],
  [/\bthey are\b/gi, "they're"],
  [/\bhe is\b/gi, "he's"],
  [/\bshe is\b/gi, "she's"],
  [/\bit is\b/gi, "it's"],
  [/\bthat is\b/gi, "that's"],
  [/\bthere is\b/gi, "there's"],
  [/\bthere are\b/gi, "there're"],
  [/\bwhat is\b/gi, "what's"],
  [/\bhere is\b/gi, "here's"],
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"],
  [/\bwere not\b/gi, "weren't"],
  [/\bhave not\b/gi, "haven't"],
  [/\bhas not\b/gi, "hasn't"],
  [/\bwill not\b/gi, "won't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bcould not\b/gi, "couldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bcan not\b/gi, "can't"],
  [/\bcannot\b/gi, "can't"],
  [/\bi will\b/gi, "i'll"],
  [/\bwe will\b/gi, "we'll"],
  [/\bit will\b/gi, "it'll"],
  [/\blet us\b/gi, "let's"],
];

const RULES_SPOKEN: Array<[RegExp, string]> = [
  [/\bgoing to\b/gi, "gonna"],
  [/\bwant to\b/gi, "wanna"],
  [/\bwants to\b/gi, "wansta"],
  [/\bgot to\b/gi, "gotta"],
  [/\bhave to\b/gi, "hafta"],
  [/\bhas to\b/gi, "hasta"],
  [/\bkind of\b/gi, "kinda"],
  [/\bsort of\b/gi, "sorta"],
  [/\ba lot of\b/gi, "a lotta"],
  [/\blots of\b/gi, "lotsa"],
  [/\bout of\b/gi, "outta"],
  [/\bdid you\b/gi, "didja"],
  [/\bwould you\b/gi, "wouldja"],
  [/\bcould you\b/gi, "couldja"],
  [/\bdon't you\b/gi, "dontcha"],
  [/\bdidn't you\b/gi, "didntcha"],
  [/\blet me\b/gi, "lemme"],
  [/\bgive me\b/gi, "gimme"],
  [/\bshould have\b/gi, "shoulda"],
  [/\bwould have\b/gi, "woulda"],
  [/\bcould have\b/gi, "coulda"],
  [/\bmust have\b/gi, "musta"],
  [/\bmight have\b/gi, "mighta"],
  [/\bdon't know\b/gi, "dunno"],
  [/\bbecause\b/gi, "cuz"],
  [/\bprobably\b/gi, "probly"],
  [/\bfor\b/gi, "fer"],
  [/\bof\b/gi, "uh"],
  [/\bjust\b/gi, "jus"],
  [/\bthem\b/gi, "em"],
  [/\bhim\b/gi, "im"],
];

function applyRules(t: string, rules: Array<[RegExp, string]>): string {
  rules.forEach(([re, rep]) => {
    t = t.replace(re, rep);
  });
  return t;
}

export function prepareText(text: string, level?: number): string {
  let t = String(text ?? "").trim();
  if (!t) return t;
  const lvl = level != null ? level : settings.reduce;
  if (lvl <= 0) return t;
  t = applyRules(t, RULES_CONTRACT);
  t = applyRules(t, RULES_SPOKEN);
  return t.replace(/\s+/g, " ").trim();
}

/* ---------------- 朗读 ---------------- */
export type SpeakOpt = {
  reduce?: number;
  rate?: number;
  pitch?: number;
  onend?: () => void;
};

export function speak(text: string, opt: SpeakOpt = {}): void {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return;
  }
  const synth = window.speechSynthesis;
  const gen = ++speakGen;

  // macOS Chrome/Safari 的已知问题：cancel 后立刻 speak 会把队列卡在 paused，
  // 之后所有朗读都“调用成功但没声音”。先 cancel，再 resume，再重新入队。
  try {
    synth.cancel();
    synth.resume();
  } catch {
    /* ignore */
  }

  const spoken = prepareText(text, opt.reduce);
  if (!spoken) return;
  if (!voiceList.length) loadVoices();
  const preferred = pickVoice();

  let watchdog = 0;

  const run = (attempt: number) => {
    if (gen !== speakGen) return;
    try {
      synth.resume();
    } catch {
      /* ignore */
    }

    const u = new SpeechSynthesisUtterance(spoken);
    const v = attempt === 0 ? preferred : null;  // 重试时交给系统默认音色
    u.lang = (v && v.lang) || "en-US";
    u.rate = clamp(opt.rate != null ? opt.rate : settings.rate, 0.5, 2);
    u.pitch = clamp(opt.pitch != null ? opt.pitch : settings.pitch, 0.5, 2);
    u.volume = 1;
    if (v) u.voice = v;

    let started = false;
    let settled = false;

    const retry = () => {
      if (settled || gen !== speakGen) return;
      settled = true;
      window.clearTimeout(watchdog);
      try {
        synth.cancel();
        synth.resume();
      } catch {
        /* ignore */
      }
      if (attempt === 0) {
        // 换系统默认音色再试一次；给 cancel 一点时间落地
        window.setTimeout(() => run(1), 40);
      } else if (opt.onend) {
        opt.onend();
      }
    };

    // 800ms 内没有 onstart，视为这次朗读没真正启动
    watchdog = window.setTimeout(() => {
      if (!started) retry();
    }, 800);

    u.onstart = () => {
      started = true;
      window.clearTimeout(watchdog);
    };
    u.onend = () => {
      window.clearTimeout(watchdog);
      if (gen === speakGen) {
        settled = true;
        if (opt.onend) opt.onend();
      }
    };
    u.onerror = () => {
      if (gen === speakGen) retry();
    };

    try {
      synth.speak(u);
    } catch {
      retry();
    }
  };

  run(0);
}

export function stopSpeech(): void {
  speakGen += 1;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/* 首次加载时触发音色枚举（部分浏览器异步返回） */
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => loadVoices();
  // 主动拉一次
  setTimeout(() => loadVoices(), 0);
}
