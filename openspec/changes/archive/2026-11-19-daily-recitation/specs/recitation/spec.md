# recitation

## ADDED Requirements

### Requirement: 独立背诵入口
系统 SHALL 提供独立的一级导航「背诵」，与 Today 解耦，随时可进入和退出，不占 Today 的 60 分钟，不计入 Today 四步进度。

#### Scenario: 随时进入
- **WHEN** 用户点击左侧「背诵」
- **THEN** 打开背诵页，显示当前场景的每日推荐、控制条与历史
- **AND** Today 的进度和计时不受影响

### Requirement: 每日推荐与换一篇
系统 SHALL 按 `(domain, level, date)` 生成并缓存一篇每日推荐；用户可「换一篇」生成新文章，不覆盖当天推荐。

#### Scenario: 当天重复进入
- **WHEN** 用户当天第二次进入背诵页
- **THEN** 看到与第一次相同的每日推荐文章

#### Scenario: 换一篇
- **WHEN** 用户点击「换一篇」
- **THEN** 系统生成并展示一篇新文章，难度仍按当前画像

### Requirement: 分级提示
系统 SHALL 在背诵阶段隐藏原文，并提供 0–2 档提示：无提示、句首词+连接词、内容词；记录本次使用的最高档位。

#### Scenario: 切换提示
- **WHEN** 用户选择 L2
- **THEN** 页面只显示每句的内容词，不显示完整原文
- **AND** 评分时独立性按 L2 计算（50）

#### Scenario: 看整句
- **WHEN** 用户选择「看整句」
- **THEN** 本次不计分，可重新开始

### Requirement: 录音与对齐评分
系统 SHALL 接收背诵录音，经 ASR 转写后与原文对齐，输出完整度、准确度、流利度、独立性四项分数，并给出漏句、漏语块与转写差异。

#### Scenario: 完成一次背诵
- **WHEN** 用户录完并提交
- **THEN** 返回四项分数、综合分、原文/转写对齐 diff、漏句与漏语块
- **AND** 本次记录写入历史与画像

#### Scenario: 未配 ASR
- **WHEN** 未配置音频供应商
- **THEN** 返回 409 与中文提示，引导去设置，不产生脏记录

### Requirement: AI 复盘与飞轮
系统 SHALL 基于评分与差异生成结构化复盘（总结、优点、漏点、发音问题、一个 drill、下次重点），并把漏语块/错音写回画像，供下一次出篇复用。

#### Scenario: 复盘
- **WHEN** 评分完成
- **THEN** 展示复盘卡片，包含至少一条带原文的漏点与一条可执行建议

#### Scenario: 下一次出篇
- **WHEN** 用户次日或换一篇再次生成
- **THEN** prompt 携带 `weak_chunks`、`recent_pron_issues`、当前 level 与今日目标

### Requirement: 难度自适应
系统 SHALL 按历史表现自动升降等级（L1–L5），并在页面展示当前等级。

#### Scenario: 升级
- **WHEN** 最近两次完整度 ≥85% 且提示 ≤L1
- **THEN** 下一次出篇等级 +1（最高 L5）

#### Scenario: 降级
- **WHEN** 最近一次完整度 <60%
- **THEN** 下一次出篇等级 -1（最低 L1）

### Requirement: 历史与降级
系统 SHALL 保留最近 30 次记录与 7 天录音；未配 LLM 时使用分层种子文章，保证可演示。

#### Scenario: 查看历史
- **WHEN** 用户打开背诵页
- **THEN** 显示最近记录（日期、标题、等级、四项分、提示档）与趋势

#### Scenario: 无 Key
- **WHEN** 未配置 LLM
- **THEN** 仍可拿到对应等级种子文章并完成背诵与本地复盘
