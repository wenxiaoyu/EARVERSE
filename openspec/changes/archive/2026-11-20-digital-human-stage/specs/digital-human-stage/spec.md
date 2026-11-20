# digital-human-stage

## ADDED Requirements

### Requirement: Digital human rendering
Mira SHALL 使用 three.js 渲染 3D 数字人占位模型。

#### Scenario: Load placeholder
- **WHEN** 进入 Live
- **THEN** 加载 `/avatar/readyplayer-me.glb` 并居中显示

### Requirement: Lip sync
数字人嘴型 SHALL 跟随 TTS 振幅。

#### Scenario: Speaking
- **WHEN** Mira 播放语音
- **THEN** 模型 viseme/mouth morph 随振幅变化

### Requirement: Fallback
模型加载失败 SHALL 回退 SVG 形象。

#### Scenario: Load fail
- **WHEN** GLB 加载失败
- **THEN** 显示 TeacherAvatar
