# Design — Live Coach v3

## Streaming
- 复用 `LLMClient.stream_chat`；纯文本提示，不要求 JSON。
- SSE：`delta`（逐 token）+ `done`（最终 reply/mood/gesture）。
- 中文 token 直接丢弃，最终回退英文。

## Model-level barge-in
- `send` 在请求前启动 VAD 监听；`onSpeechStart` 调用 `bargeIn()`。
- `bargeIn()` abort 当前 fetch；已流出的部分保留为 assistant 消息。
- 中断后用户继续说完，VAD 自动发起下一轮。

## Live2D
- 换用 Mao（Cubism 4），`live2dcubismcore.min.js` 全局引入，懒加载 `cubism4` chunk。
- 表情 exp_01–exp_08，动作 Idle/TapBody。
- 仍带 SVG 回退与 NOTICE。

## Tomorrow goal
- `coach/end` 把 `next_focus` 写入 `models.set_goal(..., for_date=明天)`。
