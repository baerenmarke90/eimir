import { useEffect, useState } from 'react';

/** Root tabs whose opening rise has already played in this page load. */
const played = new Set<string>();

const INTRO_WINDOW_MS = 1400;

/**
 * Whether a root tab should play its short opening rise.
 *
 * True only for the first time the tab is shown after the app loads, and only
 * long enough for the sequence to finish, so returning to a tab is immediate.
 */
export function useRootTabIntro(tab: string): boolean {
  const [intro, setIntro] = useState(() => !played.has(tab));
  useEffect(() => {
    if (!intro) return;
    played.add(tab);
    const timer = window.setTimeout(() => setIntro(false), INTRO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [intro, tab]);
  return intro;
}
