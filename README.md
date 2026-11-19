<div align="center">

<img src="app/frontend/public/logo.svg" width="88" alt="EARVERSE" />

# 耳界 · EARVERSE

**不用翻译，听见就懂。**

每天 1 小时，把英语从「看得懂」练成「听得懂、接得上、说得出」。

`AI 教练` · `听辨训练` · `发音评分` · `场景实战` · `每日复盘`

</div>

---

## 这是什么

耳界不是题库，而是一个 **AI 驱动的英语交流教练**。

它先测出你到底卡在哪——认识但听不出、听得出但反应慢、还是会用不会说——再把每天 1 小时拆成四块，围绕你的短板出题、实战、复盘，并在第二天继续针对昨天的弱项。

目标：3~6 个月内，从「开会能听懂大意但不敢开口」到「能独立应付工作会议里的听说」。

---

## 核心能力

| 能力 | 说明 |
|------|------|
| **首次测验** | AI 按场景出题 + 给答案键；先只听发音选中文，没听出才露词问「认识吗」，精准识别「哑巴词汇」 |
| **每日 1 小时** | 激活复习 → 新内容训练 → 场景实战 → 复盘收尾，四块自动编排 |
| **自适应错音** | 跟读/对立对错了，立刻记录错音，下一组优先练这个音 |
| **发音评分** | 录音 → ASR 转写 → AI 可懂度评分，指出具体音/词问题 |
| **最小对立对** | ship/sheep、think/sink、v/w、l/r… 专治「听成另一个词」 |
| **场景实战** | 群聊式真实场景（会议、客户、出差、面试），把一件事办成 |
| **教练报告** | 掌握构成、听力盲区、发音、毕业进度，一眼看清 |
| **多场景分轨** | 职场 / 出门 / 面试 / 日常，各自独立画像，互不影响 |
| **可降级** | 未配模型也能跑：种子题 + 本地规则 + 离线剧本 |

---

## 它怎么工作

```
首次测验 ──► 生成「明日目标」
                │
      ┌─────────▼─────────┐
      │  每天 1 小时（AI 编排）│
      │  ① 激活复习          │
      │  ② 新内容训练        │
      │  ③ 场景实战          │
      │  ④ 复盘收尾          │
      └─────────┬─────────┘
                │
        今日复盘 ──► 生成新的「明日目标」
```

- **今日目标**来自昨天 AI 复盘（词 / 语音点 / 待毕业功能），今天所有题目都围绕它生成。
- **毕业逻辑**：同一言语功能在 **3 个不同真实场合**各办成 1 次，才算掌握。
- **请求时机**：进入「今天」或切换场景时生成复习题/跟读句/对立对；「换一组」、用尽、或点评分后再练时重新生成。

---

## 技术栈

- **后端**：Python · FastAPI · Uvicorn · SQLite（画像）
- **前端**：React · Vite · TypeScript
- **AI**：DeepSeek（对话 `/v1/chat/completions`、ASR `/v1/tools/asr`、TTS `/v1/tools/tts`）
- **发音播放**：浏览器 SpeechSynthesis（音色/语速/音高可调）
- **常驻**：macOS launchd（LaunchDaemon 开机自启 + 崩溃自愈）

---

## 目录结构

```
english-trainer/
├── app/                    当前实现
│   ├── backend/            FastAPI 后端
│   │   ├── app/
│   │   │   ├── assessment/   自适应测验
│   │   │   ├── training/     每日编排
│   │   │   ├── scenarios/    场景实战
│   │   │   ├── generation/   AI 内容生成
│   │   │   ├── pronunciation/发音评估 & 对立对
│   │   │   ├── reports/      教练报告
│   │   │   ├── speech/       ASR / TTS
│   │   │   ├── llm/          客户端 & prompts
│   │   │   └── main.py       HTTP API + 静态托管
│   │   └── tests/            pytest
│   ├── frontend/           React + Vite + TS
│   ├── seed/               种子语料
│   └── scripts/            构建 / 启动 / 服务管理
├── openspec/               规格与变更记录（真相源）
├── app.js / server.py ...  旧版文件（保留，不再使用）
└── README.md
```

---

## 快速开始

### 1. 依赖

- Python 3.10+
- Node.js 18+

```bash
# 后端
python3 -m pip install -r app/backend/requirements.txt

# 前端
cd app/frontend && npm install && npm run build && cd ../..
```

### 2. 启动

```bash
./app/start.command          # 或
./app/scripts/restart.sh     # 构建 + 重启 + 健康检查
```

打开 **http://127.0.0.1:8000**

### 3. 配置模型（推荐）

进入「设置」页填入 DeepSeek：

- Base URL：`https://api.deepseek.com/v1`
- Model：`deepseek-flash`
- API Key：只存本机后端，不入浏览器

填一次即可同时启用：对话、出题、判卷、ASR、TTS。

---

## 配置与降级

配置保存在 `app/backend/data/env.config.json`（**已 gitignore，不会提交**）。

支持环境变量覆盖：

```bash
OPENAI_BASE_URL=... OPENAI_API_KEY=... OPENAI_MODEL=...
```

未配置或请求失败时自动降级：

| 模块 | 降级 |
|------|------|
| 测验/练习 | 种子语料 |
| 计划/报告 | 本地规则 |
| 场景对话 | 离线剧本 |
| 发音评分 | 词重合启发式 |

---

## 常用命令

```bash
./app/scripts/restart.sh          # 构建 + 重启 + 就绪校验
./app/scripts/service.sh status   # 服务状态
./app/scripts/service.sh logs     # 跟随日志
./app/scripts/service.sh stop     # 停止
./app/scripts/service.sh uninstall# 卸载自启

sudo ./app/scripts/install-daemon.sh  # 开机自启（LaunchDaemon，免登录）
```

- 地址：`http://127.0.0.1:8000`
- 健康检查：`curl http://127.0.0.1:8000/api/health`
- 日志：`app/logs/coach.out.log` / `app/logs/coach.err.log`

---

## 测试

```bash
cd app/backend
python3 -m pytest tests/ -q
```

---

## 数据与隐私

- 画像存 SQLite：`app/backend/data/profiles.db`（本地，不入库）。
- 密钥存 `app/backend/data/env.config.json`（本地，不入库）。
- 仓库只包含代码、种子语料与规格文档，**不含任何用户数据或密钥**。

---

<div align="center">

**耳界 EARVERSE** · 把声音，直接变成意思。

</div>
