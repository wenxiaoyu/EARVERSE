# live-coach Specification

## Purpose
TBD - created by archiving change live-coach-mira. Update Purpose after archive.
## Requirements
### Requirement: Mira entry
左侧导航下方 SHALL 显示 Mira 虚拟形象入口；点击进入 Live Room。

#### Scenario: Enter Mira Live
- **WHEN** 用户点击左侧导航下方的 Mira 卡片
- **THEN** 打开 Live Room，显示 Mira 形象、英文问候和对话输入区

### Requirement: English-only
Mira SHALL only output English. 中文输入 SHALL 被拒绝并收到英文引导；AI 输出含中文 SHALL 重试或回退英文。

#### Scenario: Chinese input
- **WHEN** 用户输入中文
- **THEN** 请求不进入 LLM，Mira 用英文引导用户改用英语

#### Scenario: Chinese model output
- **WHEN** 模型返回含中文的回复
- **THEN** 系统重试一次；仍含中文则使用固定英文兜底

### Requirement: Learner context
Mira SHALL receive an English LearnerBrief containing goal, weaknesses, vocab, recent errors, pronunciation issues, scenario history and recitation level.

#### Scenario: Greeting uses learner data
- **WHEN** 用户进入 Live Room
- **THEN** Mira 的英文问候可以引用今日目标、薄弱音或哑巴词汇，但不输出中文档案

### Requirement: Body language
Mira SHALL have at least 6 states and 8 gestures driven by conversation intent; speaking mouth SHALL follow TTS amplitude.

#### Scenario: Correcting gesture
- **WHEN** 后端返回 `mood=correcting` 或 `gesture=point_up`
- **THEN** 形象切换到对应表情/手势，并在语音结束后回到自然姿态

### Requirement: Real-time turn
用户 SHALL be able to speak naturally; system SHALL auto-detect end of speech, transcribe, reply, and play teacher audio. Text fallback SHALL exist.

#### Scenario: Voice turn
- **WHEN** 用户点击开始说话并说完一句英文
- **THEN** 系统在静音后自动上传音频、显示英文回复并播放 Mira 语音

#### Scenario: Text fallback
- **WHEN** 麦克风不可用或用户选择打字
- **THEN** 用户仍可通过英文输入完成同一轮对话

