import { EimirIcon } from './EimirIcon';
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
        <EimirIcon name={completed ? 'check' : 'circle'} />
      </span>
    </button>
  );
}
