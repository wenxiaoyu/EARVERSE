/* ============================================================
   A+B LISTENING TRAINER — app
   零依赖静态应用。所有状态存 localStorage。
   ============================================================ */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
const STORE_KEY = 'abTrainer.v1';
const DAY = 86400000;
const ATTR_TAGS = ['连读', '弱读', '缩略', '失去爆破', '生词', '走神', '拼写'];
const PARSE_TAGS = ['连读', '弱读', '缩略', '失去爆破'];

/* 界面上不出现术语：存的是短标签，显示的是人话 */
const TAG_LABEL = {
  '连读': '连在一起',
  '弱读': '念得很轻',
  '缩略': '说成了缩写',
  '失去爆破': '尾音吞掉',
  '生词': '不认识',
  '走神': '走神了',
  '拼写': '拼错了'
};
/* 句子自带的分类标签也翻译一遍 */
const SENT_TAG = {
  '连读': '连读', '闪音': 't/d 变轻', '弱读': '虚词很轻',
  '缩略': '说成缩写', '变形': '连成一串', '生词': '生词'
};

/* ---------------- 小工具 ---------------- */
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const todayKey = (d) => {
  const x = d ? new Date(d) : new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const startOfDay = (d) => {
  const x = d ? new Date(d) : new Date();
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const shuffle = (a) => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* 控件旁边闪一下「已保存」，解决"点了不知道生效没有" */
const savedTimers = {};
function flashSaved(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '已保存 ✓';
  el.classList.add('on');
  clearTimeout(savedTimers[id]);
  savedTimers[id] = setTimeout(() => el.classList.remove('on'), 1800);
}

/* ---------------- 状态 ---------------- */
const STATE_V = 2;

function defaultState() {
  return {
    v: STATE_V,
    cards: {},
    dict: {},
    sessions: {},
    settings: { voiceURI: '', rate: 1, pitch: 1, reduce: 1, newCap: 20 },
    customSentences: [],
    rules: {},
    newToday: { date: '', n: 0 },
    /* 每个言语功能办到哪一步：和 cards 平级，不塞进 sessions */
    skills: {},
    created: Date.now()
  };
}

let state = defaultState();
let storageOK = true;

function storageProbe() {
  try {
    const k = '__abt_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

function showStorageBanner() {
  showBanner('storage-banner', `
    <b>进度无法保存</b>
    <span>浏览器拒绝了这个页面的本地存储（通常是因为用 file:// 直接打开）。双击文件夹里的 <code>start.command</code> 启动后再用，记录才会留下来。</span>
  `);
}

function showBanner(id, html) {
  if (document.getElementById(id)) return;
  const bar = document.createElement('div');
  bar.id = id;
  bar.className = 'storage-banner';
  bar.innerHTML = html;
  document.body.insertBefore(bar, document.body.firstChild);
}

function showVoiceBanner() {
  const hasSynth = 'speechSynthesis' in window;
  showBanner('voice-banner', `
    <b>没有可用的英语语音</b>
    <span>${hasSynth
      ? '系统里没找到英文声音。macOS：系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音，下载一个英文语音（如 Samantha），然后重新打开本页。'
      : '当前浏览器不支持语音合成，请换用 Chrome / Edge / Safari。'}</span>
  `);
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state = Object.assign(defaultState(), parsed);
      state.settings = Object.assign(defaultState().settings, parsed.settings || {});
      state.newToday = Object.assign({ date: '', n: 0 }, parsed.newToday || {});
      /* v1 的记录原样保留：老用户第二天打开，卡和听写记录都还在，
         只是多了一张空的「办成过的事」表 */
      if (!state.skills || typeof state.skills !== 'object') state.skills = {};
      if (Number(parsed.v || 1) < STATE_V) {
        state.v = STATE_V;
        save();
      }
    }
  } catch (e) {
    console.warn('读取本地数据失败', e);
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    storageOK = false;
    showStorageBanner();
  }
}

/* ---------------- 语音引擎 ----------------
   Web Speech 只能用系统里已装的音色，"教科书腔"其实是两件事叠加：
   (1) 音色本身是压缩录音（citation 录音，每个词都念满）；
   (2) 合成器不会做弱读连读，功能词也读成重读形式。
   第 (2) 件能在代码里消除：朗读前把 to / and / of / you 这类词改写成
   真实的弱读拼写（gonna、lemme、n'、fer…），合成器照着念就自然多了。
   第 (1) 件只能靠装更好的音色，界面上会明确提示当前是哪种。            */

let voiceList = [];
let speakGen = 0;

const VOICE_QUALITY = /natural|premium|enhanced|neural|siri/i;
const VOICE_GOOD = /^(samantha|ava|allison|susan|zoe|serena|karen|moira|tessa|daniel|tom|nicky|google)/i;
/* macOS 的整蛊/新奇音色，听起来像玩具，绝不能当默认 */
const VOICE_BAD = /\b(bad news|good news|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;

/* macOS 的 voiceURI 里会带 premium / enhanced 段（如 com.apple.voice.premium.en-US.Ava），
   但 voice 名有时不带后缀，所以两处都要查，否则装了 Premium 也会被判成压缩音色。*/
function voiceMeta(v) {
  return ((v && v.name) || '') + ' ' + ((v && v.voiceURI) || '');
}

function voiceScore(v) {
  const n = v.name || '';
  const meta = voiceMeta(v);
  let s = 0;
  if (VOICE_QUALITY.test(meta)) s += 60;       /* 神经/增强音色，差距最大 */
  if (/google/i.test(n)) s += 45;
  if (VOICE_GOOD.test(n)) s += 30;
  if (/^en[-_]us/i.test(v.lang)) s += 12;
  else if (/^en[-_]gb/i.test(v.lang)) s += 8;
  else s += 2;
  if (v.localService === false) s += 6;        /* 联网音色通常更自然 */
  if (VOICE_BAD.test(n)) s -= 200;
  return s;
}

function voiceIsQuality(v) {
  const n = (v && v.name) || '';
  return VOICE_QUALITY.test(voiceMeta(v)) || /google/i.test(n) || !v.localService;
}

function voiceTag(v) {
  if (!v) return '';
  if (VOICE_BAD.test(v.name || '')) return '机器人';
  return voiceIsQuality(v) ? '高质量' : '';
}

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const all = window.speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  voiceList = all.slice().sort((a, b) => (voiceScore(b) - voiceScore(a)) || a.name.localeCompare(b.name));
  renderVoiceSelect();
}

function pickVoice() {
  if (!voiceList.length) loadVoices();
  const uri = state.settings.voiceURI;
  if (uri) {
    const found = voiceList.find((v) => v.voiceURI === uri);
    if (found) return found;
  }
  return voiceList[0] || null;
}

/* --- 弱读改写 --- */
/* 顺序很重要：先缩合（do not → don't），再连读（to → gonna 系列），
   最后才是弱读吞音。 */
const RULES_CONTRACT = [
  [/\bi am\b/gi, "i'm"],
  [/\byou are\b/gi, "you're"],
  [/\bwe are\b/gi, "we're"],
  [/\bthey are\b/gi, "they're"],
  [/\bhe is\b/gi, "he's"],
  [/\bshe is\b/gi, "she's"],
  [/\bit is\b/gi, "it's"],
  [/\bthat is\b/gi, "that's"],
  [/\bthere is\b/gi, "there's"],
  [/\bthere are\b/gi, "there're"],
  [/\bwhat is\b/gi, "what's"],
  [/\bhere is\b/gi, "here's"],
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"],
  [/\bwere not\b/gi, "weren't"],
  [/\bhave not\b/gi, "haven't"],
  [/\bhas not\b/gi, "hasn't"],
  [/\bwill not\b/gi, "won't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bcould not\b/gi, "couldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bcan not\b/gi, "can't"],
  [/\bcannot\b/gi, "can't"],
  [/\bi will\b/gi, "i'll"],
  [/\bwe will\b/gi, "we'll"],
  [/\bit will\b/gi, "it'll"],
  [/\blet us\b/gi, "let's"]
];

const RULES_SPOKEN = [
  [/\bgoing to\b/gi, 'gonna'],
  [/\bwant to\b/gi, 'wanna'],
  [/\bwants to\b/gi, 'wansta'],
  [/\bgot to\b/gi, 'gotta'],
  [/\bhave to\b/gi, 'hafta'],
  [/\bhas to\b/gi, 'hasta'],
  [/\bkind of\b/gi, 'kinda'],
  [/\bsort of\b/gi, 'sorta'],
  [/\ba lot of\b/gi, 'a lotta'],
  [/\blots of\b/gi, 'lotsa'],
  [/\bout of\b/gi, 'outta'],
  [/\bdid you\b/gi, 'didja'],
  [/\bwould you\b/gi, 'wouldja'],
  [/\bcould you\b/gi, 'couldja'],
  [/\bdon't you\b/gi, 'dontcha'],
  [/\bdidn't you\b/gi, 'didntcha'],
  [/\blet me\b/gi, 'lemme'],
  [/\bgive me\b/gi, 'gimme'],
  [/\bshould have\b/gi, 'shoulda'],
  [/\bwould have\b/gi, 'woulda'],
  [/\bcould have\b/gi, 'coulda'],
  [/\bmust have\b/gi, 'musta'],
  [/\bmight have\b/gi, 'mighta'],
  [/\bdon't know\b/gi, 'dunno'],
  [/\bbecause\b/gi, 'cuz'],
  [/\bprobably\b/gi, 'probly'],
  /* 功能词弱读 —— 这几条决定了"每个词都念满"能不能消失 */
  [/\bfor\b/gi, 'fer'],
  [/\bof\b/gi, 'uh'],
  [/\bjust\b/gi, 'jus'],
  [/\bthem\b/gi, 'em'],
  [/\bhim\b/gi, 'im']
];

function applyRules(t, rules) {
  rules.forEach(([re, rep]) => { t = t.replace(re, rep); });
  return t;
}

/* 0 = 教科书（原样）· 1 = 真人近似（缩写 + 连读 + 弱读）
   没有"中间档"：只做缩合而不做弱读，句子里没有 gonna 这类词时等于什么都没变，
   那档位就是骗人的。 */
function prepareText(text, level) {
  let t = String(text == null ? '' : text).trim();
  if (!t) return t;
  const lvl = level != null ? level : (state.settings.reduce == null ? 1 : Number(state.settings.reduce));
  if (lvl <= 0) return t;
  t = applyRules(t, RULES_CONTRACT);
  t = applyRules(t, RULES_SPOKEN);
  return t.replace(/\s+/g, ' ').trim();
}

function speak(text, opt) {
  opt = opt || {};
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    toast('当前环境不支持语音合成，请用 Chrome / Edge / Safari 打开');
    return null;
  }
  const gen = ++speakGen;
  window.speechSynthesis.cancel();

  const spoken = prepareText(text, opt.reduce);
  const u = new SpeechSynthesisUtterance(spoken);
  const v = pickVoice();
  u.lang = (v && v.lang) || 'en-US';
  u.rate = clamp(opt.rate != null ? opt.rate : state.settings.rate, 0.5, 2);
  u.pitch = clamp(opt.pitch != null ? opt.pitch : (state.settings.pitch == null ? 1 : state.settings.pitch), 0.5, 2);
  u.volume = 1;
  if (v) u.voice = v;
  u.onstart = () => { if (gen === speakGen && opt.onstart) opt.onstart(); };
  u.onend = () => { if (gen === speakGen && opt.onend) opt.onend(); };
  u.onerror = () => { if (gen === speakGen && opt.onend) opt.onend(); };
  window.speechSynthesis.speak(u);
  return u;
}

function stopSpeech() {
  speakGen += 1;                 /* 让还在排队的回调失效，避免循环重启 */
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/* 对话专用：不清空队列，一句接一句念下去（speak() 会 cancel，不能连读） */
function speakAppend(text, opt) {
  opt = opt || {};
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const spoken = prepareText(text, opt.reduce);
  if (!spoken) return null;
  const u = new SpeechSynthesisUtterance(spoken);
  const v = pickVoice();
  u.lang = (v && v.lang) || 'en-US';
  u.rate = clamp(opt.rate != null ? opt.rate : state.settings.rate, 0.5, 2);
  u.pitch = clamp(opt.pitch != null ? opt.pitch : (state.settings.pitch == null ? 1 : state.settings.pitch), 0.5, 2);
  u.volume = 1;
  if (v) u.voice = v;
  if (opt.onstart) u.onstart = opt.onstart;
  if (opt.onend) u.onend = opt.onend;
  if (opt.onerror) u.onerror = opt.onerror;
  window.speechSynthesis.speak(u);
  return u;
}

/* ---------------- 路由 ---------------- */
function go(page) {
  stopSpeech();
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  if (location.hash !== '#' + page) {
    try { history.replaceState(null, '', '#' + page); } catch (e) { location.hash = page; }
  }
  window.scrollTo(0, 0);
  if (page === 'today') renderToday();
  if (page === 'cards') renderCardsPage();
  if (page === 'dictation') renderDictationPage();
  if (page === 'say' && window.__ENV__) window.__ENV__.render();
  if (page === 'reductions') renderReductions();
  if (page === 'progress') renderProgress();
  if (page === 'settings') {
    renderSettings();
    if (window.__ENV__) window.__ENV__.renderSettings();
  }
  refreshBadges();
}

function refreshBadges() {
  const due = dueCount();
  const b = $('nav-due');
  b.textContent = due;
  b.classList.toggle('zero', due === 0);
  $('streak-foot').innerHTML = streakText();
}

/* ============================================================
   1. 听觉闪卡（A 型）
   ============================================================ */

function introducedToday() {
  if (state.newToday.date !== todayKey()) {
    state.newToday = { date: todayKey(), n: 0 };
  }
  return state.newToday.n;
}

function dueCards(pool) {
  const now = Date.now();
  return pool.filter((c) => {
    const s = state.cards[c.id];
    return s && s.due <= now;
  });
}

function unseenCards(pool) {
  return pool.filter((c) => !state.cards[c.id]);
}

function dueCount() {
  return dueCards(CARDS).length + unseenAvailable();
}

function unseenAvailable() {
  const cap = state.settings.newCap || 20;
  const remaining = Math.max(0, cap - introducedToday());
  return Math.min(remaining, unseenCards(CARDS).length);
}

let fcQueue = [];
let fcPos = 0;
let fcRevealed = false;
let fcDeck = 'all';
let fcDoneToday = 0;

function deckPool() {
  return fcDeck === 'all' ? CARDS : CARDS.filter((c) => c.cat === fcDeck);
}

function buildQueue() {
  const pool = deckPool();
  const due = shuffle(dueCards(pool).map((c) => c.id));
  const cap = state.settings.newCap || 20;
  const remain = Math.max(0, cap - introducedToday());
  const fresh = shuffle(unseenCards(pool)).slice(0, remain).map((c) => c.id);
  fcQueue = due.concat(fresh);
  fcPos = 0;
  fcRevealed = false;
  fcDoneToday = 0;
}

function currentCard() {
  return fcQueue[fcPos] ? CARDS.find((c) => c.id === fcQueue[fcPos]) : null;
}

function renderCardsPage() {
  renderDeckPills();
  if (!fcQueue.length) buildQueue();
  renderFlashcard();
}

function renderDeckPills() {
  const decks = [
    { k: 'all', n: '全部' },
    { k: 'core', n: '高频词' },
    { k: 'phrasal', n: '短语动词' },
    { k: 'chunk', n: '常用说法' },
    { k: 'connect', n: '连接词' }
  ];
  $('deck-pills').innerHTML = decks.map((d) => {
    const total = d.k === 'all' ? CARDS.length : CARDS.filter((c) => c.cat === d.k).length;
    return `<button class="pill ${fcDeck === d.k ? 'active' : ''}" data-deck="${d.k}">${d.n} ${total}</button>`;
  }).join('');
}

const CAT_NAME = {
  core: '高频口语词',
  phrasal: '短语动词',
  chunk: '常用说法',
  connect: '连接词'
};

/* 这次评价之后，下次什么时候再考 —— 直接显示出来，让记忆曲线可见 */
function nextIntervalFor(card, g) {
  const s = state.cards[card.id];
  const base = s ? s.interval : 0;
  if (g === 3) return base <= 0 ? 2 : Math.min(60, Math.round(base * 2.2));
  if (g === 2) return base <= 0 ? 1 : Math.min(45, Math.round(base * 1.5));
  return 0;
}

function renderFlashcard() {
  const stage = $('fc-stage');
  const card = currentCard();
  const total = fcQueue.length;

  $('fc-progress-text').textContent = total ? `第 ${Math.min(fcPos + 1, total)} 张 · 共 ${total} 张` : '';
  const bar = $('fc-bar');
  if (bar) bar.style.width = total ? `${Math.round((Math.min(fcPos, total) / total) * 100)}%` : '0%';

  const nxFoot = $('fc-next');
  if (nxFoot) nxFoot.textContent = card ? '跳过，去听写 →' : '练完了，去听写 →';

  if (!card) {
    const untouched = unseenCards(deckPool()).length;
    stage.innerHTML = `
      <div class="fc-cat">这一轮清空了</div>
      <div style="font-size:22px;font-weight:700">今天的卡做完了</div>
      <p class="hint" style="max-width:400px;text-align:center;margin:0">
        ${untouched > 0
          ? `还有 ${untouched} 张没解锁。每天只放 ${state.settings.newCap} 张新卡，是怕你第二天复习不完——明天会自动补上。`
          : '这一副牌都过了一遍。学得越牢的，隔得越久才回来考你。'}
      </p>
      <div class="row" style="margin-top:4px">
        <button class="btn btn-ghost" id="fc-restart">再来一轮</button>
        <button class="btn btn-primary" id="fc-inline-next">去做听写 →</button>
      </div>
    `;
    if (fcDoneToday > 0) markSession('cards');
    const rs = $('fc-restart');
    if (rs) rs.onclick = () => { buildQueue(); renderFlashcard(); };
    const nx2 = $('fc-inline-next');
    if (nx2) nx2.onclick = () => go('dictation');
    refreshBadges();
    return;
  }

  const catName = CAT_NAME[card.cat] || card.cat;

  if (!fcRevealed) {
    stage.innerHTML = `
      <div class="fc-cat">${catName}</div>
      <div class="fc-audio-only">
        <button class="play-btn" id="fc-play" aria-label="播放发音">▶</button>
        <div>只听，别看书。</div>
        <div class="hint">心里先说出中文意思，再点开答案。</div>
      </div>
      <button class="btn btn-primary btn-lg" id="fc-reveal" style="margin-top:8px">看答案</button>
    `;
    $('fc-play').onclick = (e) => { e.stopPropagation(); playCardWord(card); };
    $('fc-reveal').onclick = revealCard;
    playCardWord(card);
  } else {
    const i2 = nextIntervalFor(card, 2);
    const i3 = nextIntervalFor(card, 3);
    stage.innerHTML = `
      <div class="fc-cat">${catName}</div>
      <div class="fc-answer">
        <div class="fc-word">${esc(card.w)}</div>
        <div class="fc-zh">${esc(card.zh)}</div>
        <div class="fc-ex">
          <button class="play-btn sm" id="fc-ex-play" aria-label="播放例句">▶</button>
          <span>${esc(card.ex)}</span>
        </div>
      </div>
      <div class="hint" style="margin-top:18px">刚才听出来了吗？诚实选一个：</div>
      <div class="grade-row">
        <button class="grade-btn" data-g="1">没听出来<small>马上再考一次</small></button>
        <button class="grade-btn" data-g="2">想了 2 秒<small>${i2} 天后再考</small></button>
        <button class="grade-btn" data-g="3">一下就懂<small>${i3} 天后再考</small></button>
      </div>
    `;
    $('fc-ex-play').onclick = () => speak(card.ex);
    stage.querySelectorAll('.grade-btn').forEach((b) => {
      b.onclick = () => gradeCard(parseInt(b.dataset.g, 10));
    });
  }
  refreshBadges();
}

function playCardWord(card) {
  const btn = $('fc-play');
  if (btn) btn.classList.add('playing');
  speak(card.w, {
    onend: () => { if (btn) btn.classList.remove('playing'); }
  });
}

function revealCard() {
  if (fcRevealed) return;
  fcRevealed = true;
  const card = currentCard();
  if (card && state.settings.rate < 1.05) {
    /* 慢速下翻面立刻用正常速再播一次，避免"只记住慢速版" */
  }
  renderFlashcard();
}

function gradeCard(g) {
  const card = currentCard();
  if (!card) return;
  const now = Date.now();
  let s = state.cards[card.id];
  if (!s) {
    s = { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, seen: now };
    state.cards[card.id] = s;
    state.newToday.n = introducedToday() + 1;
    state.newToday.date = todayKey();
  }
  s.reps += 1;
  let msg = '';
  if (g === 3) {
    s.ease = Math.min(3.0, s.ease + 0.08);
    s.interval = s.interval <= 0 ? 2 : Math.min(60, Math.round(s.interval * 2.2));
    s.due = now + s.interval * DAY;
    msg = `记住了 · ${s.interval} 天后再考`;
  } else if (g === 2) {
    s.interval = s.interval <= 0 ? 1 : Math.min(45, Math.round(s.interval * 1.5));
    s.due = now + s.interval * DAY;
    msg = `记下了 · ${s.interval} 天后再考`;
  } else {
    s.lapses += 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.interval = 0;
    s.due = now + 8000;           /* 8 秒后重新挤回本轮 */
    if (fcPos + 3 < fcQueue.length) {
      fcQueue.splice(fcPos + 3, 0, card.id);
    } else {
      fcQueue.push(card.id);
    }
    msg = '没关系，这张等会儿再出现';
  }
  save();
  fcDoneToday += 1;
  const doneN = bumpToday('cards');
  if (doneN >= 10) markSession('cards');
  toast(msg);

  fcRevealed = false;
  fcPos += 1;
  renderFlashcard();
}

/* ============================================================
   2. 听写 + 归因（B 型）
   ============================================================ */

let dCurrent = null;
let dChecked = false;
let dLoop = false;
let dSlow = false;
let dPlayToken = 0;
let dAttribution = {};      /* token -> tag */

function allSentences() {
  return SENTENCES.concat(state.customSentences);
}

function nextDictation() {
  const pool = allSentences();
  if (!pool.length) return;
  /* 优先：从来没练过的 → 练得最少的 → 随机 */
  const scored = pool.map((s) => {
    const rec = state.dict[s.id];
    const n = rec ? rec.attempts.length : 0;
    const last = rec && rec.attempts.length ? rec.attempts[rec.attempts.length - 1].ts : 0;
    return { s, n, last };
  });
  scored.sort((a, b) => (a.n - b.n) || (a.last - b.last));
  const minN = scored[0].n;
  const cands = scored.filter((x) => x.n === minN).map((x) => x.s);
  dCurrent = shuffle(cands)[0];
}

function todayAttempts() {
  const key = todayKey();
  return allAttempts().filter((a) => todayKey(a.ts) === key).length;
}

function renderDictationPage() {
  if (!dCurrent) nextDictation();
  dChecked = false;
  dAttribution = {};
  $('d-result').style.display = 'none';
  $('d-result').innerHTML = '';
  $('d-foot').style.display = 'none';
  $('d-input').value = '';
  $('d-input').disabled = false;

  const tag = dCurrent ? (SENT_TAG[dCurrent.tag] || dCurrent.tag) : '';
  $('d-tag').textContent = tag ? `这类坑：${tag}` : '—';
  $('d-slow').classList.toggle('btn-soft', dSlow);
  $('d-loop').classList.toggle('btn-soft', dLoop);

  const n = todayAttempts();
  $('d-counter').textContent = n
    ? `今天已听写 ${n} 句 · 题库 ${allSentences().length} 句`
    : `题库 ${allSentences().length} 句，随便挑`;
}

function playDictation() {
  if (!dCurrent) return;
  const my = ++dPlayToken;
  const rate = dSlow ? state.settings.rate * 0.75 : state.settings.rate;
  const btn = $('d-play');
  btn.classList.add('playing');
  speak(dCurrent.text, {
    rate,
    onend: () => {
      if (my !== dPlayToken) return;
      if (dLoop) {
        setTimeout(() => { if (my === dPlayToken && dLoop) playDictation(); }, 600);
      } else {
        btn.classList.remove('playing');
      }
    }
  });
}

function stopDictation() {
  dPlayToken++;
  dLoop = false;
  const lb = $('d-loop');
  if (lb) lb.classList.remove('btn-soft');
  const btn = $('d-play');
  if (btn) btn.classList.remove('playing');
  stopSpeech();
}

/* --- 分词与 diff --- */
/* 口语化朗读会把词改成 gonna / i'm / fer 这类形式，学习者照听到的写下来
   必须算对。这里把"缩写"和"连读"都还原成同一个标准序列，两边同时归一，
   所以 don't 与 do not、gonna 与 going to 不会互相判错。 */
const WORD_VARIANTS = {
  /* 连读 / 融合 */
  gonna: ['going', 'to'],
  wanna: ['want', 'to'],
  wansta: ['wants', 'to'],
  gotta: ['got', 'to'],
  hafta: ['have', 'to'],
  hasta: ['has', 'to'],
  kinda: ['kind', 'of'],
  sorta: ['sort', 'of'],
  lotta: ['lot', 'of'],
  lotsa: ['lots', 'of'],
  outta: ['out', 'of'],
  dunno: ['do', 'not', 'know'],
  shoulda: ['should', 'have'],
  woulda: ['would', 'have'],
  coulda: ['could', 'have'],
  musta: ['must', 'have'],
  mighta: ['might', 'have'],
  lemme: ['let', 'me'],
  gimme: ['give', 'me'],
  didja: ['did', 'you'],
  wouldja: ['would', 'you'],
  couldja: ['could', 'you'],
  dontcha: ['do', 'not', 'you'],
  didntcha: ['did', 'not', 'you'],
  cuz: ['because'],
  probly: ['probably'],
  /* 功能词弱读 */
  fer: ['for'],
  uh: ['of'],
  jus: ['just'],
  em: ['them'],
  /* 缩写统一拆开，避免"听写 i'm、答案 i am"这种假错误 */
  "i'm": ['i', 'am'],
  "i've": ['i', 'have'],
  "i'll": ['i', 'will'],
  "i'd": ['i', 'would'],
  "you're": ['you', 'are'],
  "you've": ['you', 'have'],
  "you'll": ['you', 'will'],
  "we're": ['we', 'are'],
  "we've": ['we', 'have'],
  "we'll": ['we', 'will'],
  "they're": ['they', 'are'],
  "they've": ['they', 'have'],
  "they'll": ['they', 'will'],
  "he's": ['he', 'is'],
  "she's": ['she', 'is'],
  "it's": ['it', 'is'],
  "it'll": ['it', 'will'],
  "that's": ['that', 'is'],
  "there's": ['there', 'is'],
  "there're": ['there', 'are'],
  "what's": ['what', 'is'],
  "here's": ['here', 'is'],
  "let's": ['let', 'us'],
  "don't": ['do', 'not'],
  "doesn't": ['does', 'not'],
  "didn't": ['did', 'not'],
  "isn't": ['is', 'not'],
  "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'],
  "weren't": ['were', 'not'],
  "haven't": ['have', 'not'],
  "hasn't": ['has', 'not'],
  "won't": ['will', 'not'],
  "wouldn't": ['would', 'not'],
  "couldn't": ['could', 'not'],
  "shouldn't": ['should', 'not'],
  "can't": ['can', 'not'],
  cannot: ['can', 'not']
};

function normWords(s) {
  const n = String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return [];
  const out = [];
  n.split(' ').forEach((w) => {
    const v = WORD_VARIANTS[w];
    if (v) out.push.apply(out, v);
    else out.push(w);
  });
  return out;
}

function lcsDiff(answer, user) {
  const n = answer.length, m = user.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = answer[i] === user[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (answer[i] === user[j]) { out.push({ t: answer[i], s: 'ok' }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: answer[i], s: 'miss' }); i++; }
    else { out.push({ t: user[j], s: 'extra' }); j++; }
  }
  while (i < n) { out.push({ t: answer[i], s: 'miss' }); i++; }
  while (j < m) { out.push({ t: user[j], s: 'extra' }); j++; }
  return out;
}

function checkDictation() {
  if (!dCurrent || dChecked) return;
  const raw = $('d-input').value.trim();
  if (!raw) {
    toast('先写几个词再交卷——写错也算，写空没法批改');
    $('d-input').focus();
    return;
  }
  const answer = normWords(dCurrent.text);
  const user = normWords(raw);
  const diff = lcsDiff(answer, user);
  const okCount = diff.filter((d) => d.s === 'ok').length;
  const acc = answer.length ? Math.round((okCount / answer.length) * 100) : 0;
  const missed = diff.filter((d) => d.s === 'miss').map((d) => d.t);

  dChecked = true;
  $('d-input').disabled = true;
  stopDictation();

  /* 记录 */
  if (!state.dict[dCurrent.id]) state.dict[dCurrent.id] = { attempts: [] };
  const attempt = { ts: Date.now(), acc, miss: missed.slice(0, 12), tags: {} };
  state.dict[dCurrent.id].attempts.push(attempt);
  save();
  const dn = bumpToday('dictation');
  if (dn >= 3) markSession('dictation');
  if (dn === 3) toast('听写这步完成了 · 今天 3 步里已走完 ' + STEPS.filter((b) => sessionOf(todayKey())[b.k]).length + ' 步');

  const color = acc >= 85 ? 'var(--ok)' : acc >= 60 ? 'var(--warn)' : 'var(--bad)';
  const verdict = acc >= 85 ? '基本听全了' : acc >= 60 ? '听出一半多，还差几个词' : '差得比较多，慢速再听两遍';

  const missTokens = diff.filter((d) => d.s === 'miss');

  const result = $('d-result');
  result.style.display = 'block';
  result.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:2px">
      <span class="accuracy-badge" style="color:${color}">${acc}<small>% 的词听对了</small></span>
      <span class="tag">${esc(dCurrent.tag)}</span>
    </div>
    <div class="hint" style="margin-bottom:14px">${verdict}${missed.length ? ` · 漏了 ${missed.length} 个词（下面标红）` : ' · 一个词没漏'}</div>

    <div class="diff-line">${diff.map((d) => {
      const cls = d.s === 'ok' ? 'ok' : d.s === 'miss' ? 'miss' : 'extra';
      return `<span class="tok ${cls}">${esc(d.t)}</span>`;
    }).join(' ')}</div>

    <div class="row" style="margin-top:14px">
      <button class="btn btn-ghost btn-sm" id="d-replay-full">再听一遍</button>
      <button class="btn btn-ghost btn-sm" id="d-replay-slow">慢速再听</button>
      <button class="btn btn-ghost btn-sm" id="d-retry">重做这句</button>
      <div class="spacer"></div>
      <span class="hint" style="color:var(--ok)">已记录 ✓${dn < 3 ? ` · 今天第 ${dn} 句，还差 ${3 - dn} 句` : ' · 今天这步完成'}</span>
    </div>

    <div class="note-box">
      <b>这句的坑</b> — ${esc(dCurrent.note || '（你自己加的句子，没有提示）')}
    </div>

    ${missTokens.length ? `
      <div style="margin-top:18px">
        <div style="font-size:13.5px;font-weight:600;color:var(--ink-2)">顺手标一下：这些词为什么没听出来？</div>
        <div class="hint" style="margin-top:2px">不标也能练。标了才知道你固定卡在哪一类——一周后「我的进步」会告诉你。</div>
        <div class="attr-wrap">
          ${missTokens.slice(0, 8).map((t) => `
            <div class="attr-row">
              <span class="attr-token">${esc(t.t)}</span>
              <div class="attr-chips" data-token="${esc(t.t)}">
                ${ATTR_TAGS.map((tag) => `<button class="attr-chip" data-tag="${esc(tag)}">${esc(TAG_LABEL[tag] || tag)}</button>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  $('d-replay-full').onclick = () => speak(dCurrent.text);
  $('d-replay-slow').onclick = () => speak(dCurrent.text, { rate: state.settings.rate * 0.7 });
  $('d-retry').onclick = retryDictation;
  $('d-foot').style.display = 'flex';

  result.querySelectorAll('.attr-chips').forEach((group) => {
    const token = group.dataset.token;
    group.querySelectorAll('.attr-chip').forEach((chip) => {
      chip.onclick = () => {
        const tag = chip.dataset.tag;
        const same = dAttribution[token] === tag;
        dAttribution[token] = same ? null : tag;
        group.querySelectorAll('.attr-chip').forEach((c) => {
          c.classList.toggle('on', c.dataset.tag === dAttribution[token]);
        });
        /* 写回记录 */
        attempt.tags[token] = dAttribution[token];
        save();
        if (dAttribution[token]) toast('已记下：' + (TAG_LABEL[dAttribution[token]] || dAttribution[token]));
      };
    });
  });
}

function revealDictation() {
  if (!dCurrent) return;
  dChecked = true;
  $('d-input').disabled = true;
  stopDictation();
  const result = $('d-result');
  result.style.display = 'block';
  result.innerHTML = `
    <div class="hint" style="margin-bottom:10px">答案（这次不计入统计）</div>
    <div class="diff-line" style="font-size:17px">${esc(dCurrent.text)}</div>
    <div class="note-box"><b>这句的坑</b> — ${esc(dCurrent.note || '—')}</div>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-ghost btn-sm" id="d-replay-full">再听一遍</button>
      <button class="btn btn-ghost btn-sm" id="d-retry">现在照听一遍，重做</button>
    </div>
  `;
  $('d-replay-full').onclick = () => speak(dCurrent.text);
  $('d-retry').onclick = retryDictation;
  $('d-foot').style.display = 'flex';
}

/* 重做同一句：清空批改状态，保留句子 */
function retryDictation() {
  dChecked = false;
  dAttribution = {};
  const input = $('d-input');
  input.value = '';
  input.disabled = false;
  $('d-result').style.display = 'none';
  $('d-result').innerHTML = '';
  $('d-foot').style.display = 'none';
  input.focus();
  playDictation();
}

/* ============================================================
   3. 变形表
   ============================================================ */

function renderReductions() {
  const box = $('rules-list');
  const doneN = REDUCTIONS.filter((r) => state.rules[r.id]).length;
  $('rules-progress').textContent = `已标 ${doneN} / ${REDUCTIONS.length}`;

  box.innerHTML = REDUCTIONS.map((r) => {
    const done = !!state.rules[r.id];
    return `
      <div class="rule ${done ? 'done' : ''}">
        <div class="rule-head">
          <span class="rule-form">${esc(r.formal)}</span>
          <span class="rule-arrow">→</span>
          <span class="rule-sound">${esc(r.sound)}</span>
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-sm" data-cmp="${r.id}">听两次</button>
        </div>
        <div class="row" style="gap:8px">
          <span class="rule-name">${esc(r.name)}</span>
          <button class="btn ${done ? 'btn-soft' : 'btn-ghost'} btn-xs" data-done="${r.id}">${done ? '✓ 听得出' : '我听得出来了'}</button>
        </div>
        <div class="rule-tip">${esc(r.tip)}</div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-cmp]').forEach((b) => {
    b.onclick = () => {
      const r = REDUCTIONS.find((x) => x.id === b.dataset.cmp);
      if (!r) return;
      const old = b.textContent;
      b.textContent = '第一遍…';
      b.disabled = true;
      speak(r.formal, {
        rate: state.settings.rate,
        reduce: 0,
        onend: () => setTimeout(() => {
          b.textContent = '第二遍…';
          speak(r.sound, {
            reduce: 0,
            onend: () => { b.textContent = old; b.disabled = false; }
          });
        }, 450)
      });
      toast('先听字典念法，再听真人念法');
    };
  });

  box.querySelectorAll('[data-done]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.done;
      state.rules[id] = !state.rules[id];
      if (!state.rules[id]) delete state.rules[id];
      save();
      renderReductions();
      toast(state.rules[id] ? '已标记 · 下次听写遇到再验证' : '已取消标记');
    };
  });
}

/* ============================================================
   4. 进度与诊断
   ============================================================ */

function knownCount() {
  return Object.values(state.cards).filter((c) => c.interval >= 14).length;
}
function learningCount() {
  return Object.values(state.cards).filter((c) => c.interval < 14).length;
}

function allAttempts() {
  const out = [];
  Object.keys(state.dict).forEach((sid) => {
    state.dict[sid].attempts.forEach((a) => out.push(Object.assign({ sid }, a)));
  });
  return out.sort((a, b) => a.ts - b.ts);
}

function tagCounts() {
  const counts = {};
  ATTR_TAGS.forEach((t) => { counts[t] = 0; });
  allAttempts().forEach((a) => {
    Object.keys(a.tags || {}).forEach((k) => {
      const t = a.tags[k];
      if (t && counts[t] != null) counts[t] += 1;
    });
  });
  return counts;
}

function renderProgress() {
  const attempts = allAttempts();
  const avgAcc = attempts.length
    ? Math.round(attempts.reduce((a, b) => a + b.acc, 0) / attempts.length)
    : 0;
  const known = knownCount();
  const covered = Object.keys(state.dict).length;
  const totalSent = allSentences().length;

  /* --- 一句话结论 --- */
  const hero = $('prog-hero');
  if (!attempts.length) {
    hero.innerHTML = `
      <div class="hero-verdict empty-hero">
        <div class="hv-line">还没有数据。</div>
        <div class="hv-sub">去听写一句，回来这里就有第一行结论了。</div>
      </div>`;
  } else if (attempts.length < 5) {
    hero.innerHTML = `
      <div class="hero-verdict empty-hero">
        <div class="hv-line">才练了 ${attempts.length} 句，目前平均听懂 <b>${avgAcc}%</b> 的词。</div>
        <div class="hv-sub">做到 5 句就能看出趋势了，先别急着判断自己行不行。</div>
      </div>`;
  } else {
    const half = Math.floor(attempts.length / 2);
    const early = attempts.slice(0, half);
    const recent = attempts.slice(half);
    const mean = (arr) => Math.round(arr.reduce((a, b) => a + b.acc, 0) / arr.length);
    const e = mean(early), r = mean(recent);
    const delta = r - e;
    let line, sub;
    if (delta >= 5) {
      line = `半程之后明显在涨：从 <b>${e}%</b> 到 <b>${r}%</b>，高了 <b>${delta}</b> 个点。`;
      sub = '保持现在的节奏就行，别加量——听力是靠天数堆的，不是靠单次时长。';
    } else if (delta <= -5) {
      line = `最近几组比开头低了 <b>${Math.abs(delta)}</b> 个点（${e}% → ${r}%）。`;
      sub = '通常是句子变长变难，或者练的时候累了。先换几条短的找回节奏。';
    } else {
      line = `听懂比例基本走平：<b>${e}%</b> → <b>${r}%</b>（${delta >= 0 ? '+' : ''}${delta}）。`;
      sub = '4–6 次听写看不出趋势是正常的，练到 20 句再回头看这条线。';
    }
    hero.innerHTML = `
      <div class="hero-verdict">
        <div class="hv-line">${line}</div>
        <div class="hv-sub">${sub}</div>
      </div>`;
  }

  /* --- 三个关键数字 --- */
  $('progress-stats').innerHTML = `
    <div class="stat"><div class="k">不用想就懂的词</div><div class="v">${known} <small>/ ${CARDS.length}</small></div></div>
    <div class="stat"><div class="k">练过的句子</div><div class="v">${covered} <small>/ ${totalSent}</small></div></div>
    <div class="stat"><div class="k">平均听懂</div><div class="v">${avgAcc}<small>%</small></div></div>
  `;

  /* --- 近 14 天 --- */
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const key = todayKey(d);
    const todays = attempts.filter((a) => todayKey(a.ts) === key);
    const acc = todays.length ? Math.round(todays.reduce((x, y) => x + y.acc, 0) / todays.length) : null;
    days.push({ key, label: String(d.getDate()), acc, n: todays.length, today: i === 0 });
  }
  if (!attempts.length) {
    $('acc-bars').innerHTML = '<div class="empty-chart">做完第一次听写，这里就会出现第一根柱子。</div>';
    $('acc-note').textContent = '柱子越高＝那一句听得越全。';
  } else {
    $('acc-bars').innerHTML = days.map((d) => {
      const h = d.acc == null ? 3 : Math.max(6, d.acc);
      return `<div class="bar-col ${d.today ? 'today' : ''}" title="${d.key}：${d.acc == null ? '没练' : d.acc + '%'}">
        <div class="bar" style="height:${h}%">${d.acc == null ? '' : `<i style="height:100%"></i>`}</div>
        <div class="bar-lbl">${d.label}</div>
      </div>`;
    }).join('');
    const withData = days.filter((d) => d.acc != null);
    $('acc-note').textContent = `14 天里你练了 ${withData.length} 天，平均每天 ${Math.round(withData.reduce((a, b) => a + b.n, 0) / withData.length)} 句。柱子越高＝听得越全。`;
  }

  /* --- 卡点分布 --- */
  const counts = tagCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) {
    $('dist').innerHTML = `<div class="empty-chart">还没有标注。下次听写漏词时，点一下那一排原因按钮——这里就会出现你的第一名。</div>`;
  } else {
    const rows = ATTR_TAGS.map((t) => ({ t, v: counts[t] })).sort((a, b) => b.v - a.v);
    $('dist').innerHTML = rows.map((row) => {
      const pct = total ? (row.v / total) * 100 : 0;
      const color = PARSE_TAGS.includes(row.t) ? 'var(--accent)' : row.t === '生词' ? 'var(--bad)' : '#aab0ba';
      return `<div class="dist-row ${row.v ? '' : 'zero'}">
        <span class="nm">${esc(TAG_LABEL[row.t] || row.t)}</span>
        <span class="track"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></span>
        <span class="num">${row.v}</span>
      </div>`;
    }).join('') + `<div class="hint" style="margin-top:10px">共标了 ${total} 次。这些是你自己给漏掉的词选的原因，越诚实越准。</div>`;
  }

  /* --- 下一步建议 --- */
  $('diagnosis').innerHTML = buildDiagnosis(attempts, counts, total);

  /* --- 这几件事你已经在真场合里办成过 --- */
  renderSkillBoard();
}

