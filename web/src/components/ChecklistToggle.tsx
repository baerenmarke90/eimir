import './ChecklistToggle.css';

export function ChecklistToggle({
  completed,
  disabled = false,
  label,
  onToggle,
  className = '',
}: {
  completed: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`checklist-toggle ${className}`.trim()}
      aria-pressed={completed}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="checklist-toggle-indicator" aria-hidden="true">
        {completed ? (
          <svg
            className="inline-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 12 4 4 8-9" />
          </svg>
        ) : (
          <svg
            className="inline-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </span>
    </button>
  );
}
