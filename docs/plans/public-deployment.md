# 从单机到公网：部署评估与改造方案

> 状态：**暂缓执行，保留单机运行**
> 日期：2026-11-19
> 适用：EARVERSE / 耳界（`app/` FastAPI + React + SQLite 单用户版本）
> 结论：当前版本**不适合直接公网部署**；本文件保留评估结论和后续改造路线，等真正要开放给外部用户时再按阶段执行。

---

## 1. 当前决策

- 继续以**单机、单用户、本机自托管**方式运行。
- 不把 `8000` 端口直接暴露到公网；如需远程访问，优先走 VPN / 内网穿透 + 访问控制。
- 本文件只做方案存档，不触发代码改造。

---

## 2. 当前架构事实

| 项 | 现状 |
|---|---|
| 用户模型 | 单用户。`main.py` 的 `_profile()` 固定 `storage.load_or_create("default")` |
| 鉴权 | 无。所有 `/api/*` 公开 |
| 画像存储 | SQLite `profiles` 表，整份 JSON 读写 |
| 会话 | 测验/实战会话在进程内 dict；实战另有 SQLite 备份 |
| 背诵 | `recitations` / `recitation_attempts` 全局按 `domain` 存，无 `user_id` |
| 密钥 | 一个全局 DeepSeek Key，保存在 `data/env.config.json`（0600） |
| 语音 | ASR 走 DeepSeek；发音播放走浏览器 `speechSynthesis` |
| 部署 | macOS launchd + `uvicorn --reload` + `vite build --watch`，启动时执行前端构建 |
| 前端 | FastAPI 托管 `frontend/dist` 静态文件 |

---

## 3. 公网部署会踩的坑

### P0：一上线就出问题

1. **所有用户共用一个画像**
   - `_profile()` 固定返回 `default`。
   - 用户 A 的短板、录音、历史、复盘会直接出现在用户 B 面前。

2. **没有任何鉴权**
   - `/api/profile`、`/api/report`、`/api/recitation/*` 全部可匿名访问。
   - `/api/config` 可被任意人修改 `base_url` / `model` / `key`。
   - 攻击者可把 `base_url` 指向自己的服务器并保留全局 Key，下一次请求即泄露 Key。
   - 也可清空 Key，让全站 AI 瘫痪。

3. **资源没有 owner 校验**
   - 背诵文章/历史/录音只按 `domain` 或 `id` 查询。
   - 现在等于公开；加登录后会变成 IDOR。

4. **全局 Key 成本失控**
   - 无配额、限流、验证码、邮箱验证。
   - 脚本可刷 LLM + ASR，账单按 token/音频计费。

5. **SSRF**
   - `base_url` 可任意改，服务端会向该地址发请求；可指向内网或云 metadata。

6. **上传无限制**
   - `/api/pronunciation`、`/api/recitation/score`、`/api/speech/asr` 都是 `await file.read()`。
   - 没有大小、时长、速率限制，大文件可打爆内存/磁盘。

7. **SQLite + 整份画像 JSON 的并发写**
   - 读整份 JSON → 修改 → 写回整份 JSON，后写覆盖先写（丢更新）。
   - 多 worker 时进程内锁不共享，易 `database is locked`。

### P1：上线后很快遇到

| 问题 | 现状/影响 |
|---|---|
| 会话在内存 | `_probe_sessions` / `_scenario_sessions` 重启丢失；多 worker 不共享 |
| 背诵全局缓存 | `recitations` 只按 `(domain, level, date, kind)`，所有用户共享同一篇 |
| 数据在本地磁盘 | SQLite + `data/recitation_audio/`，扩容、迁移、备份困难 |
| 时区 | `local_date()` 用服务器时区；全球用户的「今天」会错位 |
| 长请求 | LLM/ASR 90–120s 超时，无队列/重试/熔断，反代易 504 |
| TTS 依赖浏览器 | 设备无英文音色就没声音；移动端差异大 |
| 部署形态 | launchd + `--reload` + frontend watch，不适合 Linux 服务器 |
| 无 TLS/反代 | 直接暴露 8000；麦克风要求 HTTPS；CORS 目前 `*` |
| 无观测 | 无请求 ID、指标、错误追踪、每用户成本/延迟、审计日志 |
| 无迁移机制 | 仅 `CREATE TABLE IF NOT EXISTS`；画像 JSON 靠 `version` |
| 无备份/恢复 | 数据库和录音没有自动备份 |

### P2：规模化与合规

