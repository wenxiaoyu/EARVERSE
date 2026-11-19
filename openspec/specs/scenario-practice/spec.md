# scenario-practice Specification

## Purpose
TBD - created by archiving change ai-english-coach. Update Purpose after archive.
## Requirements
### Requirement: 群聊式场景
场景实战 SHALL 由 AI 扮演多个角色（最多 3 人），每个角色有独立的立场、语域与说话方式，AI SHALL 不向用户暴露角色立场。对话 SHALL 以「办成一件具体的事」为目标，而非围绕话题闲聊。

#### Scenario: 多角色各持立场
- **WHEN** 用户进入一个场景实战
- **THEN** 系统呈现一个待办目标（如「让老板接受延期」），由多个 AI 角色按各自隐藏立场与用户对话

### Requirement: 实时短板观察
对话过程中系统 SHALL 实时捕捉用户的表现信号：卡顿、回避某类表达、用词错误、请求重说。这些信号 SHALL 在对话结束时汇总为结构化记录回填画像。

#### Scenario: 捕捉回避信号
- **WHEN** 用户在需要「直接拒绝」时绕圈子不直说
- **THEN** 系统记录该「表达回避」信号，关联到对应言语功能

### Requirement: 场景成功度量
系统 SHALL 以「用户是否在对话中办成了目标的事」为成功判据，成功与否由 AI 依据对话结果判定并记录到场景战绩。

#### Scenario: 成功记录
- **WHEN** 用户在一个场景中达成对话目标
- **THEN** 系统将该场景标记为「办成」，并记录该场景对应的言语功能完成一次

### Requirement: 言语功能毕业标准
同一言语功能 SHALL 在 3 个不同场合各办成 1 次才被判定为「会了」。系统 SHALL 追踪每个言语功能在不同场合的完成情况，并据此决定是否继续安排该功能的训练。

#### Scenario: 三场合毕业
- **WHEN** 用户在 3 个不同场景中分别办成了同一言语功能（如「拒绝请求」）
- **THEN** 系统将该言语功能标记为「会了」，降低其在后续训练中的优先级

