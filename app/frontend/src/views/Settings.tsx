import AsyncButton from "../components/AsyncButton";
import { useEffect, useState } from "react";
import { api } from "../api";
import { toast } from "../toast";
import { getBg, setBg } from "../bgTheme";
import { TTS_SAMPLE } from "../tts";
import { speak } from "../voice";

export default function Settings({ onSaved }: { onSaved: () => void }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [bg, setBgState] = useState(getBg());

  useEffect(() => {
    api.getConfig().then((c) => {
      setCfg(c);
      setBaseUrl(c.llm.base_url || "");
      setModel(c.llm.model || "");
    });
  }, []);

  const saveModel = async () => {
    setSaving(true);
    try {
      await api.setConfig({ llm: { base_url: baseUrl, model, api_key: apiKey } });
      setApiKey("");
      setCfg(await api.getConfig());
      toast("已保存");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <p className="screen-tag">Screen 05 — 设置 · Console</p>
      <h1>控制台</h1>
      <p className="sub">改完立刻生效。全站统一使用 Manbo 的英语音色。</p>

      {cfg && !cfg.llm?.api_key_set && (
        <div className="panel model-setup">
          <div className="ms-head"><span className="mw-bang">!</span><b>接入 AI 教练 · 约 1 分钟</b></div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            填入 DeepSeek Key 后，AI 会读懂你的短板，实时出题、判卷、纠正发音，并在场景里陪你演练。
            未接入时，页面只展示预设的演示内容。
          </p>
          <a className="ds-link" href="https://platform.deepseek.com/sign_in" target="_blank" rel="noreferrer noopener">
            还没有 Key？去 DeepSeek 平台注册并获取 →
          </a>
        </div>
      )}

      {/* 声音 */}
      <div className="panel">
        <h2>声音</h2>
        <div className="voice-fixed">
          <div className="voice-orb">M</div>
          <div>
            <b>Manbo · Stella</b>
            <span>固定的英语女声 · 全站统一</span>
          </div>
          <span className="badge ok">统一音色</span>
        </div>
        <p className="hint" style={{ margin: "10px 0 0" }}>
          今天 / 测验 / 背诵 / 实战 / 报告 / Manbo Live 的所有英文朗读，都优先使用这一套神经音色。
          断网或模型未配置时，才回退到本机英文音色。
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm primary" onClick={() => speak(TTS_SAMPLE, "plain")}>试听 Manbo</button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>语速统一 0.96；不再按设备/浏览器切换音色。</div>
      </div>

      {/* 外观 */}
      <div className="panel">
        <h2>外观</h2>
        <label>背景氛围</label>
        <div className="seg">
          <button className={bg === "soft" ? "on" : ""} onClick={() => { setBg("soft"); setBgState("soft"); }}>柔光</button>
          <button className={bg === "bold" ? "on" : ""} onClick={() => { setBg("bold"); setBgState("bold"); }}>张扬</button>
          <button className={bg === "ultra" ? "on" : ""} onClick={() => { setBg("ultra"); setBgState("ultra"); }}>炸裂</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>柔光偏静；张扬带旋转光束与网格地面；炸裂再加色相流动、扫描线与扩散脉冲环。</div>
      </div>

      {/* 模型 */}
      <div className="panel">
        <h2>模型 <span className={`badge ${cfg?.llm?.api_key_set ? "ok" : "warn"}`}>{cfg?.llm?.api_key_set ? "已配置" : "未配置"}</span></h2>
        <p className="hint" style={{ marginTop: -4 }}>密钥只存本机后端，不进浏览器、不上传。OpenAI 兼容接口均可。</p>
        <div className="row">
          <button
            className="btn sm"
            onClick={() => {
              setBaseUrl("https://api.deepseek.com/v1");
              setModel("deepseek-flash");
              toast("已填入 DeepSeek 预设，粘贴密钥后保存");
            }}
          >
            DeepSeek 一键预设
          </button>
          <span className="hint">自动填入接口地址与模型名</span>
        </div>

        <a className="ds-cta" href="https://platform.deepseek.com/sign_in" target="_blank" rel="noreferrer noopener">
          <span className="ds-badge">DeepSeek</span>
          <span className="ds-text">
            <b>还没有 Key？去 DeepSeek 开放平台获取</b>
            <small>打开后登录 → 左侧「API keys」→ 创建密钥 → 复制以 sk- 开头的字符串，粘贴到下面。</small>
          </span>
          <span className="ds-arrow">↗</span>
        </a>

        <label>接口地址</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" style={{ width: "100%" }} />
        <label>模型名</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" style={{ width: "100%" }} />
        <label>密钥</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={cfg?.llm?.api_key_set ? `已设置（${cfg.llm.api_key_masked}），留空不修改` : "sk-…"} style={{ width: "100%" }} />
        {cfg?.llm?.api_key_set && (
          <div className="row" style={{ marginTop: 6 }}>
            <AsyncButton className="btn link" loadingText="清除中…" onClick={async () => {
              await api.setConfig({ llm: { clear_api_key: true } });
              setCfg(await api.getConfig());
              toast("已清除密钥");
              onSaved();
            }}>清除已保存的密钥</AsyncButton>
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <AsyncButton className="btn primary" onClick={saveModel} loadingText="保存中…">保存</AsyncButton>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          没配模型也能用，AI 环节自动降级为本地规则。
        </p>
      </div>
    </section>
  );
}
