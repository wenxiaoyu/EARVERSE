# Live Coach Layout

## Why
Live2D 被两栏布局和常驻对话框遮挡；用户希望形象居中、对话默认收起、进入即可收音。

## What Changes
- 舞台改单栏全屏，Live2D 居中。
- 对话面板默认隐藏，点击「对话」浮出，可「隐藏」收起。
- 进入 Live 自动开始收音；底部仅显示收音状态，不再需要「开始」按钮。

## Impact
`Coach.tsx`、`Live2DStage.tsx`、`styles.css`
