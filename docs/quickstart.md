# 耳界 EARVERSE · 安装与使用教程

一个装在自己电脑上的 AI 英语教练：会听你说英语、会诊断你的短板、会陪你练、还会给你出报告。
所有数据只存在你自己的电脑里，不上传。

---

## 一、准备工作（什么都不用装）

**不用提前装 Python / Node。** 安装器会自动检测：

- 电脑里已有合适的 Python（3.10+）和 Node（18+）→ 直接复用
- 没有 → 自动下载**便携版**装到安装目录的 `.runtime/` 里，**不需要 sudo、不改动系统环境**

所以只要电脑能上网、有 `curl`（macOS/Linux 自带），一条命令就能装完。

> 首次安装会额外下载约 150–250MB（Python + Node + 依赖），国内走清华/阿里镜像，通常 1–5 分钟。

---

## 二、安装（复制一条命令即可）

### macOS / Linux / WSL

```bash
curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | bash
```

> 网络环境在海外，可换成：
> `curl -fsSL https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.sh | bash`

国内网络加速（用国内 pip/npm 镜像）：

```bash
curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | EARVERSE_CN=1 bash
```

### Windows

打开 **PowerShell**，粘贴：

```powershell
irm https://gitee.com/fish/earverse/raw/main/install.ps1 | iex
```

> 如果提示「禁止运行脚本」，先执行一次：
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

安装会自动：下载代码 → 建虚拟环境 → 装依赖 → 构建前端 → 启动服务。
看到 `http://127.0.0.1:8000` 就成功了。

默认安装位置：mac/linux 是 `~/earverse`，Windows 是 `C:\Users\你\earverse`。

---

## 三、首次配置（很重要，只填一次）

1. 浏览器打开 **http://127.0.0.1:8000**
2. 点左侧 **设置**
3. 填入 DeepSeek 的三项：

| 项目 | 填什么 |
|---|---|
| Base URL | `https://api.deepseek.com/v1` |
| Model | `deepseek-flash` |
| API Key | 你自己的 DeepSeek Key |

4. 点 **保存**

> 没有 Key 也能打开和浏览，但对话、出题、评分、语音会用本地降级方案，效果差很多。建议先配好。

配好后，**先做一次「首次测验」**。大概 10 分钟，做完 AI 才知道你的真实短板，后面的训练和报告才有针对性。

---

## 四、开始使用

打开就是 **Manbo**（AI 英语教练）的首页，可以直接开口说话。

| 功能 | 位置 | 说明 |
|---|---|---|
| 跟 Manbo 练口语 | 首页 | 直接说话聊天，只说英语；听不懂可以点「查看中文」看翻译 |
| 今日训练 | 今日 | 每天约 1 小时，AI 排好 4 块任务 |
| 背诵 | 背诵 | 独立训练，3 档提示 |
| 场景实战 | 实战 | 24 类、89 个真实场景（开会、面试、点餐…） |
| 报告 | 报告 | 周期化六维评估，看趋势和短板 |
| 分享 | 报告 → 生成分享笔记 | 一键生成小红书图文（含 Manbo 点评） |

小提示：

- Manbo 只懂英语，会引导你说英语；想说中文当辅助时，点句子下面的「查看中文」
- 说话时不用等它说完，可以直接打断
- 它会记住你聊过的事，下次接着聊

---

## 五、做个桌面图标（可选，体验更像 App）

装好后默认是浏览器打开。想双击图标就进，执行：

### macOS

```bash
cd ~/earverse
./app/scripts/install-shortcut.sh
```

会在「应用程序」和桌面生成 **耳界 EARVERSE**，双击即打开独立窗口（无地址栏）。

### Windows

在安装目录（默认 `C:\Users\你\earverse`）打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\app\scripts\install-shortcut.ps1
```

桌面会出现「耳界 EARVERSE」快捷方式。

---

## 六、常见问题

**Q：浏览器打开 127.0.0.1:8000 没反应？**
等 10–30 秒（首次启动较慢）。还不行就重启服务：
- mac/linux：`cd ~/earverse && ./start.sh`
- Windows：双击安装目录里的 `start.bat`

**Q：提示 8000 端口被占用？**
关掉占用它的程序，或重启一次；确认没有开了多个窗口。

**Q：没有声音 / 麦克风用不了？**
在系统设置里给浏览器（Chrome/Edge）麦克风权限：
- macOS：系统设置 → 隐私与安全性 → 麦克风
- Windows：设置 → 隐私 → 麦克风

**Q：Manbo 不说话？**
浏览器默认会拦截自动播放，点一下页面任意位置即可。

**Q：怎么更新到最新版？**
- mac/linux：`cd ~/earverse && ./install.sh --update`
- Windows：`cd $HOME\earverse; .\install.ps1 --update`
更新会保留你的学习记录和设置。

**Q：怎么卸载？**
直接删掉安装目录（`~/earverse`）。如果装过开机自启：
`./app/scripts/service.sh uninstall`

---

## 七、隐私

- 学习记录、设置、语音缓存都只存在本机 `app/backend/data/`
- API Key 只保存在本机后端，不进浏览器、不入库
- 仅在使用时把你的文字/语音发给 DeepSeek 做对话与合成

---

有问题随时说，看到会回。
