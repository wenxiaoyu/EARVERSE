# Verify Report — daily-recitation

## Overall Verdict: PASS

### 构建
- `python3 -m pytest tests/ -q` → **139 passed**
- `tsc -b && vite build` → success（dist 产出正常）
- 服务重启 → `/api/health` `{"ok": true, "llm_configured": true}`

### 接口冒烟
- `GET /api/recitation/today?domain=work` → 返回 L2 文章、3 档提示、历史 0 条。
- `POST /api/recitation/generate`（meeting）→ AI 出篇 105 词，落在 L2 允许区间。
- `POST /api/recitation/score`（合成音频）→ ASR 转写成功，完整度 1.0 / 准确度 1.0 / 综合 98.9，AI 复盘返回结构化 summary/wins/misses/drill/next。
- `GET /api/recitation/history` → 记录与 audio_url 正常。
- `GET /api/recitation/attempts/{id}/audio` → 200，RIFF PCM 16k WAV。

### UI（Playwright）
- 导航 7 项，背诵为第 3 项；无 console/page error。
- 背诵页：今日推荐、原文、语块、开始背诵正常。
- 背诵态：3 个提示 pill（L0/L1/L2），选 L2 只显示内容词，无原文泄露。
- 设置页：DeepSeek 获取入口链接到 `https://platform.deepseek.com/sign_in`，新标签打开。
- 结果页：四维分数、复盘、漏词、diff、回放、历史趋势正常。

### 数据清理
- 冒烟产生的 attempt / manual 文章 / 测试音频已删除，画像 recitation 维度重置为初始值；仅保留当天每日推荐缓存。

### 已知限制
- 流利度未做静音段检测；v2 再加停顿分析。
- 今日推荐按 `(domain, level, date)` 缓存；手动「换一篇」不覆盖推荐。
