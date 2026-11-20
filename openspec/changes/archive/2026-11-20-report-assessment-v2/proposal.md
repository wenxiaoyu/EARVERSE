## Why

现有教练报告把累计数据、听辨正确率、场景成功率混在一起，并用“词汇掌握率/趋势/掌握率”等名称表达不同含义；`period` 只传给 AI，没有真正参与数据筛选。结论看起来完整，但口径不一致、没有样本量和置信度，AI 容易在薄数据上过度解读。

本变更先把报告改成**可解释的能力评估**：按周期统计、六维指标、样本量/置信度、证据链；AI 只负责把结构化事实写成结论。

## What Changes

- 新增 `reports/metrics.py`：按周/月统计，生成六维指标（听力理解、语音感知、词汇自动化、发音可懂度、互动达成、学习投入）。
- 每个指标包含：分数、样本量 `n`、置信度、与上一周期对比、证据类型；样本不足时明确标注。
- `period` 真正参与数据筛选：本周 vs 上周、本月 vs 上月。
- 词汇自动化率只计 `automatic`，不再把 `recognized` 算作掌握。
- 报告 API 返回 `metrics / range / coverage / trend / confidence`。
- AI prompt 只接收 facts；禁止编造数字；数据不足必须说明。
- 前端报告页改用后端周期指标，增加六维画像、置信度、数据覆盖说明；累计词汇构成明确标注“累计”。

## Capabilities

### New Capabilities
- `report-assessment`: 周期化的六维能力评估与置信度说明。

### Modified Capabilities
- `coach-report`: 报告由累计叙事改为周期事实 + 证据链。
- `user-profile`: 复用现有数据，不新增必填字段。

## Impact

- 后端：新增 metrics 模块；重写 `reports/service.py` 的本地/AI 报告输入。
- 前端：报告页 KPI 改为六维画像；图表使用周期数据；新增数据说明。
- 无数据库迁移；现有画像字段够做 Phase 1。
- 已知限制：反应时间、7 天复测、计划完成率留到 Phase 2。
