/* API 客户端 + 语音工具 */
const BASE = "";

// ---- 全局请求追踪：任何网络请求都会体现在"请求中"UI 上 ----
let inflight = 0;
const inflightListeners = new Set<(n: number) => void>();
function notifyInflight() { inflightListeners.forEach((f) => f(inflight)); }
export function onInflight(fn: (n: number) => void): () => void {
  inflightListeners.add(fn); fn(inflight);
  return () => { inflightListeners.delete(fn); };
}
export function getInflightCount(): number { return inflight; }
function track<T>(p: Promise<T>): Promise<T> {
  inflight += 1; notifyInflight();
  return p.finally(() => { inflight -= 1; notifyInflight(); });
}

function json<T>(path: string, init?: RequestInit): Promise<T> {
  return track((async () => {
    const res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  })());
}

export const api = {
  health: () => json<{ ok: boolean; llm_configured: boolean; model: string }>("/api/health"),
  getConfig: () => json<any>("/api/config"),
  setConfig: (body: any) => json<any>("/api/config", { method: "POST", body: JSON.stringify(body) }),
  profile: (domain: string) => json<any>(`/api/profile?domain=${domain}`),

  assessmentStart: (domain: string, count = 18) =>
    json<any>("/api/assessment/start", { method: "POST", body: JSON.stringify({ domain, count }) }),
  assessmentAnswer: (body: any) =>
    json<any>("/api/assessment/answer", { method: "POST", body: JSON.stringify(body) }),
  assessmentSeen: (session_id: string, seen_known: boolean) =>
    json<any>("/api/assessment/seen", { method: "POST", body: JSON.stringify({ session_id, seen_known }) }),
  assessmentFinish: (session_id: string) =>
    json<any>("/api/assessment/finish", { method: "POST", body: JSON.stringify({ session_id }) }),
  assessmentConfirm: (domain: string, corrections?: string) =>
    json<any>("/api/assessment/confirm", {
      method: "POST",
      body: JSON.stringify({ domain, corrections }),
    }),
  pronunciationTarget: (domain: string) => json<any>(`/api/pronunciation/target?domain=${domain}`),
  pronunciationItems: (domain: string, count = 5) =>
    json<any>(`/api/pronunciation/items?domain=${domain}&count=${count}`),
  pronunciationAssess: (audio: Blob, domain: string, target = "") =>
    track((async () => {
      const fd = new FormData();
      fd.append("file", audio, "speech.wav");
      fd.append("domain", domain);
      fd.append("target", target);
      const res = await fetch("/api/pronunciation", { method: "POST", body: fd });
      return res.json();
    })()),

  plan: (domain: string, state = "normal") => json<any>(`/api/plan?domain=${domain}&state=${state}`),
  trainingResult: (body: any) =>
    json<any>("/api/training/result", { method: "POST", body: JSON.stringify(body) }),
  trainingRecord: (body: any) =>
    json<any>("/api/training/record", { method: "POST", body: JSON.stringify(body) }),
  dailyMinimalPair: (domain: string, correct: boolean, focus = "", target = "") =>
    json<any>("/api/daily/minimal-pair", { method: "POST", body: JSON.stringify({ domain, correct, focus, target }) }),
  dailyRecap: (domain: string) =>
    json<any>("/api/daily/recap", { method: "POST", body: JSON.stringify({ domain }) }),

  scenarios: (domain?: string) => json<any>(`/api/scenarios${domain ? `?domain=${domain}` : ""}`),
  scenarioStart: (scenario_id: string) =>
    json<any>("/api/scenario/start", { method: "POST", body: JSON.stringify({ scenario_id }) }),
  scenarioSay: (session_id: string, text: string) =>
    json<any>("/api/scenario/say", { method: "POST", body: JSON.stringify({ session_id, text }) }),
  scenarioReview: (session_id: string) =>
    json<any>("/api/scenario/review", { method: "POST", body: JSON.stringify({ session_id }) }),

  generate: (domain: string, kind = "cards", count = 10) =>
    json<any>("/api/generate", { method: "POST", body: JSON.stringify({ domain, kind, count }) }),
  report: (domain: string, period = "week") => json<any>(`/api/report?domain=${domain}&period=${period}`),
  seed: (name: string) => json<any>(`/api/seed/${name}`),
  minimalPairs: (domain: string, count = 8) => json<any>(`/api/minimal-pairs?domain=${domain}&count=${count}`),
};

import { getSettings, speak as ttsSpeak } from "./tts";

/** 播放发音：遵循设置页的音色/语速/音高/口语化。speed 为相对倍率。 */
export function speak(text: string, style: "real" | "plain" = "real", speed = 1.0) {
  const s = getSettings();
  ttsSpeak(text, {
    reduce: style === "plain" ? 0 : 1,
    rate: speed !== 1.0 ? s.rate * speed : undefined,
  });
}

/** 录音工具（MediaRecorder）。 */
export function createRecorder() {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  return {
    async start() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
    },
    async stop(): Promise<Blob> {
      return new Promise((resolve) => {
        if (!recorder) return resolve(new Blob());
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          recorder?.stream.getTracks().forEach((t) => t.stop());
          resolve(blob);
        };
        recorder.stop();
      });
    },
  };
}
