# Tasks — Live Coach Mira

## 1. 后端
- [x] 1.1 `coach/context.py`：英文 LearnerBrief + 本地 greeting
- [x] 1.2 `coach/guard.py`：CJK/非英文输入、输出校验、固定英文兜底
- [x] 1.3 `coach/prompts.py`：Mira system prompt + JSON schema
- [x] 1.4 `coach/service.py`：start/turn、LLM 结构化输出、失败回退
- [x] 1.5 `main.py`：`POST /api/coach/start`、`POST /api/coach/turn`
- [x] 1.6 单测：中文输入、中文输出、正常 turn、无 LLM 回退

## 2. 前端形象
- [x] 2.1 `TeacherAvatar.tsx`：SVG 半身像、表情、口型、手势
- [x] 2.2 `MiraCard.tsx`：左侧导航下方入口
- [x] 2.3 `Coach.tsx`：Live Room、字幕、麦克风、文字输入、TTS 播放
- [x] 2.4 `useVadRecorder.ts`：自动停顿录音
- [x] 2.5 `App.tsx` / `api.ts` / `styles.css` 接入

## 3. 验证
- [x] 3.1 后端 pytest
- [x] 3.2 前端 tsc + build
- [x] 3.3 手工进入 Live、Mira 英文欢迎、中文输入英文拒绝、语音轮次
- [x] 3.4 更新 README / 归档
