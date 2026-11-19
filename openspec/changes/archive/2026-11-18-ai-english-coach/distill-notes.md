# Distill Notes: ai-english-coach

## 可复用知识

### 1. 影像「哑巴词汇」的分层探测法（核心方法论）

要区分「不认识 / 认识但听不出 / 能懂但慢 / 已自动化」，必须分两次探：
- 层 1（看）：展示单词，问「认识意思吗」→ seen_known
- 层 2（听）：隐藏单词，只播发音，问「听出来了吗」+ 记录反应毫秒
- 判据：seen=True & heard=False → `deaf`（哑巴词汇，最值钱的短板信号）；heard=True & reaction>1200ms → `recognized`（未自动化）。

实现位置：`app/backend/app/models.py::_recompute_vocab_state`、`assessment/engine.py::classify_vocab`。

### 2. 自适应测验的两条选择策略

- **能力边界二分**：从中间难度起，对→难一档、错→易一档，收敛出「能力边界档位」。
- **短板定向追加**：某 tag 累计错 ≥2 次，后续优先出同 tag 未问题目。
- 纯逻辑实现 + 18 例单测，可不依赖 LLM 独立运行。

### 3. 多场景并行 = 画像按 domain 分片 + 全局层

- `domains[domain]` 存各场景独立短板/进度/节奏；
- `global` 层存跨场景通用短板，避免「换场景就全忘」；
- 「三场合毕业」以 `domain:scenario` 为 venue 去重计数，跨 domain 汇总。

### 4. 1 小时编排 = 权重等比缩放，永不丢分钟

`training/loop.py::_rebalance` 用最大余数法把权重缩放到精确总时长（整数、无丢分钟），
状态/画像驱动只改权重不改总数。可扩展为 AI 微调权重。

### 5. AI 不可用时的确定性降级矩阵

| 能力 | 主路径 | 降级路径 |
|------|--------|---------|
| 诊断/报告 | LLM | 本地 `_local_explanation` / `local_report`（引用错误原句） |
| 内容 | LLM 生成 | 种子语料按难度筛选 |
| 场景对话 | LLM 流式 | 离线 beats 剧本 |
| 语音 | 云端 TTS/ASR | 浏览器 SpeechSynthesis（TTS）；ASR 明确 409 提示 |

## 坑与经验

1. **Python 3.14 移除隐式事件循环**：`asyncio.get_event_loop()` 会抛错，测试统一用 `asyncio.run`。
2. **sqlite `:memory:` 必须保持同一连接**且手动设 `row_factory`，否则 fetch 返回 tuple。
3. **静态托管路径**：`Path(__file__).resolve().parents[N]` 要数清层级（main.py 在 `app/backend/app/`，app 根是 parents[2]）。
4. **OpenSpec 1.2.0 原生无 ade-* schema/checklist.js**：用 spec-driven + `openspec validate` 替代 Gate。
