/* ============================================================
   ENV.JS — 「说英语」：和一个扮演真人的模型把一件事办成

   设计要点（改代码前先读这三条）：
   1. 耳朵优先。对方的话默认不显示文字，只听。看不到字才叫听力环境。
      想看图，得自己点「看原文」，或者按「没听懂」两级之后自动给。
   2. 对方不纠正你。你说错了，它用正确说法把话重复一遍（recast），
      不评论、不停顿。当场纠错会把对话变成考试。
   3. 说错了也要留下东西。结束时不打分数，只挑三句「你刚才想说但
      没说明白」的地道说法，一键进听写题库，明天它自己回来考你。
   ============================================================ */
(function () {
'use strict';

const A = () => window.__ABTRAINER__ || {};
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function toast(msg) {
  const t = A().toast;
  if (t) t(msg); else console.log('[say]', msg);
}

/* 每个人一个固定的色相：同一个名字在哪都同一个颜色，靠颜色 0.3 秒认出是谁。
   不靠颜色也能认——名字和身份永远写在旁边。 */
function hueFor(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/* ---------------- 会话状态 ---------------- */
const S = {
  view: 'list',          // list | brief | chat | debrief
  filter: 'all',
  scenario: null,
  msgs: [],              // {role, text, shown, zh, by:castId, streaming}
  turns: 0,              // 学习者说了几句
  busy: false,
  mode: 'unknown',       // model | demo
  health: null,
  err: '',
  ladder: {},            // assistant 消息下标 -> 0..3 已经按了几次「没听懂」
  help: null,            // 我不会说 返回的候选
  debrief: null,
  demoN: 0,
  asrOn: false,
  spoken: {},            // castId -> 说了几句（接话规则用）
  lastBy: '',            // 上一位说话的 castId
  sessionId: ''          // 这一次对话的 id，素材靠它回溯来源
};

/* ---------------- 与本机服务通信 ---------------- */

async function health(force) {
  if (S.health && !force) return S.health;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    S.health = await r.json();
    S.mode = S.health.configured ? 'model' : 'demo';
  } catch (e) {
    /* 用 python3 -m http.server 打开时没有 /api/health */
    S.health = { ok: false, configured: false, reason: 'no_server' };
    S.mode = 'demo';
  }
  const page = $('page-say');
  if (S.view === 'list' && page && page.classList.contains('active')) render();
  return S.health;
}

async function chatStream(messages, onDelta, signal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: true }),
    signal
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || ct.indexOf('application/json') >= 0) {
    let msg = '模型没回应';
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch (e) { /* 不是 JSON */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (!res.body) throw new Error('浏览器不支持流式读取');

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.indexOf('data:') !== 0) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (c) onDelta(c);
      } catch (e) { /* 半行，跳过 */ }
    }
  }
}

async function chatOnce(messages, temperature) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: false, temperature: temperature == null ? 0.3 : temperature })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || j.error || '模型没回应');
  const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return String(c || '').trim();
}

/* ---------------- 提示词 ----------------
   这些规则里每一条都对应一个具体的失败模式，不是凑数：
   没有「1–2 句」它会一口气讲一段，听不懂；
   没有「recast」它会开始讲课；
   没有「end with a question」它会说完就停，把你晾着；
   没有「只演你一个人」它会替你、替旁边的人一起说，群聊就散了。
   轮次换人时提示词跟着换人——模型一次只演一个角色，这是硬约束。 */

function castList() {
  return (S.scenario && S.scenario.cast) || [];
}

function systemPrompt(who) {
  const sc = S.scenario;
  const cast = castList();
  const others = cast.filter((c) => c.id !== who.id);
  return [
    'You are playing a real person in an English conversation practice app. The learner is a Chinese engineer practising spoken English.',
    '',
    'SCENE: ' + sc.place,
    'YOU ARE: ' + who.name + ' — ' + who.role + '.',
    'WHAT YOU WANT (never say this outright, never mention it): ' + who.stance,
    others.length
      ? 'ALSO IN THE ROOM, but they speak for themselves — you never speak for them: ' +
        others.map((o) => o.name + ' (' + o.role + ')').join(', ')
      : '',
    'THE LEARNER IS TRYING TO: ' + sc.goal,
    '',
    'RULES',
    '1. Speak natural spoken English only. One or two short sentences per turn, 25 words maximum. Contractions, everyday words. No lists, no markdown, no emoji, no stage directions.',
    '2. Never mention that this is practice. Never say you are an AI. Never teach grammar. Never correct the learner explicitly.',
    '2b. You are only ' + who.name + '. Never write another person\'s line, never write a name prefix, never summarize what the others said.',
    '3. If the learner\u2019s meaning is clear but the wording is wrong, answer what they meant and use the correct wording naturally inside your own sentence. Do not comment on the mistake.',
    '4. Always end your turn with a question or a clear cue that it is their turn to speak.',
    '5. Stay in character. You have your own agenda. Push back at least once before you give the learner what they want.',
    '6. If you genuinely cannot understand them, say so in character: "Sorry \u2014 could you say that again?"',
    '7. Work these expressions in naturally when they fit: ' + (sc.must || []).join(' / '),
    '8. The scene ends when the matter is settled either way. Then give one short closing line and stop.',
    '',
    'Do not write anything before or after your spoken line.'
  ].filter((x) => x !== '').join('\n');
}

function modelMessages() {
  const sc = S.scenario;
  const out = [{ role: 'system', content: systemPrompt(S.activeSpeaker || castList()[0]) }];
  /* 只带最近 20 条，长了会拖慢首字延迟 */
  S.msgs.slice(-20).forEach((m) => {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text });
    } else {
      const c = castOf(sc, m.by);
      out.push({ role: 'assistant', content: (c ? c.name + ': ' : '') + m.text });
    }
  });
  return out;
}

