import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTaskOrigin } from '../client/taskOrigin';
import { PreviewCardLink } from './PreviewCardLink';

/** Content and utility entries share the same safe task-return contract. */
export function TaskOriginLink({
  to,
  className,
  ariaLabel,
  children,
  previewControls = false,
  onFollow,
}: {
  to: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
  previewControls?: boolean;
  onFollow?: () => void;
}) {
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  function followWithOrigin(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const taskOriginKey = captureOrigin();
    onFollow?.();
    if (!taskOriginKey) return;
    event.preventDefault();
    void navigate(to, { state: { taskOriginKey } });
  }
  const DestinationLink = previewControls ? PreviewCardLink : Link;
  return (
    <DestinationLink
      to={to}
      className={className}
      aria-label={ariaLabel}
      onClick={followWithOrigin}
    >
      {children}
    </DestinationLink>
  );
}

export { TaskOriginLink as TodayDestinationLink };
