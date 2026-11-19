# Review Report — daily-recitation

## Overall Verdict: PASS

### 边界
- Today 四步 / 60 分钟时钟 / 测验 / 实战 / 报告逻辑未改动。
- 背诵为独立导航第 3 项，只读写 `domains[domain].recitation` 与 `recent_pron_issues`/`weak_chunks`。
- 旧画像通过 `ensure_domain` 自动回填 `recitation` 默认结构，无需迁移。

### 安全与错误处理
- 密钥仍只存后端；前端只显示 masked。
- 录音评分未配 ASR 返回 409；401/402/429/550 转中文提示。
- 录音文件限制在 `data/recitation_audio/`，7 天后清理；历史每场景保留 30 次。
- 上传文件只按生成的 attempt id 命名，不使用用户文件名。

### 代码质量
- 出篇、提示、评分、复盘全部纯函数可单测；LLM 失败逐层降级到种子/本地复盘。
- 提示档位 3 档（L0/L1/L2），旧 hint=3 数据在前端归一到「关键词」、后端夹到 L2。
- 难度升/降只看完整度与提示档，不会因正常使用关键词提示而误降级。

### Needs Judgment
- 流利度 v1 只用 wpm + 时长，没有停顿检测；已记录为 v2。
- ASR 对同义改写/漏词可能误判，页面同时展示转写供用户判断。

### 结论
可进入 verify。
