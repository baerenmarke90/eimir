import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const WISH_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-01T10:00:00Z';

const PLAN_TITLE = 'Picnic in the park';
const WISH_TITLE = 'Weekend trip to Lisbon';
const PLAN_START = '2099-09-14T14:00:00Z';

function localTime(value: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type MockOptions = {
  plansFail?: boolean;
  plansDelayMs?: number;
  plannedEnd?: string | null;
  onSchedule?: (body: Record<string, unknown>) => void;
};

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<void> {
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
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'planning-reference-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'planning-reference-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
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
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({
        hasMore: false,
        nextCursor: null,
        items: [
          {
            capabilities: { canComment: true, canDelete: true, canEdit: true },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Lea' },
            id: WISH_ID,
            spaceId: SPACE_ID,
            status: 'OPEN',
            title: WISH_TITLE,
            updatedAt: TEST_NOW,
            version: 1,
          },
        ],
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      if (options.plansDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.plansDelayMs),
        );
      }
      if (options.plansFail) {
        await fulfillJson(
          {
            code: 'E2E_FORCED_FAILURE',
            detail: 'Forced Plan listing failure for the loading/error test.',
            status: 500,
            title: 'Forced failure',
          },
          500,
        );
        return;
      }
      const requestedStatus = new URL(request.url()).searchParams.get('status');
      const items =
        requestedStatus === 'PLANNED'
          ? [
              {
                capabilities: {
                  canComment: true,
                  canDelete: true,
                  canEdit: true,
                },
                createdAt: TEST_NOW,
                createdBy: ACCOUNT_ID,
                creator: { id: ACCOUNT_ID, displayName: 'Ben' },
                description: 'Nice weather, remember the sunscreen.',
                experiencedOn: null,
                id: PLAN_ID,
                placeId: null,
                plannedEnd: options.plannedEnd ?? null,
                plannedStart: PLAN_START,
                sourceWishId: null,
                spaceId: SPACE_ID,
                status: 'PLANNED',
                title: PLAN_TITLE,
                updatedAt: TEST_NOW,
                version: 1,
              },
            ]
          : [];
      await fulfillJson({ hasMore: false, nextCursor: null, items });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, nextCursor: null, items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}`
    ) {
      await fulfillJson({
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Ben' },
        description: 'Nice weather, remember the sunscreen.',
        experiencedOn: null,
        id: PLAN_ID,
        placeId: null,
        plannedEnd: options.plannedEnd ?? null,
        plannedStart: PLAN_START,
        sourceWishId: null,
        spaceId: SPACE_ID,
        status: 'PLANNED',
        title: PLAN_TITLE,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}/schedule`
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      options.onSchedule?.(body);
      await fulfillJson({
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Ben' },
        description: 'Nice weather, remember the sunscreen.',
        experiencedOn: null,
        id: PLAN_ID,
        placeId: null,
        plannedEnd: body.plannedEnd ?? null,
        plannedStart: body.plannedStart ?? null,
        sourceWishId: null,
        spaceId: SPACE_ID,
        status: 'PLANNED',
        title: PLAN_TITLE,
        updatedAt: TEST_NOW,
        version: 2,
      });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `planning-reference test does not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await captureR3Evidence(page, testInfo, `r3-plan-detail-range-${name}.png`);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('ArrowLeft/ArrowRight moves focus and selection between the Plans and Wishes tabs', async ({
  page,
}) => {
  await installMocks(page);
  await signIn(page);
  await page.goto('/plan');

  const plansTab = page.getByRole('tab', { name: m5s3.overview.segmentPlans });
  const wishesTab = page.getByRole('tab', {
    name: m5s3.overview.segmentWishes,
  });
  await plansTab.focus();
  await expect(plansTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(PLAN_TITLE)).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(wishesTab).toHaveAttribute('aria-selected', 'true');
  await expect(wishesTab).toBeFocused();
  await expect(page.getByText(WISH_TITLE)).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(plansTab).toHaveAttribute('aria-selected', 'true');
  await expect(plansTab).toBeFocused();
  await expect(page.getByText(PLAN_TITLE)).toBeVisible();
});

test('clicking the focal Plan navigates from the Planning overview to the read-first detail page', async ({
  page,
}) => {
  await installMocks(page);
  await signIn(page);
  await page.goto('/plan');

  await page.getByRole('tab', { name: m5s3.overview.segmentPlans }).click();
  await page.locator('.planen-next-link').click();

  await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN_ID}$`));
  await expect(
    page.getByRole('heading', { name: PLAN_TITLE, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: taskBoundary.back }),
  ).toBeVisible();
});

