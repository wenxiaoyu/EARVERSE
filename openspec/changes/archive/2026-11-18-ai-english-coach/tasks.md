# Tasks: ai-english-coach

## 1. 项目骨架

- [x] 1.1 初始化后端 FastAPI 项目结构，声明依赖（fastapi/uvicorn/sqlite/httpx 等）[mode: standard]
- [x] 1.2 初始化前端 React + Vite + TypeScript 项目骨架 [mode: standard]
- [x] 1.3 后端静态托管前端构建产物，配置开发环境 API 代理 [mode: standard]

## 2. 数据层

- [x] 2.1 实现画像数据模型：domain 分片（work/travel/interview 等）+ 全局层，含听力盲区/词汇掌握度/表达回避/场景战绩/错误史五维度 [mode: tdd]
- [x] 2.2 实现 SQLite 存储层与画像 CRUD 接口（含 JSON 字段序列化）[mode: tdd]
- [x] 2.3 抽取种子数据：CARDS/SENTENCES/REDUCTIONS/SKILLS/SCENARIOS 转 JSON/YAML 文件 [mode: standard]
- [x] 2.4 为种子数据补充难度标定字段，建立标定基准 [mode: standard]

## 3. LLM 编排基础

- [x] 3.1 实现 OpenAI 兼容 LLM 客户端与流式 SSE 通道 [mode: tdd]
- [x] 3.2 实现配置管理（base_url/api_key/model 读写，沿用 env.config.json 模式）[mode: standard]
- [x] 3.3 定义多角色 prompt 模板：评估器/诊断器/内容生成器/场景演员/教练报告器 [mode: standard]

## 4. 语音能力

- [x] 4.1 集成云端 TTS（含语流变形参数：弱读/连读还原）[mode: tdd]
- [x] 4.2 集成 Whisper 系 ASR 转写接口（本地与云端可切换）[mode: tdd]

## 5. 阶段 0：首次 AI 测验

- [x] 5.1 实现分层探测前端交互（看→听→说中文，记录反应时间）[mode: tdd]
- [x] 5.2 实现自适应出题算法（能力边界二分定位 + 短板定向追加）[mode: tdd]
- [x] 5.3 实现口语产出评估（录音 → ASR 转写 → LLM 评分）[mode: tdd]
- [x] 5.4 实现画像产出与用户确认交互（呈现判断、支持纠正、确认后生效）[mode: tdd]

## 6. 阶段 1：训练闭环

- [x] 6.1 实现训练结果回填画像（听音/听写/口语三类事件）[mode: tdd]
- [x] 6.2 实现 AI 每日诊断（引用当天具体错误原句）[mode: tdd]
- [x] 6.3 实现次日训练计划生成（优先最薄弱维度）[mode: tdd]
- [x] 6.4 实现 1 小时 4 块动态编排（激活复习/新内容/实战/复盘，块时长随状态调整）[mode: tdd]

## 7. 阶段 2：场景实战

- [x] 7.1 实现群聊场景：多角色（≤3 人）+ 隐藏立场 + 流式对话 [mode: tdd]
- [x] 7.2 实现实时短板观察（卡顿/回避/用错信号捕捉并回填）[mode: tdd]
- [x] 7.3 实现场景成功度量 + 言语功能三场合毕业判定 [mode: tdd]

## 8. 阶段 3：内容生成

- [x] 8.1 实现按画像生成听音词与听写句 [mode: tdd]
- [x] 8.2 实现难度标定与用户反馈动态校准 [mode: tdd]
- [x] 8.3 实现冷启动种子 → 画像充足后 AI 生成的切换逻辑 [mode: tdd]

## 9. 阶段 4：教练报告

- [x] 9.1 实现周报/月报生成（趋势判断 + 原因分析 + 下一步建议）[mode: tdd]
- [x] 9.2 实现报告引用错误原句 + 可行动建议的呈现 [mode: tdd]

## 10. 多场景并行轨道

- [x] 10.1 实现场景选择 UI（可多选）[mode: standard]
- [x] 10.2 实现多轨道独立画像/进度/复习节奏（互不影响）[mode: tdd]
- [x] 10.3 实现分场景诊断与报告（不合并为笼统结论）[mode: tdd]

## 11. 端到端集成与验证

- [x] 11.1 前后端联调，走通「评估→训练→实战→复盘→明日计划」完整闭环 [mode: standard]
- [x] 11.2 构建打包 + 启动脚本（替代原 start.command）[mode: standard]
