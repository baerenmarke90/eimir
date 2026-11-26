import { createContext, useContext } from 'react';

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
