/* 全站统一语音：所有英文朗读优先使用 Manbo（服务端 stella 神经音色），
   失败才回退浏览器英文音色。同一句文本做内存缓存，避免重复合成。 */
import { speak as browserSpeak } from "./tts";

export const MIRA_VOICE = "stella";
export const MIRA_RATE = 0.96;

type PlayOpts = {
  style?: "plain" | "real";
  speed?: number;
  onstart?: () => void;
  onend?: () => void;
  onAmplitude?: (v: number) => void;
  signal?: AbortSignal;
};

type Current = {
  audio: HTMLAudioElement;
  ctx?: AudioContext;
  url?: string;
  raf?: number;
  stop: () => void;
};

const cache = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();
const MAX_CACHE = 80;
let current: Current | null = null;
let seq = 0;

/** 给短句补终止标点：DeepSeek 对无标点短句会在词中间插入长停顿。 */
export function normalizeSpeakText(text: string): string {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return t;
  if (!/[.!?…:;]$/.test(t)) t += ".";
  return t;
}

function keyOf(text: string, style: string, speed: number) {
  return `${MIRA_VOICE}|${style}|${speed}|${text}`;
}

function remember(key: string, blob: Blob) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, blob);
}

async function fetchSpeech(text: string, style: string, speed: number, signal?: AbortSignal) {
  const key = keyOf(text, style, speed);
  const hit = cache.get(key);
  if (hit) return hit;
  const running = inflight.get(key);
  if (running) return running;
  const task = (async () => {
    const res = await fetch("/api/speech/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, style, speed, voice: MIRA_VOICE }),
      signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const blob = await res.blob();
    remember(key, blob);
    return blob;
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/** 停止当前全站语音；用于切页/打断/新朗读。 */
export function stopMira() {
  seq += 1;
  const c = current;
  current = null;
  if (c) c.stop();
  try {
    window.speechSynthesis?.cancel();
  } catch { /* ignore */ }
}

/**
 * 播放一句 Manbo。
 * - 服务端可用时：同一音色、同一语速、同一缓存
 * - 失败：回退浏览器英文音色，保证功能不中断
 */
export async function playMira(text: string, opts: PlayOpts = {}): Promise<void> {
  const line = normalizeSpeakText(text);
  if (!line) return;
  stopMira();
  const my = ++seq;
  const style = opts.style || "plain";
  const speed = opts.speed ?? MIRA_RATE;
  opts.onstart?.();

  try {
    const blob = await fetchSpeech(line, style, speed, opts.signal);
    if (my !== seq) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.preservesPitch = true;
    audio.playbackRate = speed;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaElementSource(audio);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    an.connect(ctx.destination);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      opts.onAmplitude?.(Math.min(1, Math.sqrt(sum / buf.length) * 6));
      raf = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      URL.revokeObjectURL(url);
      ctx.close().catch(() => {});
      opts.onAmplitude?.(0);
    };
    const c: Current = { audio, ctx, url, raf: 0, stop: () => { audio.pause(); cleanup(); } };
    current = c;
    audio.onended = () => {
      if (current === c) current = null;
      cleanup();
      if (my === seq) opts.onend?.();
    };
    audio.onerror = () => {
      if (current === c) current = null;
      cleanup();
      if (my === seq) {
        browserSpeak(line, { reduce: style === "plain" ? 0 : 1, rate: speed, onend: opts.onend });
      }
    };
    await audio.play();
    tick();
  } catch (e) {
    if (my !== seq) return;
    // 被新语音/主动停止打断时不回退；真的失败才回退浏览器
    if ((e as any)?.name === "AbortError") return;
    opts.onAmplitude?.(0);
    browserSpeak(line, {
      reduce: style === "plain" ? 0 : 1,
      rate: speed,
      onend: opts.onend,
    });
  }
}

/** 预取：页面加载/悬停时先把句子合成好，点击时直接播缓存。 */
export function prefetchSpeech(text: string, style: "real" | "plain" = "real", speed = MIRA_RATE): void {
  const line = normalizeSpeakText(text);
  if (!line) return;
  void fetchSpeech(line, style, speed).catch(() => {});
}

/** 兼容旧调用：`speak(text, "real")`。不阻塞 UI，统一走 Manbo。 */
export function speak(text: string, style: "real" | "plain" = "real", speed = MIRA_RATE): void {
  void playMira(text, { style, speed });
}
