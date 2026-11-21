<div align="center">

<img src="app/frontend/public/logo.svg" width="88" alt="EARVERSE" />

# 耳界 · EARVERSE

**不用翻译，听见就懂。**

每天 1 小时，把英语从「看得懂」练成「听得懂、接得上、说得出」。

`AI 教练` · `听辨训练` · `发音评分` · `每日背诵` · `场景实战` · `每日复盘`

</div>

---

## 这是什么

耳界不是题库，而是一个 **AI 驱动的英语交流教练**。

它先测出你到底卡在哪——认识但听不出、听得出但反应慢、还是会用不会说——再把每天 1 小时拆成四块，围绕你的短板出题、实战、复盘；另有一个独立的「背诵」入口，随时练一段成篇表达。第二天继续针对昨天的弱项。

目标：3~6 个月内，从「开会能听懂大意但不敢开口」到「能独立应付工作会议里的听说」。

---

## 核心能力

| 能力 | 说明 |
|------|------|
| **首次测验** | AI 按场景出题 + 给答案键；先只听发音选中文，没听出才露词问「认识吗」，精准识别「哑巴词汇」 |
| **每日 1 小时** | 激活复习 → 新内容训练 → 场景实战 → 复盘收尾，四块自动编排 |
| **每日背诵** | 独立入口，AI 按水平出 1 篇；原文隐藏，3 档提示（无 / 结构 / 关键词），录音对齐评分 + 复盘，漏词语块回流 |
| **自适应错音** | 跟读/对立对错了，立刻记录错音，下一组优先练这个音 |
| **发音评分** | 录音 → ASR 转写 → AI 可懂度评分，指出具体音/词问题 |
| **最小对立对** | ship/sheep、think/sink、v/w、l/r… 专治「听成另一个词」 |
| **场景实战** | 群聊式真实场景（会议、客户、出差、面试），把一件事办成 |
| **陪练 Mira** | 左侧栏进入 Live；半身形象 + 自动 VAD 语音轮次；懂你的学习档案，但只讲英语，中文会被英文引导 |
| **教练报告** | 六维能力画像 + 周期对比 + 样本量/置信度；低样本明确标注，不拼虚假总分 |
| **分享笔记** | 报告页生成「今天 vs 昨天」成绩单 / 金句卡，AI 文案，可下载发小红书 |
| **多场景分轨** | 24 个训练场景（会议、客户、出差、面试、医疗、租房…），各自独立画像，互不影响 |
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
- **背诵独立**：不占 Today 的 60 分钟、不进四步进度；按左侧当前训练场景出篇，结果写回同一画像轨道。

---

## 技术栈

- **后端**：Python · FastAPI · Uvicorn · SQLite（画像）
- **前端**：React · Vite · TypeScript
- **AI**：DeepSeek（对话 `/v1/chat/completions`、ASR `/v1/tools/asr`、TTS `/v1/tools/tts`）
- **全站语音**：统一 Mira / DeepSeek `stella` 服务端 TTS；短句自动补标点，失败回退浏览器英文音色
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
│   │   │   ├── recitation/  每日背诵（出篇/提示/对齐评分）
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

## 快速开始（一行安装）

> **无需预装任何环境**：安装器会自动准备 Python 3.10+ 与 Node 18+（已有则复用，没有就下载便携版，**不需要 sudo / 管理员权限**），然后自动下载代码、创建虚拟环境、装依赖、构建前端并启动。

### macOS / Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.sh | bash
```

### 国内网络（Gitee 镜像，推荐）

```bash
curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | bash
```

- 同时使用国内 pip / npm 镜像：
  ```bash
  curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | EARVERSE_CN=1 bash
  ```
- 安装器会优先从 Gitee 下载代码，失败时自动回退 GitHub。
- 也可以强制指定源：
  ```bash
  # 只走 Gitee
  curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | bash -s -- --source=gitee
  # 只走 GitHub
  curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | bash -s -- --source=github
  # 自有 CDN 代码包
  curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | EARVERSE_TARBALL="https://cdn.example.com/earverse.tar.gz" bash -s -- --source=custom
  ```

- 只安装不启动：
  ```bash
  curl -fsSL https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.sh | bash -s -- --no-start
  ```
- 指定安装目录（默认 `~/earverse`）：
  ```bash
  curl -fsSL https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.sh \
    | EARVERSE_DIR="$HOME/apps/earverse" bash
  ```
- 之后启动：`cd ~/earverse && ./start.sh`

### Windows（PowerShell）

```powershell
# 国内
irm https://gitee.com/fish/earverse/raw/main/install.ps1 | iex

# 海外
irm https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.ps1 | iex
```

- 国内镜像加速：
  ```powershell
  $env:EARVERSE_CN="1"; irm https://gitee.com/fish/earverse/raw/main/install.ps1 | iex
  ```

- 只安装不启动：
  ```powershell
  $env:EARVERSE_NO_START="1"; irm https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.ps1 | iex
  ```
- 之后启动：双击安装目录下的 `start.bat`

打开 **http://127.0.0.1:8000**

### 自动更新

安装器默认会检查远程最新版本（Gitee / GitHub 的 commit）：

```bash
./install.sh --check-update     # 只检查是否有新版本
./install.sh --no-update-check  # 跳过检查
./install.sh --update           # 强制更新（保留画像/设置）
```

发现新版本时会自动下载代码并保留 `app/backend/data/`。更新后如果服务正在运行，重启一次即可生效。

### 本地仓库

```bash
./install.sh                 # 安装并启动
./install.sh --no-start      # 只安装
./install.sh --update        # 更新代码（保留画像/设置）
```

### 手动方式（可选）

```bash
python3 -m pip install -r app/backend/requirements.txt
cd app/frontend && npm install && npm run build && cd ../..

./app/start.command          # 或
./app/scripts/restart.sh     # 构建 + 重启 + 健康检查
```

### 桌面版（过渡方案）

不想看到浏览器地址栏？用 App 模式打开——复用同一后端，无需额外打包：

```bash
# macOS：创建 ~/Applications/耳界 EARVERSE.app + 桌面别名（双击即用，自带图标）
./app/scripts/install-shortcut.sh

# Windows：创建桌面快捷方式（Chrome/Edge App 模式）
powershell -ExecutionPolicy Bypass -File .\app\scripts\install-shortcut.ps1

# 只想打开一次
./app/scripts/open-app.sh
```

服务没启动时会自动在后台拉起；找不到 Chromium 内核浏览器时回退系统默认浏览器。
这是正式 Electron 桌面版之前的过渡形态。

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
- TTS 音频缓存：`app/backend/data/tts-cache/`（内存 L1 + 磁盘 L2，重启不丢；默认 300MB，按 LRU 淘汰）。
  - 命中率/占用：`GET /api/speech/tts/stats`
  - 清空：`POST /api/speech/tts/clear`
- 仓库只包含代码、种子语料与规格文档，**不含任何用户数据或密钥**。

---

<div align="center">

**耳界 EARVERSE** · 把声音，直接变成意思。

</div>
