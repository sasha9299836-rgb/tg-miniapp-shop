import "./ui.css";

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {text ? <div className="empty__text">{text}</div> : null}
    </div>
  );
}
