/**
 * Brings the garden's flight band into view before a send flight (#2158 G).
 *
 * The send card sits below the garden, so a seed or bouquet used to fly at
 * the top of the page while the person looked at the card. The Motion
 * Contract lets a one-shot motion play only where it is seen (M12): the page
 * therefore scrolls the band smoothly into view first, waits until the
 * scroll has settled and only then starts the flight. When the band is
 * already in view nothing moves. If the person scrolls away meanwhile, the
 * flight is skipped and the result simply appears (`false`).
 *
 * The wait is a safety cap, not a motion duration: the browser chooses the
 * length of a smooth scroll, and `scrollend` is missing on older WebViews.
 */
import { isVisibleNow } from '../motion/visibility';

const SETTLE_CAP_MS = 1000;
const STABLE_FRAMES = 3;

/** True when the whole element is inside the viewport. */
export function fullyInView(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  // Layout-free environments report an empty box; treat it as shown.
  if (rect.width === 0 && rect.height === 0) return true;
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

function settled(element: Element): Promise<void> {
  return new Promise((resolve) => {
    let last = Number.NaN;
    let stable = 0;
    let frame = 0;
    const finish = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(cap);
      window.removeEventListener('scrollend', finish);
      resolve();
    };
    const cap = window.setTimeout(finish, SETTLE_CAP_MS);
    window.addEventListener('scrollend', finish, { once: true });
    const check = () => {
      const top = element.getBoundingClientRect().top;
      stable = top === last ? stable + 1 : 0;
      last = top;
      if (stable >= STABLE_FRAMES) finish();
      else frame = window.requestAnimationFrame(check);
    };
    frame = window.requestAnimationFrame(check);
  });
}

/**
 * Scrolls the band into view when it is not, and resolves once a flight
 * there would be seen. Never call it with reduced motion: there is no
 * flight then, and the result appears in place.
 */
export async function revealFlightBand(
  band: HTMLElement | null,
): Promise<boolean> {
  if (!band) return false;
  if (fullyInView(band)) return isVisibleNow(band).visible;
  band.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  await settled(band);
  return isVisibleNow(band).visible;
}

/**
 * With reduced motion the result appears in place: move only as far as
 * needed to show the status line, without animation.
 */
export function showResultStatus(status: HTMLElement | null): void {
  if (!status || fullyInView(status)) return;
  status.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
}
