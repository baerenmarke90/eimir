import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { applyRouteEntryHandoff } from '../client/routeEntryHandoff';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';

/**
 * The Plan composer sits below an async Planning overview state. On a fresh
 * `/plan#plan-title` entry the shared handoff can run while the loading state
 * is still present; replacing that state can then shift the already-positioned
 * target underneath the sticky shell chrome. Re-apply the same handoff once,
 * after that local loading node disappears. The shared route-entry semantics
 * remain unchanged, and the target's scoped scroll margin owns the chrome
 * clearance.
 */
function stabilizePlanRouteEntry(hash: string): (() => void) | undefined {
  if (hash !== '#plan-title') return undefined;

  const target = document.getElementById('plan-title');
  const content = target?.closest('.planen-panel');
  if (!target || !content?.querySelector('.ui-state-loading')) return undefined;

  let frame = 0;
  const observer = new MutationObserver(() => {
    if (content.querySelector('.ui-state-loading')) return;

    observer.disconnect();
    frame = window.requestAnimationFrame(() => {
      if (target.isConnected && window.location.hash === hash) {
        target.scrollIntoView({ block: 'start' });
      }
    });
  });

  observer.observe(content, { childList: true });

  return () => {
    observer.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  };
}

/**
 * Mounted once by `AppShell`. Applies the shared destination handoff (see
 * `routeEntryHandoff.ts`) on every route change, so every Quick Create
 * target - and any other in-app navigation - lands on a visible, correctly
 * positioned composition without a per-destination scroll hack.
 *
 * POP navigation (browser Back/Forward, and the initial load) is left
 * alone when there is no hash to honor, so native scroll restoration for
 * Back/Forward is not overridden.
 */
export function RouteEntryHandoff(): null {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { resolveOrigin } = useTaskOrigin();

  useEffect(() => {
    const state = location.state as {
      taskReturnKey?: unknown;
      taskOriginKey?: unknown;
    } | null;
    const origin = resolveOrigin(state?.taskReturnKey);
    if (
      origin &&
      origin.to === taskOriginPath(location.pathname, location.search)
    ) {
      if (location.pathname === '/story') return undefined;
      const frame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: origin.scrollY, behavior: 'instant' });
        if (origin.focusTarget === 'quick-create') {
          Array.from(
            document.querySelectorAll<HTMLElement>('.quick-create-trigger'),
          )
            .find((element) => element.getClientRects().length > 0)
            ?.focus({ preventScroll: true });
        }
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (navigationType === 'POP' && !location.hash) return undefined;
    applyRouteEntryHandoff(location.hash);
    const cleanup = stabilizePlanRouteEntry(location.hash);
    // `location` (not just `.hash`) is the dependency: a pathname-only
    // change between two hash-less routes must still re-run the handoff.
    const frame = resolveOrigin(state?.taskOriginKey)
      ? window.requestAnimationFrame(() => {
          const heading = document.querySelector<HTMLElement>('main h1');
          if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
          }
        })
      : 0;
    return () => {
      cleanup?.();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location, navigationType, resolveOrigin]);

  return null;
}
