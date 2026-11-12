import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { type Location, Route, Routes, useLocation } from 'react-router-dom';
import { PrimaryTabTaskOriginScope } from '../client/taskOrigin';
import { AppErrorBoundary } from './AppErrorBoundary';

export interface PrimaryTabPanel {
  path: string;
  element: ReactNode;
}

/**
 * Keeps every visited primary tab mounted, like a native tab bar. Returning to
 * a tab shows the view, its images and its scroll position as they were left,
 * instead of rebuilding it behind loading and image placeholders. Inactive
 * tabs are hidden (removed from layout, focus order and accessibility tree)
 * and see the location they last had, so they never react to another tab's
 * route. Queries in hidden tabs stay subscribed and follow the normal cache
 * freshness and invalidation contracts.
 */
export function PrimaryTabPanels({
  panels,
  fallback,
}: {
  panels: readonly PrimaryTabPanel[];
  fallback: ReactNode;
}) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const active = panels.some((panel) => panel.path === pathname)
    ? pathname
    : null;
  // Idempotent render-time bookkeeping: a newly visited tab mounts in the same
  // commit that makes it active.
  const locations = useRef(new Map<string, Location>());
  if (active) locations.current.set(active, location);
  const scrollPositions = useRef(new Map<string, number>());
  const activeRef = useRef<string | null>(null);
  const renderedTab = useRef<string | null>(null);

  // Capture the outgoing reading position while its panel is still visible.
  // Once React hides that panel, the shorter destination can clamp scrollY
  // before a scroll event runs and silently overwrite the saved position.
  if (renderedTab.current !== active) {
    if (renderedTab.current && typeof window !== 'undefined')
      scrollPositions.current.set(renderedTab.current, window.scrollY);
    renderedTab.current = active;
  }

  useLayoutEffect(() => {
    const previous = activeRef.current;
    activeRef.current = active;
    if (!active || previous === active) return;
    const saved = scrollPositions.current.get(active);
    // New tabs start at the top; revisited tabs restore their reading position.
    window.scrollTo({ top: saved ?? 0, behavior: 'instant' });
  }, [active]);


  return panels.map(({ path, element }) => {
    const kept = locations.current.get(path);
    if (!kept) return null;
    const visible = path === active;
    return (
      <div
        key={path}
        className="primary-tab-panel"
        data-primary-tab={path}
        hidden={!visible}
      >
        <PrimaryTabTaskOriginScope active={visible}>
          <AppErrorBoundary resetKey={kept.key} fallback={fallback}>
            <Routes location={kept}>
              <Route path={path} element={element} />
            </Routes>
          </AppErrorBoundary>
        </PrimaryTabTaskOriginScope>
      </div>
    );
  });
}