/* ---------------- 接话规则（本地算，不交给模型） ----------------
   交给模型的话它会一直自己说下去，或者三个人混成一个人。
   1. 你点名谁，谁接
   2. 每 3 轮，旁观者插一句（在场就得有用，不然摆着干什么）
   3. 同一个人不能连着说两轮
   4. 其余挑说得最少的那个人 */
function pickSpeaker(userText) {
  const cast = castList();
  if (!cast.length) return null;
  const text = String(userText || '').toLowerCase();
  const counts = S.spoken || {};

  const named = cast.filter((c) => c.id !== S.lastBy && text.indexOf(c.name.toLowerCase()) >= 0)[0];
  if (named) return named;

  const notLast = cast.filter((c) => c.id !== S.lastBy);
  const pool = notLast.length ? notLast : cast;
  const lineN = S.msgs.filter((m) => m.role === 'assistant').length;

  if (lineN % 3 === 2) {
    const by = pool.filter((c) => c.tag === 'bystander')[0];
    if (by) return by;
  }
  return pool.slice().sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0))[0];
}

/* ---------------- 场景渲染 ---------------- */

function render() {
  const root = $('say-root');
  if (!root) return;
  if (S.view === 'list') renderList(root);
  else if (S.view === 'brief') renderBrief(root);
  else if (S.view === 'chat') renderChat(root);
  else if (S.view === 'debrief') renderDebrief(root);
}

function modeBanner() {
  if (S.mode === 'model') return '';
  if (S.health && S.health.reason === 'no_server') {
    return `<div class="say-note warn">
      <b>现在没有模型转发</b>
      <span>页面是用普通静态服务器打开的，只能用演示模式。关掉窗口，双击 <code>start.command</code> 重启一次就好。</span>
    </div>`;
  }
  if (S.health && !S.health.configured) {
    return `<div class="say-note">
      <b>还没配模型，现在是演示模式</b>
      <span>场景能走完，但对方只会念固定的台词，不会回应你说的内容。去 <button class="link-btn" data-go="settings">设置 → 说英语</button> 填一个接口地址和密钥，立刻变成真的对话。</span>
    </div>`;
  }
  return '';
}

function renderList(root) {
  const cats = [{ k: 'all', n: '全部' }].concat(
    Object.keys(CAT_NAME_SAY).map((k) => ({ k, n: CAT_NAME_SAY[k] }))
  );
  const list = S.filter === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.cat === S.filter);
  const st = A().sayStats ? A().sayStats() : { total: 0, todayDone: false };
  const pick = A().pickSayToday ? A().pickSayToday() : null;
  const pickScene = pick && scenarioById(pick.sceneId);

  root.innerHTML = `
    ${modeBanner()}
    <div class="say-tip">
      <b>不是聊天，是办事。</b>每次挑一件事，把它办成。在场的人各有自己的立场，不会一开始就顺着你。
      ${st.total ? `<span class="hint">你已经在这些场景里说过 ${st.total} 次。</span>` : ''}
    </div>
    ${pick && pickScene ? `
      <button class="say-today" data-pick="${pick.sceneId}">
        <div class="st-k">今天练这件</div>
        <div class="st-t">${esc(pick.label)}</div>
        <div class="st-d">${esc(pick.why)}</div>
        <div class="st-s">${esc(pickScene.place)} · 在场 ${esc(pick.castNames.join('、'))}</div>
      </button>` : ''}
    <div class="deck-pills" id="say-cats">
      ${cats.map((c) => `<button class="pill ${S.filter === c.k ? 'active' : ''}" data-cat="${c.k}">${c.n}</button>`).join('')}
    </div>
    ${pick ? '<div class="say-list-k">想练别的也行，这些都能挑：</div>' : ''}
    <div class="sc-grid">
      ${list.map((s) => `
        <button class="sc-card ${pick && pick.sceneId === s.id ? 'picked' : ''}" data-pick="${s.id}">
          <div class="sc-top">
            <span class="sc-cat">${CAT_NAME_SAY[s.cat] || s.cat}</span>
            <span class="sc-min">约 6 分钟</span>
          </div>
          <div class="sc-title">${esc(s.title)}</div>
          <div class="sc-goal">${esc(s.goal)}</div>
          <div class="sc-role">在场：${(s.cast || []).map((c) => c.name).join('、')}</div>
        </button>`).join('')}
    </div>
    <div class="say-foot-note">
      说的时候尽量出声，哪怕只有两个词。这个工具不评分，只负责让你先开一次口。
    </div>
  `;

  const catBox = $('say-cats');
  if (catBox) {
    catBox.onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      S.filter = b.dataset.cat;
      render();
    };
  }
  root.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => pickSceneById(b.dataset.pick);
  });
}

function pickSceneById(id) {
  const sc = scenarioById(id);
  if (!sc) return;
  S.scenario = sc;
  S.view = 'brief';
  A().stopSpeech && A().stopSpeech();
  render();
  window.scrollTo(0, 0);
}

function pick(id) { pickSceneById(id); }

