import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { primaryTabIndex, subpageParentPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { TaskBackButton, TaskBackSlotContext } from './TaskBackButton';
import './SubpageNavigation.css';

function firstInDocument(hosts: readonly HTMLElement[]): HTMLElement | null {
  let first: HTMLElement | null = null;
  for (const host of hosts) {
    if (!host.isConnected) continue;
    if (
      !first ||
      host.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING
    )
      first = host;
  }
  return first;
}

/** Secondary navigation is opt-out by primary root, never opt-in by page. */
export function SubpageNavigation({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const [shellSlot, setShellSlot] = useState<HTMLDivElement | null>(null);
  const [hosts, setHosts] = useState<readonly HTMLElement[]>([]);
  const [owners, setOwners] = useState(0);
  const register = useCallback(() => {
    setOwners((count) => count + 1);
    return () => setOwners((count) => count - 1);
  }, []);
  const registerHost = useCallback((host: HTMLElement) => {
    setHosts((current) => [...current, host]);
    return () => setHosts((current) => current.filter((item) => item !== host));
  }, []);
  // The page heading's leading cell hosts Back in the title row; the shell row
  // remains only for pages without a heading (loading, error, map views).
  const host = useMemo(() => firstInDocument(hosts), [hosts]);
  const slot = host ?? shellSlot;
  // Every subpage uses the same round chevron Back (#2063); the text label
  // that Chapters, Insights and Recaps used looked like a second control.
  const placement = useMemo(
    () => ({ slot, register, registerHost, showBackLabel: false }),
    [slot, register, registerHost],
  );
  if (primaryTabIndex(location.pathname) >= 0) return children;
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const shellBack =
    owners === 0 ? (
      <TaskBackButton
        shellDefault
        className="shell-detail-back"
        onClick={() =>
          requestReturn(originKey, subpageParentPath(location.pathname))
        }
      />
    ) : null;
  return (
    <TaskBackSlotContext.Provider value={placement}>
      <div
        className="shell-detail-context subpage-back-slot"
        ref={setShellSlot}
      >
        {host ? null : shellBack}
      </div>
      {host && shellBack ? createPortal(shellBack, host) : null}
      {children}
    </TaskBackSlotContext.Provider>
  );
}
