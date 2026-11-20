# Design — Live Coach v2

## D1 全双工打断
- VAD 增加 `onSpeechStart`，持续麦克风在 Mira 说话前启动。
- `bargeIn()`：检测到用户开口即 `stopMira()`、停口型、进入 curious/lean_in。
- 说话时监听门限 0.035，安静时 0.018，配合浏览器回声消除。
- 仍为轮次式 ASR/LLM；打断的是 TTS 播放，不等模型流式。

## D2 Live2D
- 懒加载 `Live2DStage`，pixi.js 走异步 chunk，避免拖慢首屏。
- `live2d.min.js`（Cubism 2.1 运行时）全局引入；Shizuku 示例模型本地托管。
- 表情映射 f01–f04，动作映射 idle/tapBody/pinchOut/flickHead/shake。
- 口型用 `PARAM_MOUTH_OPEN_Y` 跟随 TTS 振幅。
- 失败回退 `TeacherAvatar` SVG；带 NOTICE 说明示例模型，商用前需换授权模型。

## D3 会话总结回流
- `coach/end`：过滤英文历史 → LLM 生成 JSON → 英文守卫。
- 写入 `domain.coach.sessions/weak_points/next_focus/last_summary`。
- corrections 以 `kind=speaking` 写入错误史，参与报告。
- 无 LLM / 无用户发言时回退本地总结，不伪造弱项。
