import { createContext, useContext } from 'react';

const nothingToTell = () => {};

/**
 * Set by the tab panels around a page that is prepared before its first
 * visit (#2063). The page calls it once it has drawn what it is prepared for
 * (a map's first complete view, or nothing to draw); the panel then rests
 * with its contents skipped until it is visited.
 */
export const PrimaryTabPreparedContext = createContext<(() => void) | null>(
  null,
);

/** A stable callback; it does nothing outside a preparation. */
export function usePrimaryTabPrepared(): () => void {
  return useContext(PrimaryTabPreparedContext) ?? nothingToTell;
}
