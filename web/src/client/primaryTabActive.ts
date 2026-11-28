import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Whether the kept primary tab around a page is the one shown. The tab panels
 * provide it per tab, so a page re-renders only when its own tab is shown or
 * parked, never for another tab's navigation. Outside the tab panels (a page
 * rendered on its own) the page counts as shown.
 */
export const PrimaryTabActiveContext = createContext(true);

export function usePrimaryTabActive(): boolean {
  return useContext(PrimaryTabActiveContext);
}

/**
 * Calls `onReturn` each time the kept tab is shown again after it was parked.
 * A kept page does not mount again on return, so `refetchOnMount` never runs
 * for it; a read that must be current on return (#2345) asks for it here.
 */
export function usePrimaryTabReturn(onReturn: () => void): void {
  const active = usePrimaryTabActive();
  const wasActive = useRef(active);
  const latest = useRef(onReturn);
  latest.current = onReturn;
  useEffect(() => {
    if (active && !wasActive.current) latest.current();
    wasActive.current = active;
  }, [active]);
}