/* 不写百分比、不写熟练度：只写"在哪个场合办成了"和"还差哪一个" */
function renderSkillBoard() {
  const box = $('skills-panel');
  if (!box) return;
  const b = skillBoard();

  if (!b.triedCount) {
    box.innerHTML = `
      <h2>这些事你已经办成过</h2>
      <p class="hint" style="margin-top:-6px">还没有记录。第一次「说英语」结束后，这里会出现第一行——写的是你在哪个场合把哪件事办成了，不是分数。一件事要在 3 个不同场合各办成 1 次，才算真的会了。</p>
      <div class="row"><button class="btn btn-ghost btn-sm" data-go="say">去说一次 →</button></div>`;
    return;
  }

  const all = b.done.concat(b.doing);
  box.innerHTML = `
    <h2>这些事你已经办成过</h2>
    <p class="hint" style="margin-top:-6px">同一件事在 3 个不同场合各办成 1 次，才算真的会了。办成之后一个月会回来验一次。</p>
    <div class="skill-list">
      ${all.map((r) => {
        const pct = r.settled ? 100 : Math.round((r.won / SETTLE_VENUES) * 100);
        return `<div class="skill-row ${r.settled ? 'done' : ''}">
          <div class="sk-top">
            <span class="sk-name">${esc(r.label)}</span>
            <span class="sk-count">${r.settled ? '已经办成过' : `${r.won} / ${SETTLE_VENUES} 个场合`}</span>
          </div>
          <div class="sk-bar"><i style="width:${pct}%"></i></div>
          <div class="sk-note">${r.settled
            ? `在 ${esc(r.venues.join('、'))} 那儿都办成过`
            : r.won
            ? `在 ${esc(r.venues.join('、'))} 那儿办成过${r.gap && GAP_LABEL[r.gap] ? ` · 上次卡在${GAP_LABEL[r.gap]}` : ''}`
            : `还没办成过${r.gap && GAP_LABEL[r.gap] ? ` · 上次卡在${GAP_LABEL[r.gap]}` : ''}`}</div>
        </div>`;
      }).join('')}
    </div>
    ${b.done.length ? `<div class="hint" style="margin-top:12px">办成过 ${b.done.length} 件，还有 ${b.doing.length} 件在练。</div>` : ''}
  `;
}

