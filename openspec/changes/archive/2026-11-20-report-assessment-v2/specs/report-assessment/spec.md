# report-assessment

## ADDED Requirements

### Requirement: 周期化统计
报告 SHALL 按本周/本月真正筛选数据，并使用同一周期计算所有指标、趋势和 AI facts。

#### Scenario: 切换周期
- **WHEN** 用户切换「本周 / 本月」
- **THEN** 六维指标、趋势、样本量、AI 结论都只使用该周期数据

### Requirement: 六维能力画像
报告 SHALL 展示六个独立维度，不合成单一总分：听力理解、语音感知、词汇自动化、发音可懂度、互动达成、学习投入。

#### Scenario: 展示维度
- **WHEN** 打开报告
- **THEN** 每个维度显示分数（或“—”）、样本量 n、置信度、与上一周期变化（若可比较）

#### Scenario: 词汇口径
- **WHEN** 计算词汇自动化率
- **THEN** 只把 `automatic` 计为掌握，`recognized` 不计入

### Requirement: 样本量与置信度
报告 SHALL 对比例指标使用 Wilson 95% 区间，并在样本不足时明确标注，不显示误导性的 0%/100%。

#### Scenario: 小样本
- **WHEN** 某维度 n 低于最小样本
- **THEN** 显示“样本不足”，不给出强结论

### Requirement: 周期对比
报告 SHALL 对比当前周期与上一周期；当前/上期都达到最小样本才计算变化，变化小于 3 个百分点视为持平。

#### Scenario: 上周没有数据
- **WHEN** 上一周期无数据
- **THEN** 不显示“变好/变差”，只展示当前周期和“无对比基线”

### Requirement: AI 事实约束
AI SHALL 只根据后端 facts 写报告，不得编造数字；样本不足时必须说明。

#### Scenario: 低置信度
- **WHEN** 某维度 n 低
- **THEN** AI 结论必须标注样本不足或低置信，不得下强结论

### Requirement: 累计与周期区分
词汇构成、听力盲区、发音明细等累计数据 SHALL 明确标注“累计”，不得混入本周/本月结论。

#### Scenario: 词汇构成
- **WHEN** 用户查看词汇构成
- **THEN** 标题或说明标注“累计”，并说明不是周期变化
