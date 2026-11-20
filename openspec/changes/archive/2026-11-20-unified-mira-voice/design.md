# Design — Unified Mira Voice

## Voice pipeline
`speak/playMira` → `normalizeSpeakText`（补 `.`）→ front cache / inflight dedupe → `/api/speech/tts`（voice=stella）→ audio playback.
失败回退 `tts.ts` 浏览器英文音色。

## Why punctuation
DeepSeek 对 `we're a bit behind` 这类无终止标点短句会产生约 400ms 词中停顿；补 `.` 后停顿消失。只改合成文本，不改进界面显示。

## Latency
- 服务端 LRU 200 条 WAV 缓存
- 前端 80 条 Blob 缓存
- Today 前三项、Recitation 全文预取
- 同一 key 的 inflight 请求复用

## Consistency
所有 server TTS 请求显式 `voice=stella`；OpenAI 兼容端点仍使用自身配置音色。设置页不再提供浏览器音色选择。
