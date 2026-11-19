# Review Report: ai-english-coach

## Overall Verdict: PASS

## 审查范围

git diff 不可用（本目录非独立 git 仓库，位于更大仓库子目录）。审查基于新增文件：
- `app/backend/app/**`（models/storage/config/seeddata/assessment/training/scenarios/generation/reports/speech/llm/main）
- `app/backend/tests/**`（7 个测试文件，90 用例）
- `app/frontend/src/**`（App + 5 个视图 + api + 样式）
- `app/seed/*.json`（种子语料）
- `app/start.command` / `app/README.md`

## 与 design 的一致性

| 决策 | 落地情况 |
|------|---------|
| D1 Python/FastAPI | ✅ |
| D2 SQLite + JSON 画像 | ✅ |
| D3 React+Vite+TS | ✅ |
| D4 多轨道画像（domain 分片 + global 层） | ✅ 有隔离单测 |
| D5 多角色 LLM 管线 + 成本分层 | ✅ 角色 prompt 分离；高频/低频 max_tokens 不同 |
| D6 云端 TTS + Whisper ASR | ✅ 接口就绪，含浏览器 TTS 降级 |
| D7 种子降级 | ✅ 117 词/52 句/15 规则/20 功能/10 场景 |
| D8 自适应测验 | ✅ 二分边界 + 定向追加 + 反应时间 |

## 与 specs 的一致性

7 个 capability 的关键 requirement 均有实现与测试锚点：
- user-profile：四态词汇、分轨、可溯源 ✅
- first-assessment：分层探测、自适应、反应时间、口语评估、画像确认 ✅
- training-loop：回填、诊断、次日计划、1h 编排 ✅
- scenario-practice：群聊多角色、实时信号、成功度量、三场合毕业 ✅
- content-generation：按画像生成、种子降级、难度校准 ✅
- coach-report：周报/月报、引用错误、可行动 ✅
- multi-domain-tracks：场景选择、独立轨道、分场景诊断 ✅

## P0 / P1 / P2 问题

- **P0**：无。
- **P1**：口语评估与场景 LLM 对话强依赖模型配置；未配置时降级可用但非 AI 生成。属于运行期配置约束，非代码缺陷。
- **P2**（建议后续）：
  1. `app/backend/data/` 未加入 .gitignore 提示。
  2. `main.py` 中 FastAPI `TestClient` 与 httpx 版本有弃用告警（starlette 提示装 httpx2），不影响运行。
  3. 未做多用户鉴权（design 明确 Non-Goal，仅预留 user_id）。
  4. 前端无自动化 E2E（本变更范围外，可用 e2e suite 补齐）。

## 结论

实现与 design/specs 一致，测试充分（90 用例全通过），构建与端到端冒烟通过。建议进入 Doc（distill + archive）。