function buildDiagnosis(attempts, counts, total) {
  if (!attempts.length) {
    return `<h3>接下来盯这一条</h3>
      <p>先去听写一句，什么都别想。</p>
      <p class="hint">做完 5 句、标过几次原因，这里会给你一条具体建议。</p>`;
  }
  if (total < 3) {
    return `<h3>接下来盯这一条</h3>
      <p>漏词的时候顺手点一下原因（连在一起 / 念得很轻 / 不认识……）。</p>
      <p class="hint">标满 3 次，这里就能告诉你固定卡在哪一类，而不是让你"多听"。现在标了 ${total} 次。</p>`;
  }

  const parse = PARSE_TAGS.reduce((a, t) => a + counts[t], 0);
  const vocab = counts['生词'] || 0;
  const attention = (counts['走神'] || 0) + (counts['拼写'] || 0);
  const parseShare = total ? parse / total : 0;
  const vocabShare = total ? vocab / total : 0;

  /* 最大的一类 */
  const top = ATTR_TAGS
    .map((t) => ({ t, v: counts[t] }))
    .sort((a, b) => b.v - a.v)[0];

  const lines = ['<h3>接下来盯这一条</h3>'];

  if (parseShare >= 0.5) {
    lines.push(`<p>你漏掉的词里 <b>${Math.round(parseShare * 100)}%</b> 是"声音连在一起了"，最多的是「${esc(TAG_LABEL[top.t] || top.t)}」。这说明词你都认识，是耳朵没跟上真实语流。</p>`);
    lines.push(`<p>做法：去「为什么听不清」，把对应的几条各听两次，然后回听写找同一类的句子验证。不用加时长，换个练法就行。</p>`);
  } else if (vocabShare >= 0.4) {
    lines.push(`<p>生词占了 <b>${Math.round(vocabShare * 100)}%</b>。这时候再硬练听写收益会掉——单句里一半的词不认识，练的是猜，不是听。</p>`);
    lines.push(`<p>做法：回头看「听音猜义」，每天 20 个新词，重点是听到声音知道意思，别背拼写。</p>`);
  } else if (attention >= total * 0.35) {
    lines.push(`<p>走神 + 拼写占了 <b>${Math.round((attention / total) * 100)}%</b>。这跟耳朵关系不大，是注意力和拼写准确度。</p>`);
    lines.push(`<p>做法：句子挑短的，一句话听完就写；批改时先不要纠结拼写，只看漏了哪个词。</p>`);
  } else {
    lines.push(`<p>卡点比较分散，没有单一主因。这说明 A（听音猜义）和 B（听写）两条线都在推进。</p>`);
    lines.push(`<p>做法：保持现在的配比，每天 10 张卡 + 3 句听写，别加量。</p>`);
  }

  lines.push(`<p class="hint">这些结论来自 ${attempts.length} 次听写、${total} 次标注。样本还小，练到 20 句再回来看会准得多。</p>`);
  return lines.join('');
}

