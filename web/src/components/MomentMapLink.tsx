import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTaskOrigin } from '../client/taskOrigin';

/** Internal map navigation shares the existing task/sheet return lifecycle. */
export function MomentMapLink({
  to,
  children,
  className,
  ariaLabel,
  onNavigate,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onNavigate?: (proceed: () => void) => void;
}) {
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  return (
    <Link
      to={to}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const proceed = () => {
          void navigate(to, {
            state: { taskOriginKey: captureOrigin(), mapFromMoment: true },
          });
        };
        if (onNavigate) onNavigate(proceed);
        else proceed();
      }}
    >
      {children}
    </Link>
  );
}
