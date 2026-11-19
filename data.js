/* ============================================================
   DATA BANK — A+B Trainer
   A 型训练素材：听觉闪卡（声音 → 意义）
   B 型训练素材：听写句（语流变形 → 解析）
   所有例句均为会议/职场口语，可直接迁移到真实场景。
   ============================================================ */

/* ---------- 1. 听觉闪卡 ----------
   cat: core（高频口语词） / phrasal（短语动词） / chunk（语块）
   w   : 英文
   zh  : 中文（听觉闪卡翻面才显示）
   ex  : 例句（翻面后可播放，用于"词在句中"训练）
*/
const CARDS = [
  /* ---------- core：高频口语词 ---------- */
  { id: 'c01', cat: 'core', w: 'actually', zh: '实际上；其实', ex: 'Actually, I think we should wait.' },
  { id: 'c02', cat: 'core', w: 'probably', zh: '大概；很可能', ex: "It'll probably take two more days." },
  { id: 'c03', cat: 'core', w: 'available', zh: '有空的；可用的', ex: 'Are you available on Thursday afternoon?' },
  { id: 'c04', cat: 'core', w: 'schedule', zh: '日程；安排', ex: "Let's check the schedule first." },
  { id: 'c05', cat: 'core', w: 'colleague', zh: '同事', ex: 'I need to check with a colleague.' },
  { id: 'c06', cat: 'core', w: 'deadline', zh: '截止时间', ex: 'The deadline is the end of this month.' },
  { id: 'c07', cat: 'core', w: 'update', zh: '更新；最新进展', ex: 'Just a quick update on the project.' },
  { id: 'c08', cat: 'core', w: 'issue', zh: '问题；议题', ex: "We ran into an issue yesterday." },
  { id: 'c09', cat: 'core', w: 'figure', zh: '弄明白；数字', ex: "I can't figure out why it failed." },
  { id: 'c10', cat: 'core', w: 'handle', zh: '处理；应对', ex: "I'll handle it from here." },
  { id: 'c11', cat: 'core', w: 'manage', zh: '设法做到；管理', ex: 'Did you manage to finish it?' },
  { id: 'c12', cat: 'core', w: 'eventually', zh: '最终', ex: 'We eventually found the root cause.' },
  { id: 'c13', cat: 'core', w: 'currently', zh: '目前', ex: "We're currently testing it internally." },
  { id: 'c14', cat: 'core', w: 'immediately', zh: '立刻', ex: 'We need to fix this immediately.' },
  { id: 'c15', cat: 'core', w: 'specific', zh: '具体的', ex: 'Could you be more specific?' },
  { id: 'c16', cat: 'core', w: 'particular', zh: '特定的；尤其是', ex: 'Is there any particular reason?' },
  { id: 'c17', cat: 'core', w: 'approximately', zh: '大约', ex: 'It takes approximately two weeks.' },
  { id: 'c18', cat: 'core', w: 'regarding', zh: '关于', ex: 'I have a question regarding the budget.' },
  { id: 'c19', cat: 'core', w: 'attached', zh: '附上的', ex: "I've attached the file to the email." },
  { id: 'c20', cat: 'core', w: 'confirm', zh: '确认', ex: 'Can you confirm the number?' },
  { id: 'c21', cat: 'core', w: 'postpone', zh: '推迟', ex: 'Can we postpone it to next week?' },
  { id: 'c22', cat: 'core', w: 'prioritize', zh: '排优先级；优先处理', ex: 'We need to prioritize the client request.' },
  { id: 'c23', cat: 'core', w: 'allocate', zh: '分配（资源）', ex: "We've allocated two engineers to it." },
  { id: 'c24', cat: 'core', w: 'escalate', zh: '升级（上报）', ex: "Let's escalate this to the manager." },
  { id: 'c25', cat: 'core', w: 'align', zh: '对齐；达成一致', ex: "Let's align on the scope first." },
  { id: 'c26', cat: 'core', w: 'clarify', zh: '澄清', ex: 'Just to clarify, is that this week?' },
  { id: 'c27', cat: 'core', w: 'deliver', zh: '交付', ex: 'Can we deliver by Friday?' },
  { id: 'c28', cat: 'core', w: 'estimate', zh: '估计', ex: "That's a rough estimate." },
  { id: 'c29', cat: 'core', w: 'impact', zh: '影响', ex: 'What impact will that have on the release?' },
  { id: 'c30', cat: 'core', w: 'resource', zh: '资源；人手', ex: "We don't have enough resources right now." },
  { id: 'c31', cat: 'core', w: 'capacity', zh: '产能；承载能力', ex: "We're at full capacity this sprint." },
  { id: 'c32', cat: 'core', w: 'scope', zh: '范围', ex: "That's out of scope for now." },
  { id: 'c33', cat: 'core', w: 'timeline', zh: '时间线', ex: 'Can you walk me through the timeline?' },
  { id: 'c34', cat: 'core', w: 'milestone', zh: '里程碑', ex: 'The next milestone is in mid-December.' },
  { id: 'c35', cat: 'core', w: 'stakeholder', zh: '相关方', ex: 'We should loop in the stakeholders.' },
  { id: 'c36', cat: 'core', w: 'approve', zh: '批准', ex: 'Has legal approved the contract?' },
  { id: 'c37', cat: 'core', w: 'proposal', zh: '提案', ex: "I'll send over a short proposal." },
  { id: 'c38', cat: 'core', w: 'review', zh: '评审；复查', ex: 'Can you review my slides before tomorrow?' },
  { id: 'c39', cat: 'core', w: 'recommend', zh: '建议', ex: 'What would you recommend?' },
  { id: 'c40', cat: 'core', w: 'concern', zh: '顾虑；担心', ex: 'My main concern is the data quality.' },
  { id: 'c41', cat: 'core', w: 'option', zh: '选项', ex: "There's a second option we should consider." },
  { id: 'c42', cat: 'core', w: 'context', zh: '背景；来龙去脉', ex: 'Let me give you some context.' },
  { id: 'c43', cat: 'core', w: 'agenda', zh: '议程', ex: 'Anything to add to the agenda?' },
  { id: 'c44', cat: 'core', w: 'minutes', zh: '会议纪要', ex: "I'll share the minutes afterwards." },
  { id: 'c45', cat: 'core', w: 'brief', zh: '简要的；简报', ex: 'Just a brief update from my side.' },
  { id: 'c46', cat: 'core', w: 'urgent', zh: '紧急的', ex: 'Is this urgent or can it wait?' },
  { id: 'c47', cat: 'core', w: 'flexible', zh: '灵活的', ex: 'Our timeline is fairly flexible.' },
  { id: 'c48', cat: 'core', w: 'reasonable', zh: '合理的', ex: 'That sounds like a reasonable plan.' },
  { id: 'c49', cat: 'core', w: 'significant', zh: '显著的；重大的', ex: 'There was a significant delay.' },
  { id: 'c50', cat: 'core', w: 'temporary', zh: '临时的', ex: "It's just a temporary workaround." },
  { id: 'c51', cat: 'core', w: 'alternative', zh: '替代方案', ex: "Is there an alternative approach?" },
  { id: 'c52', cat: 'core', w: 'preliminary', zh: '初步的', ex: 'These are preliminary results.' },
  { id: 'c53', cat: 'core', w: 'feasible', zh: '可行的', ex: 'Do you think that is feasible?' },
  { id: 'c54', cat: 'core', w: 'consistent', zh: '一致的；稳定的', ex: 'The numbers have to be consistent.' },
  { id: 'c55', cat: 'core', w: 'efficient', zh: '高效的', ex: "It's not the most efficient way to do it." },
  { id: 'c56', cat: 'core', w: 'sufficient', zh: '足够的', ex: 'Is the sample size sufficient?' },
  { id: 'c57', cat: 'core', w: 'accurate', zh: '准确的', ex: 'The forecast was not very accurate.' },
  { id: 'c58', cat: 'core', w: 'aware', zh: '意识到的', ex: 'Are you aware of the change?' },
  { id: 'c59', cat: 'core', w: 'requirement', zh: '需求；要求', ex: 'Is that a hard requirement?' },
  { id: 'c60', cat: 'core', w: 'bandwidth', zh: '精力；可用时间（口语）', ex: "I don't have the bandwidth for that." },

  /* ---------- phrasal：短语动词 ---------- */
  { id: 'p01', cat: 'phrasal', w: 'follow up', zh: '跟进', ex: "I'll follow up with the vendor tomorrow." },
  { id: 'p02', cat: 'phrasal', w: 'come up with', zh: '想出（方案）', ex: 'We need to come up with a workaround.' },
  { id: 'p03', cat: 'phrasal', w: 'bring up', zh: '提出（话题）', ex: "I'll bring it up with my manager." },
  { id: 'p04', cat: 'phrasal', w: 'look into', zh: '调查；研究', ex: "Let me look into it and get back to you." },
  { id: 'p05', cat: 'phrasal', w: 'figure out', zh: '搞清楚', ex: "We're still trying to figure out the cause." },
  { id: 'p06', cat: 'phrasal', w: 'sort out', zh: '解决；理清', ex: "We'll sort it out after the meeting." },
  { id: 'p07', cat: 'phrasal', w: 'go over', zh: '过一遍', ex: "Let's go over the numbers one more time." },
  { id: 'p08', cat: 'phrasal', w: 'run into', zh: '遇到（问题）', ex: 'We ran into a problem with the data.' },
  { id: 'p09', cat: 'phrasal', w: 'put off', zh: '推迟', ex: "Let's put off the decision until Monday." },
  { id: 'p10', cat: 'phrasal', w: 'call off', zh: '取消', ex: 'They called off the launch.' },
  { id: 'p11', cat: 'phrasal', w: 'carry out', zh: '执行', ex: 'We carried out the test last week.' },
  { id: 'p12', cat: 'phrasal', w: 'set up', zh: '建立；安排', ex: "I'll set up a call for Thursday." },
  { id: 'p13', cat: 'phrasal', w: 'take over', zh: '接手', ex: 'She took over the project in May.' },
  { id: 'p14', cat: 'phrasal', w: 'back up', zh: '支持；备份', ex: 'Can you back up that claim with data?' },
  { id: 'p15', cat: 'phrasal', w: 'break down', zh: '拆分；出故障', ex: "Let's break down the timeline by phase." },
  { id: 'p16', cat: 'phrasal', w: 'check in', zh: '确认情况；汇报一下', ex: "I'll check in with you on Friday." },
  { id: 'p17', cat: 'phrasal', w: 'reach out', zh: '联系', ex: "I'll reach out to their team." },
  { id: 'p18', cat: 'phrasal', w: 'roll out', zh: '推出；逐步上线', ex: "We're rolling it out next quarter." },
  { id: 'p19', cat: 'phrasal', w: 'wrap up', zh: '收尾；结束', ex: "Let's wrap up in five minutes." },
  { id: 'p20', cat: 'phrasal', w: 'catch up', zh: '赶上；聊近况', ex: "Let's catch up early next week." },
  { id: 'p21', cat: 'phrasal', w: 'point out', zh: '指出', ex: 'Good point — thanks for pointing that out.' },
  { id: 'p22', cat: 'phrasal', w: 'rule out', zh: '排除', ex: "We can't rule out a data issue yet." },
  { id: 'p23', cat: 'phrasal', w: 'work out', zh: '解决；顺利进行', ex: "I'm sure it'll work out." },
  { id: 'p24', cat: 'phrasal', w: 'end up', zh: '最终变成', ex: 'We ended up doing it manually.' },
  { id: 'p25', cat: 'phrasal', w: 'turn down', zh: '拒绝', ex: 'They turned down our proposal.' },
  { id: 'p26', cat: 'phrasal', w: 'fill in', zh: '代为参加；填写', ex: 'Can you fill in for me on Thursday?' },
  { id: 'p27', cat: 'phrasal', w: 'kick off', zh: '开始；启动', ex: "Let's kick off with the status update." },

  /* ---------- chunk：语块 ---------- */
  { id: 'k01', cat: 'chunk', w: 'to be honest', zh: '说实话', ex: 'To be honest, I doubt we can make it.' },
  { id: 'k02', cat: 'chunk', w: 'as far as I know', zh: '据我所知', ex: 'As far as I know, it is still open.' },
  { id: 'k03', cat: 'chunk', w: 'the thing is', zh: '问题在于', ex: 'The thing is, we have no budget left.' },
  { id: 'k04', cat: 'chunk', w: "I'm not sure if", zh: '我不确定是否', ex: "I'm not sure if that's the right fix." },
  { id: 'k05', cat: 'chunk', w: 'it depends on', zh: '取决于', ex: 'It depends on what the client wants.' },
  { id: 'k06', cat: 'chunk', w: 'what I mean is', zh: '我的意思是', ex: 'What I mean is, we need more time.' },
  { id: 'k07', cat: 'chunk', w: 'just in case', zh: '以防万一', ex: 'Bring a backup copy, just in case.' },
  { id: 'k08', cat: 'chunk', w: 'on my end', zh: '我这边', ex: 'Everything is ready on my end.' },
  { id: 'k09', cat: 'chunk', w: 'in terms of', zh: '就……而言', ex: 'In terms of cost, option B is better.' },
  { id: 'k10', cat: 'chunk', w: 'at this point', zh: '目前这个阶段', ex: 'At this point, we should stop and reassess.' },
  { id: 'k11', cat: 'chunk', w: 'more or less', zh: '大致上', ex: "It's more or less done." },
  { id: 'k12', cat: 'chunk', w: 'sooner or later', zh: '迟早', ex: "We'll have to deal with it sooner or later." },
  { id: 'k13', cat: 'chunk', w: 'by the way', zh: '顺便说一下', ex: 'By the way, did you see my email?' },
  { id: 'k14', cat: 'chunk', w: 'that being said', zh: '话虽如此', ex: 'That being said, I still think it is risky.' },
  { id: 'k15', cat: 'chunk', w: 'as long as', zh: '只要', ex: "We can ship it as long as QA signs off." },
  { id: 'k16', cat: 'chunk', w: 'for now', zh: '暂时', ex: "Let's keep the old version for now." },
  { id: 'k17', cat: 'chunk', w: 'up to you', zh: '你决定', ex: "Either way works — it's up to you." },
  { id: 'k18', cat: 'chunk', w: 'make sense', zh: '讲得通；能理解', ex: 'Does that make sense?' },
  { id: 'k19', cat: 'chunk', w: 'no worries', zh: '没关系', ex: 'No worries, it happens.' },
  { id: 'k20', cat: 'chunk', w: 'sounds good', zh: '听起来不错', ex: 'Monday at ten? Sounds good.' },

  /* ---------- connect：语篇连接词（听力最容易"滑过去"的词） ---------- */
  { id: 'n01', cat: 'connect', w: 'however', zh: '然而', ex: 'However, the numbers tell a different story.' },
  { id: 'n02', cat: 'connect', w: 'therefore', zh: '因此', ex: 'Therefore, we should delay the release.' },
  { id: 'n03', cat: 'connect', w: 'otherwise', zh: '否则', ex: "We need to act now, otherwise it's too late." },
  { id: 'n04', cat: 'connect', w: 'meanwhile', zh: '与此同时', ex: 'Meanwhile, the client is still waiting.' },
  { id: 'n05', cat: 'connect', w: 'nevertheless', zh: '尽管如此', ex: 'Nevertheless, I think we should try.' },
  { id: 'n06', cat: 'connect', w: 'apparently', zh: '看起来；据说', ex: 'Apparently, the file was never uploaded.' },
  { id: 'n07', cat: 'connect', w: 'basically', zh: '基本上；说白了', ex: "Basically, we have to start over." },
  { id: 'n08', cat: 'connect', w: 'honestly', zh: '老实说', ex: "Honestly, I don't see the point." },
  { id: 'n09', cat: 'connect', w: 'eventually', zh: '最终', ex: 'Eventually, they agreed to the plan.' },
  { id: 'n10', cat: 'connect', w: 'in other words', zh: '换句话说', ex: 'In other words, we missed the window.' }
];