/* ============================================================
   4.5 言语功能：排期、记账、毕业

   三件可验证的事，写在这里，界面上一句术语都不出现：
   1. 每条从对话里捞出来的素材都带 from（哪次对话、你原话、卡在哪）
   2. 同一个功能要在 3 个不同场合各办成 1 次，才算"办成过"
   3. 今天页直接给"今天练这件"，不给 10 个场景让你挑
   ============================================================ */

const SETTLE_VENUES = 3;      /* 3 个不同场合各办成 1 次 */
const SETTLE_DAYS = 30;       /* 办成之后隔一个月回来验一次 */

const GAP_LABEL = {
  word: '缺词',
  pattern: '句式不会',
  ear: '没听清',
  none: '',
  unknown: '未评估'
};

function allSkills() { return window.SKILLS || []; }
function allScenes() { return window.SCENARIOS || []; }
function skillDef(id) { return allSkills().filter((s) => s.id === id)[0] || null; }
function skillLabel(id) { const d = skillDef(id); return d ? d.label : ''; }
function recOf(id) { return state.skills[id] || null; }

function skillRec(id) {
  if (!state.skills[id]) {
    state.skills[id] = {
      attempts: 0, wins: 0, venues: {}, fails: [],
      hold: 0, gap: '', lastAt: 0, settled: false, settledAt: 0
    };
  }
  return state.skills[id];
}

