import type { Route } from '@playwright/test';

/**
 * #2345: opening a game page marks that game's notices read
 * (`POST /spaces/{id}/games/{surface}/notices/read`, 204). Journeys that do
 * not assert it answer it here, before their strict write and
 * unexpected-request accounting; `opened` collects the surfaces when a journey
 * wants to check them.
 */
export async function fulfillGameNoticesRead(
  route: Route,
  opened?: string[],
): Promise<boolean> {
  const request = route.request();
  if (request.method() !== 'POST') return false;
  const match = new URL(request.url()).pathname.match(
    /^\/api\/v1\/spaces\/[^/]+\/games\/([A-Z_]+)\/notices\/read$/,
  );
  if (!match) return false;
  opened?.push(match[1]);
  await route.fulfill({ status: 204, body: '' });
  return true;
}