/* ---------- 2. 听写句 ----------
   tag : 主要考哪种变形
   note: 批改后显示的提示（点出这句真正的陷阱）
   hint: 播放前可选提示（默认隐藏）
*/
const SENTENCES = [
  /* ---- 连读（辅音+元音） ---- */
  { id: 's01', tag: '连读', text: 'Not at all, that is a good question.', note: 'not at all → "no-da-dall"，t 与 a 连读并浊化。' },
  { id: 's02', tag: '连读', text: 'We need to figure out what went wrong.', note: 'figure out → "fig-yer-out"，r 与 out 连上。' },
  { id: 's03', tag: '连读', text: 'Let me check on that and get back to you.', note: 'check on → "che-ckon"；get back to → "ge-back-tuh"。' },
  { id: 's04', tag: '连读', text: 'I will pick it up on my way back.', note: 'pick it up → "pi-ki-tup"，三个词黏成一串。' },
  { id: 's05', tag: '连读', text: 'Is it already on the agenda?', note: 'Is it → "i-zit"；already on → "already-yon"。' },
  { id: 's06', tag: '连读', text: 'Put it in the shared folder.', note: 'Put it in → "pu-ti-tin"。' },
  { id: 's07', tag: '连读', text: 'We should take a look at it together.', note: 'look at it → "loo-ka-tit"。' },
  { id: 's08', tag: '连读', text: 'Turn it off and on again.', note: 'Turn it off → "tur-ni-toff"；off and → "off-n"。' },

  /* ---- 闪音（t/d → 轻 d） ---- */
  { id: 's09', tag: '闪音', text: 'Just to make sure I got it right.', note: 'got it → "go-dit"，t 变闪音。' },
  { id: 's10', tag: '闪音', text: 'That is a better option for us.', note: 'better → "be-der"。' },
  { id: 's11', tag: '闪音', text: 'We need a little more data.', note: 'little → "li-dl"；data → "day-da"。' },
  { id: 's12', tag: '闪音', text: 'Let us sit down and talk about it.', note: 'sit down 的 t 几乎不发声；talk about it → "tal-ka-bau-dit"。' },
  { id: 's13', tag: '闪音', text: 'I will get it sorted out today.', note: 'get it → "ge-dit"。' },
  { id: 's14', tag: '闪音', text: 'What matters is the total number.', note: 'matters → "ma-derz"；total → "to-dl"。' },

  /* ---- 弱读（功能词退化） ---- */
  { id: 's15', tag: '弱读', text: 'We have a lot of things to cover.', note: 'a lot of → "a-lo-da"，of 退化成 ə。' },
  { id: 's16', tag: '弱读', text: 'Most of it is already done.', note: 'most of it → "mos-to-vit"。' },
  { id: 's17', tag: '弱读', text: 'It is one of the biggest risks.', note: 'one of the → "wun-a-thuh"。' },
  { id: 's18', tag: '弱读', text: 'I am going to talk to him about it.', note: 'talk to him → "tal-kuh-wim"。' },
  { id: 's19', tag: '弱读', text: 'This is for the client, not for us.', note: 'for the → "fer-thuh"，两个都弱。' },
  { id: 's20', tag: '弱读', text: 'We can sort it out and then decide.', note: 'and then → "n-then"。' },
  { id: 's21', tag: '弱读', text: 'There are a couple of open items.', note: 'couple of → "cuppla"；are a → "ara"。' },

  /* ---- 缩略（gonna / wanna / 串形） ---- */
  { id: 's22', tag: '缩略', text: 'I am going to need two more days.', note: 'going to → "gonna"。' },
  { id: 's23', tag: '缩略', text: 'Do you want to move it to Friday?', note: 'want to → "wanna"。' },
  { id: 's24', tag: '缩略', text: 'I have got to take this call.', note: 'have got to → "gotta"。' },
  { id: 's25', tag: '缩略', text: 'It is kind of a blocker for us.', note: 'kind of → "kinda"。' },
  { id: 's26', tag: '缩略', text: 'We sort of expected this.', note: 'sort of → "sorta"。' },
  { id: 's27', tag: '缩略', text: 'Give me a second, I will pull up the numbers.', note: 'give me → "gimme"。' },
  { id: 's28', tag: '缩略', text: 'Let me look into it.', note: 'let me → "lemme"。' },

  /* ---- 变形（didja / whaddaya / 疑问句连读） ---- */
  { id: 's29', tag: '变形', text: 'Did you get a chance to look at the deck?', note: 'did you → "didja"；get a → "ge-da"。' },
  { id: 's30', tag: '变形', text: 'What are you working on right now?', note: 'what are you → "whaddaya"。' },
  { id: 's31', tag: '变形', text: 'Could you say that again a bit slower?', note: 'could you → "couldja"。' },
  { id: 's32', tag: '变形', text: 'Would you mind sharing your screen?', note: 'would you → "wouldja"。' },
  { id: 's33', tag: '变形', text: 'Are you referring to the Q3 report?', note: 'Are you → "arya"。' },
  { id: 's34', tag: '变形', text: 'What do you think about moving it to Friday?', note: 'what do you → "whaddaya"。' },
  { id: 's35', tag: '变形', text: 'Do you have a minute to talk about this?', note: 'do you → "dya"；have a → "hava"。' },

  /* ---- 情态缩写（shoulda / coulda / woulda） ---- */
  { id: 's36', tag: '情态', text: 'He should have told us earlier.', note: 'should have → "shoulda"。' },
  { id: 's37', tag: '情态', text: 'We could have caught this sooner.', note: 'could have → "coulda"。' },
  { id: 's38', tag: '情态', text: 'I would have done it differently.', note: 'would have → "woulda"。' },
  { id: 's39', tag: '情态', text: 'We should not have shipped it that early.', note: 'should not have → "shouldn-a"。' },

  /* ---- 失去爆破 ---- */
  { id: 's40', tag: '失去爆破', text: 'That is a big deal for the team.', note: 'big deal 的 g 几乎不出声。' },
  { id: 's41', tag: '失去爆破', text: 'We will need the next day to prepare.', note: 'next day → "nex-day"。' },
  { id: 's42', tag: '失去爆破', text: 'Let us keep it short and simple.', note: 'keep it → "kee-pit"；short and → "shor-n"。' },

  /* ---- 会议固定表达 ---- */
  { id: 's43', tag: '综合', text: 'Let us take this offline and circle back tomorrow.', note: 'take this → "tay-this"；and → "n"。offline 是"会后再说"。' },
  { id: 's44', tag: '综合', text: 'Just to recap, the action items are on the doc.', note: 'recap 读 "ree-cap"；items are → "item-zar"。' },
  { id: 's45', tag: '综合', text: 'Who is taking the action item on the budget?', note: 'taking the → "tay-kin-thuh"；action item 常读成一串。' },
  { id: 's46', tag: '综合', text: 'I will keep you posted on the progress.', note: 'keep you → "kee-pya"。' },
  { id: 's47', tag: '综合', text: 'Can you walk me through the timeline?', note: 'walk me → "wok-me"；through the → "thru-thuh"。' },
  { id: 's48', tag: '综合', text: 'We are a little behind schedule.', note: 'a little → "a-li-dl"。' },
  { id: 's49', tag: '综合', text: 'Any questions before we wrap up?', note: 'before we → "before-we" 连读；wrap up → "ra-pup"。' },
  { id: 's50', tag: '综合', text: 'Let us double check with legal first.', note: 'double check 的 le 几乎吞掉；with legal → "with-leegl"。' },
  { id: 's51', tag: '综合', text: 'Something came up, can we reschedule?', note: 'came up → "cay-mup"。' },
  { id: 's52', tag: '综合', text: 'It turned out to be a much bigger issue.', note: 'turned out → "turn-dout"；out to → "out-tuh"。' }
];

