# live-coach-v2

## ADDED Requirements

### Requirement: Barge-in
Mira 说话时用户开口 SHALL 立即停止 TTS 并进入新轮次。

#### Scenario: Interrupt Mira
- **WHEN** Mira 正在播放语音且用户开始说话
- **THEN** 语音立即停止，麦克风继续收录用户这句话

### Requirement: Live2D avatar
Mira SHALL 使用 Live2D 形象；口型 SHALL 跟随 TTS 振幅，表情和动作 SHALL 由对话意图驱动。

#### Scenario: Live2D loaded
- **WHEN** 用户进入 Mira Live
- **THEN** 显示 Live2D 模型；加载失败则回退 SVG 形象

### Requirement: Session debrief feedback
结束会话 SHALL 生成英文总结，并把弱项与口语改写回流到学习档案。

#### Scenario: End session
- **WHEN** 用户点击结束对话
- **THEN** 显示英文 debrief，画像 `coach` 段与错误史被更新
