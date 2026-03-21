interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="empty-state-card">
      <span className="empty-state-icon" aria-hidden="true">
        {icon}
      </span>
      <strong>{title}</strong>
      <p className="muted-text">{description}</p>
    </div>
  );
}
