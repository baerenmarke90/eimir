import type { Route } from '@playwright/test';

/**
 * #1907 F2: Story surfaces read the couple's occasions (important dates and
 * both partners' profile birthdays) to mark moments. Unrelated journeys have
 * none. Call this as the last handler before a strict unexpected-request
 * fallback, so journeys that mock these reads explicitly keep their own data.
 */
export async function fulfillNoOccasionSources(route: Route): Promise<boolean> {
  const request = route.request();
  if (request.method() !== 'GET') return false;
  const pathname = new URL(request.url()).pathname;
  if (/^\/api\/v1\/spaces\/[^/]+\/important-dates$/.test(pathname)) {
    await route.fulfill({ json: [] });
    return true;
  }
  const profile = pathname.match(
    /^\/api\/v1\/spaces\/[^/]+\/profiles\/([^/]+)$/,
  );
  if (profile) {
    await route.fulfill({
      json: {
        accountId: profile[1],
        displayName: '',
        birthday: null,
        id: `profile-${profile[1]}`,
        preferences: [],
        profileAttachmentId: null,
        createdAt: '2023-06-17T00:00:00Z',
        updatedAt: '2023-06-17T00:00:00Z',
        version: 1,
      },
    });
    return true;
  }
  return false;
}