/* 这个功能在哪些场景里练得到 */
function venuesOf(sid) {
  return allScenes().filter((sc) => (sc.covers || []).indexOf(sid) >= 0);
}

function wonAt(sid, sceneId) {
  const r = recOf(sid);
  return !!(r && r.venues[sceneId]);
}

/* 一次对话结束后的记账。
   演示模式只记"练过"（attempts），不记赢，不记缺口——不假装判过。 */
function recordSay(d) {
  if (!d || !d.skillId || !skillDef(d.skillId)) return null;
  const r = skillRec(d.skillId);
  r.attempts += 1;
  r.lastAt = Date.now();
  if (d.outcome === 'success' && d.mode !== 'demo') {
    r.wins += 1;
    r.venues[d.sceneId] = (r.venues[d.sceneId] || 0) + 1;
    r.hold = 0;
    if (Object.keys(r.venues).length >= SETTLE_VENUES && !r.settled) {
      r.settled = true;
      r.settledAt = Date.now();
    }
  } else if (d.outcome === 'failed' && d.mode !== 'demo') {
    r.hold = Math.min(2, (r.hold || 0) + 1);
    r.fails.push({
      date: todayKey(),
      sceneId: d.sceneId,
      you: String(d.you || '').slice(0, 160),
      gap: d.gap || 'none'
    });
    if (r.fails.length > 3) r.fails = r.fails.slice(-3);
  }
  if (d.gap) r.gap = d.gap;
  return r;
}

