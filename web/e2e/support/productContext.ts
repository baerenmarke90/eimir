import type { Route } from '@playwright/test';

/** Narrow defaults for unrelated journeys; feature journeys override them explicitly. */
export async function fulfillDefaultProductContext(
  route: Route,
): Promise<boolean> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  // An unrelated journey starts without pending one-time messages. Feature
  // journeys install their explicit encrypted-message contract before this fallback.
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/once-messages$/.test(pathname)
  ) {
    await route.fulfill({
      json: { items: [] },
      headers: { 'Cache-Control': 'private, no-store' },
    });
    return true;
  }
  // Explicit shell/bootstrap additions only. Dedicated acceptance journeys
  // intercept these before this default; arbitrary writes remain unexpected.
  if (
    request.method() === 'PUT' &&
    pathname === '/api/v1/account/device-context'
  ) {
    const body = request.postDataJSON() as {
      timezone: string;
      spaceId: string;
    };
    if (
      !body.timezone ||
      !body.spaceId ||
      Object.keys(body).some((key) => !['timezone', 'spaceId'].includes(key))
    )
      throw new Error('Unexpected device context');
    await route.fulfill({
      json: { timezone: body.timezone, sharedDayPending: false },
      headers: { 'Cache-Control': 'private, no-store' },
    });
    return true;
  }
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/context-tag-suggestions$/.test(pathname)
  ) {
    await route.fulfill({ json: { learned: [], proposed: [] } });
    return true;
  }
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/memories\/[^/]+\/(plans|wishes)$/.test(pathname)
  ) {
    await route.fulfill({ json: { items: [] } });
    return true;
  }
  return false;
}