- **隐私**：录音、转写、画像属个人数据；需要隐私政策、同意、导出、删除账号、保留期限；发给 DeepSeek 属第三方处理。
- **内容安全**：AI 生成文章/场景/复盘；用户输入可能 prompt injection；无审核/举报/年龄限制。
- **计费**：无套餐、额度、用量计量。
- **高可用**：单进程、单机、无队列/对象存储/CDN/WAF。
- **多租户**：所有表需要 `user_id` 与索引，现有数据要迁移。
- **账号体系**：注册、登录、邮箱验证、找回密码、会话/JWT、CSRF、防撞库。

---

## 4. 改造路线

### Phase 0：当前（单机）

- 不暴露公网。
- 远程访问走 VPN / 内网穿透 + 访问控制。
- `/api/config` 仅本机可访问（或直接不开放）。
- 定期手工备份 `data/profiles.db` 与 `data/env.config.json`。

### Phase 1：小范围 beta（私人邀请制）

目标：10–50 个可控用户，数据隔离、成本可控、可恢复。

1. **账号与隔离**
   - 邮箱/OAuth 登录；所有 API 从会话取 `user_id`。
   - `profiles`、`sessions`、`recitations`、`recitation_attempts` 全部加 `user_id`。
   - 所有读写加 owner 校验；录音回放校验归属。

2. **数据层**
   - SQLite → Postgres；或至少 SQLite WAL + `busy_timeout` + 事务。
   - 画像更新改为事务/乐观锁，避免整份 JSON 覆盖。
   - 会话搬到 Redis 或数据库。

3. **密钥与配额**
   - Key 迁到环境变量/密钥管理，不入镜像、不入 `data/`。
   - `/api/config` 改为管理员-only；普通用户不可改 `base_url`。
   - 每用户每日/每月 LLM + ASR 配额；超限给出明确提示。

4. **上传与请求**
   - 限制上传大小、音频时长、并发数、每 IP/每用户速率。
   - 长请求加超时、重试、降级；必要时引入队列。

5. **部署**
   - Linux + Docker/systemd；不用 `--reload` / `vite watch`。
   - 前端在 CI 预构建，服务器只托管 `dist`。
   - Nginx/Caddy 终止 TLS，反代到应用；限制 CORS 到正式域名。
   - 独立运行用户，不跑 root。

6. **可观测与备份**
   - 结构化日志 + 请求 ID；Sentry/指标；每用户成本与延迟统计。
   - 数据库 + 录音定时备份，做一次恢复演练。

7. **产品边界**
   - 时区按用户；每日推荐/日历/目标按用户时区计算。
   - 隐私政策、录音保留期限、删除账号/导出数据。

### Phase 2：公网规模化

- 任务队列 + 多 worker；对象存储存录音；CDN 托管前端。
- 内容审核/举报；prompt injection 防护；年龄与使用条款。
- 套餐/计费/用量计量；WAF/限流/防刷。
- 多实例 + 健康检查 + 滚动发布；数据库只读副本/连接池。

---

## 5. 最小公网改造清单（按优先级）

- [ ] 登录 + 全链路 `user_id` + owner 校验
- [ ] 锁住 `/api/config`，Key 迁出配置文件
- [ ] 每用户 LLM/ASR 配额 + 速率限制
- [ ] 上传大小/时长限制
- [ ] Postgres 或 SQLite WAL + 事务
- [ ] 会话搬出进程内存
- [ ] HTTPS 反代 + 正式域名 + 收紧 CORS
- [ ] Docker/systemd + 预构建前端
- [ ] 自动备份 + 恢复演练
- [ ] 日志/指标/错误追踪
- [ ] 时区按用户
- [ ] 隐私政策 + 删除/导出 + 保留期限

---

## 6. 验收标准（Phase 1）

- 两个测试账号互相看不到对方画像、录音、历史、报告。
- 未登录访问任意 `/api/*` 返回 401。
- 普通用户无法修改 `base_url` / 全局 Key。
- 单用户超配额时只影响自己，不拖垮全站。
- 上传 100MB 文件被拒绝，服务不 OOM。
- 并发 20 个请求无 `database is locked`、无画像丢更新。
- 服务重启后测验/实战会话可按预期恢复或明确提示。
- 备份可在新机器恢复出完整画像与录音。

---

## 7. 暂不做

- 公网域名、TLS、备案
- 多租户改造
- 计费/套餐
- 内容审核
- 高可用/队列
- 移动端适配

以上等真正要开放时，再按 Phase 1 开工。
