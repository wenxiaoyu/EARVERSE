## 1. 指标与周期

- [x] 1.1 新增 `app/reports/metrics.py`：period range、current/previous 统计
- [x] 1.2 六维指标：听力/语音/词汇/发音/互动/投入
- [x] 1.3 Wilson 区间、置信度、最小样本、delta 阈值
- [x] 1.4 周期内每日 trend、coverage、active_days

## 2. 报告服务

- [x] 2.1 `reports/service.py` 使用 metrics facts
- [x] 2.2 本地报告：结论 / 关键短板 / 下周计划，引用 n 与置信度
- [x] 2.3 新 AI prompt `report_v2_messages`，禁止编数字，样本不足要说明
- [x] 2.4 API 返回 `metrics/range/coverage/trend/confidence`

## 3. 前端

- [x] 3.1 报告页六维画像卡（分数/delta/n/置信度）
- [x] 3.2 周期标签与数据覆盖说明
- [x] 3.3 趋势图改用后端 trend，改名为听辨正确率
- [x] 3.4 词汇/盲区/发音标注“累计”
- [x] 3.5 AI 结论仍用 sections/headline/next_week

## 4. 验证

- [x] 4.1 单测：周期边界、Wilson、小样本、delta、无数据
- [x] 4.2 全量 pytest 通过
- [x] 4.3 前端构建 + 接口冒烟
- [x] 4.4 手工检查本周/本月切换后所有 KPI 使用同一周期
