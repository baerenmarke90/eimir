let smoothEntryRequested = false;

/**
 * The bottom bar calls this just before it reselects the page already shown.
 * The next route entry then glides to the top instead of jumping. It is a
 * one-shot request rather than navigation state because state set on a
 * location is carried over by in-page navigations (story view tabs, Planning
 * segments), which are not a reselection.
 */
export function requestSmoothRouteEntry(): void {
  smoothEntryRequested = true;
}

/** Reads and clears the pending request from `requestSmoothRouteEntry`. */
export function takeSmoothRouteEntry(): boolean {
  const requested = smoothEntryRequested;
  smoothEntryRequested = false;
  return requested;
}

const GLIDE_INTENTS = ['wheel', 'touchstart', 'keydown'] as const;
let stopGlide: (() => void) | undefined;

/**
 * Eases the page back to its top frame by frame. The browser's own smooth
 * scroll depends on compositor animation and is cancelled by any other
 * scroll, so the glide is driven here: it always finishes at the top unless
 * the person starts scrolling, or the next route entry begins.
 */
function glideToTop(): void {
  stopGlide?.();
  const from = window.scrollY;
  if (from <= 0) {
    window.scrollTo(0, 0);
    return;
  }
  const duration = Math.min(700, 280 + from * 0.25);
  let start = -1;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of GLIDE_INTENTS) window.removeEventListener(type, stop);
    if (stopGlide === stop) stopGlide = undefined;
  };
  const step = (now: number) => {
    if (start < 0) start = now;
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, from * (1 - progress) ** 3);
    if (progress < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  for (const type of GLIDE_INTENTS)
    window.addEventListener(type, stop, { passive: true });
  stopGlide = stop;
  frame = requestAnimationFrame(step);
}

/**
 * Single shared destination handoff applied on every client-side route
 * entry (Quick Create targets, in-app links, and direct navigation alike):
 *
 * - if the new URL carries a hash that matches an existing element, any
 *   ancestor `<details>` disclosure is opened and the anchor is scrolled
 *   into view (used by the Wish/Plan inline composers on `/plan`);
 * - otherwise the freshly mounted page is scrolled to its top, since
 *   client-side navigation does not reset scroll position on its own and
 *   the previous page's offset would otherwise carry over.
 *
 * This never moves focus: per the #810 Quick Create product contract,
 * choosing a destination must reveal the right create composition without
 * forcing an unrelated focus target or the on-screen keyboard.
 */
export function applyRouteEntryHandoff(
  hash: string,
  { smooth = false }: { smooth?: boolean } = {},
): void {
  stopGlide?.();
  const targetId = hash.replace(/^#/, '');
  if (!targetId) {
    // Reselecting the page already shown glides back to its start instead of
    // jumping; reduced motion keeps the immediate jump.
    if (
      smooth &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      glideToTop();
    else window.scrollTo(0, 0);
    return;
  }

  const target = document.getElementById(targetId);
  if (!target) return;

  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }

  target.scrollIntoView({ block: 'start' });
}
