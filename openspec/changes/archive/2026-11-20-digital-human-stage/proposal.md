# Digital Human Stage

## Why
用户需要 AI 数字人英语老师，而不是 Live2D 动漫形象。readyplayer.me 无法访问，故先用 three.js 官方示例的 Ready Player Me 占位模型跑通数字人管线。

## What Changes
- 移除 Live2D（pixi / cubism / 示例模型）
- 新增 three.js `DigitalHumanStage`：GLB 加载、居中、灯光、口型/眨眼/点头
- TTS 振幅驱动 viseme；对话意图驱动头部姿态
- 占位模型 `/avatar/readyplayer-me.glb`，后续替换用户提供的 `.glb` / `.vrm`

## Impact
`DigitalHumanStage.tsx`、`Coach.tsx`、`styles.css`、`package.json`、`public/avatar/`
