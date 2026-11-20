import { type RefObject, useEffect, useState } from 'react';
import { durationMs } from './tokens';
import { observeVisibility } from './visibility';

/**
 * Whether a decorative, ambient scene should rest (Motion Contract M8;
 * #2063, moved into the motion layer by #2079): it plays only while it is
 * seen, and only for a short visible time in total
 * (`motion.duration.ambientRest`, `--duration-ambient-rest`). It rests while
 * it is off screen, while the page or its kept view is hidden, and for good
 * once the time is used up, so an idle page stops rendering for motion
 * nobody can see. Callers pause their animations in place while resting,
 * which never makes a part jump.
 *
 * The budget is read through the token adapter (M1), so it is `0` and the
 * scene rests with reduced motion. Without IntersectionObserver the scene
 * counts as on screen.
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
    const budget = durationMs('ambient-rest');
    if (!node || budget <= 0) {
      setResting(true);
      return;
    }
    let spent = 0;
    let since: number | null = null;
    let timer: number | undefined;
    // On screen comes from the observer below; page and kept view from the
    // layer's visibility controller.
    let onScreen = typeof IntersectionObserver === 'undefined';
    let shown = true;
    let done = false;
    const stop = () => {
      if (since !== null) spent += performance.now() - since;
      since = null;
      window.clearTimeout(timer);
      setResting(true);
    };
    const play = () => {
      if (done || since !== null || spent >= budget) return;
      since = performance.now();
      setResting(false);
      timer = window.setTimeout(() => {
        stop();
        done = true;
        cleanup();
      }, budget - spent);
    };
    const update = () => {
      if (onScreen && shown) play();
      else stop();
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            update();
          });
    observer?.observe(node);
    const unsubscribe = observeVisibility(
      node,
      (state) => {
        shown = state.page && state.keptView;
        update();
      },
      { onScreen: false },
    );
    function cleanup() {
      observer?.disconnect();
      unsubscribe();
    }
    return () => {
      cleanup();
      window.clearTimeout(timer);
    };
  }, [ref, enabled]);
  return resting;
}
