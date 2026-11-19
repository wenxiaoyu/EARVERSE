# Tasks: ai-assessment-pronunciation

## 1. AI 出题与判卷（后端）

- [x] 1.1 编写出题 prompt（rubric 把 difficulty 锚到可验证特征 + JSON 契约）[mode: tdd]
- [x] 1.2 编写收卷判卷/画像 prompt（输入作答日志，输出四态画像 + 置信度）[mode: tdd]
- [x] 1.3 实现题单与画像的校验器（结构/选项唯一/答案索引合法/释义非空）[mode: tdd]
- [x] 1.4 实现新测验服务：生成题单 → 执行管道 → 收卷出画像（AI 主导）[mode: tdd]

## 2. 先听后看 + 客观判定（前端）

- [x] 2.1 测验 UI 改为听音阶段不显示原文 + 四选一中文选项 [mode: tdd]
- [x] 2.2 没听出后再露词，并记录"看着是否认识" [mode: tdd]
- [x] 2.3 采集反应时间与完整作答日志（供收卷判定）[mode: tdd]

## 3. 发音探测

- [x] 3.1 发音朗读项生成（覆盖 th、v/w、l/r、词尾、连读、重音）——AI 生成 + 固定素材兜底 [mode: tdd]
- [x] 3.2 录音上传 + ASR 转写接口（走 DeepSeek `/v1/tools/asr`，前端录 16-bit PCM WAV）[mode: tdd]
- [x] 3.3 可懂度评分：ASR 差异 + AI 推断，并预留音素级 `level=phoneme` 接口 [mode: tdd]
- [x] 3.4 发音结果写入画像发音维度（按场景分轨）[mode: tdd]

## 4. 配置：文本/音频供应商分离

- [x] 4.1 配置模型新增 audio 段（base_url/key/model），未单独配置时回退用文本供应商（DeepSeek 同时提供 TTS/ASR）[mode: tdd]
- [x] 4.2 音频统一复用文本供应商（DeepSeek 同时提供 TTS/ASR），不做独立音频配置 UI（用户确认）[mode: standard]

## 5. 训练侧发音（P1）

- [x] 5.1 跟读练习 UI：听→跟读→评分反馈 [mode: tdd]
- [x] 5.2 最小对立对（ship/sheep、v/w、l/r、θ/s）辨听 [mode: tdd]
- [x] 5.3 场景复盘增加发音维度（对场景关键句逐句跟读评分，不打断对话）[mode: tdd]

## 6. 集成与验证

- [x] 6.1 端到端：开场出题 → 作答（含朗读）→ 收卷画像（含发音）[mode: standard]
- [x] 6.2 降级路径：无文本模型 / 无音频供应商 均不崩溃且明确提示 [mode: standard]
- [x] 6.3 更新 README 与本方案文档（配置与发音说明）[mode: standard]
