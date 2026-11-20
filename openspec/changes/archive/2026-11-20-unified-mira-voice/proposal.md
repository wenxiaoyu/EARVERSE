# Unified Mira Voice

## Why
Mira 使用服务端神经 TTS，其他页面使用浏览器 SpeechSynthesis，导致音色、自然度和设备差异很大；短句还会因无终止标点被 TTS 插入长停顿。

## What Changes
- 所有英文朗读统一走 `voice.ts` → `/api/speech/tts`，固定 Mira（DeepSeek `stella`）。
- 浏览器 TTS 仅作断网/无 Key 回退。
- 统一语速 0.96；短句自动补终止标点，修复 `behind` 前长停顿。
- 前端内存缓存 + 服务端 TTS 缓存 + 页面预取。
- 设置页移除浏览器音色/音高选择，只保留 Mira 固定音色与试听。
- 切页自动停止当前朗读。

## Impact
`api.ts`、`voice.ts`、`tts.ts`（仅回退）、`Settings.tsx`、`Today.tsx`、`Recitation.tsx`、`Coach.tsx`、`App.tsx`、`main.py`、`speech/tts.py`
