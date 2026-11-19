# Verify Report: ai-english-coach

TDD Report Status: consumed
Skipped Unit Tests: 0
Executed Unit Tests: 90

## 构建验证

| 项 | 命令 | 结果 |
|----|------|------|
| 后端导入 | `python3 -c "import app.main"` | ✅ PASS |
| 后端单测 | `python3 -m pytest tests/ -q` | ✅ 90 passed |
| 前端构建 | `npm run build`（tsc + vite） | ✅ PASS（159KB JS / 4.7KB CSS） |
| API 冒烟 | health/seed/plan/scenarios | ✅ PASS |
| 静态托管 | uvicorn 起服务 curl `/` 与 assets | ✅ 200 |

## 端到端覆盖

- 首次测验：start → 18 题自适应作答 → finish（能力边界=2）→ confirm ✅
- 每日计划：4 块编排、总时长 60 ✅
- 训练回填 + 诊断（本地降级）✅
- 场景实战：start → say（SSE 流式降级）→ review（含实时信号）✅
- 报告生成（本地降级，引用错误）✅
- 内容生成：种子降级 + 难度校准 ✅
- 口语评估：未配置模型时 409 明确降级 ✅

## Overall Verdict: PASS

## 备注

- 语音 TTS/ASR、LLM 生成/诊断/报告的真实链路需配置模型 Key 后才能端到端验证；本地已提供确定性的降级路径并通过。
- 测试覆盖 90 例，含画像四态、多场景隔离、自适应边界、三场合毕业、实时信号、难度校准。
