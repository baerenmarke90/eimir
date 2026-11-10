import { type ReactNode, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';

/** Internal map navigation shares the existing task/sheet return lifecycle. */
export function MomentMapLink({
  to,
  children,
  className,
  ariaLabel,
  onNavigate,
  returnFocusKey,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onNavigate?: (proceed: () => void) => void;
  returnFocusKey?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, resolveOrigin } = useTaskOrigin();
  const link = useRef<HTMLAnchorElement>(null);
  const restoredEntry = useRef<string | null>(null);
  const selectedKey = returnFocusKey
    ? `moment-map:${returnFocusKey}`
    : undefined;
  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  useEffect(() => {
    if (!selectedKey) return;
    const origin = resolveOrigin(returnKey);
    if (
      !origin ||
      origin.to !== taskOriginPath(location.pathname, location.search) ||
      origin.selectedKey !== selectedKey
    )
      return;
    const entry = `${location.key}:${String(returnKey)}`;
    if (restoredEntry.current === entry) return;
    let settleFrame: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      const anchor = link.current;
      if (!anchor?.isConnected || !resolveOrigin(returnKey)) return;
      window.scrollTo({ top: origin.scrollY, behavior: 'instant' });
      anchor.focus({ preventScroll: true });
      restoredEntry.current = entry;
      settleFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: origin.scrollY, behavior: 'instant' });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
    };
  }, [
    selectedKey,
    returnKey,
    location.key,
    location.pathname,
    location.search,
    resolveOrigin,
  ]);
  return (
    <Link
      ref={link}
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
            state: {
              taskOriginKey: captureOrigin(
                selectedKey ? { selectedKey } : undefined,
              ),
              mapFromMoment: true,
            },
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
