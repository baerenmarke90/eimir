import { type RefObject, useEffect, useState } from 'react';
import { cssDurationMilliseconds } from './cssDuration';

/** The semantic token for how long ambient motion may play while seen. */
const REST_TOKEN = '--duration-ambient-rest';

function restBudget(): number {
  return cssDurationMilliseconds(
    getComputedStyle(document.documentElement).getPropertyValue(REST_TOKEN),
  );
}

/**
 * Whether a decorative, ambient scene should rest (#2063): it plays only
 * while it is on screen, and only for a short visible time in total
 * (`motion.duration.ambientRest`). Offscreen it rests, so an idle page stops
 * rendering for motion nobody can see; once the time is used up it stays at
 * rest where it is. Callers pause their animations in place while resting,
 * which never makes a part jump.
 *
 * Without IntersectionObserver the scene counts as seen.
 */
export function useAmbientRest(
  ref: RefObject<Element | null>,
  enabled: boolean,
): boolean {
  const [resting, setResting] = useState(true);
  useEffect(() => {
    if (!enabled) {
      setResting(true);
      return;
    }
    const node = ref.current;
    const budget = restBudget();
    if (!node || budget <= 0) {
      setResting(true);
      return;
    }
    let spent = 0;
    let since: number | null = null;
    let timer: number | undefined;
    const stop = () => {
      if (since !== null) spent += performance.now() - since;
      since = null;
      window.clearTimeout(timer);
      setResting(true);
    };
    const play = () => {
      if (since !== null || spent >= budget) return;
      since = performance.now();
      setResting(false);
      timer = window.setTimeout(() => {
        stop();
        observer?.disconnect();
      }, budget - spent);
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const seen = entries.some((entry) => entry.isIntersecting);
            if (seen) play();
            else stop();
          });
    if (observer) observer.observe(node);
    else play();
    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [ref, enabled]);
  return resting;
}
