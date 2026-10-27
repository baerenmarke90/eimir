import type { Route } from '@playwright/test';

/** The optional provider service is unconfigured in unrelated diary journeys.
 * Admit only its availability GET. Provider writes and every other unknown
 * request keep the owning fixture's strict failure behavior.
 */
export async function fulfillUnconfiguredPhotoSources(
  route: Route,
): Promise<boolean> {
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