test('shows the loading state while Plans are in flight, then the error state on failure, with a working retry', async ({
  page,
}) => {
  let plansCallCount = 0;
  await installMocks(page, { plansFail: true, plansDelayMs: 2000 });
  // Registered after installMocks, so this handler runs first (Playwright
  // checks the most-recently-registered route handler first) and can count
  // the request before falling back to the mock above for the actual response.
  await page.route('**/api/v1/**', async (route, request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans`
    ) {
      plansCallCount += 1;
    }
    await route.fallback();
  });
  await signIn(page);
  await page.goto('/plan');
  await page.getByRole('tab', { name: m5s3.overview.segmentPlans }).click();

  await expect(page.getByText(de.states.loading.title)).toBeVisible();
  await expect(page.getByRole('button', { name: /erneut/i })).toBeVisible({
    timeout: 10_000,
  });
  expect(plansCallCount).toBeGreaterThan(0);
});

test('end time is progressive, blocks an invalid range, and submits the same-day end without a second date', async ({
  page,
}) => {
  let scheduleBody: Record<string, unknown> | null = null;
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, {
    onSchedule: (body) => {
      scheduleBody = body;
    },
  });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);
  await page.getByText(m5s3.plan.actionsHeading).click();

  const disclosure = page.getByRole('button', { name: m5s3.plan.addEndTime });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel(m5s3.plan.endTime)).toBeHidden();

  await disclosure.click();
  const endTime = page.getByLabel(m5s3.plan.endTime);
  await expect(endTime).toBeVisible();
  await endTime.fill('13:30');
  await expect(page.getByText(m5s3.plan.endMustFollowStart)).toBeVisible();
  await page.getByRole('button', { name: m5s3.plan.reschedule }).click();
  expect(scheduleBody).toBeNull();

  await endTime.fill('16:30');
  await page.getByRole('button', { name: m5s3.plan.reschedule }).click();
  await expect.poll(() => scheduleBody).not.toBeNull();
  expect(scheduleBody).toMatchObject({
    plannedStart: '2099-09-14T14:00:00.000Z',
    plannedEnd: new Date('2099-09-14T16:30').toISOString(),
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`timed Plan range is readable at 390x844 in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, { plannedEnd: '2099-09-14T16:30:00Z' });
    await signIn(page);
    await page.goto(`/plan/plans/${PLAN_ID}`);

    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    const range = new RegExp(
      `${escapeRegex(localTime(PLAN_START))}–${escapeRegex(
        localTime('2099-09-14T16:30:00Z'),
      )}`,
    );
    await expect(page.getByText(range)).toBeVisible();
    await expect(page.getByLabel(m5s3.plan.endTime)).toBeHidden();
    await expectNoHorizontalOverflow(page);

    const result = await new AxeBuilder({ page })
      .withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22a',
        'wcag22aa',
      ])
      .analyze();
    expect(result.violations).toEqual([]);
    await capture(page, testInfo, `390-${colorScheme}`);
  });
}

test('cross-day Plan range reflows at 320px and keeps the same hierarchy when expanded', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await installMocks(page, { plannedEnd: '2099-09-15T01:15:00Z' });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);

  const crossDayRange = new RegExp(
    `${escapeRegex(localTime(PLAN_START))}.*${escapeRegex(
      localTime('2099-09-15T01:15:00Z'),
    )}`,
  );
  await expect(page.getByText(crossDayRange)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, '320-cross-day-light');

  await page.getByText(m5s3.plan.actionsHeading).click();
  await expect(page.getByLabel(m5s3.plan.endsAnotherDay)).toBeChecked();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByText(crossDayRange)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, '1280-cross-day-light');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Plan detail is axe-clean at 390x844 in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto(`/plan/plans/${PLAN_ID}`);

    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    await expect(
      page.getByRole('heading', { name: PLAN_TITLE, level: 1 }),
    ).toBeVisible();

    const result = await new AxeBuilder({ page })
      .withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22a',
        'wcag22aa',
      ])
      .analyze();
    expect(result.violations).toEqual([]);
  });
}
