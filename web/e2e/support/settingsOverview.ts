import type { Route } from '@playwright/test';

/**
 * The Settings overview reads one status line per row from data its owning
 * pages already use. Journeys that only pass through the overview answer those
 * reads with a quiet default; journeys of the owning pages install their own.
 */
export async function fulfillSettingsOverviewStatuses(
  route: Route,
  spaceId: string,
): Promise<boolean> {
  const request = route.request();
  if (request.method() !== 'GET') return false;
  const pathname = new URL(request.url()).pathname;
  const base = `/api/v1/spaces/${spaceId}`;
  if (pathname === `${base}/calendar-sync`) {
    await route.fulfill({
      json: {
        available: false,
        canSync: false,
        connections: [],
        services: [],
        target: null,
        targetToken: 'calendar-target-token',
      },
    });
    return true;
  }
  if (pathname === '/api/v1/auth/sign-in-methods') {
    await route.fulfill({
      json: { emailLink: true, localPassword: false, oidc: [], passkeys: [] },
    });
    return true;
  }
  if (pathname === '/api/v1/notification-preferences') {
    await route.fulfill({
      json: {
        catalogVersion: 2,
        quietHours: {
          enabled: false,
          start: null,
          end: null,
          timeZone: 'Europe/Berlin',
        },
        capabilities: [],
        items: [],
      },
    });
    return true;
  }
  if (pathname === `${base}/configuration`) {
    await route.fulfill({
      headers: { ETag: '"overview-default"' },
      json: {
        canManageSpaceConfiguration: false,
        dailyContextTimezone: null,
        dailyQuestionsEnabled: false,
        energyCheckInEnabled: false,
        energyVisibilityMode: 'IMMEDIATE',
        loveNotesEnabled: false,
        sharedAchievementsEnabled: false,
        spaceId,
        supportGesturesEnabled: false,
        version: 1,
        vibeCheckEnabled: false,
        vibeVisibilityMode: 'IMMEDIATE',
      },
    });
    return true;
  }
  return false;
}
