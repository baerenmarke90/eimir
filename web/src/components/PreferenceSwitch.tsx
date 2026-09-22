import { useId } from 'react';
import './PreferenceSwitch.css';

export function PreferenceSwitch({
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
  className,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const descriptionId = useId();

  return (
    <div
      className={`preference-switch-row${className ? ` ${className}` : ''}`}
    >
      <span className="preference-switch-copy">
        <strong>{label}</strong>
        {description ? <span id={descriptionId}>{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
        className="preference-switch-control"
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="preference-switch-track" aria-hidden="true">
          <span className="preference-switch-thumb" />
        </span>
      </button>
    </div>
  );
}
