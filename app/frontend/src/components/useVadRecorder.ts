/* 浏览器自动停顿录音：检测到说话后，静音约 800ms 自动结束。
   输出 16-bit PCM WAV，供 DeepSeek ASR 使用。
   抗噪：需连续 240ms 有声才确认「说话」，且总时长 ≥ 400ms 才触发识别；
   否则视为噪声丢弃，静默超时自动清空缓冲继续监听。 */
import { useRef } from "react";
import { encodeWav } from "../wavRecorder";

type Cb = (blob: Blob) => void;

const MIN_SPEECH_MS = 400;

export function useVadRecorder() {
  const ref = useRef<{
    ctx?: AudioContext; stream?: MediaStream; node?: ScriptProcessorNode;
    an?: AnalyserNode; gain?: GainNode; chunks: Float32Array[]; active: boolean;
    speech: boolean; speechCount: number; speechMs: number; silence: number; started: number; timer?: number;
    done?: Cb; onSpeech?: () => void; threshold: number;
  }>({ chunks: [], active: false, speech: false, speechCount: 0, speechMs: 0, silence: 0, started: 0, threshold: 0.018 });

  const cleanup = () => {
    const r = ref.current;
    if (r.timer) window.clearInterval(r.timer);
    r.timer = undefined;
    r.node?.disconnect();
    r.an?.disconnect();
    r.gain?.disconnect();
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    r.ctx = undefined; r.stream = undefined; r.node = undefined; r.an = undefined; r.gain = undefined;
    r.active = false;
  };

  /** final=false 只停麦不识别（静音/切页/打断用）；final=true 才把音频交给 ASR。 */
  const stop = (final = false) => {
    const r = ref.current;
    if (!r.active) return;
    const rate = r.ctx?.sampleRate ?? 44100;
    const chunks = r.chunks;
    const cb = r.done;
    cleanup();
    const blob = encodeWav(chunks, rate);
    r.chunks = [];
    if (final && blob.size > 44 && cb) cb(blob);
  };

  const start = async (onDone: Cb, onSpeech?: () => void, threshold = 0.018) => {
    const r = ref.current;
    if (r.active) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const chunks: Float32Array[] = [];
    r.ctx = ctx; r.stream = stream; r.node = node; r.an = an; r.gain = gain;
    r.chunks = chunks; r.active = true; r.speech = false; r.speechCount = 0; r.speechMs = 0; r.silence = 0;
    r.started = Date.now(); r.done = onDone; r.onSpeech = onSpeech; r.threshold = threshold;
    node.onaudioprocess = (e) => {
      if (!r.active) return;
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(an);
    an.connect(node);
    node.connect(gain);
    gain.connect(ctx.destination);
    const buf = new Float32Array(an.fftSize);
    r.timer = window.setInterval(() => {
      if (!r.active) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (rms > r.threshold) {
        r.speechCount += 1;
        // 连续 2 个采样（约 240ms）才算「开始说话」，避免噪声瞬间打断 AI
        if (!r.speech && r.speechCount >= 2) {
          r.onSpeech?.();
          r.speech = true;
        }
        if (r.speech) { r.silence = 0; r.speechMs += 120; }
      } else {
        r.speechCount = 0;
        if (r.speech) r.silence += 120;
      }

      const tooLong = Date.now() - r.started > 45_000;
      const silentDone = r.speech && r.silence >= 800;

      if (tooLong) {
        if (r.speechMs >= MIN_SPEECH_MS) {
          stop(true);
        } else {
          // 45s 内没有有效语音：丢弃缓冲，继续监听，不触发 ASR
          r.started = Date.now();
          r.chunks.length = 0;
          r.speech = false; r.speechCount = 0; r.silence = 0; r.speechMs = 0;
        }
      } else if (silentDone) {
        if (r.speechMs >= MIN_SPEECH_MS) {
          stop(true);
        } else {
          // 太短的「说话」视为噪声，忽略并继续监听
          r.speech = false; r.speechCount = 0; r.silence = 0; r.speechMs = 0;
        }
      }
    }, 120);
  };

  return { start, stop };
}
