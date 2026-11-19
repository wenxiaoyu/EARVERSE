import AsyncButton from "../components/AsyncButton";
import { useEffect, useState } from "react";
import { api } from "../api";
import { toast } from "../toast";
import { getBg, setBg } from "../bgTheme";
import {
  TTS_SAMPLE,
  getSettings,
  getVoices,
  loadVoices,
  prepareText,
  saveSettings,
  speak,
  subscribe,
  voiceTag,
} from "../tts";

export default function Settings({ onSaved }: { onSaved: () => void }) {
  const [v, setV] = useState(getSettings());
  const [voices, setVoices] = useState(getVoices());

  useEffect(() => {
    const unsub = subscribe(() => {
      setV(getSettings());
      setVoices(getVoices());
    });
    loadVoices();
    const t = setTimeout(() => setVoices(getVoices()), 300);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

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

  const sample = (mode: "plain" | "real" | "slow" | "ab") => {
    if (!("speechSynthesis" in window)) {
      toast("当前浏览器不支持语音合成");
      return;
    }
    if (mode === "plain") {
      saveSettings({ reduce: 0 });
      speak(TTS_SAMPLE, { reduce: 0 });
      toast("教科书念法 · 已记住");
    } else if (mode === "real") {
      saveSettings({ reduce: 1 });
      speak(TTS_SAMPLE, { reduce: 1 });
      toast("口语化念法 · 已记住");
    } else if (mode === "slow") {
      speak(TTS_SAMPLE, { rate: v.rate * 0.75 });
      toast("试听：慢速 0.75x");
    } else {
      speak(TTS_SAMPLE, { reduce: 0, onend: () => setTimeout(() => speak(TTS_SAMPLE, { reduce: 1 }), 480) });
      toast("A/B 对比播放中…");
    }
  };

  const reduceOn = Number(v.reduce) > 0;

  return (
    <section>
      <p className="screen-tag">Screen 05 — 设置 · Console</p>
      <h1>控制台</h1>
      <p className="sub">改完立刻生效。声音按这台电脑上的音色朗读。</p>

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

        <label>音色</label>
        <select value={v.voiceURI} onChange={(e) => { saveSettings({ voiceURI: e.target.value }); toast("音色已切换"); }} style={{ width: "100%" }}>
          {voices.length === 0 && <option value="">正在检测音色…</option>}
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name}{voiceTag(voice) ? `（${voiceTag(voice)}）` : ""} · {voice.lang}
            </option>
          ))}
        </select>
        <div className="hint" style={{ marginTop: 6 }}>
          {voices.length ? `共 ${voices.length} 个英文音色，已按质量排序。` : "没检测到英文音色，请用 Chrome / Edge / Safari。"}
        </div>

        <label>语速 · <b style={{ color: "var(--amber)" }}>{v.rate.toFixed(2)}</b></label>
        <input type="range" min={0.6} max={1.3} step={0.05} value={v.rate}
          onChange={(e) => saveSettings({ rate: parseFloat(e.target.value) })} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => { speak(TTS_SAMPLE); toast("试听：语速 " + v.rate.toFixed(2)); }}>试听</button>
          <span className="hint">1.0 接近真人；0.75 只用于第一遍听写。</span>
        </div>

        <label>音高 · <b style={{ color: "var(--amber)" }}>{v.pitch.toFixed(2)}</b></label>
        <input type="range" min={0.8} max={1.2} step={0.02} value={v.pitch}
          onChange={(e) => saveSettings({ pitch: parseFloat(e.target.value) })} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => { speak(TTS_SAMPLE); toast("试听：音高 " + v.pitch.toFixed(2)); }}>试听</button>
          <span className="hint">1.00 原声；0.94–0.98 压掉一点播音腔。</span>
        </div>

        <label>口语化</label>
        <div className="seg">
          <button className={reduceOn ? "on" : ""} onClick={() => { saveSettings({ reduce: 1 }); speak(TTS_SAMPLE, { reduce: 1 }); }}>开 · 像真人</button>
          <button className={!reduceOn ? "on" : ""} onClick={() => { saveSettings({ reduce: 0 }); speak(TTS_SAMPLE, { reduce: 0 }); }}>关 · 念满</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>开启后 going to 读成 gonna、for 读成 fer；批改时两种写法都算对。</div>

        <label>试听同一句话</label>
        <div className="row">
          <button className={`btn sm ${!reduceOn ? "primary" : ""}`} onClick={() => sample("plain")}>教科书</button>
          <button className={`btn sm ${reduceOn ? "primary" : ""}`} onClick={() => sample("real")}>口语化</button>
          <button className="btn sm" onClick={() => sample("slow")}>慢速</button>
          <button className="btn sm" onClick={() => sample("ab")}>A/B 对比</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          教科书 / 口语化 会记住并作用于所有朗读；慢速与 A/B 仅本次试听。
        </div>
        <div className="hint" style={{ marginTop: 10 }}>当前朗读内容：</div>
        <div className="pron-target" style={{ fontSize: 15, padding: "10px 12px" }}>
          {prepareText(TTS_SAMPLE, reduceOn ? 1 : 0)}
        </div>
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