/* 今天练哪一件。顺序：上次没办成 → 失败未复验 → 从没试过 → 办成过到期 → 赢最少的 */
function pickSayToday() {
  const scenes = allScenes();
  const skills = allSkills();
  if (!scenes.length || !skills.length) return null;

  /* 同一功能优先挑最轻的、还没在里面办成过的那个场合 */
  function venueFor(sid) {
    const vs = venuesOf(sid);
    const open = vs.filter((sc) => !wonAt(sid, sc.id));
    const pool = open.length ? open : vs;
    const sorted = pool.slice().sort((a, b) => (a.load || 2) - (b.load || 2));
    return sorted[0] || null;
  }
  function make(sid, sc, why) {
    if (!sc) return null;
    return {
      skillId: sid,
      label: skillLabel(sid),
      plain: (skillDef(sid) || {}).plain || '',
      sceneId: sc.id,
      title: sc.title,
      goal: sc.goal,
      castNames: (sc.cast || []).map((c) => c.name),
      why
    };
  }

  /* 1. 上次没办成，退一档再来 */
  let s = skills.filter((x) => {
    const r = recOf(x.id);
    return r && r.hold > 0;
  }).sort((a, b) => (recOf(b.id).hold - recOf(a.id).hold))[0];
  if (s) {
    const pick = make(s.id, venueFor(s.id), '上次卡在这一步，换轻一点的场合再来一次');
    if (pick) return pick;
  }

  /* 2. 失败过，还没回去复验 */
  s = skills.filter((x) => {
    const r = recOf(x.id);
    if (!r || !r.fails.length || r.settled) return false;
    const last = r.fails[r.fails.length - 1];
    return !wonAt(x.id, last.sceneId);
  })[0];
  if (s) {
    const r = recOf(s.id);
    const last = r.fails[r.fails.length - 1];
    const sc = allScenes().filter((x) => x.id === last.sceneId)[0] || venueFor(s.id);
    return make(s.id, sc, '上次就是在这儿卡住的，回去再试一次');
  }

  /* 3. 刚办成过一个场合：同一件事换个场合再验一次。
        不先做这一步，前 20 天会一直在尝新东西，进度条永远停在 1 / 3。 */
  s = skills.filter((x) => {
    const r = recOf(x.id);
    if (!r || r.settled || !r.wins) return false;
    if (Object.keys(r.venues).length >= SETTLE_VENUES) return false;
    return Date.now() - (r.lastAt || 0) < 7 * DAY;
  }).sort((a, b) => (recOf(a.id).lastAt || 0) - (recOf(b.id).lastAt || 0))[0];
  if (s) return make(s.id, venueFor(s.id), '上次办成了，换一个场合再验一次，凑满 3 个才算真的会');

  /* 4. 从没试过 */
  s = skills.filter((x) => {
    const r = recOf(x.id);
    return !r || r.attempts === 0;
  })[0];
  if (s) return make(s.id, venueFor(s.id), '这件事你还没试过，先在最轻的场合走一遍');

  /* 5. 办成过，一个月了，回来验一次 */
  s = skills.filter((x) => {
    const r = recOf(x.id);
    return r && r.settled && Date.now() - (r.settledAt || 0) > SETTLE_DAYS * DAY;
  }).sort((a, b) => (recOf(a.id).settledAt || 0) - (recOf(b.id).settledAt || 0))[0];
  if (s) return make(s.id, venueFor(s.id), '一个月前办成过，回来验一次还记不记得');

  /* 6. 都试过了，挑办成场合最少的那件 */
  s = skills.filter((x) => {
    const r = recOf(x.id);
    return r && !r.settled;
  }).sort((a, b) => {
    const ra = recOf(a.id), rb = recOf(b.id);
    return (Object.keys(ra.venues).length - Object.keys(rb.venues).length) || (ra.lastAt - rb.lastAt);
  })[0];
  if (s) return make(s.id, venueFor(s.id), '这件你办成过一两次，再换个场合就稳了');

  /* 7. 全都办成过：随便挑一件换个新场合 */
  s = skills.slice().sort((a, b) => (recOf(a.id).lastAt || 0) - (recOf(b.id).lastAt || 0))[0];
  return s ? make(s.id, venueFor(s.id), '这些你都办成过，随便挑一件换个场合') : null;
}

/* 进步页用：办成过的、在练的 */
function skillBoard() {
  const done = [];
  const doing = [];
  allSkills().forEach((s) => {
    const r = recOf(s.id);
    if (!r || !r.attempts) return;
    const row = {
      id: s.id,
      label: s.label,
      plain: s.plain,
      attempts: r.attempts,
      won: Object.keys(r.venues).length,
      venues: allScenes()
        .filter((sc) => r.venues[sc.id])
        .map((sc) => (sc.cast && sc.cast[0] ? sc.cast[0].name : sc.title)),
      settled: !!r.settled,
      gap: r.gap || ''
    };
    if (r.settled) done.push(row);
    else doing.push(row);
  });
  return {
    done,
    doing,
    doneCount: done.length,
    triedCount: done.length + doing.length
  };
}

/* ============================================================
   5. 今日 / 会话
   ============================================================ */

const STEPS = [
  { k: 'cards', title: '听音猜义', meta: '听声音猜意思 · 10 张新词 + 到期的旧词', page: 'cards', mins: 10 },
  { k: 'dictation', title: '听写 3 句', meta: '写出来，再标一下没听清的原因', page: 'dictation', mins: 10 },
  { k: 'listening', title: '随便听 10 分钟', meta: '走路、通勤时听，允许听不懂', page: null, mins: 10 },
  /* 第 4 步是选做的：开口这件事，一开始就得允许自己逃 */
  { k: 'say', title: '说 5 分钟', meta: '挑一件事，用英语办成它', page: 'say', mins: 6, optional: true }
];

function sessionOf(day) {
  return state.sessions[day] || { cards: false, dictation: false, listening: false, say: false };
}
/* 今天这一步做了多少（用于"3 / 10 张"这类细进度） */
function bumpToday(k) {
  const day = todayKey();
  if (!state.sessions[day]) state.sessions[day] = { cards: false, dictation: false, listening: false };
  if (!state.sessions[day].n) state.sessions[day].n = { cards: 0, dictation: 0 };
  state.sessions[day].n[k] = (state.sessions[day].n[k] || 0) + 1;
  save();
  return state.sessions[day].n[k];
}

function todayCount(k) {
  const s = state.sessions[todayKey()];
  return (s && s.n && s.n[k]) || 0;
}

function markSession(k) {
  const day = todayKey();
  if (!state.sessions[day]) state.sessions[day] = { cards: false, dictation: false, listening: false, say: false };
  if (!state.sessions[day][k]) {
    state.sessions[day][k] = true;
    save();
  }
  refreshBadges();
}

let listenTimer = null;

function renderToday() {
  const s = sessionOf(todayKey());
  const core = STEPS.filter((b) => !b.optional);
  const doneN = core.filter((b) => s[b.k]).length;
  const next = core.find((b) => !s[b.k]);
  const sayDone = !!s.say;

  const hour = new Date().getHours();
  const greet = hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const remainMin = core.filter((b) => !s[b.k]).reduce((a, b) => a + b.mins, 0);

  $('today-greeting').textContent = greet;

  /* --- 一张卡，只告诉你现在做哪一步 --- */
  const card = $('next-card');
  if (!doneN && !Object.keys(state.cards).length && !Object.keys(state.dict).length) {
    $('today-sub').textContent = '第一次用？从第 1 步开始就行，其他什么都不用管。';
  } else if (doneN >= core.length && !sayDone) {
    $('today-sub').textContent = '三步都走完了。还有一件选做的：把这些词用出去。';
  } else if (doneN >= core.length) {
    $('today-sub').textContent = '今天练完了。明天这些词会自动回来考你。';
  } else {
    $('today-sub').textContent = `已完成 ${doneN} / ${core.length} 步 · 大约还要 ${remainMin} 分钟`;
  }

  if (next) {
    const dueN = dueCount();
    const btn =
      next.k === 'cards' ? `<button class="btn btn-primary btn-lg" id="nc-go">开始 · ${dueN} 张等你</button>`
      : next.k === 'dictation' ? `<button class="btn btn-primary btn-lg" id="nc-go">开始听写</button>`
      : `<button class="btn btn-primary btn-lg" id="nc-go">开始 10 分钟计时</button>
         <button class="btn btn-ghost btn-sm" id="nc-skip" style="margin-left:8px;background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.4);color:#fff">已经听过了</button>`;
    const desc =
      next.k === 'cards' ? '听到发音，先在心里说出中文意思，再点开答案。不要看书。'
      : next.k === 'dictation' ? '听一句，写一句。听不清就慢速、循环，直到写出来。'
      : '挑一集播客或新闻，走着听。听不懂也继续，这一块练的是耳朵不烦。';
    card.className = 'next-card';
    card.innerHTML = `
      <div class="nc-kicker">第 ${STEPS.indexOf(next) + 1} 步 / 共 3 步</div>
      <div class="nc-title">现在做：${next.title}</div>
      <div class="nc-desc">${desc}</div>
      ${btn}
    `;
    const goBtn = $('nc-go');
    if (goBtn) goBtn.onclick = () => (next.page ? go(next.page) : startListenTimer());
    const skip = $('nc-skip');
    if (skip) skip.onclick = () => { markSession('listening'); toast('好的，今天就算听过了'); renderToday(); };
  } else if (!sayDone) {
    /* 三步走完了：把「用出去」放在这一刻，而不是永远藏在导航里。
       这里只给一件，不给你一张清单挑。 */
    const pick = pickSayToday();
    card.className = 'next-card';
    card.innerHTML = `
      <div class="nc-kicker">三步走完 · 还有一步选做</div>
      <div class="nc-title">今天练这件${pick ? '：' + esc(pick.label) : '：说 5 分钟'}</div>
      <div class="nc-desc">${pick
        ? `${esc(pick.why)}。场合是「${esc(pick.title)}」，在场 ${esc(pick.castNames.join('、'))}。
           他们不会替你说话，也不会当场纠正你。`
        : '挑一件真实的事，和几个人演一遍。他们不会替你说话，也不会当场纠正你。'}</div>
      <button class="btn btn-primary btn-lg" id="nc-go">开始说</button>
      <button class="btn btn-ghost btn-sm" id="nc-skip" style="margin-left:8px;background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.4);color:#fff">今天先不练</button>
    `;
    $('nc-go').onclick = () => go('say');
    $('nc-skip').onclick = () => { toast('行，那就明天再说'); };
  } else {
    card.className = 'next-card all-done';
    card.innerHTML = `
      <div class="nc-kicker">今天完成</div>
      <div class="nc-title">全都走完了</div>
      <div class="nc-desc">明天这些词会自动回来考你。现在可以去「我的进步」看一眼结论。</div>
      <button class="btn btn-primary btn-lg" id="nc-go">看我的进步</button>
    `;
    $('nc-go').onclick = () => go('progress');
  }

  /* --- 三步清单 --- */
  const nCards = todayCount('cards');
  const nDict = todayCount('dictation');
  const sayPick = pickSayToday();

  $('today-blocks').innerHTML = STEPS.map((b, i) => {
    const done = s[b.k];
    const isNext = next ? next.k === b.k : (b.k === 'say' && !sayDone);
    const meta = b.k === 'cards'
      ? `${b.meta.split(' · ')[0]} · 今天 ${nCards} / 10 张`
      : b.k === 'dictation'
      ? `${b.meta.split(' · ')[0]} · 今天 ${nDict} / 3 句`
      : b.k === 'say' && sayPick
      ? `今天练「${sayPick.label}」· 在场 ${sayPick.castNames.join('、')}`
      : b.meta;
    return `<div class="block ${done ? 'done' : ''} ${isNext ? 'next' : ''}">
      <div class="b-check">${done ? '✓' : (b.optional ? '＋' : i + 1)}</div>
      <div class="b-body">
        <div class="b-title">${b.title}${b.optional ? ' <span class="tag tag-soft">选做</span>' : ''}</div>
        <div class="b-meta">${meta}</div>
      </div>
      ${b.page
        ? `<button class="btn btn-ghost btn-sm" data-go="${b.page}">${done ? (b.optional ? '再说一次' : '再做一次') : '开始'}</button>`
        : `<button class="btn btn-ghost btn-sm" id="listen-timer">${done ? '再来一次' : '计时'}</button>`}
    </div>`;
  }).join('');

  $('listen-links').innerHTML = LISTENING_SOURCES.map((x) =>
    `<a href="${x.url}" target="_blank" rel="noopener"><span>${esc(x.name)}</span><span class="src-note">${esc(x.note)}</span></a>`
  ).join('');

  refreshBadges();
}

