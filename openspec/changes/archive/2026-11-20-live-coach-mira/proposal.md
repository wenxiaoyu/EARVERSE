# Live Coach Mira

## Why

用户需要一个随时可以开口的英语陪练，而不是又一个题库。现有 Today / 场景实战是任务驱动的；缺少一个「进入状态就能自由聊」的 AI 老师。Mira 必须了解学习者档案、能聊任何话题，但只能用英语交流。

## What Changes

- 左侧导航下方新增 Mira 虚拟形象入口，点击进入 Live Room。
- 新增 Coach Live 页面：半身形象、实时字幕、自动 VAD 语音轮次、文字兜底。
- 后端新增 `coach` 模块：LearnerBrief、英语-only 输入/输出门禁、Mira prompt、会话 turn。
- Mira 能引用用户目标、薄弱音、易混音、哑词、最近错误、背诵等级、最近场景。
- 形象有状态机与肢体语言：倾听、思考、解释、纠错、鼓励、共情、困惑、庆祝、告别。
- 只懂英语是硬约束：中文输入不进入 LLM，AI 输出含中文则重试/回退，TTS 只合成英文。

## Impact

- 前端：`App.tsx`、`views/Coach.tsx`、`components/TeacherAvatar.tsx`、`components/MiraCard.tsx`、`components/useVadRecorder.ts`、`api.ts`、`styles.css`
- 后端：`app/coach/*`、`main.py`、`llm/prompts.py` 可选
- 不影响 Today 60 分钟与四步进度；陪练独立。
