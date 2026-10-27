import type { Route } from '@playwright/test';

/** Empty canonical context in journeys without linked places; writes remain strict. */
export async function fulfillEmptyMomentPlaces(route: Route): Promise<boolean> {
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
  return false;
}

/** Optional provider availability in unrelated journeys; every other read/write stays strict. */
export async function fulfillUnconfiguredPhotoSources(
  route: Route,
): Promise<boolean> {
  if (await fulfillEmptyMomentPlaces(route)) return true;
  const request = route.request();
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
