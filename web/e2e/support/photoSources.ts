import type { Route } from '@playwright/test';

/** Optional provider availability and empty canonical photo places in unrelated journeys.
 * Admit only these reads. Provider writes and every other unknown
 * request keep the owning fixture's strict failure behavior.
 */
export async function fulfillUnconfiguredPhotoSources(
  route: Route,
): Promise<boolean> {
  const request = route.request();
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/moments\/(memories|heart-moments)\/[^/]+\/places$/.test(
      new URL(request.url()).pathname,
    )
  ) {
    await route.fulfill({
      json: { items: [], nextCursor: null, hasMore: false },
    });
    return true;
  }
  if (
    request.method() !== 'GET' ||
    !/^\/api\/v1\/spaces\/[^/]+\/photo-sources$/.test(
      new URL(request.url()).pathname,
    )
  )
    return false;
  await route.fulfill({
    json: {
      enabled: false,
      googleAvailable: false,
      immichConnected: false,
      immichConnectionToken: 'fixture:immich:absent',
      immichOrigin: null,
      canImport: false,
    },
    headers: { 'Cache-Control': 'private, no-store' },
  });
  return true;
}
