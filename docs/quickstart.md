# 耳界 EARVERSE · 安装与使用教程

一个装在自己电脑上的 AI 英语教练：会听你说英语、诊断你的短板、陪你练、给你出报告。
数据只存本地，不上传。

---

## 一、安装（一条命令，无需预装任何环境）

安装器会自动准备 Python 3.10+ 和 Node 18+：
已有就复用；没有就下载**便携版**到安装目录，**不需要 sudo / 管理员权限**，也不改动系统环境。

### macOS / Linux

打开「终端」，粘贴：

```bash
curl -fsSL https://gitee.com/fish/earverse/raw/main/install.sh | bash
```

海外网络可换成：

```bash
curl -fsSL https://raw.githubusercontent.com/wenxiaoyu/EARVERSE/main/install.sh | bash
```

### Windows

打开 **PowerShell**，粘贴：

```powershell
irm https://gitee.com/fish/earverse/raw/main/install.ps1 | iex
```

> 如果提示「禁止运行脚本」，先执行一次：
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 安装器会做什么

1. 下载代码（国内优先 Gitee，失败回退 GitHub）
2. 准备 Python / Node（便携版，走清华 + npmmirror 镜像）
3. 创建虚拟环境、安装后端依赖、构建前端
4. 启动服务，地址：**http://127.0.0.1:8000**

首次约 1–5 分钟（要下载 150–250MB）；之后再运行会复用已有环境，很快。
默认安装目录：mac/Linux 是 `~/earverse`，Windows 是 `C:\Users\你\earverse`。

---

## 二、首次配置（只填一次）

1. 浏览器打开 **http://127.0.0.1:8000**
2. 左侧点 **设置**
3. 填 DeepSeek 三项：

| 项目 | 填什么 |
|---|---|
| Base URL | `https://api.deepseek.com/v1` |
| Model | `deepseek-flash` |
| API Key | 你自己的 DeepSeek Key |

4. 点 **保存**

> 没有 Key 也能打开，但对话/出题/评分/语音会用本地降级方案，效果差很多。

配好后，**先做一次「首次测验」**（约 10 分钟）。AI 靠它了解你的真实水平，后面的训练和报告才有针对性。

---

## 三、开始使用

打开就是 **Manbo**（AI 英语教练）的首页，可以直接开口说英语。

| 功能 | 位置 | 说明 |
|---|---|---|
| 跟 Manbo 练口语 | 首页 | 直接说话；它只说英语，想看懂可点句下「查看中文」 |
| 今日训练 | 今日 | 每天约 1 小时，AI 排好 4 块任务 |
| 背诵 | 背诵 | 独立训练，3 档提示 |
| 场景实战 | 实战 | 24 类、89 个真实场景（面试、开会、点餐…） |
| 报告 | 报告 | 六维评估 + 趋势，看短板和进步 |
| 分享 | 报告 → 生成分享笔记 | 一键生成小红书图文（含 Manbo 点评） |

小技巧：

- Manbo 说话时你可以**直接打断**，像真人对话
- 它会记住你聊过的事，下次接着聊
- 说英文时偶尔夹杂中文也没关系，它只回应听懂的部分

### 外观

默认是 **「柔光」** 背景，安静、耐看。
想要更强氛围，可到 **设置 → 外观 → 背景氛围** 切换：柔光 / 张扬 / 炸裂。

---

## 四、桌面图标（推荐，体验更像 App）

装好后默认是浏览器打开，会带地址栏。做个桌面图标，双击就是独立窗口。

### macOS

```bash
cd ~/earverse
./app/scripts/install-shortcut.sh
```

会在「应用程序」和桌面生成 **耳界 EARVERSE**（自带图标）。双击即打开无地址栏窗口。
服务没启动时，它会自动在后台拉起。

### Windows

在安装目录（默认 `C:\Users\你\earverse`）打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\app\scripts\install-shortcut.ps1
```

桌面会出现「耳界 EARVERSE」快捷方式。

> 如果以后双击打不开，看日志：
> `~/Library/Logs/EARVERSE-launch.log`（macOS）

---

## 五、常见问题

**Q：浏览器打不开 127.0.0.1:8000？**
等 10–30 秒（首次启动较慢）。还不行就重启：
- mac/Linux：`cd ~/earverse && ./start.sh`
- Windows：双击安装目录里的 `start.bat`

**Q：提示 8000 端口被占用？**
关掉占用它的程序，再重试；确认没有同时开多个实例。

**Q：没有声音 / 麦克风用不了？**
给浏览器麦克风权限：
- macOS：系统设置 → 隐私与安全性 → 麦克风
- Windows：设置 → 隐私 → 麦克风
另外，浏览器会拦截自动播放，点一下页面即可。

**Q：怎么更新？**
- mac/Linux：`cd ~/earverse && ./install.sh --update`
- Windows：`cd $HOME\earverse; .\install.ps1 --update`
更新会保留学习记录和设置。

**Q：怎么卸载？**
直接删除安装目录（`~/earverse`）。
如果装过开机自启，再执行：`./app/scripts/service.sh uninstall`。

---

## 六、隐私

- 学习记录、设置、语音缓存都只在本机 `app/backend/data/`
- API Key 只保存在本机后端，不进浏览器、不入库
- 仅在使用时把你的文字/语音发给 DeepSeek 做对话与合成

---

有问题随时说。
