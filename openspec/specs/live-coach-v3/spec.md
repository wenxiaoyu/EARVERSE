# live-coach-v3 Specification

## Purpose
TBD - created by archiving change live-coach-v3. Update Purpose after archive.
## Requirements
### Requirement: Streaming reply
Mira 回复 SHALL 通过 SSE 边生成边显示。

#### Scenario: Streaming
- **WHEN** 用户发送英文消息
- **THEN** 回复逐字显示，并在完成后进入语音播放

### Requirement: Model-level barge-in
Mira 生成期间用户开口 SHALL 中止正在进行的 LLM 请求。

#### Scenario: Interrupt generation
- **WHEN** Mira 正在生成回复且用户开口
- **THEN** 请求被中止，已显示的部分保留，用户这句话继续被识别

### Requirement: Cubism 4 avatar
Mira SHALL 使用 Cubism 4 模型，口型与表情/动作由对话驱动。

#### Scenario: Mao loads
- **WHEN** 进入 Live
- **THEN** 加载 Mao 模型；失败回退 SVG

### Requirement: Tomorrow goal
会话 next focus SHALL 写入明日目标。

#### Scenario: Goal set
- **WHEN** 会话结束生成 next focus
- **THEN** 画像 goal 的 for_date 为明天且 text 等于 next focus

