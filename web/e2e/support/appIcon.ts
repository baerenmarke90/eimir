import type { Route } from '@playwright/test';
import { fulfillDefaultProductContext } from './productContext';

/** Default shell preference in journeys that do not exercise icon selection.
 * This admits only the new GET; writes and all other unknown requests retain
 * each fixture's existing strict failure behavior.
 */
export async function fulfillDefaultAppIcon(route: Route): Promise<boolean> {
  const request = route.request();
  if (await fulfillDefaultProductContext(route)) return true;
  if (
    request.method() !== 'GET' ||
    !/^\/api\/v1\/spaces\/[^/]+\/appearance\/(app-icon|wir-design)$/.test(
      new URL(request.url()).pathname,
    )
  )
    return false;
  await route.fulfill({
    json: request.url().endsWith('/wir-design')
      ? { designId: 'warm', version: 0 }
      : { iconId: 'original', version: 0 },
    headers: {
      ETag: '"fixture-original:absent"',
      'Cache-Control': 'private, no-store',
    },
  });
  return true;
}
