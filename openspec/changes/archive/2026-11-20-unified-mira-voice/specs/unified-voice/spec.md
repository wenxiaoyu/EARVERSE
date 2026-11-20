# unified-voice

## ADDED Requirements

### Requirement: All English playback uses Mira
所有英文朗读 SHALL 优先通过服务端 TTS 使用固定 Mira / stella 音色。

#### Scenario: Play in Today
- **WHEN** 用户点击今天页面的播放按钮
- **THEN** 请求 `/api/speech/tts` 且携带 `voice=stella`

### Requirement: Graceful fallback
服务端不可用或未配置 Key 时 SHALL 回退浏览器英文音色。

#### Scenario: Backend TTS fails
- **WHEN** `/api/speech/tts` 返回错误
- **THEN** 仍播放英文，不阻断页面

### Requirement: Natural short phrases
无终止标点的短句 SHALL 在合成前补 `.`，避免词中长停顿。

#### Scenario: we're a bit behind
- **WHEN** 朗读无标点短句 `we're a bit behind`
- **THEN** 合成文本为 `we're a bit behind.`
