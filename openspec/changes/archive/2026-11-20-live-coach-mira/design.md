# Design — Live Coach Mira

## D1 人设

Mira：30 岁左右、温暖、精准、略带幽默的英语陪练。聊天优先，纠错第二。每次最多问一个问题。只懂英语、只说英语、不翻译中文。

## D2 入口

左侧导航下方放 `MiraCard`：小头像 + “Mira / 英语陪练 / LIVE” + 在线点。点击进入 `coach` tab，不新增导航项，避免 8 项拥挤。

## D3 形象

- 2D SVG 分层半身像，3/4 侧坐，桌面/笔记本作手势落点
- 深橄榄外套、米白衬衫、琥珀胸针；细线 + 纸感，和 EARVERSE editorial 风格一致
- 状态：idle / listening / thinking / speaking / correcting / encouraging / empathy / confused / celebrating / goodbye
- 手势枚举：`none|nod|lean_in|open_palm|point_up|hand_on_chest|shrug|thumbs_up|wave|chin_tap`
- 口型用 TTS 音频振幅驱动；思考/倾听用手势和头部姿态；`prefers-reduced-motion` 降级

## D4 实时链路

MVP：自动 VAD 轮次对话。
`mic -> VAD 停顿 -> WAV -> /api/speech/asr -> /api/coach/turn -> 文本 + TTS 音频 -> 播放 + 口型`
教师语音用后端 TTS，失败回退浏览器 TTS。目标首音频 1.5–3s。Phase 2 再做全双工打断。

## D5 LearnerBrief

后端把画像压成英文 brief：目标、六维、弱音、易混、哑词、最近错误、发音错点、最近场景、背诵等级、活跃天数。不把中文 label、原始日志直接塞给 LLM，减少中文泄漏。

## D6 英语-only 门禁

1. 输入：含 CJK/日文/韩文 -> 不进入 LLM，返回固定英文引导
2. Prompt：Mira does not understand Chinese; never output Chinese; never translate
3. 输出：CJK 扫描 -> 重试一次 -> 固定英文兜底
4. TTS：只合成英文；中文文本拒绝
5. 存储/字幕：Mira 消息只保留英文；不生成中文翻译

## D7 会话

不落库，前端保留当前会话最近 12 轮；发送 turn 时带 history。结束只清空当前会话，不影响画像。后续可加 `coach_sessions` 持久化。
