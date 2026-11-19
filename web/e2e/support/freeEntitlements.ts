import type { Route } from '@playwright/test';

/** The exact Free Space read used by feature marks; all writes/other IDs stay strict. */
export async function fulfillFreeEntitlements(
  route: Route,
  spaceId: string,
): Promise<boolean> {
  const request = route.request();
  if (
    request.method() !== 'GET' ||
    new URL(request.url()).pathname !== `/api/v1/spaces/${spaceId}/entitlements`
  )
    return false;
  await route.fulfill({
    json: {
      spaceId,
      tier: 'FREE',
      status: 'ACTIVE',
      effectiveUntil: null,
      isInGracePeriod: false,
      capabilities: ['core'],
    },
  });
  return true;
}
