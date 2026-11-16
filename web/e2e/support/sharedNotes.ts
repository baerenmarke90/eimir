import type { Route } from '@playwright/test';

/**
 * Unrelated journeys have no shared notes: Wir asks for the pinned ones and a
 * Plan asks for its linked ones (#1969). Journeys about notes install their own
 * handlers before this default.
 */
export async function fulfillNoSharedNotes(route: Route): Promise<boolean> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (request.method() !== 'GET') return false;
  if (/^\/api\/v1\/spaces\/[^/]+\/shared-notes$/.test(pathname)) {
    await route.fulfill({
      json: { items: [], nextCursor: null, hasMore: false },
      headers: { 'Cache-Control': 'private, no-store' },
    });
    return true;
  }
  if (/^\/api\/v1\/spaces\/[^/]+\/plans\/[^/]+\/notes$/.test(pathname)) {
    await route.fulfill({
      json: [],
      headers: { 'Cache-Control': 'private, no-store' },
    });
    return true;
  }
  return false;
}
