/* 一次性抽取脚本：把 data.js / scenarios.js 的内容资产转成后端可读的种子 JSON。
   用法：node app/seed/extract-seed.js
   产出：app/seed/*.json
   之后即可删除此脚本（种子数据已是独立文件）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const OUT = __dirname;

function loadScripts(files) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  });
  return sandbox.window;
}

/* 简单难度标定（task 2.4 初版）：
   1 = 单字/短词，2 = 多词短语/语块，3 = 语流变形密集或长句。
   后续由用户反馈与 AI 离线批量标定校准。 */
function cardDifficulty(c) {
  if (c.cat === 'core') return c.w.indexOf(' ') >= 0 ? 2 : 1;
  if (c.cat === 'phrasal') return 2;
  if (c.cat === 'chunk') return 3;
  if (c.cat === 'connect') return 2;
  return 2;
}

function sentenceDifficulty(s) {
  const hardTags = ['连读', '弱读', '缩略', '变形', '情态', '失去爆破', '综合'];
  const words = s.text.split(/\s+/).length;
  let d = hardTags.includes(s.tag) ? 2 : 1;
  if (words >= 9) d = 3;
  return d;
}

function write(name, data) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const n = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`wrote ${name} (${n})`);
}

const w = loadScripts(['data.js', 'scenarios.js']);

write('cards.json', w.CARDS.map((c) => ({ ...c, difficulty: cardDifficulty(c) })));
write('sentences.json', w.SENTENCES.map((s) => ({ ...s, difficulty: sentenceDifficulty(s) })));
write('reductions.json', w.REDUCTIONS);
write('skills.json', w.SKILLS);
write('listening-sources.json', w.LISTENING_SOURCES);
write('scenarios.json', w.SCENARIOS.map((s) => ({
  id: s.id,
  cat: s.cat,
  load: s.load,
  title: s.title,
  goal: s.goal,
  place: s.place,
  role: s.role,
  brief: s.brief,
  opener: s.opener,
  covers: s.covers || [],
  cast: s.cast || [],
  must: s.must || [],
  phrases: s.phrases || [],
  beats: s.beats || [],
  hints: s.hints || []
})));
write('cat-names.json', w.CAT_NAME_SAY);

console.log('done');
