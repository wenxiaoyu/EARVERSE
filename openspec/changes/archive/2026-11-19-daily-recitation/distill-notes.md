# Distill Notes — daily-recitation

## 可复用知识

1. **已知原文的朗读/背诵评分，用对齐而不是自由说评分**
   - `SequenceMatcher` 对齐 + 模糊匹配（相似度 ≥0.75）比单纯集合重合稳定。
   - 四项分开（完整度/准确度/流利度/独立性）比一个总分更能指导下一次。

2. **提示阶梯要少而清晰**
   - 三档足够：无 / 结构（句首词+连接词）/ 关键词（内容词）。
   - 首字母档对成年人偏“填字游戏”，价值低、干扰大，已移除。

3. **LLM 出篇必须做长度校验**
   - 只写“120 词”模型仍会写 85 词；要在 prompt 里强调“不足视为不合格”，并在代码里校验 + 回退种子，否则难度会漂。

4. **飞轮的最小闭环**
   - 漏语块 → `weak_chunks` → 下次 prompt；错音 → `recent_pron_issues` → 跟读/对立对。
   - 等级只按完整度升降，不因使用正常提示而降级。

5. **独立功能不要塞进 Today**
   - 不占 60 分钟、不进四步状态，用户随时可练；每日推荐按 `(domain, level, date)` 缓存即可保留仪式感。

## 运维坑（重要）

- launchd 以 root 运行时，`vite build --watch` 会把 `dist` 写成 root 所有，导致普通用户构建 `EACCES`。
- 解决：把 LaunchDaemon 的 `UserName` 改为实际用户（`xpeng`），并 `chown` `dist/logs/data`；否则每次都要 sudo。
- 切换用户后若端口仍被旧 root 进程占用，需先 `pkill -f uvicorn app.main:app` 再启动，否则 supervisor 会因 `Address already in use` 崩溃循环。