function startListenTimer() {
  if (listenTimer) { toast('计时已经在跑了'); return; }
  let left = 10 * 60;
  const fmt = () => `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const paint = () => {
    const t = $('listen-timer-text');
    if (t) t.textContent = `还剩 ${fmt()}`;
    const b = $('nc-go');
    if (b) { b.disabled = true; b.textContent = `计时中 ${fmt()}`; }
    const s = $('listen-timer');
    if (s) { s.disabled = true; s.textContent = fmt(); }
  };
  paint();
  toast('计时开始 · 听不懂也继续听');
  listenTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(listenTimer);
      listenTimer = null;
      markSession('listening');
      toast('10 分钟到了 · 这一步算完成');
      renderToday();
      return;
    }
    paint();
  }, 1000);
}

/* ---------------- 连续天数 ---------------- */
function activeDays() {
  return Object.keys(state.sessions).filter((k) => {
    const s = state.sessions[k];
    return s && (s.cards || s.dictation || s.listening);
  });
}
function streakDays() {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const key = todayKey(Date.now() - i * DAY);
    if (activeDays().includes(key)) n++;
    else if (i === 0) continue;      /* 今天还没练不算断 */
    else break;
  }
  return n;
}
function streakText() {
  const n = streakDays();
  if (!n) return '今天还没开始 · 从第 1 步走';
  if (n === 1) return '连续 1 天';
  return `连续 ${n} 天 · 别断`;
}

/* ============================================================
   6. 设置
   ============================================================ */

const TTS_SAMPLE = 'Actually, I think we should wait for the rest of them, and then figure out what to do.';

function renderVoiceSelect() {
  const sel = $('set-voice');
  if (!sel) return;
  if (!voiceList.length) {
    sel.innerHTML = '<option value="">没有检测到英文音色</option>';
    return;
  }
  sel.innerHTML = voiceList.map((v) => {
    const q = voiceTag(v);
    return `<option value="${esc(v.voiceURI)}" ${v.voiceURI === state.settings.voiceURI ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}${q ? ' · ' + q : ''}</option>`;
  }).join('');
  if (!state.settings.voiceURI && voiceList[0]) {
    state.settings.voiceURI = voiceList[0].voiceURI;
    save();
  }
  const cur = pickVoice();
  const line = $('voice-cur');
  if (line && cur) {
    line.innerHTML = `现在用 <b>${esc(cur.name)}</b> · ${voiceIsQuality(cur)
      ? '高质量，接近真人'
      : '录音拼接档，偏机械'} · 这台电脑一共检测到 ${voiceList.length} 个英文音色`;
  }
}

function updatePreview() {
  const box = $('tts-preview');
  if (!box) return;
  box.innerHTML = `实际念出来的文本：<code>${esc(prepareText(TTS_SAMPLE))}</code>`;
}

function renderVoiceHealth() {
  const box = $('voice-health');
  if (!box) return;
  if (!voiceList.length) {
    box.innerHTML = '<h2>声音档位</h2><div class="hint" style="margin-top:-6px">还没有检测到英文音色。</div>';
    return;
  }
  const cur = pickVoice();
  const q = voiceList.filter(voiceIsQuality).length;
  const bad = voiceList.filter((v) => VOICE_BAD.test(v.name || '')).length;
  const curQ = cur ? voiceIsQuality(cur) : false;

  box.innerHTML = `
    <h2>你现在听到的是哪一档</h2>
    <p class="hint" style="margin-top:-6px">同一个句子，不同音色差别很大。这里判断你在哪一档。</p>
    <div class="grid-3" style="margin-top:14px">
      <div class="stat"><div class="k">英文音色</div><div class="v">${voiceList.length}</div></div>
      <div class="stat"><div class="k">高质量</div><div class="v">${q}</div></div>
      <div class="stat"><div class="k">机器人音色</div><div class="v">${bad}</div></div>
    </div>
    <div style="font-size:14px;margin-top:2px">
      当前：<b>${esc(cur ? cur.name : '无')}</b>
      <span class="tag" style="margin-left:6px">${curQ ? '高质量' : '偏机械'}</span>
    </div>
    ${q === 0 ? `
      <div class="note-box" style="background:#fff8ec;border-left-color:#e0a13a">
        <b>这台电脑只装了"录音拼接"档的音色</b>
        <div style="margin-top:6px">这一档每个词都念满，「教科书腔」主要来自这里——语速、音高怎么调都到不了真人。换音色是唯一能明显改善的一步，两条路选一条：</div>
        <ol style="margin:10px 0 0 18px;padding:0;line-height:1.85">
          <li><b>系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音 → English (United States)</b>，点 <b>Ava (Premium)</b> 或 <b>Zoe (Premium)</b> 下载（约 200–500 MB），回本页刷新。</li>
          <li>或者用 <b>Edge</b> 打开同一个网址，会多出 <code>Microsoft … Online (Natural)</code> 系列——神经语音，要联网，但和压缩音色不是一个量级。</li>
        </ol>
        <div style="margin-top:8px">换之前，把上面的「口语化」保持在开，是现在最有效的改善。</div>
      </div>
    ` : (curQ ? `
      <div class="hint" style="margin-top:10px">这一档里已经是最自然的了，不用再折腾。</div>
    ` : `
      <div class="note-box" style="background:#f2f7ff;border-left-color:#5b8def">
        <b>还有更自然的音色没被选中</b>
        <div style="margin-top:4px">系统里已经有 ${q} 个高质量音色，你现在用的是 ${esc(cur ? cur.name : '默认')}（录音拼接档）。</div>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" id="use-best">换成 ${esc(voiceList[0].name)}</button>
        </div>
      </div>
    `)}
  `;
  const best = $('use-best');
  if (best) {
    best.onclick = () => {
      state.settings.voiceURI = voiceList[0].voiceURI;
      save();
      renderVoiceSelect();
      renderVoiceHealth();
      updatePreview();
      speak(TTS_SAMPLE);
      flashSaved('saved-voice', '已切换 ✓');
      toast('已换成 ' + voiceList[0].name + '，正在用它念一句给你听');
    };
  }
}

function renderSettings() {
  renderVoiceSelect();
  const rate = Number(state.settings.rate) || 1;
  $('set-rate').value = rate;
  $('set-rate-val').textContent = rate.toFixed(2);
  const pitch = state.settings.pitch == null ? 1 : Number(state.settings.pitch);
  $('set-pitch').value = pitch;
  $('set-pitch-val').textContent = pitch.toFixed(2);
  const reduceOn = Number(state.settings.reduce) > 0;
  $('reduce-seg').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (b.dataset.reduce === '1') === reduceOn);
  });
  $('set-newcap').value = String(state.settings.newCap || 20);
  updatePreview();
  renderVoiceHealth();
  const bytes = new Blob([JSON.stringify(state)]).size;
  $('storage-info').textContent = `本地占用约 ${(bytes / 1024).toFixed(1)} KB · 从 ${new Date(state.created).toLocaleDateString('zh-CN')} 开始记录`;
}

/* ============================================================
   7. 初始化与事件绑定
   ============================================================ */

function bindNav() {
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.onclick = () => go(n.dataset.page);
  });
  /* 所有「下一步」按钮统一走这里 */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t) go(t.dataset.go);
  });
  const fcNext = $('fc-next');
  if (fcNext) fcNext.onclick = () => go('dictation');
}

function bindCards() {
  $('deck-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-deck]');
    if (!btn) return;
    fcDeck = btn.dataset.deck;
    buildQueue();
    renderDeckPills();
    renderFlashcard();
  });
}

function bindDictation() {
  $('d-play').onclick = () => {
    if (dLoop) { stopDictation(); return; }
    playDictation();
  };
  $('d-slow').onclick = () => {
    dSlow = !dSlow;
    $('d-slow').classList.toggle('btn-soft', dSlow);
    toast(dSlow ? '慢速 0.75 倍已开启' : '回到正常语速');
    playDictation();
  };
  $('d-loop').onclick = () => {
    dLoop = !dLoop;
    $('d-loop').classList.toggle('btn-soft', dLoop);
    toast(dLoop ? '循环中 · 再点一下停止' : '循环已关');
    if (dLoop) playDictation(); else stopDictation();
  };
  $('d-check').onclick = checkDictation;
  $('d-reveal').onclick = revealDictation;
  $('d-next').onclick = () => { nextDictation(); renderDictationPage(); };

  $('d-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      checkDictation();
    }
  });
}

function bindSettings() {
  $('set-voice').onchange = () => {
    state.settings.voiceURI = $('set-voice').value;
    save();
    const v = pickVoice();
    renderVoiceSelect();
    renderVoiceHealth();
    flashSaved('saved-voice');
    toast('已保存 · 用 ' + (v ? v.name : '默认音色') + ' 念一句给你听');
    speak(TTS_SAMPLE);
  };

  $('set-rate').oninput = () => {
    const v = parseFloat($('set-rate').value);
    state.settings.rate = v;
    $('set-rate-val').textContent = v.toFixed(2);
    save();
  };
  $('set-rate').onchange = () => {
    toast('语速已保存 ' + Number(state.settings.rate).toFixed(2) + ' ✓');
  };

  $('set-pitch').oninput = () => {
    const v = parseFloat($('set-pitch').value);
    state.settings.pitch = v;
    $('set-pitch-val').textContent = v.toFixed(2);
    save();
  };
  $('set-pitch').onchange = () => {
    toast('音高已保存 ' + Number(state.settings.pitch).toFixed(2) + ' ✓');
  };

  $('rate-test').onclick = () => speak(TTS_SAMPLE);
  $('pitch-test').onclick = () => speak(TTS_SAMPLE);

  $('reduce-seg').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      state.settings.reduce = b.dataset.reduce === '1' ? 1 : 0;
      save();
      $('reduce-seg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      updatePreview();
      flashSaved('saved-reduce');
      toast(state.settings.reduce ? '已保存 · 按真人念法朗读' : '已保存 · 按教科书念法朗读');
      speak(TTS_SAMPLE, { reduce: state.settings.reduce });
    };
  });

  $('tts-plain').onclick = () => speak(TTS_SAMPLE, { reduce: 0 });
  $('tts-real').onclick = () => speak(TTS_SAMPLE);
  $('tts-slow').onclick = () => speak(TTS_SAMPLE, { rate: state.settings.rate * 0.75 });
  $('tts-ab').onclick = () => {
    speak(TTS_SAMPLE, { reduce: 0, onend: () => setTimeout(() => speak(TTS_SAMPLE), 520) });
  };

  $('set-newcap').onchange = () => {
    state.settings.newCap = parseInt($('set-newcap').value, 10) || 20;
    save();
    flashSaved('saved-newcap');
    toast('已保存 · 每天新学 ' + state.settings.newCap + ' 个');
  };

  $('import-btn').onclick = () => {
    const raw = $('import-text').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!raw.length) {
      $('import-msg').textContent = '上面还是空的，先粘一句英文进来';
      return;
    }
    let added = 0;
    let dup = 0;
    raw.forEach((line) => {
      const text = line.replace(/\s+/g, ' ').trim();
      if (text.length < 8) return;
      if (allSentences().some((s) => s.text.toLowerCase() === text.toLowerCase())) { dup += 1; return; }
      state.customSentences.push({
        id: 'x' + Date.now() + '_' + added,
        tag: '自定义',
        text,
        note: '来自你自己的材料。注意其中的连读与弱读。'
      });
      added += 1;
    });
    save();
    $('import-msg').textContent = added
      ? `已加入 ${added} 句${dup ? `，跳过 ${dup} 句重复的` : ''}`
      : `没有新增：${dup} 句已经在题库里了`;
    if (added) {
      $('import-text').value = '';
      renderDictationPage();
      toast(`题库多了 ${added} 句，去听写里练`);
    }
  };

  $('export-btn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `listening-trainer-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('备份文件已下载到「下载」文件夹');
  };

  $('reset-btn').onclick = () => {
    if (!confirm('清空全部学习记录？这一步不可撤销，建议先点「导出备份」。')) return;
    state = defaultState();
    localStorage.removeItem(STORE_KEY);
    save();
    buildQueue();
    go('today');
    toast('已清空，从第 1 步重新开始');
  };
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const typing = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
    if (typing) return;

    const onCards = $('page-cards').classList.contains('active');
    const onDict = $('page-dictation').classList.contains('active');

    if (onCards) {
      if (e.code === 'Space') {
        e.preventDefault();
        const card = currentCard();
        if (card && !fcRevealed) playCardWord(card);
      } else if (e.key === 'Enter' && !fcRevealed) {
        e.preventDefault();
        revealCard();
      } else if (['1', '2', '3'].includes(e.key) && fcRevealed) {
        e.preventDefault();
        gradeCard(parseInt(e.key, 10));
      }
    } else if (onDict) {
      if (e.code === 'Space') {
        e.preventDefault();
        playDictation();
      }
    }
  });
}

