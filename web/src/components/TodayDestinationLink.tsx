import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOpenTaskLink } from '../client/taskOrigin';
import { PreviewCardLink } from './PreviewCardLink';

/** Content and utility entries share the same safe task-return contract. */
export function TaskOriginLink({
  to,
  className,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  children,
  selectedKey,
  previewControls = false,
  onFollow,
}: {
  to: string;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  children: ReactNode;
  selectedKey?: string;
  previewControls?: boolean;
  onFollow?: () => void;
}) {
  const openTaskLink = useOpenTaskLink();
  function followWithOrigin(event: MouseEvent<HTMLAnchorElement>) {
    openTaskLink(event, to, selectedKey, onFollow);
  }
  const DestinationLink = previewControls ? PreviewCardLink : Link;
  return (
    <DestinationLink
      to={to}
      className={className}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-task-item-key={selectedKey}
      onClick={followWithOrigin}
    >
      {children}
    </DestinationLink>
  );
}

export { TaskOriginLink as TodayDestinationLink };
