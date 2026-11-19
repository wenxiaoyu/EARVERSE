# training-loop Specification

## Purpose
TBD - created by archiving change ai-english-coach. Update Purpose after archive.
## Requirements
### Requirement: 训练结果回填
所有训练（听音猜义、听写、口语、场景对话）的结果 SHALL 在训练事件结束时实时回填用户画像，更新相应维度的条目。

#### Scenario: 听写错误回填
- **WHEN** 用户在听写中漏词并标记原因
- **THEN** 画像的错误史新增该原句，听力盲区维度对应条目被强化

### Requirement: AI 每日诊断
每日训练结束 SHALL 生成一份 AI 诊断，指出当天暴露的短板、与历史表现的对比，以及「下一步补什么」的具体建议。诊断 SHALL 引用当天的具体错误原句。

#### Scenario: 诊断引用错误
- **WHEN** 用户完成当天全部训练块
- **THEN** 系统生成诊断，其中至少引用一条当天出现的具体错误原句

### Requirement: 次日训练计划生成
系统 SHALL 基于最新画像生成次日的训练计划，计划 SHALL 优先安排用户当前最薄弱维度的针对性练习，而非固定顺序。

#### Scenario: 计划针对短板
- **WHEN** 画像显示用户「弱读 for/of」是当前最大短板
- **THEN** 次日计划优先包含弱读针对性练习

### Requirement: 1 小时训练编排
系统 SHALL 将每天 1 小时训练编排为多块结构（激活复习 → 新内容训练 → 场景实战 → 复盘收尾），各块的时长与内容 SHALL 由 AI 按用户当日状态与画像动态决定，而非固定配比。

#### Scenario: 动态块时长
- **WHEN** 用户当日状态疲惫或历史数据显示中途走神
- **THEN** AI 缩短实战块时长、延长激活复习块，并调整各块顺序

