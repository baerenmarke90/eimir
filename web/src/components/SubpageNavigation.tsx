import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PRIMARY_APP_ROUTES, subpageParentPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { TaskBackButton, TaskBackSlotContext } from './TaskBackButton';
import './SubpageNavigation.css';

/** Secondary navigation is opt-out by primary root, never opt-in by page. */
export function SubpageNavigation({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [owners, setOwners] = useState(0);
  const register = useCallback(() => {
    setOwners((count) => count + 1);
    return () => setOwners((count) => count - 1);
  }, []);
  const placement = useMemo(() => ({ slot, register }), [slot, register]);
  const isRoot = PRIMARY_APP_ROUTES.some(
    (route) => route.path === location.pathname.replace(/\/$/, ''),
  );
  if (isRoot) return children;
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  return (
    <TaskBackSlotContext.Provider value={placement}>
      <div className="shell-detail-context subpage-back-slot" ref={setSlot}>
        {owners === 0 ? (
          <TaskBackButton
            shellDefault
            className="shell-detail-back"
            onClick={() =>
              requestReturn(originKey, subpageParentPath(location.pathname))
            }
          />
        ) : null}
      </div>
      {children}
    </TaskBackSlotContext.Provider>
  );
}
