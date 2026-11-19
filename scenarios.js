/* ============================================================
   SCENARIOS — 「去办一件事」的场景库

   每个场景不是话题，是一件要办成的事：
     goal   你要办成什么（进场景前给你看）
     load   这个场合的难度（1 轻松 / 2 一般 / 3 硬）。同一个功能先在最轻
            的场合办成，办砸了就退回更轻的一档——不是换话题，是换语域。
     covers 这个场景能练到哪几件言语功能（对应 data.js 的 SKILLS）。
            一个功能要在 3 个不同场景各办成 1 次才算真的会了。
     cast   在场的人（最多 3 个）。每个人有自己的立场，立场永远不给你看。
            语音靠 voice 里的 pitch/rate 区分，不然三个人听起来是同一个人。
     beats  离线演示模式用的剧本：一句一行，标着谁说的
     phrases 结束后可以一键加进听写题库的 3 句
     hints  卡住时给的中文提示（演示模式与「我不会说」共用）

   为什么改成群聊：真实场合很少是一对一。你要同时应付一个不给面子的
   同事和一个息事宁人的旁观者，才知道自己到底会不会。一次最多 3 个人，
   再多就变成开会，耳朵跟不上。
   ============================================================ */

const CAT_NAME_SAY = {
  work: '职场',
  client: '客户',
  interview: '面试',
  travel: '出门',
  social: '日常'
};

