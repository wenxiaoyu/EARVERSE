# Spec: coach-report

## ADDED Requirements

### Requirement: AI 教练周报/月报
系统 SHALL 按周与按月生成 AI 教练报告，报告 SHALL 回答「你在变好还是变差、为什么、下一步补哪」，而非仅展示正确率等统计数字。

#### Scenario: 周报生成
- **WHEN** 用户累计训练满一周
- **THEN** 系统生成周报，包含趋势判断（变好/变差）、原因分析、下一步建议

### Requirement: 引用具体错误
教练报告 SHALL 引用用户的具体错误原句作为证据，SHALL 不出现无出处的泛泛结论。

#### Scenario: 报告引用原句
- **WHEN** 报告指出用户某类短板
- **THEN** 报告附上至少一条该短板的原始错误句子与来源事件

### Requirement: 报告可行动
报告的每一条结论 SHALL 附带一个可立即执行的行动建议（练什么、怎么练、练多少），而非仅有评价。

#### Scenario: 结论带行动
- **WHEN** 报告指出「弱读 for/of 薄弱」
- **THEN** 报告给出具体行动（如「接下来 3 天每天 10 分钟弱读对练」）
