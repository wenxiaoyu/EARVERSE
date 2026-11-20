# live-coach-layout Specification

## Purpose
TBD - created by archiving change live-coach-layout. Update Purpose after archive.
## Requirements
### Requirement: Centered stage
Live2D SHALL be centered in a full-bleed stage.

#### Scenario: Enter Live
- **WHEN** 用户进入 Live
- **THEN** 舞台单栏全屏，Live2D 模型居中显示

### Requirement: Collapsed chat
对话面板 SHALL 默认隐藏，点击「对话」浮出。

#### Scenario: Toggle chat
- **WHEN** 用户点击「对话」
- **THEN** 对话面板浮出；点击「隐藏」收起

### Requirement: Auto listening
进入 Live SHALL 自动开始收音，无需点击开始。

#### Scenario: Auto mic
- **WHEN** 进入 Live
- **THEN** 麦克风自动开启并显示「收音中…」

