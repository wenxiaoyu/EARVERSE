/* 浏览器录音 → 16-bit PCM WAV（DeepSeek ASR 要求 WAV/Ogg Opus）。
   用 Web Audio 采集，避免 MediaRecorder 产出 webm 被拒。 */

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  let len = 0;
  for (const c of chunks) len += c.length;
  const data = new Float32Array(len);
  let o = 0;
  for (const c of chunks) {
    data.set(c, o);
    o += c.length;
  }
  const buffer = new ArrayBuffer(44 + len * 2);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + len * 2, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, len * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

export function createWavRecorder() {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: ScriptProcessorNode | null = null;
  let gain: GainNode | null = null;
  let chunks: Float32Array[] = [];

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    source = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(4096, 1, 1);
    gain = ctx.createGain();
    gain.gain.value = 0; // 不回声
    chunks = [];
    node.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(node);
    node.connect(gain);
    gain.connect(ctx.destination);
  }

  async function stop(): Promise<Blob> {
    const rate = ctx?.sampleRate ?? 44100;
    node?.disconnect();
    source?.disconnect();
    gain?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    const c = ctx;
    ctx = null;
    if (c) await c.close();
    return encodeWav(chunks, rate);
  }

  return { start, stop };
}