function ensureVoices() {
  if (!('speechSynthesis' in window)) {
    showVoiceBanner();
    return;
  }
  let tries = 0;
  const tick = setInterval(() => {
    tries += 1;
    loadVoices();
    if (voiceList.length) { clearInterval(tick); return; }
    if (tries >= 12) {
      clearInterval(tick);
      if (!voiceList.length) showVoiceBanner();
    }
  }, 300);
}

function init() {
  storageOK = storageProbe();
  if (!storageOK) showStorageBanner();

  load();

  /* 跨天重置新卡计数 */
  if (state.newToday.date && state.newToday.date !== todayKey()) {
    state.newToday = { date: todayKey(), n: 0 };
    save();
  }

  bindNav();
  bindCards();
  bindDictation();
  bindSettings();
  bindKeyboard();

  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 400);
    ensureVoices();
  } else {
    toast('当前浏览器不支持语音合成，请用 Chrome / Edge / Safari');
    showVoiceBanner();
  }

  renderToday();
  refreshBadges();

  /* 第一次用：把「这个工具在练什么」展开，看完自己收起来 */
  if (!Object.keys(state.cards).length && !Object.keys(state.dict).length) {
    const ex = $('explain');
    if (ex) ex.open = true;
  }

  /* 支持 #cards 这类直接进入某个页面 */
  const PAGES = ['today', 'cards', 'dictation', 'say', 'reductions', 'progress', 'settings'];
  const hash = (location.hash || '').replace('#', '');
  if (PAGES.includes(hash) && hash !== 'today') go(hash);

  /* 浏览器前进/后退 */
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace('#', '');
    if (PAGES.includes(h)) go(h);
  });

  /* 离开页面时停止朗读 */
  window.addEventListener('beforeunload', stopSpeech);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ============================================================
   8. 给「说英语」页的接口
   两个文件都是 classic script，各自在自己的作用域里跑。
   这里只暴露对话需要的几个动作，env.js 不直接碰 state。
   ============================================================ */

/* 把对话里学到的句子塞进听写题库（和设置页手工导入同一套逻辑）。
   每句可以带 from：哪次对话、你当时的原话、卡在哪。
   这是"素材是哪来的"唯一能追溯的地方，所以必须存下来。 */
function addCustomSentences(items) {
  const out = { added: 0, dup: 0, skipped: 0 };
  (items || []).forEach((it, i) => {
    const text = String((it && it.text) || it || '').replace(/\s+/g, ' ').trim();
    if (text.length < 8) { out.skipped += 1; return; }
    if (allSentences().some((s) => s.text.toLowerCase() === text.toLowerCase())) {
      out.dup += 1;
      return;
    }
    state.customSentences.push({
      id: 'x' + Date.now() + '_' + i,
      tag: '自定义',
      text,
      note: (it && it.note) || '来自你自己刚说过的话。',
      from: (it && it.from) || null,
      skill: (it && it.skill) || ''
    });
    out.added += 1;
  });
  if (out.added) {
    save();
    const c = $('d-counter');
    if (c) c.textContent = `题库 ${allSentences().length} 句`;
  }
  return out;
}

/* 一次对话结束：记进今天的进度，也留一条历史，供以后诊断。
   同时给「言语功能」记账——办成了没有、卡在哪、在谁那儿。 */
function markSaySession(info) {
  const day = todayKey();
  if (!state.sessions[day]) state.sessions[day] = { cards: false, dictation: false, listening: false, say: false };
  state.sessions[day].say = true;
  if (!state.say) state.say = { sessions: [] };
  state.say.sessions.push({
    date: day,
    id: (info && info.id) || '',
    turns: (info && info.turns) || 0,
    outcome: (info && info.outcome) || 'unclear',
    mode: (info && info.mode) || 'model',
    skill: (info && info.skillId) || '',
    gap: (info && info.gap) || '',
    who: (info && info.who) || '',
    ts: Date.now()
  });
  if (state.say.sessions.length > 400) state.say.sessions = state.say.sessions.slice(-400);

  if (info && info.skillId) {
    recordSay({
      skillId: info.skillId,
      sceneId: (info && info.sceneId) || (info && info.id) || '',
      outcome: (info && info.outcome) || '',
      gap: (info && info.gap) || '',
      you: (info && info.you) || '',
      mode: (info && info.mode) || 'model'
    });
  }

  save();
  renderToday();
  refreshBadges();
}

function sayStats() {
  const list = (state.say && state.say.sessions) || [];
  const last = list.length ? list[list.length - 1] : null;
  return {
    total: list.length,
    last,
    lastDate: last ? last.date : '',
    todayDone: !!sessionOf(todayKey()).say
  };
}

/* 供无头测试使用 */
window.__ABTRAINER__ = {
  get state() { return state; },
  go, buildQueue, renderFlashcard, gradeCard, revealCard,
  checkDictation, lcsDiff, normWords, dueCount, streakDays, prepareText,
  markSession, nextDictation, get currentCard() { return currentCard(); },
  get queue() { return fcQueue.slice(); },
  get pos() { return fcPos; },
  get sentence() { return dCurrent; },
  /* 说英语页要用 */
  speakAppend, stopSpeech, toast, esc,
  addCustomSentences, markSaySession, sayStats,
  /* 言语功能的排期与账本 */
  pickSayToday, skillBoard, skillLabel, GAP_LABEL,
  get settings() { return state.settings; }
};

})();
