# 耳界 EARVERSE · AI 英语教练

> 不用翻译，听见就懂。每天 1 小时，听得懂、接得上、说得出。

AI 驱动的英语交流教练。目标：3~6 个月内从「开会能听懂大意但不敢开口」到「能独立应付工作会议里的听说」。
每天 1 小时，由 AI 编排（激活复习 → 新内容训练 → 场景实战 → 复盘收尾）。

规格真相源：`openspec/changes/ai-english-coach/`（proposal / specs / design / tasks）。

## 结构

```
app/
├── backend/            FastAPI 后端（画像、测验、编排、场景、报告、语音）
│   ├── app/
│   │   ├── models.py        用户画像数据模型（多场景分轨）
│   │   ├── storage.py       SQLite 画像持久化
│   │   ├── config.py        LLM/语音配置管理
│   │   ├── seeddata.py      种子语料加载
│   │   ├── assessment/      自适应测验引擎
│   │   ├── training/        每日 1 小时编排
│   │   ├── scenarios/       群聊式场景实战
│   │   ├── generation/      AI 内容生成
│   │   ├── reports/         教练报告
│   │   ├── speech/          TTS / ASR
│   │   ├── llm/             LLM 客户端 + 多角色 prompt
│   │   └── main.py          HTTP API + 静态托管
│   └── tests/          pytest（80+ 用例）
├── frontend/           React + Vite + TS 前端
├── seed/               从旧 data.js/scenarios.js 抽取的种子语料
└── start.command       一键启动（后端托管前端）
```

## 快速开始

```bash
# 1. 安装后端依赖
python3 -m pip install -r app/backend/requirements.txt

# 2. 构建前端
cd app/frontend && npm install && npm run build && cd ../..

# 3. 启动
./app/start.command
# → http://127.0.0.1:8000
```

## 配置模型（可选但推荐）

在「设置」页填入 OpenAI 兼容接口即可启用全部 AI 能力：
- base_url 例：`https://api.deepseek.com/v1`
- model 例：`deepseek-chat`
- 密钥：只存本机后端，不入浏览器

**DeepSeek 同时提供文本与音频（TTS/ASR）**，填一次密钥即可：
- 文本：`/v1/chat/completions`（模型 `deepseek-flash`）
- 发音评估：`/v1/tools/asr`（16-bit PCM WAV）
- 朗读：`/v1/tools/tts`（`stella`/`tide`）
未配置时系统自动降级：测验用种子题、计划/报告走本地规则、场景走离线剧本。

## 测试

```bash
cd app/backend && python3 -m pytest tests/ -q
```

## 长期运行 / 自启 / 热更新

用 macOS 原生 `launchd` 管理：**LaunchDaemon（开机自启，免登录）+ 崩溃自愈 + 常驻 `127.0.0.1:8000`**。

```bash
sudo ./app/scripts/install-daemon.sh   # 一次性：安装开机自启（LaunchDaemon），立即启动
./app/scripts/service.sh status   # 状态
./app/scripts/service.sh logs     # 跟随日志
./app/scripts/service.sh stop     # 停止（plist 保留，下次登录仍自启）
./app/scripts/service.sh uninstall# 彻底卸载（不再自启）
```

### 改代码后如何生效

| 场景 | 做法 |
|------|------|
| 改前端 `src/` | 自动：`vite build --watch` 实时重编译，刷新页面即最新 |
| 改后端 `.py` | 自动：`uvicorn --reload` 热重启 |
| 改了依赖 / 想强制干净重启 | 手动：`./app/scripts/restart.sh`（自动编译 → 重启服务） |

- 日志：`app/logs/coach.out.log` / `app/logs/coach.err.log`
- 架构：`serve.sh` → `supervise.py`（同时托管 `npm run watch` 与 `uvicorn --reload`，统一接收 SIGTERM 优雅退出）
- 进程崩溃 → launchd 5 秒内自动拉起整套

> 说明：默认已是 LaunchDaemon（开机即启、无需登录）。若只想「登录后自启」，可 `./app/scripts/service.sh uninstall` 后运行 `./app/scripts/install.sh`（LaunchAgent 模式）。

## 训练与评估（AI 驱动）

- **首次测验**：AI 按场景+上版画像出题（含难度与答案键）；**先只听发音选中文**，没听出才露词问"认识吗"（识别哑巴词汇）；收卷由 AI 出四态画像与置信度。
- **发音**：测验内朗读探测 + 「今天」页**跟读练习**（听→跟读→可懂度评分）+ **最小对立对辨听**（ship/sheep、v/w、l/r、θ/s）。
- **实战**：群聊场景，复盘里可对"场景关键句"逐句跟读评分。
- **画像**：按场景分轨，含听力/词汇四态/表达回避/场景战绩/错误史/发音六维。
