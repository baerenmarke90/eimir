import type { Route } from '@playwright/test';
import { fulfillNoSharedNotes } from './sharedNotes';

/** Unrelated Plan journeys have no comments or linked lists unless explicitly arranged. */
export async function fulfillEmptyPlanComments(route: Route): Promise<boolean> {
  // Wir and Plans also ask for shared notes (#1969); unrelated journeys have none.
  if (await fulfillNoSharedNotes(route)) return true;
  if (
    route.request().method() !== 'GET' ||
    !/^\/api\/v1\/spaces\/[^/]+\/plans\/[^/]+\/(comments|collections)$/.test(
      new URL(route.request().url()).pathname,
    )
  )
    return false;
  await route.fulfill({
    json: new URL(route.request().url()).pathname.endsWith('/collections')
      ? []
      : { items: [], hasMore: false, nextCursor: null },
  });
  return true;
}
