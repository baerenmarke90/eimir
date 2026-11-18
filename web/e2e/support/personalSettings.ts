import type { Route } from '@playwright/test';

const ACCOUNT_KEYS = ['theme', 'diaryLayout', 'gardenSound', 'gardenVibration'];
const SPACE_KEYS = ['occasionHolidays', 'wirStatistics'];

function emptyDocument(keys: readonly string[]) {
  return {
    ...Object.fromEntries(keys.map((key) => [key, null])),
    schemaVersion: 1,
    version: 0,
  };
}

/**
 * Shell bootstrap: the signed-in person's own settings documents (Product
 * Owner request 2026-11-18). Unrelated journeys start without saved choices,
 * so the device's own values apply; a write of allowlisted keys (for example
 * a journey that picks the dark theme) is answered statelessly. Any other key
 * still fails the journey.
 */
export async function fulfillDefaultPersonalSettings(
  route: Route,
): Promise<boolean> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  const keys =
    pathname === '/api/v1/account/personal-settings'
      ? ACCOUNT_KEYS
      : /^\/api\/v1\/spaces\/[^/]+\/personal-settings$/.test(pathname)
        ? SPACE_KEYS
        : null;
  if (!keys) return false;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.method() === 'GET') {
    await route.fulfill({
      json: emptyDocument(keys),
      headers: { ...headers, ETag: '"fixture-personal-settings:absent"' },
    });
    return true;
  }
  if (request.method() !== 'PATCH') return false;
  const body = request.postDataJSON() as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key)))
    throw new Error('Unexpected personal setting');
  await route.fulfill({
    json: { ...emptyDocument(keys), ...body, version: 1 },
    headers: { ...headers, ETag: '"fixture-personal-settings:1"' },
  });
  return true;
}