const SCENARIOS = [
  /* ---------------- 职场 ---------------- */
  {
    id: 'w-delay',
    cat: 'work',
    load: 3,
    title: '跟老板说：要延期',
    goal: '让老板接受晚两周，而且不砍需求',
    place: '周五下午的同步会，Mark 把数据平台的 Priya 也叫来了',
    role: '你的直属经理 Mark',
    brief: '集成测试阶段发现底层接口不稳定，原定下周五上线已经不可能。今天这次会，你要说清楚，还得带着一个新日期出去。',
    opener: "Come on in. Before we start — is the launch still on for Friday?",
    covers: ['ask-delay', 'bad-news', 'ask-commit', 'trade-offer', 'refuse-request', 'disagree', 'set-time', 'borrow-resource'],
    cast: [
      {
        id: 'mark',
        name: 'Mark',
        role: '你的直属经理',
        tag: 'boss',
        voice: { pitch: 0.86, rate: 0.98 },
        stance: '他下周一要跟 VP 汇报，最怕临时变卦。他倾向让你带团队周末赶工，除非你能说清根因，并给出一个自己愿意承诺的新日期。',
        opener: "Come on in. Before we start — is the launch still on for Friday?"
      },
      {
        id: 'priya',
        name: 'Priya',
        role: '数据平台负责人',
        tag: 'peer',
        voice: { pitch: 1.12, rate: 1.03 },
        stance: '她不负责你们上线，只关心自己团队这季度被叫去救火第几次了。语气不客气，会直接问这是不是又一次接口问题。'
      },
      {
        id: 'elena',
        name: 'Elena',
        role: '同组工程师',
        tag: 'bystander',
        voice: { pitch: 1.2, rate: 0.97 },
        stance: '她刚通宵改完测试脚本，倾向周末继续赶，会小声说「我还能再顶一晚」。她不是帮你，她是真的累到只想赶紧结束。'
      }
    ],
    must: ["I'd rather be upfront with you", 'The root cause is', 'What I can commit to is', 'That gives us two weeks of buffer'],
    phrases: [
      "I'd rather be upfront with you than surprise you next week.",
      'The root cause is an unstable interface we do not control.',
      'What I can commit to is the 28th, with a two-week buffer.'
    ],
    beats: [
      { by: 'mark', text: 'Come on in. Before we start — is the launch still on for Friday?' },
      { by: 'mark', text: 'I was afraid of that. The VP wants the date on Monday. Can the team push through the weekend?' },
      { by: 'priya', text: 'Is this the interface again? That is the third time this quarter we have been pulled in.' },
      { by: 'mark', text: 'And if we cut the reporting feature, could you still hit Friday?' },
      { by: 'elena', text: 'I can stay late tonight if that buys us a day.' },
      { by: 'mark', text: 'Alright. Send me the new plan tonight and I will take the 28th to the VP.' }
    ],
    hints: ['先说结论：Friday 不可能', '给根因，别只说 it is complicated', '主动给一个新日期，别等他问']
  },
  {
    id: 'w-resource',
    cat: 'work',
    load: 2,
    title: '去别的团队借个人',
    goal: '借到一个工程师，做两周',
    place: '跨团队周会，视频，只剩十分钟',
    role: '数据平台负责人 Priya',
    brief: '你的项目卡在一个数据接口上，对方团队是唯一能改的人。会议只剩十分钟，他们团队那个改接口的人也在线。',
    opener: "We've got ten minutes. What did you want to raise?",
    covers: ['borrow-resource', 'trade-offer', 'probe-detail', 'ask-commit', 'cut-in', 'self-intro'],
    cast: [
      {
        id: 'priya',
        name: 'Priya',
        role: '数据平台负责人',
        tag: 'peer',
        voice: { pitch: 1.12, rate: 1.02 },
        stance: '她自己团队也排满了。不直接拒绝，但要你证明优先级，最多给一个人两周，还要你承担一半的值班。',
        opener: "We've got ten minutes. What did you want to raise?"
      },
      {
        id: 'wei',
        name: 'Wei',
        role: '接口的维护者',
        tag: 'peer',
        voice: { pitch: 0.95, rate: 1.0 },
        stance: '他愿意改，但他刚被上个月的需求坑过。会先问清楚改动范围，问到你答不上来就沉默不接话。'
      },
      {
        id: 'tom',
        name: 'Tom',
        role: '你这边同组工程师',
        tag: 'bystander',
        voice: { pitch: 1.05, rate: 1.04 },
        stance: '他不想接这个活，会帮你说话但说不到点上，比如「我们真的很急」。他说完就看你。'
      }
    ],
    must: ["We're blocked on", 'Could you spare', 'It would unblock', "We'd take the on-call"],
    phrases: [
      "We're blocked on one endpoint, and you're the only team that can change it.",
      'Could you spare one engineer for two weeks?',
      "We'd take half the on-call if that helps."
    ],
    beats: [
      { by: 'priya', text: "We've got ten minutes. What did you want to raise?" },
      { by: 'priya', text: 'Blocked how? My team is fully allocated through the quarter.' },
      { by: 'wei', text: 'Which endpoint? If it is the aggregation one, I know where it breaks.' },
      { by: 'tom', text: 'We are really stuck on this one. Like, the whole release is stuck.' },
      { by: 'priya', text: 'One person. Two weeks. And you take half the on-call.' },
      { by: 'priya', text: "Fine. I'll talk to Wei and confirm by tomorrow." }
    ],
    hints: ['一句话说清你被什么卡住', '承认对方也满，再提具体要求', '准备好让步：值班、工期、范围']
  },

  /* ---------------- 客户 ---------------- */
  {
    id: 'c-late',
    cat: 'client',
    load: 3,
    title: '告诉客户：晚三天',
    goal: '客户接受晚三天，而且不提赔偿',
    place: '电话会议，客户那边来了两个人',
    role: '客户方项目经理 Daniel',
    brief: '一个关键模块的回归测试出了问题，交付要晚三天。今天必须打这个电话，对方周三有对外发布。',
    opener: "Hey — thanks for calling back. Please tell me we're still good for Wednesday.",
    covers: ['bad-news', 'ask-delay', 'propose-alt', 'ask-commit', 'self-repair', 'refuse-request'],
    cast: [
      {
        id: 'daniel',
        name: 'Daniel',
        role: '客户方项目经理',
        tag: 'peer',
        voice: { pitch: 0.92, rate: 1.0 },
        stance: '生气但专业。第一反应是要么加急要么补偿。你把原因和补救说清楚，他会接受，但不会替你说好话。',
        opener: "Hey — thanks for calling back. Please tell me we're still good for Wednesday."
      },
      {
        id: 'ruth',
        name: 'Ruth',
        role: '客户方发布负责人',
        tag: 'boss',
        voice: { pitch: 1.14, rate: 1.05 },
        stance: '她只关心下周三的对外发布能不能按时。她已经在准备新闻稿，一开口就要你给一个「能写进日历的日子」。'
      }
    ],
    must: ['I want to be straight with you', "Here's what happened", 'To make up for it', 'Would a daily update help'],
    phrases: [
      'I want to be straight with you before the news gets out.',
      "Here's what happened, and here's what we're doing about it.",
      "To make up for it, we'll run a daily update until it ships."
    ],
    beats: [
      { by: 'daniel', text: "Hey — thanks for calling back. Please tell me we're still good for Wednesday." },
      { by: 'ruth', text: "Three days? Our launch is Wednesday. That's not a small thing for us." },
      { by: 'daniel', text: "So what actually happened? And don't tell me 'testing issues'." },
      { by: 'ruth', text: 'Okay. What are you doing so this does not happen again?' },
      { by: 'daniel', text: 'Alright — Saturday, then. And I want that daily update.' }
    ],
    hints: ['先说坏消息，别绕圈子', '原因要具体，一句话说完', '主动给补救，别等对方开口要']
  },
  {
    id: 'c-chase',
    cat: 'client',
    load: 2,
    title: '催供应商交样件',
    goal: '拿到一个明确的发货日期',
    place: '电话，供应商销售，中间还转给了一次计划员',
    role: '供应商销售 Kevin',
    brief: '产线下周就要试装，样件还没到。对方每次都说「在排产」。',
    opener: 'Kevin speaking — how can I help?',
    covers: ['ask-commit', 'probe-detail', 'cut-in', 'clarify-number', 'bargain', 'soft-no', 'bad-news', 'admit-unknown', 'ask-repeat', 'disagree', 'borrow-resource'],
    cast: [
      {
        id: 'kevin',
        name: 'Kevin',
        role: '供应商销售',
        tag: 'peer',
        voice: { pitch: 0.9, rate: 1.02 },
        stance: '客气地拖，实际在等另一个更大的客户。只有听到停线风险或要被上报，他才会给日期。',
        opener: 'Kevin speaking — how can I help?'
      },
      {
        id: 'linda',
        name: 'Linda',
        role: '供应商排产计划员',
        tag: 'bystander',
        voice: { pitch: 1.16, rate: 0.99 },
        stance: '她只管排产表。「前面还有四个客户」是她唯一会说的信息，除非你问具体哪天，她会顺口说出一个数字。'
      }
    ],
    must: ["We're running out of", 'I need a date, even a rough one', 'This is starting to affect', 'Can you escalate internally'],
    phrases: [
      "We're running out of buffer here — I need a date, even a rough one.",
      'This is starting to affect our line next week.',
      'Can you escalate internally and call me back today?'
    ],
    beats: [
      { by: 'kevin', text: 'Kevin speaking — how can I help?' },
      { by: 'kevin', text: "It's in production. I'll check with the plant and come back to you." },
      { by: 'linda', text: "We've got four other customers ahead of you on that line." },
      { by: 'kevin', text: "I can't give you an exact date, but it's moving." },
      { by: 'kevin', text: "If it's really that urgent, I can try to move you up the queue." },
      { by: 'kevin', text: "Okay — Friday, five hundred pieces. I'll email the confirmation today." }
    ],
    hints: ['先说后果：下周试装、可能停线', "别接受 it is moving 这种回答", '要求一个具体日期']
  },

  /* ---------------- 面试 ---------------- */
  {
    id: 'i-self',
    cat: 'interview',
    load: 2,
    title: '面试：一分钟介绍自己',
    goal: '90 秒内让对方记住你做过什么',
    place: '视频面试，技术面第一轮，旁边还坐着一位工程师',
    role: '面试官 Sarah',
    brief: '面试刚开始，对方说「先介绍下你自己」。',
    opener: "Thanks for making time. We've got forty minutes — start by telling me about yourself.",
    covers: ['self-intro', 'probe-detail', 'admit-unknown', 'self-repair', 'close-conv'],
    cast: [
      {
        id: 'sarah',
        name: 'Sarah',
        role: '面试官',
        tag: 'boss',
        voice: { pitch: 1.1, rate: 1.04 },
        stance: '时间紧，讨厌背稿。一听到抽象表述就会打断，追问系统和数字。',
        opener: "Thanks for making time. We've got forty minutes — start by telling me about yourself."
      },
      {
        id: 'leo',
        name: 'Leo',
        role: '同场旁听的资深工程师',
        tag: 'bystander',
        voice: { pitch: 0.88, rate: 0.98 },
        stance: '他决定技术深度那一票。问的是运维、边界、你到底碰过哪一行代码；答得空他就低头不问了。'
      }
    ],
    must: ["I've spent the last", "The part I'm proudest of", 'What draws me here'],
    phrases: [
      "I've spent the last five years building backend services at scale.",
      "The part I'm proudest of is cutting our latency by half.",
      'What draws me here is the size of the problem.'
    ],
    beats: [
      { by: 'sarah', text: "Thanks for making time. We've got forty minutes — start by telling me about yourself." },
      { by: 'sarah', text: 'Stop there. What exactly did you build? Give me the system, not the summary.' },
      { by: 'leo', text: 'And did you own the on-call for it, or just the code?' },
      { by: 'sarah', text: 'Why us, though? You could do this anywhere.' },
      { by: 'sarah', text: "Good. Let's go deeper on that latency work." }
    ],
    hints: ['别从毕业讲起，从最近五年讲', '给一个具体项目 + 一个数字', '最后一句说为什么是这家']
  },
  {
    id: 'i-weak',
    cat: 'interview',
    load: 3,
    title: '面试：你最大的缺点',
    goal: '说一个真实短板，并给出正在改的证据',
    place: '视频面试，第二轮机考后面谈',
    role: '面试官 Sarah',
    brief: '前面聊得不错，对方突然问到这个，旁边的工程师也抬起头。',
    opener: "Let me ask something less comfortable. What's your biggest weakness?",
    covers: ['admit-unknown', 'probe-detail', 'disagree', 'self-repair', 'close-conv'],
    cast: [
      {
        id: 'sarah',
        name: 'Sarah',
        role: '面试官',
        tag: 'boss',
        voice: { pitch: 1.1, rate: 1.03 },
        stance: '不接受「我太追求完美」这种套话，一定会追问一个真实例子和代价。',
        opener: "Let me ask something less comfortable. What's your biggest weakness?"
      },
      {
        id: 'leo',
        name: 'Leo',
        role: '同场旁听的资深工程师',
        tag: 'bystander',
        voice: { pitch: 0.88, rate: 0.98 },
        stance: '他要的是细节：哪一次、多少钱、谁受影响。你一含糊他就替你把话补完，然后看你怎么接。'
      }
    ],
    must: ['I used to', 'What I do now is', 'It still shows up when'],
    phrases: [
      'I used to take on too much and not say anything until it was late.',
      'What I do now is flag it in the first week, not the last.',
      "It still shows up when I'm the only one who understands a system."
    ],
    beats: [
      { by: 'sarah', text: "Let me ask something less comfortable. What's your biggest weakness?" },
      { by: 'sarah', text: 'That sounds like a humblebrag. Give me a real one.' },
      { by: 'leo', text: 'Can you give me an example where it actually cost you?' },
      { by: 'sarah', text: 'And what changed? Not what you plan to do — what you actually do now.' },
      { by: 'sarah', text: "Okay, that's a real answer. Let's move on." }
    ],
    hints: ['别说「太追求完美」', '给一件真事，说清代价', '重点在「现在怎么做」，不是「我打算改」']
  },

  /* ---------------- 出门 ---------------- */
  {
    id: 't-hotel',
    cat: 'travel',
    load: 1,
    title: '酒店：换一间安静的房间',
    goal: '换成不靠马路的房间，而且不加钱',
    place: '晚上十点，酒店前台，值班经理在旁边',
    role: '前台 Yuki',
    brief: '你明天一早有客户会议，房间正对马路。',
    opener: 'Good evening. Checking in?',
    covers: ['refuse-request', 'propose-alt', 'clarify-number', 'bargain', 'soft-no', 'wrap-confirm'],
    cast: [
      {
        id: 'yuki',
        name: 'Yuki',
        role: '前台',
        tag: 'peer',
        voice: { pitch: 1.13, rate: 1.0 },
        stance: '今晚接近满房，只有一次松口的空间。礼貌，但很会把人推回去。',
        opener: 'Good evening. Checking in?'
      },
      {
        id: 'marco',
        name: 'Marco',
        role: '值班经理',
        tag: 'boss',
        voice: { pitch: 0.87, rate: 0.99 },
        stance: '他有权免掉附加费，但不会主动给。你要求降房价时他会说不行，除非你给出一个他能接受的理由。'
      }
    ],
    must: ["I'm afraid", 'Would it be possible to', 'Is there any way', 'That works for me'],
    phrases: [
      "I'm afraid the room I was given faces the street.",
      'Would it be possible to move me to a quieter room?',
      'Is there any way to do that without changing the rate?'
    ],
    beats: [
      { by: 'yuki', text: 'Good evening. Checking in?' },
      { by: 'yuki', text: "I'm afraid we're almost fully booked tonight. Most rooms face the street." },
      { by: 'yuki', text: "Let me check... there's one on the seventh floor, but it's a deluxe room." },
      { by: 'marco', text: "Marco, duty manager — I can't change the rate, but I could waive the breakfast charge." },
      { by: 'yuki', text: "Alright — room 712, quiet side, same rate. Here's your key." }
    ],
    hints: ['先说问题，用 I am afraid', '提要求用 Would it be possible', '对方要加钱就问 Is there any way']
  },
  {
    id: 't-airport',
    cat: 'travel',
    load: 1,
    title: '航班取消，去改签',
    goal: '改到今天能走，而且不加钱',
    place: '机场柜台，队伍很长，值班主管在后面',
    role: '地勤 Denise',
    brief: '你的航班取消了，明天上午有会议。',
    opener: 'Next, please. Passport and booking reference?',
    covers: ['clarify-number', 'propose-alt', 'ask-commit', 'ask-repeat', 'bargain', 'ask-delay', 'cut-in', 'wrap-confirm', 'self-repair'],
    cast: [
      {
        id: 'denise',
        name: 'Denise',
        role: '地勤',
        tag: 'peer',
        voice: { pitch: 1.15, rate: 1.01 },
        stance: '只按系统给的东西说。但你问对问题（联程、隔壁机场、次日早班），她会多透露一句。',
        opener: 'Next, please. Passport and booking reference?'
      },
      {
        id: 'hana',
        name: 'Hana',
        role: '值班主管',
        tag: 'bystander',
        voice: { pitch: 0.94, rate: 1.03 },
        stance: '她能批跨航司签转，但只在队伍快不动的时候才接手。她接手时会重复一遍你的诉求，说错这时才最难改。'
      }
    ],
    must: ['My flight was cancelled', 'What are my options', 'Is there anything tonight', 'Could you check'],
    phrases: [
      'My flight was cancelled and I have a meeting tomorrow morning.',
      'What are my options tonight?',
      'Could you check the airport across town?'
    ],
    beats: [
      { by: 'denise', text: 'Next, please. Passport and booking reference?' },
      { by: 'denise', text: "Yes, that one's cancelled. The earliest I have is tomorrow at two." },
      { by: 'hana', text: "Supervisor here — we can't ticket across two airlines on this desk. What are you asking for, exactly?" },
      { by: 'denise', text: "There is a flight from the other airport at nine, but it's a separate ticket." },
      { by: 'denise', text: "You're confirmed on the nine o'clock. Gate changes are on the board." }
    ],
    hints: ['说明你明天有会议，把时间压力讲出来', '问 options，别只问 what now', '让对方查另一个机场']
  },

  /* ---------------- 日常 ---------------- */
  {
    id: 's-small',
    cat: 'social',
    load: 1,
    title: '电梯里遇到新同事',
    goal: '聊满几轮，约到下周一午饭',
    place: '办公楼电梯，早高峰，中途又上来一个同组同事',
    role: '新来的同事 Alex',
    brief: '电梯里先是你们两个，中间停了一层。',
    opener: "Morning. You're on this floor too?",
    covers: ['self-intro', 'probe-detail', 'set-time', 'ask-repeat', 'close-conv', 'wrap-confirm'],
    cast: [
      {
        id: 'alex',
        name: 'Alex',
        role: '新来的同事',
        tag: 'peer',
        voice: { pitch: 1.08, rate: 1.01 },
        stance: '想认识人但有点紧张，回答很短。你问开放问题他就多说，问 yes/no 他就只说「嗯」。',
        opener: "Morning. You're on this floor too?"
      },
      {
        id: 'nina',
        name: 'Nina',
        role: '你同组的同事',
        tag: 'bystander',
        voice: { pitch: 1.18, rate: 1.05 },
        stance: '她认识所有人，会顺手替 Alex 补一句背景，也会替你接掉尴尬的空白。你如果一直不说话，她就替他约了。'
      }
    ],
    must: ["How's the first week going", 'What did you do before', 'Do you want to grab lunch'],
    phrases: [
      "How's your first week going so far?",
      'What did you do before you joined?',
      'Do you want to grab lunch on Monday?'
    ],
    beats: [
      { by: 'alex', text: "Morning. You're on this floor too?" },
      { by: 'alex', text: 'Yeah, second week. Still getting lost, honestly.' },
      { by: 'nina', text: "Alex, right? You're on the data side with me. Hi!" },
      { by: 'alex', text: 'Lunch? Sure — Monday works.' },
      { by: 'alex', text: "Great, see you Monday. I'll message you." }
    ],
    hints: ['问开放问题，别问 yes/no', '对方说 still getting lost，可以顺着接一句', '最后主动约一个具体时间']
  },
  {
    id: 's-weekend',
    cat: 'social',
    load: 1,
    title: '约同事周末打球',
    goal: '拿到一个确定的 yes，或者一个具体替代时间',
    place: '周五下班，工位旁边，另一个同事也还没走',
    role: '同事 Ben',
    brief: '你想约他周六上午打球。',
    opener: 'Hey — you heading out?',
    covers: ['set-time', 'soft-no', 'trade-offer', 'refuse-request', 'ask-commit', 'close-conv'],
    cast: [
      {
        id: 'ben',
        name: 'Ben',
        role: '同事',
        tag: 'peer',
        voice: { pitch: 0.93, rate: 0.99 },
        stance: '连着加了两周班，很累。想拒绝但不好意思，会一直说 maybe。',
        opener: 'Hey — you heading out?'
      },
      {
        id: 'chris',
        name: 'Chris',
        role: '旁边还没走的同事',
        tag: 'bystander',
        voice: { pitch: 1.06, rate: 1.06 },
        stance: '他听见了就想加入，但只在周日有空。他会直接说出自己的时间，把「周六」这个前提悄悄换掉。'
      }
    ],
    must: ['Are you up for', 'No pressure', 'How about', 'Let me know by'],
    phrases: [
      'Are you up for a game on Saturday morning?',
      "No pressure if you're wiped out — how about next weekend?",
      "Let me know by Friday night and I'll book the court."
    ],
    beats: [
      { by: 'ben', text: 'Hey — you heading out?' },
      { by: 'ben', text: "Saturday? Maybe. I've been working weekends for two weeks." },
      { by: 'chris', text: "If you two are playing, count me in. Sunday's better for me though." },
      { by: 'ben', text: "I'd probably be terrible. And I'd have to leave early." },
      { by: 'ben', text: "Alright, Sunday ten. I'll be there." }
    ],
    hints: ['先给台阶：No pressure', '对方说 maybe，就换一个更具体的时间', '最后把时间钉死']
  }
];

function scenarioById(id) {
  return SCENARIOS.filter((s) => s.id === id)[0] || null;
}

/* 剧本里的说话人是谁（演示模式、复盘、界面都要用） */
function castOf(scenario, byId) {
  const cast = (scenario && scenario.cast) || [];
  return cast.filter((c) => c.id === byId)[0] || cast[0] || null;
}

/* 供测试与页面使用（classic script 的顶层 const 不会成为 window 属性） */
window.SCENARIOS = SCENARIOS;
window.CAT_NAME_SAY = CAT_NAME_SAY;
window.scenarioById = scenarioById;
window.castOf = castOf;
