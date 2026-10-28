import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTaskOrigin } from '../client/taskOrigin';

/** All Today content links share the same safe task-return contract. */
export function TodayDestinationLink({
  to,
  className,
  ariaLabel,
  children,
}: {
  to: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  function openFromToday(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const taskOriginKey = captureOrigin();
    if (!taskOriginKey) return;
    event.preventDefault();
    void navigate(to, { state: { taskOriginKey } });
  }
  return (
    <Link
      to={to}
      className={className}
      aria-label={ariaLabel}
      onClick={openFromToday}
    >
      {children}
    </Link>
  );
}
