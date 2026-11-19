# pronunciation Specification

## Purpose
TBD - created by archiving change ai-assessment-pronunciation. Update Purpose after archive.
## Requirements
### Requirement: 朗读发音探测
测验 SHALL 包含朗读环节：给用户若干含典型难点的朗读项（如 /θ//ð/、/v/ vs /w/、/l/ vs /r/、词尾辅音、辅音丛、连读、重音），用户录音后系统交由 AI 评估；评估结果 SHALL 写入画像的「发音」维度。

#### Scenario: 完成一次发音探测
- **WHEN** 用户在测验中朗读一句目标文本并提交录音
- **THEN** 系统返回该次朗读的评分与问题清单（哪些音素/重音/语流有问题），并写入画像发音维度

### Requirement: 可懂度优先的评分
发音评分首版 SHALL 以「可懂度」为准：结合 ASR 转写与目标文本的差异，由 AI 推断可能的发音问题；系统 SHALL 预留音素级评分（强制对齐/GOP）的升级接口，以便后续提升精度。

#### Scenario: 依转写差异推断
- **WHEN** 用户把 think 读得接近 sink，导致转写出现偏差
- **THEN** AI 依差异推断出 /θ/→/s/ 类问题并给出证据与置信度

### Requirement: 发音维度分场景存储
画像的发音维度 SHALL 按场景分轨存储（与听力/词汇一致的 domain 分片），并可跨场景汇总。

#### Scenario: 分场景发音短板
- **WHEN** 用户在「面试」场景朗读较差
- **THEN** 发音短板记入面试轨道，不影响「出门」轨道

### Requirement: 跟读练习
系统 SHALL 提供跟读练习：听一句 → 用户跟读 → 评分反馈；并 SHALL 提供最小对立对（如 ship/sheep、very/wery）的辨听与跟读。

#### Scenario: 跟读反馈
- **WHEN** 用户跟读一句并提交
- **THEN** 系统给出评分与需要改进的具体音/词

### Requirement: 音频供应商约束与降级
发音与 ASR 依赖支持音频的供应商；系统 SHALL 将文本模型与音频供应商分开配置。当未配置音频供应商时，发音探测 SHALL 明确提示并跳过，SHALL NOT 静默失败或伪造评分。

#### Scenario: 未配置音频供应商
- **WHEN** 用户未配置支持音频的供应商
- **THEN** 测验提示"发音探测需要配置音频供应商"，跳过该环节，其余测验照常完成

