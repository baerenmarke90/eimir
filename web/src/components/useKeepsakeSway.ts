import { type RefCallback, useEffect, useState } from 'react';
import { ambient } from '../motion/ambient';
import { durationMs } from '../motion/tokens';

/** How far a hung keepsake sways to each side of its rest pose. */
export const KEEPSAKE_SWAY_DEGREES = 1;

/** The rest pose from the keepsake's `--keepsake-rest` (CSS), in degrees. */
export function keepsakeRest(element: Element): number {
  const value = getComputedStyle(element)
    .getPropertyValue('--keepsake-rest')
    .trim();
  const degrees = Number.parseFloat(value);
  return Number.isFinite(degrees) ? degrees : 0;
}

/** One sway cycle that starts and ends in the rest pose. */
export function keepsakeSwayKeyframes(rest: number): Keyframe[] {
  return [
    rest,
    rest - KEEPSAKE_SWAY_DEGREES,
    rest + KEEPSAKE_SWAY_DEGREES,
    rest,
  ].map((degrees) => ({ rotate: `${Math.round(degrees * 1000) / 1000}deg` }));
}

/**
 * The gentle sway of a hung Polaroid after it swung in (Ambient `sway`,
 * Motion Contract 4.5, #2063). It starts when the swing-in ended
 * (`--duration-gesture-sequence` after mount), runs the finite ambient
 * repeat, pauses while the page, its kept tab or the card is hidden and
 * continues where it paused (M4, M8), and is absent with reduced motion.
 */
export function useKeepsakeSway<T extends Element>(
  enabled: boolean,
): RefCallback<T> {
  const [element, setElement] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled || !element) return undefined;
    const handle = ambient(element, {
      kind: 'sway',
      keyframes: keepsakeSwayKeyframes(keepsakeRest(element)),
      duration: 'connection-travel-far',
      delay: durationMs('gesture-sequence'),
    });
    return handle.stop;
  }, [enabled, element]);
  return setElement;
}