function renderBrief(root) {
  const sc = S.scenario;
  const cast = sc.cast || [];
  root.innerHTML = `
    <div class="say-brief">
      <div class="sb-scene">${esc(sc.place)}</div>
      <h2 class="sb-title">${esc(sc.title)}</h2>
      <p class="sb-brief">${esc(sc.brief)}</p>
      <div class="sb-row">
        <span class="sb-k">你要办成</span>
        <span class="sb-v">${esc(sc.goal)}</span>
      </div>
      <div class="sb-row">
        <span class="sb-k">在场</span>
        <span class="sb-v sb-cast">
          ${cast.map((c) => `<span class="cast-chip" style="--av-h:${hueFor(c.id)}"><b>${esc(c.name)}</b>${esc(c.role)}</span>`).join('')}
        </span>
      </div>
      <div class="sb-row">
        <span class="sb-k">值得用上</span>
        <span class="sb-v sb-must">${sc.must.map((m) => `<code>${esc(m)}</code>`).join(' ')}</span>
      </div>
      <div class="sb-how">
        <b>怎么练：</b>他们说的时候只有声音，先听；听不出名字也得知道是谁在说。
        听不懂按「没听懂」，会放慢、再讲一遍。
        你说话用英文，说出声，然后打下来（麦克风能用就直接说）。
        说错不扣分，他们也不会当场纠正你。每个人有自己的立场，进场前不会告诉你。
      </div>
      <div class="row" style="margin-top:18px">
        <button class="btn btn-primary btn-lg" id="sb-start">开始对话</button>
        <button class="btn btn-ghost" id="sb-back">换一个</button>
      </div>
    </div>
  `;
  $('sb-start').onclick = start;
  $('sb-back').onclick = () => { S.view = 'list'; render(); };
}

/* ---------------- 对话 ---------------- */

function start() {
  const sc = S.scenario;
  S.msgs = [];
  S.turns = 0;
  S.ladder = {};
  S.help = null;
  S.err = '';
  S.demoN = 1;              /* 第 0 句是开场白，已经在下面推入了 */
  S.spoken = {};
  S.lastBy = '';
  S.sessionId = 's' + Date.now();
  S.view = 'chat';
  render();

  const firstCast = (sc.cast || [])[0] || null;
  const first = makeAi(firstCast, (firstCast && firstCast.opener) || sc.opener);
  S.msgs.push(first);
  S.lastBy = first.by;
  render();
  speakLine(first);
}

/* 新的一句 AI 台词。by 记的是谁在说——界面靠它露名字，排版靠它遮字，
   语音靠它换音色。缺了这个字段，三个人会变成同一个人。 */
function makeAi(member, text) {
  const m = {
    role: 'assistant',
    text: text || '',
    shown: false,
    by: member ? member.id : ''
  };
  if (member) S.spoken[member.id] = (S.spoken[member.id] || 0) + 1;
  S.activeSpeaker = member || null;
  return m;
}

function lastAssistantIndex() {
  for (let i = S.msgs.length - 1; i >= 0; i -= 1) {
    if (S.msgs[i].role === 'assistant') return i;
  }
  return -1;
}

/* 每个人一个音色。不这么做的话，群聊听起来是一个人在自问自答。 */
function speakLine(m, rate) {
  if (!m || !m.text) return;
  const s = A().speakAppend;
  if (!s) return;
  const c = castOf(S.scenario, m.by);
  const v = (c && c.voice) || {};
  const base = (A().settings ? A().settings.rate : 1) * (v.rate || 1);
  s(m.text, {
    rate: rate ? rate * (v.rate || 1) : base * 0.97,
    pitch: v.pitch
  });
}

function renderChat(root) {
  const sc = S.scenario;
  const last = lastAssistantIndex();
  root.innerHTML = `
    <div class="say-scene">
      <div class="ss-line">
        <span class="ss-name">${esc(sc.title)}</span>
        <span class="tag">${CAT_NAME_SAY[sc.cat] || ''}</span>
        <span class="spacer"></span>
        <button class="link-btn" id="say-quit">结束这段</button>
      </div>
      <div class="ss-goal">你要办成：${esc(sc.goal)}</div>
      <div class="ss-cast">在场：${(sc.cast || []).map((c) => `<span class="cast-chip small" style="--av-h:${hueFor(c.id)}"><b>${esc(c.name)}</b></span>`).join('')}</div>
    </div>

    <div class="say-thread" id="say-thread">
      ${S.msgs.map((m, i) => (m.role === 'assistant' ? aiTurn(m, i, i === last) : userTurn(m))).join('')}
    </div>

    ${S.err ? `<div class="say-note bad"><b>出错了</b><span>${esc(S.err)}</span>
      <button class="link-btn" id="say-retry">重试</button></div>` : ''}

    ${S.help ? renderHelp() : ''}

    <div class="say-bar">
      <div class="say-tools">
        <button class="tool-btn" id="say-repeat">没听懂</button>
        <button class="tool-btn" id="say-mean">这句什么意思</button>
        <button class="tool-btn" id="say-help">我不会说</button>
      </div>
      <div class="say-input">
        <textarea id="say-text" rows="2" placeholder="你来说。英文，说得不完整也算。⌘ + Enter 发送。"></textarea>
        <button class="mic-btn" id="say-mic" title="用嘴说" aria-label="用嘴说">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="9" y="2" width="6" height="11" rx="3"></rect>
            <path d="M5 11a7 7 0 0 0 14 0"></path>
            <path d="M12 18v4"></path>
          </svg>
        </button>
        <button class="btn btn-primary" id="say-send">发送</button>
      </div>
      <div class="say-hint" id="say-hint">${S.busy ? '对方正在说…' : '轮到你了'}</div>
    </div>
  `;
  bindChat();
  const th = $('say-thread');
  if (th) th.scrollTop = th.scrollHeight;
}