/* ---------- 3. 变形规则表（B 型的知识底座） ----------
   formal: 字典形式（用于试听"教科书发音"）
   sound : 实际听感（用于试听"真实发音"近似）
*/
const REDUCTIONS = [
  { id: 'r01', name: '辅音 + 元音连读', formal: 'not at all', sound: 'nodadall', tip: '前一个词以辅音结尾、后一个以元音开头时，两个词黏成一个词。' },
  { id: 'r02', name: '闪音（t / d → 轻 d）', formal: 'better water', sound: 'bedder wader', tip: '两个元音之间的 t 会变成很轻的 d，这是美音最明显的特征。' },
  { id: 'r03', name: 'h 音脱落', formal: 'tell him', sound: 'tellim', tip: 'him / her / he 在句中常丢掉 h。' },
  { id: 'r04', name: 'to 弱读', formal: 'want to go', sound: 'wanna go', tip: 'to 在句中退化成 /tə/，快到几乎听不见。' },
  { id: 'r05', name: 'of 弱读', formal: 'a lot of', sound: 'a lotta', tip: 'of 退化成 /ə/ 甚至完全吞掉。' },
  { id: 'r06', name: 'for 弱读', formal: 'for the team', sound: 'fer the team', tip: 'for 在句中读 /fər/，不是 /fɔːr/。' },
  { id: 'r07', name: 'and 弱读', formal: 'bread and butter', sound: 'bread n butter', tip: 'and 只剩一个 /ən/ 甚至 /n/。' },
  { id: 'r08', name: 'did you 合流', formal: 'did you', sound: 'didja', tip: 'd + y 合成 /dʒ/。同理 wouldja、couldja。' },
  { id: 'r09', name: 'what are you 合流', formal: 'what are you doing', sound: 'whaddaya doing', tip: '四个音节压成一个词。' },
  { id: 'r10', name: '失去爆破', formal: 'next day', sound: 'nex day', tip: '两个爆破音相遇，前一个只做口型不出声。' },
  { id: 'r11', name: 'have 缩写', formal: 'should have', sound: 'shoulda', tip: 'shoulda / coulda / woulda，母语者几乎不读 have。' },
  { id: 'r12', name: 'give me / let me', formal: 'give me', sound: 'gimme', tip: '同理 lemme、tell me → "telly-me"。' },
  { id: 'r13', name: 'I don\'t know', formal: 'I do not know', sound: 'I dunno', tip: '极高频，几乎总是读成 "I dunno"。' },
  { id: 'r14', name: 'you 弱读', formal: 'keep you posted', sound: 'keepya posted', tip: 'you 在句中退化成 /jə/，与前词黏连。' },
  { id: 'r15', name: '句末 t / d 弱化', formal: 'I just got it', sound: 'I jus go dit', tip: '句尾的 t 常只剩一个停顿。' }
];

