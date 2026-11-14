import type { PartnerTone } from '../client/sharedListSummary';

/** Marks the place where checked entries end up: the cart bar or the cart section. */
export const CART_TARGET_ATTRIBUTE = 'data-cart-target';

const FALLBACK_DURATION_MS = 280;
/** The flight is a little longer than a context change, but still short. */
const DURATION_FACTOR = 1.5;

function tokenMilliseconds(name: string): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return FALLBACK_DURATION_MS;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return FALLBACK_DURATION_MS;
  return raw.endsWith('ms') ? value : value * 1000;
}

function visibleTarget(): DOMRect | null {
  for (const element of document.querySelectorAll(
    `[${CART_TARGET_ATTRIBUTE}]`,
  )) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

export interface CartFlight {
  /** Where the entry was before it moved. */
  from: DOMRect;
  label: string;
  tone: PartnerTone;
}

/**
 * Let a checked entry fly from its row into the cart (#1808).
 *
 * Returns `true` when the flight started or is not wanted (reduced motion, no
 * animation support), so the caller can drop it, and `false` while the cart is
 * not on screen yet, so the caller can try again after the next render. The
 * flying copy is decoration: hidden from assistive technology, never takes
 * pointer events, and removes itself when it ends. The motion token is 0 ms
 * under reduced motion, which is how the app switches motion off.
 */
export function flyIntoCart({ from, label, tone }: CartFlight): boolean {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const duration = tokenMilliseconds('--duration-context') * DURATION_FACTOR;
  if (reduced?.matches || duration <= 0) return true;
  if (typeof document.body.animate !== 'function') return true;
  const target = visibleTarget();
  if (!target) return false;

  const ghost = document.createElement('div');
  ghost.className = `shared-list-flight shared-list-flight-${tone}`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = label;
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    inlineSize: `${Math.max(from.width, 0)}px`,
    blockSize: `${Math.max(from.height, 0)}px`,
  });
  document.body.append(ghost);

  // Toward the middle of the cart, kept inside the screen.
  const targetX = target.left + target.width / 2;
  const targetY = Math.min(
    Math.max(target.top + Math.min(target.height, 56) / 2, 0),
    window.innerHeight,
  );
  const dx = targetX - (from.left + from.width / 2);
  const dy = targetY - (from.top + from.height / 2);
  const flight = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.15 },
    ],
    {
      duration,
      easing:
        getComputedStyle(document.documentElement)
          .getPropertyValue('--easing-enter')
          .trim() || 'ease-out',
      fill: 'forwards',
    },
  );
  const remove = () => ghost.remove();
  flight.addEventListener('finish', remove);
  flight.addEventListener('cancel', remove);
  return true;
}
