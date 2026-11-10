import { type ComponentProps, useId } from 'react';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ProMark } from './ProMark';
import './MediaIntakeButton.css';

/** A source choice; the caller retains its native file or short-task lifecycle. */
export function MediaIntakeButton({
  label,
  icon,
  description,
  proLabel,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  label: string;
  icon: EimirIconName;
  description?: string;
  proLabel?: string;
}) {
  const descriptionId = useId();
  const proId = `${descriptionId}-pro`;
  return (
    <button
      type="button"
      {...props}
      className={`media-intake-button ${className}`}
      aria-label={label}
      aria-describedby={
        [description ? descriptionId : '', proLabel ? proId : '']
          .filter(Boolean)
          .join(' ') || undefined
      }
    >
      <span className="media-intake-icon" aria-hidden="true">
        <EimirIcon name={icon} />
      </span>
      <span className="media-intake-copy">
        <span className="media-intake-label">{label}</span>
        {description ? (
          <span id={descriptionId} className="media-intake-description">
            {description}
          </span>
        ) : null}
      </span>
      {proLabel ? (
        <span id={proId} className="media-intake-pro">
          <ProMark label={proLabel} />
        </span>
      ) : null}
    </button>
  );
}
