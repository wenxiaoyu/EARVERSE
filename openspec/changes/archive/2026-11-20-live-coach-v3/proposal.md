# Live Coach v3

## Why
用户要求三步同步快速实现：模型级打断（LLM 流式 + 插话中止）、成人老师风格授权 Live2D、会话总结进入明日目标。

## What Changes
- 流式 LLM：`POST /api/coach/turn/stream` SSE 输出英文回复；前端边生成边显示。
- 模型级打断：生成期间麦克风持续监听，用户开口即 AbortController 中止 LLM 请求，保留已生成部分。
- Live2D 换为 Cubism 4 官方示例 Mao，并引入 Cubism Core 运行时（附 NOTICE，商用前仍需换授权模型）。
- 会话结束把 next focus 写成明日目标（`goal.for_date = 明天`）。

## Impact
`coach/prompts.py`、`coach/service.py`、`main.py`、`Coach.tsx`、`Live2DStage.tsx`、`index.html`、`public/live2d/mao`
