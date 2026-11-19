## 1. 规格与数据

- [x] 1.1 新增 `openspec/changes/daily-recitation/` 规格产物
- [x] 1.2 `models.py`：`recitation` 画像结构、`record_recitation`、`recitation_level`、`adapt_level`
- [x] 1.3 `storage.py`：`recitations` / `recitation_attempts` 表与读写、历史限制、录音清理
- [x] 1.4 `seed/recitations.json`：L1–L5 降级文章
- [x] 1.5 `seeddata.py` 注册 `recitations`

## 2. 后端能力

- [x] 2.1 `recitation/service.py`：文章校验/归一化、语块派生、三级提示
- [x] 2.2 文章生成 `generate_passage`（LLM + 降级）
- [x] 2.3 对齐评分 `score_attempt`（完整/准确/流利/独立 + diff + 漏句/漏语块）
- [x] 2.4 AI 复盘 `review_attempt`（结构化 + 本地降级）
- [x] 2.5 `llm/prompts.py`：出篇与复盘 prompt
- [x] 2.6 `main.py`：`today` / `generate` / `score` / `history` / 录音回放接口
- [x] 2.7 错误分类（401/402/429/550）与 409 未配 ASR

## 3. 前端

- [x] 3.1 导航第 3 项「背诵」+ 图标 + 路由
- [x] 3.2 `api.ts` 背诵方法
- [x] 3.3 `views/Recitation.tsx`：三态流程（听懂/背诵/评分）
- [x] 3.4 提示阶梯、录音计时、评分四维、diff、复盘、历史
- [x] 3.5 样式：与现有 warm-dark 仪表台一致

## 4. 验证

- [x] 4.1 单测：提示、对齐评分、难度自适应、画像回填、存储
- [x] 4.2 全量 `pytest` 通过
- [x] 4.3 前端构建 + 服务重启 + 接口冒烟
- [x] 4.4 浏览器手动走通：出篇 → 提示 → 录音 → 评分 → 换一篇 → 历史
- [x] 4.5 更新 README / 归档规格
