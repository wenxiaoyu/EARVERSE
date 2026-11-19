export default function About({ onStart }: { onStart?: () => void }) {
  return (
    <section className="about">
      <div className="about-hero">
        <div className="about-logo-wrap">
          <img src="/logo.svg" alt="耳界 EARVERSE" />
        </div>
        <p className="about-eyebrow">EARVERSE · AI ENGLISH COACH</p>
        <h1>
          不用翻译，<br />
          听见就<em>懂</em>。
        </h1>
        <p className="about-lead">
          耳界不教你更多单词，而是把声音和意思直接连起来。
          每天 1 小时，AI 教练陪你听得懂、接得上、说得出。
        </p>
        <div className="about-chips">
          {["听得懂", "接得上", "说得出", "办成事"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      <blockquote className="about-quote">
        你背过很多单词，却总在会议里慢半拍。
      </blockquote>

      <div className="about-grid">
        {[
          ["01", "摸底", "AI 先测出你卡在哪：认识但听不出、听得出但反应慢、还是会用不会说。"],
          ["02", "训练", "听音辨义、跟读、最小对立对，只打你的短板，不刷无用题。"],
          ["03", "实战", "进入真实场景，把一件事办成；没人替你说话。"],
          ["04", "复盘", "当天四块一起复盘，AI 给出诊断和明天目标。"],
        ].map(([n, t, d]) => (
          <div className="about-card" key={n}>
            <span className="about-n">{n}</span>
            <b>{t}</b>
            <p>{d}</p>
          </div>
        ))}
      </div>

      <div className="about-story">
        <h2>为什么叫「耳界」</h2>
        <p>
          耳朵的世界，也是耳朵的边界。耳界做的，是拆掉声音和意思之间那堵墙——
          让英语从「脑子里翻译」，变成「耳朵里直接懂」。
        </p>
      </div>

      <div className="about-features">
        {[
          ["不是题库", "AI 全程编排，内容跟着你的短板走。"],
          ["只练有用的", "真实会议、客户、出差、面试里能用的表达。"],
          ["每天 1 小时", "复习 → 训练 → 实战 → 复盘，四块刚好。"],
          ["多个场景", "职场 / 出门 / 面试 / 日常，互不影响。"],
        ].map(([t, d]) => (
          <div className="about-feature" key={t}>
            <b>{t}</b>
            <p>{d}</p>
          </div>
        ))}
      </div>

      <div className="about-cta">
        <button className="start" onClick={onStart}>
          <span className="play">▶</span>
          开始今天的 1 小时
        </button>
      </div>

      <footer className="about-foot">
        耳界 EARVERSE · 把声音，直接变成意思。
      </footer>
    </section>
  );
}
