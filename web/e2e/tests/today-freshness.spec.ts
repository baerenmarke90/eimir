import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigation from '../../src/i18n/locales/navigation';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PROFILE_ID = '00000000-0000-0000-0000-000000000020';
const PLAN_ID = '00000000-0000-0000-0000-000000000030';
const TEST_NOW = '2026-09-01T10:00:00Z';

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
}

test('Today supports app-wide pull refresh and still revalidates after plan rescheduling', async ({
  page,
}, testInfo) => {
  const unexpectedRequests: string[] = [];
  let dashboardRequestCount = 0;
  let isRescheduled = false;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'freshness-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'freshness-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({
        id: SPACE_ID,
        createdAt: TEST_NOW,
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben' },
        ],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: '"7"' },
        body: JSON.stringify({
          canManageSpaceConfiguration: true,
          dailyContextTimezone: null,
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'IMMEDIATE',
        }),
      });
      return;
    }

    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await fulfillJson({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: isPartner ? 'Ben' : 'Anna',
        id: isPartner ? '00000000-0000-0000-0000-000000000022' : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      dashboardRequestCount++;
      if (!isRescheduled) {
        // Initial state: Plan is scheduled later in October
        await fulfillJson({
          space: {
            spaceId: SPACE_ID,
            partner: { id: PARTNER_ID, displayName: 'Ben' },
          },
          relationshipDuration: {
            daysTogether: 250,
            startedOn: '2026-01-01',
          },
          retrospective: null,
          recentShared: [],
          upcoming: [
            {
              id: PLAN_ID,
              type: 'PLAN',
              titleOrText: 'Later October trip',
              scheduledAt: '2026-10-20T10:00:00Z',
              presentationRole: 'context',
            },
          ],
        });
      } else {
        // Updated state after rescheduling: Plan is scheduled earlier in September
        await fulfillJson({
          space: {
            spaceId: SPACE_ID,
            partner: { id: PARTNER_ID, displayName: 'Ben' },
          },
          relationshipDuration: {
            daysTogether: 250,
            startedOn: '2026-01-01',
          },
          retrospective: null,
          recentShared: [],
          upcoming: [
            {
              id: PLAN_ID,
              type: 'PLAN',
              titleOrText: 'Earlier September outing',
              scheduledAt: '2026-09-05T10:00:00Z',
              presentationRole: 'context',
            },
          ],
        });
      }
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}`
    ) {
      await fulfillJson({
        id: PLAN_ID,
        spaceId: SPACE_ID,
        title: isRescheduled
          ? 'Earlier September outing'
          : 'Later October trip',
        description: 'Shared planning',
        status: 'PLANNED',
        plannedStart: isRescheduled
          ? '2026-09-05T10:00:00Z'
          : '2026-10-20T10:00:00Z',
        plannedEnd: null,
        placeId: null,
        experiencedOn: null,
        sourceWishId: null,
        version: isRescheduled ? 2 : 1,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        updatedAt: TEST_NOW,
        capabilities: {
          canEdit: true,
          canDelete: true,
        },
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}/schedule`
    ) {
      isRescheduled = true;
      await fulfillJson({
        id: PLAN_ID,
        spaceId: SPACE_ID,
        title: 'Earlier September outing',
        description: 'Shared planning',
        status: 'PLANNED',
        plannedStart: '2026-09-05T10:00:00Z',
        plannedEnd: null,
        placeId: null,
        experiencedOn: null,
        sourceWishId: null,
        version: 2,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        updatedAt: TEST_NOW,
        capabilities: {
          canEdit: true,
          canDelete: true,
        },
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: 'The browser test did not define this API request.',
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => 1,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });

  // Step 1: Open /today and sign in
  await page.goto('/today');
  await signIn(page);

  // Assert initial dashboard renders later upcoming plan as primary context
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole('heading', {
      name: 'Anna & Ben',
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByText('Later October trip')).toBeVisible();
  expect(dashboardRequestCount).toBe(1);

  // Step 2: Pull-to-refresh is an app-level mobile interaction on Today.
  const refreshIndicator = page.locator('.app-pull-refresh-indicator');
  await expect(refreshIndicator).toHaveCount(1);
  await expect(page.locator('html')).toHaveClass(/app-pull-refresh-enabled/);
  await page.waitForTimeout(100);
  const requestsBeforePull = dashboardRequestCount;
  const browserRefreshSuppressed = await page.evaluate(() => {
    const dispatch = (type: string, y?: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        configurable: true,
        value: y === undefined ? [] : [{ clientX: 0, clientY: y }],
      });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    };
    dispatch('touchstart', 100);
    return dispatch('touchmove', 190);
  });
  expect(browserRefreshSuppressed).toBe(true);
  await expect(refreshIndicator).toHaveClass(/is-ready/);
  await page.screenshot({
    path: testInfo.outputPath('today-app-wide-pull-refresh-ready.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    const event = new Event('touchend', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'touches', {
      configurable: true,
      value: [],
    });
    document.dispatchEvent(event);
  });
  await expect.poll(() => dashboardRequestCount).toBe(requestsBeforePull + 1);

  // Step 3: Navigate to plan details via in-app UI click (NO page.reload())
  await page.getByRole('link', { name: /Later October trip/ }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN_ID}$`));
  await expect(
    page.getByRole('heading', {
      name: 'Later October trip',
      level: 1,
    }),
  ).toBeVisible();

  // Reschedule to an earlier timed date using the #838 date + optional-time contract.
  await page.getByText(m5s3.plan.actionsHeading).click();
  const dateInput = page.locator('#plan-schedule-date');
  const timeInput = page.locator('#plan-schedule-time');
  await expect(dateInput).toBeVisible();
  await expect(timeInput).toBeVisible();
  await dateInput.fill('2026-09-05');
  await timeInput.fill('10:00');

  // Submit the reschedule form and wait for the response
  const rescheduleButton = page.getByRole('button', {
    name: m5s3.plan.reschedule,
  });
  await rescheduleButton.click();
  await expect(rescheduleButton).toBeEnabled();

  // Step 4: Navigate back to Wir via client-side link (NO page.reload())
  await page.getByRole('link', { name: navigation.today }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Step 5: Verify Dashboard query was automatically refetched after route re-entry.
  await expect.poll(() => dashboardRequestCount).toBeGreaterThanOrEqual(2);

  // Step 6: Verify the rescheduled item is now visible in the Shared Planning
  // Horizon agenda, and the stale title is gone
  await expect(page.getByText('Earlier September outing')).toBeVisible();
  await expect(page.getByText('Later October trip')).toHaveCount(0);

  // Step 7: Verify no unexpected network requests occurred
  expect(unexpectedRequests).toEqual([]);
});
