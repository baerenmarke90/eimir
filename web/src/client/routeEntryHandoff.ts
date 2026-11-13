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
  const targetId = hash.replace(/^#/, '');
  if (!targetId) {
    // Reselecting the page already shown glides back to its start instead of
    // jumping; reduced motion keeps the immediate jump.
    if (
      smooth &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
