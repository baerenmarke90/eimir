export interface SnackbarEventDetail {
  /**
   * A monotonic id, not the message text: the exact same confirmation
   * posted twice in a row (e.g. switching Spaces twice) must still show
   * twice, and a listener keyed on text alone would not see a change to
   * react to.
   */
  id: number;
  messageKey: string;
  messageOptions?: Record<string, unknown>;
}

export const SNACKBAR_EVENT = 'eimir:snackbar';

let nextSnackbarId = 1;

/**
 * Posts a brief, non-critical confirmation
 * (`docs/COMPONENT-CONTRACTS.md` §9.2) to whichever `AppShell` is mounted,
 * via a `window` `CustomEvent` — the same decoupled pattern
 * `productReadCache.ts` already uses for its fallback/network events, so a
 * Snackbar can be triggered from any mutation's `onSuccess` without prop
 * drilling a callback through the component tree down to whichever screen
 * happens to be rendered when the action completes.
 */
export function postSnackbar(
  messageKey: string,
  messageOptions?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined')
    return;
  window.dispatchEvent(
    new CustomEvent<SnackbarEventDetail>(SNACKBAR_EVENT, {
      detail: { id: nextSnackbarId++, messageKey, messageOptions },
    }),
  );
}
