import { MiraFace } from "./TeacherAvatar";

export default function MiraCard({ active, onClick }: { active?: boolean; onClick: () => void }) {
  return (
    <button className={`mira-card ${active ? "active" : ""}`} onClick={onClick} title="和 Manbo 实时对话">
      <MiraFace />
      <span className="mira-card-copy">
        <b>Manbo</b>
        <small>英语陪练 · LIVE</small>
      </span>
      <span className="mira-live"><i /> LIVE</span>
    </button>
  );
}
