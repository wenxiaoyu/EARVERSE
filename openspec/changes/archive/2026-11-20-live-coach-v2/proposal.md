# Live Coach v2

## Why
Mira Live 需要更像真人的实时对话：用户能在 Mira 说话时直接插话；形象升级为 Live2D；结束会话后把弱项和口语改写回流到学习档案。

## What Changes
- 全双工打断：Mira 开口前即监听，用户一开口立即停语音并进入新轮次。
- Live2D 形象：pixi-live2d-display + Shizuku（Cubism 2.1 示例模型），口型跟随 TTS 振幅，表情/动作由意图驱动；加载失败回退 SVG 形象。
- 会话总结：`POST /api/coach/end` 生成英文 debrief，写入画像 `coach` 段，口语改写写入错误史，下次进入会被 LearnerBrief 引用。

## Impact
`Coach.tsx`、`useVadRecorder.ts`、`Live2DStage.tsx`、`index.html`、`api.ts`、`voice.ts`（复用）、`coach/{service,prompts,context}.py`、`models.py`、`main.py`、`package.json`