function aiTurn(m, i, isLast) {
  const shown = m.shown;
  const zh = m.zh;
  const ladder = S.ladder[i] || 0;
  const c = castOf(S.scenario, m.by);
  const name = c ? c.name : (S.scenario.role || '对方');
  const initial = (name || '?').slice(0, 1).toUpperCase();
  return `
    <div class="turn ai ${isLast ? 'last' : ''}" data-i="${i}" data-role="${esc(m.by || '')}">
      <div class="who">
        <span class="avatar" style="--av-h:${hueFor(m.by)}" aria-hidden="true">${esc(initial)}</span>
        <span class="who-name">${esc(name)}</span>
        ${c && c.role ? `<span class="who-role">${esc(c.role)}</span>` : ''}
      </div>
      <div class="turn-body">
        <div class="ai-line">
          <button class="ai-play" data-replay="${i}" title="重播">▶</button>
          ${shown
            ? `<div class="ai-text">${esc(m.text)}</div>`
            : `<span class="ai-ghost" aria-label="只说给你听，没显示文字"><i></i><i></i><i></i></span>`}
          ${shown
            ? ''
            : `<button class="link-btn tiny" data-reveal="${i}">看原文</button>`}
        </div>
        ${zh ? `<div class="ai-zh">${esc(zh)}</div>` : ''}
        ${ladder >= 2 && !shown ? `<div class="ai-ladder-hint">再看一遍也听不出？按「没听懂」会给中文。</div>` : ''}
      </div>
    </div>`;
}

function userTurn(m) {
  return `
    <div class="turn me">
      <div class="who">你</div>
      <div class="turn-body"><div class="me-text">${esc(m.text)}</div></div>
    </div>`;
}

function renderHelp() {
  return `<div class="say-help-card">
    <div class="hc-title">你可以这么说</div>
    <div class="hc-body">${S.help.options.length
      ? S.help.options.map((o) => `<button class="hc-opt" data-use="${esc(o)}">${esc(o)}</button>`).join('')
      : `<div class="hint">${esc(S.help.raw || '没拿到建议，再点一次「我不会说」。')}</div>`}
    </div>
    ${S.help.note ? `<div class="hc-note">${esc(S.help.note)}</div>` : ''}
    <button class="link-btn tiny" id="say-help-close">收起来</button>
  </div>`;
}

function bindChat() {
  const thread = $('say-thread');
  if (thread) {
    thread.onclick = (e) => {
      const rep = e.target.closest('[data-replay]');
      if (rep) { speakLine(S.msgs[+rep.dataset.replay], 0.95); return; }
      const rev = e.target.closest('[data-reveal]');
      if (rev) {
        S.msgs[+rev.dataset.reveal].shown = true;
        render();
        return;
      }
    };
  }
  const quit = $('say-quit');
  if (quit) quit.onclick = end;
  const retry = $('say-retry');
  if (retry) retry.onclick = () => { S.err = ''; render(); retryLast(); };

  const repeat = $('say-repeat');
  if (repeat) repeat.onclick = repeatStep;
  const mean = $('say-mean');
  if (mean) mean.onclick = askMeaning;
  const help = $('say-help');
  if (help) help.onclick = askHelp;
  const hcClose = $('say-help-close');
  if (hcClose) hcClose.onclick = () => { S.help = null; render(); };
  document.querySelectorAll('[data-use]').forEach((b) => {
    b.onclick = () => {
      const ta = $('say-text');
      if (ta) { ta.value = b.dataset.use; ta.focus(); }
      S.help = null;
      render();
      const ta2 = $('say-text');
      if (ta2) { ta2.value = b.dataset.use; ta2.focus(); }
    };
  });

  const send = $('say-send');
  if (send) send.onclick = submit;
  const ta = $('say-text');
  if (ta) {
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    });
    if (!S.busy) ta.focus();
  }
  const mic = $('say-mic');
  if (mic) {
    mic.classList.toggle('on', S.asrOn);
    mic.onclick = toggleMic;
  }
}

/* ---------------- 发送与回复 ---------------- */

function submit() {
  if (S.busy) { toast('等它说完这句'); return; }
  const ta = $('say-text');
  const text = (ta ? ta.value : '').replace(/\s+/g, ' ').trim();
  if (!text) { toast('先说一句，两个词也行'); return; }
  if (!/[a-zA-Z]/.test(text)) { toast('用英文说，中文它听不懂'); return; }
  if (ta) ta.value = '';
  S.help = null;
  S.err = '';
  /* 你已经用这句话回应了，就让你看它到底说了什么——先听后看 */
  const prev = lastAssistantIndex();
  if (prev >= 0) S.msgs[prev].shown = true;
  S.msgs.push({ role: 'user', text });
  S.turns += 1;
  render();
  reply();
}

async function reply() {
  S.busy = true;
  const hint = $('say-hint');
  if (hint) hint.textContent = '对方正在说…';

  /* 先定谁接话，再生成——模型一次只演一个人 */
  const lastUser = S.msgs.slice().reverse().filter((m) => m.role === 'user')[0];
  const who = pickSpeaker(lastUser ? lastUser.text : '');
  const msg = makeAi(who, '');
  S.lastBy = msg.by;
  S.msgs.push(msg);
  render();

  try {
    if (S.mode === 'demo') await demoReply(msg);
    else await streamReply(msg);
  } catch (e) {
    S.msgs.pop();
    if (msg.by) S.spoken[msg.by] = Math.max(0, (S.spoken[msg.by] || 1) - 1);
    S.err = e.message || '连不上模型';
    if (e.status === 503) { S.mode = 'demo'; S.health = { configured: false }; }
  } finally {
    S.busy = false;
    render();
  }
}

function retryLast() {
  /* 失败后重来：把最后一条用户消息再发一次 */
  const lastUser = S.msgs.filter((m) => m.role === 'user').length;
  if (!lastUser) { start(); return; }
  reply();
}

