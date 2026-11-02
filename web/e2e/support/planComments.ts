import type { Route } from '@playwright/test';

/** Existing Plan journeys now read the typed discussion collection as well. */
export async function fulfillEmptyPlanComments(route: Route): Promise<boolean> {
  if (
    route.request().method() !== 'GET' ||
    !/^\/api\/v1\/spaces\/[^/]+\/plans\/[^/]+\/comments$/.test(
      new URL(route.request().url()).pathname,
    )
  )
    return false;
  await route.fulfill({
    json: { items: [], hasMore: false, nextCursor: null },
  });
  return true;
}
