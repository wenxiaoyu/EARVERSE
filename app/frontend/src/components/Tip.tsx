export default function Tip({ text }: { text: string }) {
  return (
    <span className="tip" tabIndex={0} aria-label={text} role="note">
      <span className="tip-i">?</span>
      <span className="tip-pop" role="tooltip">{text}</span>
    </span>
  );
}
