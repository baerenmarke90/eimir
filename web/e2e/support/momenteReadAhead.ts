import type { Route } from '@playwright/test';

/**
 * #2320: the native app reads Momente › Erinnerungen ahead on the tabs beside
 * Momente (Wir, Planen), so a first swipe there finds its data. Journeys that
 * pass Wir without opening Momente answer that read with an empty selection.
 * Call this as the last handler before a strict unexpected-request fallback,
 * so journeys that mock Momente explicitly keep their own data.
 */
export async function fulfillMomenteReadAhead(route: Route): Promise<boolean> {
  const request = route.request();
  if (request.method() !== 'GET') return false;
  const pathname = new URL(request.url()).pathname;
  if (!/^\/api\/v1\/spaces\/[^/]+\/discover$/.test(pathname)) return false;
  await route.fulfill({
    json: {
      selectionDate: '2026-09-01',
      lead: null,
      items: [],
      leadContext: null,
    },
  });
  return true;
}