async function streamReply(msg) {
  let buf = '';
  const speakSentence = (t) => {
    const clean = t.trim().replace(/^["'\s]+|["'\s]+$/g, '');
    if (clean) A().speakAppend && A().speakAppend(clean, { rate: (A().settings ? A().settings.rate : 1) * 0.97 });
  };

  await chatStream(modelMessages(), (delta) => {
    msg.text += delta;
    buf += delta;
    /* 讲到一句就念一句，不用等整段生成完 */
    for (;;) {
      const m = /[.!?](?=["')\]]*\s)/.exec(buf);
      if (!m) break;
      let cut = m.index + 1;
      while (cut < buf.length && /["')\]]/.test(buf[cut])) cut += 1;
      speakSentence(buf.slice(0, cut));
      buf = buf.slice(cut).trimStart();
    }
  });

  if (buf.trim()) speakSentence(buf);
  msg.text = tidy(msg.text);
  if (!msg.text) throw new Error('模型这次什么都没说');

  const han = (msg.text.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (han > 3) S.err = '模型没按设定说英文（回了中文），可以直接重试。';
  S.err = S.err || '';
}

async function demoReply(msg) {
  const sc = S.scenario;
  const beats = sc.beats || [];
  const i = Math.min(S.demoN, beats.length - 1);
  const beat = beats[i] || { text: '' };
  S.demoN += 1;

  /* 剧本里标了谁说的：说话人跟着剧本换，不是一直同一个人念到底 */
  const who = beat.by ? castOf(sc, beat.by) : castOf(sc, '');
  msg.by = who ? who.id : '';
  S.lastBy = msg.by;
  if (msg.by) S.spoken[msg.by] = (S.spoken[msg.by] || 0) + 1;
  S.activeSpeaker = who || null;
  msg.text = beat.text || '';

  await new Promise((r) => setTimeout(r, 350));
  render();
  speakLine(msg, 0.95);
}

function tidy(t) {
  return String(t || '')
    .replace(/^\s*(assistant|partner|ai)\s*[:：]\s*/i, '')
    /* 模型偶尔会学转录格式写成 "Mark: ..."，去掉名字前缀 */
    .replace(/^\s*[A-Z][a-zA-Z]{1,12}\s*[:：]\s*/, '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------- 三个安全阀 ---------------- */

/* 没听懂：慢速重放 → 慢速 + 原文 → 中文。一级一级来，别一键看答案。 */
async function repeatStep() {
  const i = lastAssistantIndex();
  if (i < 0) return;
  const m = S.msgs[i];
  const n = (S.ladder[i] || 0) + 1;
  S.ladder[i] = n;
  const base = (A().settings ? A().settings.rate : 1);

  if (n === 1) {
    speakLine(m, base * 0.72);
    toast('放慢到 0.7 倍，再听一遍');
    render();
    return;
  }
  if (n === 2) {
    m.shown = true;
    speakLine(m, base * 0.72);
    toast('原文给你了，对着再听一遍');
    render();
    return;
  }
  askMeaning();
}

/* 这句什么意思：一次小请求，只要一行中文 */
async function askMeaning() {
  const i = lastAssistantIndex();
  if (i < 0) return;
  const m = S.msgs[i];
  if (m.zh) { toast('已经给你了'); return; }
  if (S.mode === 'demo') {
    m.shown = true;
    toast('演示模式没有中文对照，先看原文');
    render();
    return;
  }
  m.shown = true;
  m.zh = '…正在翻';
  render();
  try {
    const msgs = modelMessages().concat([
      { role: 'user', content: '[[ZH]] Translate your last line into plain, natural Chinese. Output only the translation. No quotes, no explanation.' }
    ]);
    const t = await chatOnce(msgs, 0.2);
    m.zh = t.replace(/^["'\s]+|["'\s]+$/g, '');
  } catch (e) {
    m.zh = '';
    toast('翻译失败：' + e.message);
  }
  render();
}

/* 我不会说：给两种说法，不推进对话。这是敢开口的前提。 */
async function askHelp() {
  if (S.busy) { toast('等它说完这句'); return; }
  if (S.mode === 'demo') {
    S.help = {
      options: S.scenario.phrases.slice(0, 2),
      note: '演示模式给的是这个场景里最该用的两句。'
    };
    render();
    return;
  }
  S.help = { options: [], raw: '', note: '' };
  render();
  try {
    const msgs = modelMessages().concat([{
      role: 'user',
      content: '[[HELP]] The learner does not know how to reply. Do not continue the scene. ' +
        'Reply in exactly this format and nothing else:\n' +
        '1. <one natural spoken English reply, under 12 words>\n' +
        '2. <a different natural reply, under 12 words>\n' +
        '中文：<one line in Chinese saying what each one sounds like>'
    }]);
    const t = await chatOnce(msgs, 0.5);
    S.help = parseHelp(t);
  } catch (e) {
    S.help = { options: [], raw: '没拿到建议：' + e.message, note: '' };
  }
  render();
}

function parseHelp(raw) {
  const out = { options: [], raw: String(raw || '').trim(), note: '' };
  const lines = out.raw.split('\n');
  lines.forEach((line) => {
    const m = line.match(/^\s*[12][.、)]\s*(.+?)\s*$/);
    if (m) out.options.push(m[1].replace(/^["']|["']$/g, ''));
  });
  const zh = lines.filter((l) => /^\s*中文\s*[:：]/.test(l))[0];
  if (zh) out.note = zh.replace(/^\s*中文\s*[:：]\s*/, '');
  if (!out.options.length) out.raw = out.raw.slice(0, 240);
  return out;
}

/* ---------------- 结束与复盘 ---------------- */

async function end() {
  if (S.busy) { toast('等它把这句说完'); return; }
  if (!S.turns) {
    const ok = confirm('一句都还没说。真的结束吗？说一句也算。');
    if (!ok) return;
  }
  A().stopSpeech && A().stopSpeech();

  const sc = S.scenario;

  if (S.mode === 'demo') {
    /* 演示模式不判成败、不编缺口。只记"练过"，以及这个场合该用的说法你用上了几个。 */
    S.debrief = {
      outcome: 'demo',
      skill: (sc.covers || [])[0] || '',
      gap: 'unknown',
      who: '',
      evidence: '演示模式只看流程，不判断成败。',
      stuck: [],
      phrases: sc.phrases.slice(),
      mustHit: mustHitCount(sc)
    };
    finish();
    return;
  }

  S.debrief = { loading: true };
  S.view = 'debrief';
  render();
  try {
    S.debrief = await judge();
  } catch (e) {
    S.debrief = {
      outcome: 'unclear',
      skill: '',
      gap: 'none',
      who: '',
      evidence: '这次没能拿到评价（' + e.message + '）。',
      stuck: [],
      phrases: sc.phrases.slice()
    };
  }
  finish();
}

/* 这个场合该用的说法，你用上了几个（演示模式唯一的信号，不判对错） */
const MUST_STOP = /^(i|you|we|it|the|a|an|to|is|are|was|be|of|in|on|for|that|this|and|do|does|did|not|my|your|would|could|can|with|up|at|me)$/i;

function mustHitCount(sc) {
  const text = S.msgs.filter((m) => m.role === 'user')
    .map((m) => m.text).join(' ')
    .toLowerCase().replace(/[^a-z0-9'\s]/g, ' ');
  return (sc.must || []).filter((p) => {
    const words = String(p).toLowerCase().replace(/[^a-z0-9'\s]/g, ' ')
      .split(/\s+/).filter((w) => w && !MUST_STOP.test(w));
    if (words.length < 1) return false;
    const hit = words.filter((w) => text.indexOf(w) >= 0).length;
    return hit >= Math.min(2, words.length);
  }).length;
}

async function judge() {
  const sc = S.scenario;
  const cast = sc.cast || [];
  const transcript = S.msgs.map((m) => {
    if (m.role === 'user') return 'LEARNER: ' + m.text;
    const c = castOf(sc, m.by);
    return (c ? c.name : 'PARTNER') + ': ' + m.text;
  }).join('\n');

  const skillList = (window.SKILLS || []).map((s) => s.id + '=' + s.label).join('; ');

  const sys = [
    'You evaluate one English role-play. Reply with JSON only, no markdown fence, no explanation.',
    'The learner is a Chinese speaker at intermediate level. Judge whether the task was accomplished, not grammar.'
  ].join(' ');

  const user = [
    'TASK: ' + sc.goal,
    'PEOPLE IN THE ROOM:',
    cast.map((c) => '- ' + c.id + ' (' + c.name + ', ' + c.role + '): ' + c.stance).join('\n'),
    '',
    'TRANSCRIPT',
    transcript,
    '',
    'Pick the ONE thing the learner was mainly trying to do, from this closed list (id=name):',
    skillList,
    '',
    'Return exactly this shape:',
    '{"outcome":"success|failed|unclear","skill":"<one id copied from the list>","gap":"word|pattern|ear|none",',
    ' "next":"easier|repeat|move-on","who":"<id of the person it was settled with>",',
    ' "evidence":"<one short sentence in Chinese saying why>",',
    ' "stuck":[{"you":"<what the learner actually wrote, verbatim>","better":"<natural spoken English, under 15 words>"}],',
    ' "phrases":["<3 short English sentences the learner should practise next, each under 14 words>"]}',
    '',
    'Rules:',
    '- "skill" must be copied exactly from the list above. If nothing in the list fits what the learner was doing, return "skill":"" and "outcome":"unclear". Never invent an id.',
    '- "gap": word = did not have the words; pattern = had the words but not the sentence pattern; ear = did not catch what was said; none = no real gap.',
    '- If "gap" is not "none", "stuck" must contain at least one item, and "you" must be copied from the transcript.',
    '- "next": easier = needs a lighter version of the same thing; repeat = try the same again; move-on = this one is done.',
    '- At most 2 items in "stuck". Always give exactly 3 phrases.'
  ].join('\n');

  const raw = await chatOnce([{ role: 'system', content: sys }, { role: 'user', content: user }], 0.2);
  const obj = parseJson(raw);
  if (!obj) throw new Error('评价格式不对');

  const ids = (window.SKILLS || []).map((s) => s.id);
  let skill = String(obj.skill || '');
  let outcome = ['success', 'failed', 'unclear'].indexOf(obj.outcome) >= 0 ? obj.outcome : 'unclear';
  let gap = ['word', 'pattern', 'ear', 'none'].indexOf(obj.gap) >= 0 ? obj.gap : 'none';
  const stuck = Array.isArray(obj.stuck) ? obj.stuck.filter((x) => x && x.you).slice(0, 2) : [];

  /* 两条丢弃规则：诊断宁可不记，也不能记错。
     功能名必须来自那份清单——同一个功能被分成两个名字，就永远毕不了业。 */
  let dropped = '';
  if (ids.indexOf(skill) < 0) dropped = '这次没认出你练的是哪一件，所以没记进进度';
  else if (gap !== 'none' && !stuck.length) dropped = '说你卡住了，但没指出卡在哪一句，所以没记进进度';

  if (dropped) {
    outcome = 'unclear';
    skill = '';
    gap = 'none';
  }

  const whoOk = cast.some((c) => c.id === obj.who);

  return {
    outcome: outcome,
    skill: skill,
    gap: gap,
    next: ['easier', 'repeat', 'move-on'].indexOf(obj.next) >= 0 ? obj.next : 'repeat',
    who: whoOk ? obj.who : '',
    dropped: dropped,
    evidence: String(obj.evidence || ''),
    stuck: stuck,
    phrases: Array.isArray(obj.phrases) && obj.phrases.length
      ? obj.phrases.slice(0, 3).map(String)
      : sc.phrases.slice()
  };
}

function parseJson(text) {
  const t = String(text || '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

function finish() {
  S.view = 'debrief';
  render();
  const d = S.debrief || {};
  const sc = S.scenario;
  if (A().markSaySession) {
    A().markSaySession({
      id: sc.id,
      sceneId: sc.id,
      turns: S.turns,
      outcome: d.outcome,
      mode: S.mode,
      skillId: d.skill || '',
      gap: d.gap || '',
      who: d.who || '',
      you: (d.stuck && d.stuck[0] && d.stuck[0].you) || ''
    });
  }
}

function renderDebrief(root) {
  const d = S.debrief || {};
  const sc = S.scenario;
  if (d.loading) {
    root.innerHTML = `<div class="say-brief"><div class="db-loading">正在回看这段对话…</div></div>`;
    return;
  }
  const verdict = {
    success: { cls: 'ok', k: '办成了', t: '你要的事，办成了。' },
    failed: { cls: 'bad', k: '没办成', t: '这次没办成，很正常——真实场合也常常一次不成。' },
    unclear: { cls: '', k: '不好说', t: '这次说不清算不算办成，所以没记进进度。' },
    demo: { cls: '', k: '演示模式', t: '演示模式走完了流程，不判断成败。' }
  }[d.outcome] || { cls: '', k: '', t: '' };

  const stuck = (d.stuck || []).filter((x) => x && x.you);
  const skillName = d.skill && A().skillLabel ? A().skillLabel(d.skill) : '';
  const whoCast = castOf(sc, d.who);
  const gapText = d.gap && A().GAP_LABEL ? A().GAP_LABEL[d.gap] : '';
  const nextLine = {
    word: '明天先回「听音猜义」，把这几句里的词拆开单独听过一遍，再回来听整句。',
    pattern: '明天「听写」里会出现这句的正确说法，听到就写下来。',
    ear: '明天先把这一句用 0.7 倍速听三遍，再听正常速度。',
    '': ''
  }[d.gap || ''] || '';

  root.innerHTML = `
    <div class="say-brief">
      <div class="db-verdict ${verdict.cls}">
        <div class="dv-k">${verdict.k}</div>
        <div class="dv-t">${verdict.t}</div>
      </div>
      ${d.evidence ? `<div class="db-evidence">${esc(d.evidence)}</div>` : ''}

      ${skillName || whoCast || gapText ? `
      <div class="db-diag">
        ${skillName ? `<div class="dd-row"><span class="dd-k">这次练的是</span><span class="dd-v">${esc(skillName)}</span></div>` : ''}
        ${whoCast ? `<div class="dd-row"><span class="dd-k">在谁那儿</span><span class="dd-v">${esc(whoCast.name)}（${esc(whoCast.role)}）· ${d.outcome === 'success' ? '办成了' : d.outcome === 'failed' ? '没办成' : '说不清'}</span></div>` : ''}
        ${gapText ? `<div class="dd-row"><span class="dd-k">卡在哪一步</span><span class="dd-v">${esc(gapText)}</span></div>` : ''}
        ${d.gap === 'unknown' ? `<div class="dd-row"><span class="dd-k">卡在哪一步</span><span class="dd-v">未评估（演示模式不猜）</span></div>` : ''}
      </div>` : ''}

      ${d.dropped ? `<div class="say-note warn"><b>这次没记进进度</b><span>${esc(d.dropped)}。对话本身照样算练过。</span></div>` : ''}
      ${nextLine ? `<div class="db-next">${esc(nextLine)}</div>` : ''}
      ${d.outcome === 'demo' && typeof d.mustHit === 'number' ? `
        <div class="db-next">这个场合该用的说法，这次你用上了 <b>${d.mustHit}</b> / ${(sc.must || []).length} 个。演示模式只数这个，不判对错。</div>` : ''}

      <div class="db-stats">
        <span>你说了 <b>${S.turns}</b> 句</span>
        <span>这段对话 <b>${Math.round(S.msgs.length / 2)}</b> 轮</span>
        <span>在场 <b>${esc((sc.cast || []).map((c) => c.name).join('、'))}</b></span>
      </div>

      ${stuck.length ? `
      <div class="db-block">
        <h3>${stuck.length === 1 ? '这一处' : '这两处'}，换个说法就顺了</h3>
        ${stuck.map((x) => `
          <div class="db-pair">
            <div class="dp-you">你说：${esc(x.you)}</div>
            <div class="dp-better">地道说法：${esc(x.better)}</div>
          </div>`).join('')}
      </div>` : ''}

      <div class="db-block">
        <h3>带走这三句</h3>
        <p class="hint">勾上的会加进听写题库，明天在「听写」里回来考你。它们的来源会记着：哪次对话、你当时说的哪一句。</p>
        <div class="db-picks">
          ${(d.phrases || []).map((p, i) => `
            <label class="db-pick">
              <input type="checkbox" checked data-phrase="${i}">
              <span>${esc(p)}</span>
              <button class="ai-play tiny" data-say="${esc(p)}" type="button">▶</button>
            </label>`).join('')}
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn btn-primary" id="db-add">加进听写题库</button>
          <button class="btn btn-ghost" id="db-again">再来一次</button>
          <button class="btn btn-ghost" id="db-other">换个场景</button>
        </div>
        <div class="hint" id="db-msg"></div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-say]').forEach((b) => {
    b.onclick = (e) => { e.preventDefault(); A().speakAppend && A().speakAppend(b.dataset.say, {}); };
  });
  $('db-add').onclick = () => {
    const picked = [];
    const you = (d.stuck && d.stuck[0] && d.stuck[0].you) || '';
    root.querySelectorAll('[data-phrase]').forEach((cb) => {
      if (!cb.checked) return;
      picked.push({
        text: d.phrases[+cb.dataset.phrase],
        note: '来自「' + sc.title + '」这段对话。',
        /* 可追溯：这句是从哪次卡住里捞出来的 */
        from: { sessionId: S.sessionId, sceneId: sc.id, you: you, gap: d.gap || '' },
        skill: d.skill || ''
      });
    });
    if (!picked.length) { $('db-msg').textContent = '一句都没勾，那就先不加。'; return; }
    const r = A().addCustomSentences ? A().addCustomSentences(picked) : { added: 0, dup: 0 };
    $('db-msg').textContent = r.added
      ? `已加入 ${r.added} 句${r.dup ? `，${r.dup} 句本来就在题库里` : ''}，带着这次的来源。去「听写」就能练。`
      : '这几句已经在题库里了。';
    if (r.added) toast(`题库多了 ${r.added} 句，明天会考你`);
  };
  $('db-again').onclick = () => { S.view = 'brief'; render(); };
  $('db-other').onclick = () => { S.view = 'list'; render(); };
}

/* ---------------- 麦克风 ---------------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

function toggleMic() {
  if (!SR) {
    toast('这个浏览器不支持语音识别，先打字吧（Chrome / Edge 支持）');
    return;
  }
  if (S.asrOn) { stopMic(); return; }
  try {
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const base = $('say-text') ? $('say-text').value : '';
    rec.onresult = (ev) => {
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      const ta = $('say-text');
      if (!ta) return;
      const add = (final || interim).trim();
      ta.value = (base ? base + ' ' : '') + add;
      if (final) toast('识别到了，检查一下再发送');
    };
    rec.onerror = (ev) => {
      S.asrOn = false;
      const btn = $('say-mic');
      if (btn) btn.classList.remove('on');
      const map = {
        'not-allowed': '麦克风被浏览器拦了，在地址栏左边的图标里允许一下',
        network: '语音识别要联网，这边连不上。先打字吧',
        'no-speech': '没听到声音，再试一次'
      };
      toast(map[ev.error] || '语音识别不可用，先打字吧');
    };
    rec.onend = () => {
      S.asrOn = false;
      const btn = $('say-mic');
      if (btn) btn.classList.remove('on');
    };
    rec.start();
    S.asrOn = true;
    const btn = $('say-mic');
    if (btn) btn.classList.add('on');
  } catch (e) {
    toast('麦克风启动失败，先打字吧');
    S.asrOn = false;
  }
}

function stopMic() {
  S.asrOn = false;
  try { if (rec) rec.stop(); } catch (e) { /* 已经停了 */ }
  const btn = $('say-mic');
  if (btn) btn.classList.remove('on');
}

/* ---------------- 设置页：模型配置 ---------------- */

let cfgLoaded = false;

async function renderSettings() {
  const box = $('say-cfg');
  if (!box) return;
  const status = $('say-cfg-status');
  if (status) status.textContent = '正在读取…';
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (!r.ok) throw new Error('这个启动方式没有配置接口');
    const c = await r.json();
    $('say-base').value = c.base_url || '';
    $('say-model').value = c.model || '';
    $('say-key').placeholder = c.key_hint ? `已保存（${c.key_hint}），要换就重新填` : 'sk-…';
    if (status) {
      status.textContent = c.configured
        ? `已配置 · ${c.model}`
        : '还没配置。填好点「保存并测试」。';
    }
    cfgLoaded = true;
  } catch (e) {
    if (status) status.textContent = e.message + '。用 start.command 启动才能配置。';
  }
}

async function saveSettings() {
  const status = $('say-cfg-status');
  const base = $('say-base').value.trim();
  const model = $('say-model').value.trim();
  const key = $('say-key').value.trim();
  if (!base || !model) { if (status) status.textContent = '接口地址和模型名都要填'; return; }
  if (status) status.textContent = '正在保存…';
  try {
    const body = { base_url: base, model };
    if (key) body.api_key = key;
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || '保存失败');
    if (status) status.textContent = '已保存，正在试一句…';
    await health(true);
    const ok = await testOne();
    if (status) {
      status.textContent = ok
        ? '保存成功，模型能用。回「说英语」挑一件事就行。'
        : '已保存，但调用失败：' + (S.err || '检查地址、模型名和密钥');
    }
    if (ok) { $('say-key').value = ''; toast('模型配好了'); }
  } catch (e) {
    if (status) status.textContent = '保存失败：' + e.message;
  }
}

async function testOne() {
  S.err = '';
  try {
    const t = await chatOnce([
      { role: 'system', content: 'You are a hotel receptionist. Reply with one short spoken English sentence.' },
      { role: 'user', content: 'Hi, checking in.' }
    ], 0.5);
    return !!t;
  } catch (e) {
    S.err = e.message;
    return false;
  }
}

/* ---------------- 事件绑定 ---------------- */

function boot() {
  const save = $('say-cfg-save');
  if (save) save.onclick = saveSettings;
  const test = $('say-cfg-test');
  if (test) {
    test.onclick = async () => {
      const st = $('say-cfg-status');
      if (st) st.textContent = '正在试…';
      const ok = await testOne();
      if (st) st.textContent = ok ? '能通。' : '不通：' + (S.err || '检查地址、模型名和密钥');
    };
  }
  health();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.__ENV__ = {
  render, renderSettings, pick, start, end,
  get state() { return S; },
  /* 测试用 */
  submit, askHelp, askMeaning, repeatStep, parseHelp, parseJson
};

})();