/* 泛听资源（今日页的 free-listening 区块） */
const LISTENING_SOURCES = [
  { name: 'BBC 6 Minute English', note: '6 分钟 + 完整文本，最稳的起点', url: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english' },
  { name: 'VOA Learning English', note: '慢速新闻，发音清晰', url: 'https://learningenglish.voanews.com/' },
  { name: 'All Ears English', note: '生活口语对话，连读多', url: 'https://www.allearsenglish.com/episodes/' },
  { name: 'ESL Pod', note: '慢速 + 讲解，适合精听', url: 'https://www.eslpod.com/' }
];


/* ---------- 4. 言语功能 ----------
   「说英语」结束时诊断出来的不是话题，是"用英语办成的一件小事"。
   这份清单是硬编码的：模型只能从这里挑一个，挑不出来就丢弃整次诊断。
   为什么硬编码：同一个功能被模型分成两个名字，就永远毕不了业。
   20 个足够覆盖职场和日常，再多就分不清了，少一个就会漏掉常见场面。 */
const SKILLS = [
  { id: 'ask-delay', label: '争取延期', plain: '把时间往后挪，还要对方点头' },
  { id: 'refuse-request', label: '拒绝请求', plain: '不答应，但别把关系弄僵' },
  { id: 'trade-offer', label: '提交换条件', plain: '给一点，换一点' },
  { id: 'clarify-number', label: '澄清数字和时间', plain: '把「周三」「大概」问成确切的一天' },
  { id: 'ask-repeat', label: '要求重说', plain: '没听清就打断，让对方再来一遍' },
  { id: 'cut-in', label: '打断拉回', plain: '把跑偏的对话拉回你要办的事' },
  { id: 'bargain', label: '讨价还价', plain: '不接受加钱、加量、加期限' },
  { id: 'admit-unknown', label: '承认不知道', plain: '不知道就说不确定，别硬编' },
  { id: 'bad-news', label: '传达坏消息', plain: '把坏消息说清楚，还要给出补救' },
  { id: 'ask-commit', label: '要一个明确承诺', plain: '把「再说」「在排产」问成一句话' },
  { id: 'wrap-confirm', label: '收尾确认', plain: '结束前把结论复述一遍' },
  { id: 'propose-alt', label: '提替代方案', plain: '这条路堵了就换一条' },
  { id: 'soft-no', label: '婉转否定', plain: '不直接说 no，但意思到' },
  { id: 'probe-detail', label: '追问细节', plain: '对方说得含糊，你问具体' },
  { id: 'borrow-resource', label: '借人手', plain: '让别人腾出人或时间给你' },
  { id: 'self-intro', label: '自我介绍', plain: '一分钟说清你做过什么' },
  { id: 'set-time', label: '约时间', plain: '把「改天」变成具体哪天几点' },
  { id: 'disagree', label: '表达不同意见', plain: '不同意，但说得出理由' },
  { id: 'self-repair', label: '说错了自己改', plain: '发现说错，当场修正不重来' },
  { id: 'close-conv', label: '结束对话', plain: '自己收场，不拖着' }
];

/* 显式挂到 window：classic script 顶层 const 只创建词法绑定，
   不会成为 window 属性，这里显式暴露以便扩展与测试。 */
window.SKILLS = SKILLS;
window.CARDS = CARDS;
window.SENTENCES = SENTENCES;
window.REDUCTIONS = REDUCTIONS;
window.LISTENING_SOURCES = LISTENING_SOURCES;
