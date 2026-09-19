import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const EARLY_PLAN_ID = '44444444-4444-4444-8444-444444444444';
const LATE_PLAN_ID = '55555555-5555-4555-8555-555555555555';
const IDEA_PLAN_ID = '66666666-6666-4666-8666-666666666666';
const COMPLETED_PLAN_ID = '77777777-7777-4777-8777-777777777777';
const WISH_ID = '88888888-8888-4888-8888-888888888888';
const CONVERTED_PLAN_ID = '99999999-9999-4999-8999-999999999999';
const PLACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAPTER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const EARLY_TITLE = 'Autumn hike';
const LATE_TITLE = 'Concert in October';
const IDEA_TITLE = 'Try a new recipe';
const COMPLETED_TITLE = 'Day trip we already took';
const CONVERTED_PLAN_TITLE = 'Authoritative converted autumn Plan';
const PLACE_NAME = 'Riverside cabin';
const PLACE_DESCRIPTION = 'Where we spent a quiet weekend together.';
const PLACE_ADDRESS = '12 River Lane';
const CHAPTER_TITLE = 'Summer by the lake';
const CHAPTER_DESCRIPTION = 'A season we still talk about.';

function localFutureIso(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(18, 0, 0, 0);
  return value.toISOString();
}

const EARLY_DATE = localFutureIso(10);
const LATE_DATE = localFutureIso(17);
const TEST_NOW = new Date().toISOString();

const secondaryPlace = {
  address: PLACE_ADDRESS,
  capabilities: { canComment: true, canDelete: false, canEdit: false },
  createdAt: TEST_NOW,
  createdBy: ACCOUNT_ID,
  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
  description: PLACE_DESCRIPTION,
  id: PLACE_ID,
  latitude: 49.1234,
  longitude: 7.5678,
  name: PLACE_NAME,
  spaceId: SPACE_ID,
  updatedAt: TEST_NOW,
  version: 1,
};

const secondaryChapter = {
  capabilities: { canComment: true, canDelete: false, canEdit: false },
  createdAt: TEST_NOW,
  createdBy: ACCOUNT_ID,
  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
  description: CHAPTER_DESCRIPTION,
  endOn: '2026-08-31',
  id: CHAPTER_ID,
  placeId: PLACE_ID,
  spaceId: SPACE_ID,
  startOn: '2026-06-01',
  title: CHAPTER_TITLE,
  updatedAt: TEST_NOW,
  version: 1,
};

function planDetail({
  id,
  title,
  status,
  plannedStart,
  experiencedOn = null,
  sourceWishId = null,
}: {
  id: string;
  title: string;
  status: 'IDEA' | 'PLANNED' | 'COMPLETED';
  plannedStart: string | null;
  experiencedOn?: string | null;
  sourceWishId?: string | null;
}) {
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: TEST_NOW,
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    description: null,
    experiencedOn,
    id,
    placeId: null,
    plannedEnd: null,
    plannedStart,
    sourceWishId,
    spaceId: SPACE_ID,
    status,
    title,
    updatedAt: TEST_NOW,
    version: 1,
  };
}

const earlyPlan = planDetail({
  id: EARLY_PLAN_ID,
  title: EARLY_TITLE,
  status: 'PLANNED',
  plannedStart: EARLY_DATE,
  sourceWishId: WISH_ID,
});
const latePlan = planDetail({
  id: LATE_PLAN_ID,
  title: LATE_TITLE,
  status: 'PLANNED',
  plannedStart: LATE_DATE,
});
const ideaPlan = planDetail({
  id: IDEA_PLAN_ID,
  title: IDEA_TITLE,
  status: 'IDEA',
  plannedStart: null,
});
const completedPlan = planDetail({
  id: COMPLETED_PLAN_ID,
  title: COMPLETED_TITLE,
  status: 'COMPLETED',
  plannedStart: LATE_DATE,
  experiencedOn: '2026-07-26',
});
const convertedPlan = planDetail({
  id: CONVERTED_PLAN_ID,
  title: CONVERTED_PLAN_TITLE,
  status: 'IDEA',
  plannedStart: null,
  sourceWishId: WISH_ID,
});

type PlanningMockCalls = {
  conversionBody: Record<string, unknown> | null;
  conversionIfMatch: string | null;
};

async function installPlanningMocks(
  page: Page,
  options: { empty?: boolean; secondaryDomains?: boolean } = {},
): Promise<PlanningMockCalls> {
  const calls: PlanningMockCalls = {
    conversionBody: null,
    conversionIfMatch: null,
  };
  let converted = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

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
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
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

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      // Explicit, so this Today-order/provenance test stays independent of
      // the product default (#854) and keeps exercising both upcoming items.
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      const upcoming = options.empty
        ? []
        : [
            {
              createdAt: TEST_NOW,
              id: EARLY_PLAN_ID,
              occurredOn: null,
              scheduledAt: EARLY_DATE,
              titleOrText: EARLY_TITLE,
              type: 'PLAN',
            },
            {
              createdAt: TEST_NOW,
              id: LATE_PLAN_ID,
              occurredOn: null,
              scheduledAt: LATE_DATE,
              titleOrText: LATE_TITLE,
              type: 'PLAN',
            },
          ];
      await fulfillJson({
        keepsake: null,
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        thinkingOfYouAvailableAt: null,
        upcoming,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({
        hasMore: false,
        items:
          options.empty || converted
            ? []
            : [
                {
                  capabilities: {
                    canComment: true,
                    canDelete: true,
                    canEdit: true,
                  },
                  createdAt: TEST_NOW,
                  createdBy: ACCOUNT_ID,
                  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
                  id: WISH_ID,
                  spaceId: SPACE_ID,
                  status: 'OPEN',
                  title: EARLY_TITLE,
                  updatedAt: TEST_NOW,
                  version: 2,
                },
              ],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}`
    ) {
      await fulfillJson({
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        id: WISH_ID,
        spaceId: SPACE_ID,
        status: converted ? 'PLANNED' : 'OPEN',
        title: EARLY_TITLE,
        updatedAt: TEST_NOW,
        version: converted ? 3 : 2,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}/plan`
    ) {
      calls.conversionBody = request.postDataJSON() as Record<string, unknown>;
      calls.conversionIfMatch = request.headers()['if-match'] ?? null;
      converted = true;
      await fulfillJson(
        {
          wish: {
            capabilities: {
              canComment: true,
              canDelete: true,
              canEdit: true,
            },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Anna' },
            id: WISH_ID,
            spaceId: SPACE_ID,
            status: 'PLANNED',
            title: EARLY_TITLE,
            updatedAt: TEST_NOW,
            version: 3,
          },
          plan: convertedPlan,
        },
        201,
      );
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      const requestedStatus = url.searchParams.get('status');
      let items: unknown[] = [];
      if (!options.empty && requestedStatus === 'PLANNED') {
        // Deliberately not chronological, and includes a defensive rogue
        // completed row so the client selector proves the section contract.
        items = [latePlan, completedPlan, earlyPlan];
      } else if (!options.empty && requestedStatus === 'IDEA') {
        items = converted ? [convertedPlan, ideaPlan] : [ideaPlan];
      }
      await fulfillJson({ hasMore: false, items, nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${CONVERTED_PLAN_ID}`
    ) {
      await fulfillJson(convertedPlan);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({
        hasMore: false,
        items: options.secondaryDomains ? [secondaryPlace] : [],
        nextCursor: null,
      });
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}`
    ) {
      await fulfillJson(secondaryPlace);
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/memories`,
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/heart-moments`,
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/milestones`,
      ].includes(pathname)
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/${CHAPTER_ID}`
    ) {
      await fulfillJson(secondaryChapter);
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/chapters/${CHAPTER_ID}/content`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test('Plans leads with the nearest intention, then later and undated Plans, while Wishes stays a separate domain', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  // Plans is the default segment (#892) and must not mix in Wish items -
  // those belong to the Wishes domain even though the old future-map grouped
  // them together. The Wishes panel is rendered-but-hidden (not unmounted, so
  // the #810/#856 hash handoff can still find it), so scope to the visible
  // Plans panel rather than the page as a whole.
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentPlans }),
  ).toHaveAttribute('aria-selected', 'true');

  const plansPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentPlans,
  });
  await expect(
    plansPanel.getByRole('heading', { name: m5s3.overview.nextHeading }),
  ).toBeVisible();
  await expect(plansPanel.locator('.planen-next-link')).toContainText(
    EARLY_TITLE,
  );
  await expect(plansPanel.locator('.planen-agenda-link')).toContainText(
    LATE_TITLE,
  );
  await expect(plansPanel.locator('.planen-undated-link')).toContainText(
    IDEA_TITLE,
  );
  await expect(plansPanel.locator('.planen-history')).toContainText(
    COMPLETED_TITLE,
  );
  await captureR3Evidence(page, testInfo, 'r3-overview-dense-390-light.png');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
  const wishesPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentWishes,
  });
  await expect(
    wishesPanel.getByText(EARLY_TITLE, { exact: true }),
  ).toBeVisible();
  await expect(wishesPanel.getByText(IDEA_TITLE)).toHaveCount(0);
  await expect(wishesPanel.getByText(COMPLETED_TITLE)).toHaveCount(0);
  await captureR3Evidence(page, testInfo, 'r3-wishes-390-light.png');

  await page.goto('/today');
  const todayTitles = page.locator(
    '.today-section-upcoming .today-agenda-title',
  );
  await expect(todayTitles).toHaveText([EARLY_TITLE, LATE_TITLE]);
});

test('Wish conversion opens the authoritative Plan result and preserves return continuity', async ({
  page,
}) => {
  const calls = await installPlanningMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await page.getByRole('link', { name: new RegExp(EARLY_TITLE) }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/wishes/${WISH_ID}$`));

  await page.getByText(m5s3.wish.actionsHeading).click();
  await page.getByLabel(m5s3.wish.planTitle).fill('Requested autumn Plan');
  await page.getByRole('button', { name: m5s3.wish.convert }).click();

  await expect(page).toHaveURL(new RegExp(`/plan/plans/${CONVERTED_PLAN_ID}$`));
  await expect(
    page.getByRole('heading', { name: CONVERTED_PLAN_TITLE, level: 1 }),
  ).toBeVisible();
  expect(calls.conversionIfMatch).toBe('2');
  expect(calls.conversionBody).toMatchObject({
    title: 'Requested autumn Plan',
  });

  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('planning segments keep their relationship-native empty states', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page, { empty: true });
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await expect(page.getByText(m5s3.overview.plansEmpty)).toBeVisible();
  await captureR3Evidence(page, testInfo, 'r3-overview-empty-390-light.png');
  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(page.getByText(m5s3.overview.wishesEmpty)).toBeVisible();
});

for (const scenario of [
  {
    name: '360-dark',
    viewport: { width: 360, height: 800 },
    colorScheme: 'dark' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: '430-reduced-motion',
    viewport: { width: 430, height: 860 },
    colorScheme: 'light' as const,
    reducedMotion: 'reduce' as const,
  },
  {
    name: '1280-expanded',
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
]) {
  test(`R3 overview evidence: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({
      colorScheme: scenario.colorScheme,
      reducedMotion: scenario.reducedMotion,
    });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await installPlanningMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.goto('/plan');

    await expect(page.locator('.planen-next-link')).toContainText(EARLY_TITLE);
    await expect(page.locator('.planen-undated-link')).toContainText(
      IDEA_TITLE,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await captureR3Evidence(page, testInfo, `r3-overview-${scenario.name}.png`);
  });
}

test('P2 Chapter to Place reads as relationship content and preserves return context', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    window.localStorage.setItem('eimir.theme', 'system'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page, { secondaryDomains: true });
  await page.goto('/today');
  await signIn(page);
  await page.goto(`/plan/chapters/${CHAPTER_ID}`);

  await expect(
    page.getByRole('heading', { name: CHAPTER_TITLE, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(CHAPTER_DESCRIPTION)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: m5s3.chapter.contextHeading }),
  ).toBeVisible();
  const placeLink = page.getByRole('link', { name: new RegExp(PLACE_NAME) });
  await expect(placeLink).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await captureR3Evidence(
    page,
    testInfo,
    'planning-p2-chapter-390-light.png',
  );

  await placeLink.click();
  await expect(page).toHaveURL(new RegExp(`/plan/places/${PLACE_ID}import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const EARLY_PLAN_ID = '44444444-4444-4444-8444-444444444444';
const LATE_PLAN_ID = '55555555-5555-4555-8555-555555555555';
const IDEA_PLAN_ID = '66666666-6666-4666-8666-666666666666';
const COMPLETED_PLAN_ID = '77777777-7777-4777-8777-777777777777';
const WISH_ID = '88888888-8888-4888-8888-888888888888';
const CONVERTED_PLAN_ID = '99999999-9999-4999-8999-999999999999';
const PLACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAPTER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const EARLY_TITLE = 'Autumn hike';
const LATE_TITLE = 'Concert in October';
const IDEA_TITLE = 'Try a new recipe';
const COMPLETED_TITLE = 'Day trip we already took';
const CONVERTED_PLAN_TITLE = 'Authoritative converted autumn Plan';
const PLACE_NAME = 'Riverside cabin';
const PLACE_DESCRIPTION = 'Where we spent a quiet weekend together.';
const PLACE_ADDRESS = '12 River Lane';
const CHAPTER_TITLE = 'Summer by the lake';
const CHAPTER_DESCRIPTION = 'A season we still talk about.';

function localFutureIso(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(18, 0, 0, 0);
  return value.toISOString();
}

const EARLY_DATE = localFutureIso(10);
const LATE_DATE = localFutureIso(17);
const TEST_NOW = new Date().toISOString();

const secondaryPlace = {
  address: PLACE_ADDRESS,
  capabilities: { canComment: true, canDelete: false, canEdit: false },
  createdAt: TEST_NOW,
  createdBy: ACCOUNT_ID,
  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
  description: PLACE_DESCRIPTION,
  id: PLACE_ID,
  latitude: 49.1234,
  longitude: 7.5678,
  name: PLACE_NAME,
  spaceId: SPACE_ID,
  updatedAt: TEST_NOW,
  version: 1,
};

const secondaryChapter = {
  capabilities: { canComment: true, canDelete: false, canEdit: false },
  createdAt: TEST_NOW,
  createdBy: ACCOUNT_ID,
  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
  description: CHAPTER_DESCRIPTION,
  endOn: '2026-08-31',
  id: CHAPTER_ID,
  placeId: PLACE_ID,
  spaceId: SPACE_ID,
  startOn: '2026-06-01',
  title: CHAPTER_TITLE,
  updatedAt: TEST_NOW,
  version: 1,
};

function planDetail({
  id,
  title,
  status,
  plannedStart,
  experiencedOn = null,
  sourceWishId = null,
}: {
  id: string;
  title: string;
  status: 'IDEA' | 'PLANNED' | 'COMPLETED';
  plannedStart: string | null;
  experiencedOn?: string | null;
  sourceWishId?: string | null;
}) {
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: TEST_NOW,
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    description: null,
    experiencedOn,
    id,
    placeId: null,
    plannedEnd: null,
    plannedStart,
    sourceWishId,
    spaceId: SPACE_ID,
    status,
    title,
    updatedAt: TEST_NOW,
    version: 1,
  };
}

const earlyPlan = planDetail({
  id: EARLY_PLAN_ID,
  title: EARLY_TITLE,
  status: 'PLANNED',
  plannedStart: EARLY_DATE,
  sourceWishId: WISH_ID,
});
const latePlan = planDetail({
  id: LATE_PLAN_ID,
  title: LATE_TITLE,
  status: 'PLANNED',
  plannedStart: LATE_DATE,
});
const ideaPlan = planDetail({
  id: IDEA_PLAN_ID,
  title: IDEA_TITLE,
  status: 'IDEA',
  plannedStart: null,
});
const completedPlan = planDetail({
  id: COMPLETED_PLAN_ID,
  title: COMPLETED_TITLE,
  status: 'COMPLETED',
  plannedStart: LATE_DATE,
  experiencedOn: '2026-07-26',
});
const convertedPlan = planDetail({
  id: CONVERTED_PLAN_ID,
  title: CONVERTED_PLAN_TITLE,
  status: 'IDEA',
  plannedStart: null,
  sourceWishId: WISH_ID,
});

type PlanningMockCalls = {
  conversionBody: Record<string, unknown> | null;
  conversionIfMatch: string | null;
};

async function installPlanningMocks(
  page: Page,
  options: { empty?: boolean; secondaryDomains?: boolean } = {},
): Promise<PlanningMockCalls> {
  const calls: PlanningMockCalls = {
    conversionBody: null,
    conversionIfMatch: null,
  };
  let converted = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

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
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
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

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      // Explicit, so this Today-order/provenance test stays independent of
      // the product default (#854) and keeps exercising both upcoming items.
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      const upcoming = options.empty
        ? []
        : [
            {
              createdAt: TEST_NOW,
              id: EARLY_PLAN_ID,
              occurredOn: null,
              scheduledAt: EARLY_DATE,
              titleOrText: EARLY_TITLE,
              type: 'PLAN',
            },
            {
              createdAt: TEST_NOW,
              id: LATE_PLAN_ID,
              occurredOn: null,
              scheduledAt: LATE_DATE,
              titleOrText: LATE_TITLE,
              type: 'PLAN',
            },
          ];
      await fulfillJson({
        keepsake: null,
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        thinkingOfYouAvailableAt: null,
        upcoming,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({
        hasMore: false,
        items:
          options.empty || converted
            ? []
            : [
                {
                  capabilities: {
                    canComment: true,
                    canDelete: true,
                    canEdit: true,
                  },
                  createdAt: TEST_NOW,
                  createdBy: ACCOUNT_ID,
                  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
                  id: WISH_ID,
                  spaceId: SPACE_ID,
                  status: 'OPEN',
                  title: EARLY_TITLE,
                  updatedAt: TEST_NOW,
                  version: 2,
                },
              ],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}`
    ) {
      await fulfillJson({
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        id: WISH_ID,
        spaceId: SPACE_ID,
        status: converted ? 'PLANNED' : 'OPEN',
        title: EARLY_TITLE,
        updatedAt: TEST_NOW,
        version: converted ? 3 : 2,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}/plan`
    ) {
      calls.conversionBody = request.postDataJSON() as Record<string, unknown>;
      calls.conversionIfMatch = request.headers()['if-match'] ?? null;
      converted = true;
      await fulfillJson(
        {
          wish: {
            capabilities: {
              canComment: true,
              canDelete: true,
              canEdit: true,
            },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Anna' },
            id: WISH_ID,
            spaceId: SPACE_ID,
            status: 'PLANNED',
            title: EARLY_TITLE,
            updatedAt: TEST_NOW,
            version: 3,
          },
          plan: convertedPlan,
        },
        201,
      );
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      const requestedStatus = url.searchParams.get('status');
      let items: unknown[] = [];
      if (!options.empty && requestedStatus === 'PLANNED') {
        // Deliberately not chronological, and includes a defensive rogue
        // completed row so the client selector proves the section contract.
        items = [latePlan, completedPlan, earlyPlan];
      } else if (!options.empty && requestedStatus === 'IDEA') {
        items = converted ? [convertedPlan, ideaPlan] : [ideaPlan];
      }
      await fulfillJson({ hasMore: false, items, nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${CONVERTED_PLAN_ID}`
    ) {
      await fulfillJson(convertedPlan);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({
        hasMore: false,
        items: options.secondaryDomains ? [secondaryPlace] : [],
        nextCursor: null,
      });
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}`
    ) {
      await fulfillJson(secondaryPlace);
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/memories`,
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/heart-moments`,
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/milestones`,
      ].includes(pathname)
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/${CHAPTER_ID}`
    ) {
      await fulfillJson(secondaryChapter);
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/chapters/${CHAPTER_ID}/content`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test('Plans leads with the nearest intention, then later and undated Plans, while Wishes stays a separate domain', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  // Plans is the default segment (#892) and must not mix in Wish items -
  // those belong to the Wishes domain even though the old future-map grouped
  // them together. The Wishes panel is rendered-but-hidden (not unmounted, so
  // the #810/#856 hash handoff can still find it), so scope to the visible
  // Plans panel rather than the page as a whole.
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentPlans }),
  ).toHaveAttribute('aria-selected', 'true');

  const plansPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentPlans,
  });
  await expect(
    plansPanel.getByRole('heading', { name: m5s3.overview.nextHeading }),
  ).toBeVisible();
  await expect(plansPanel.locator('.planen-next-link')).toContainText(
    EARLY_TITLE,
  );
  await expect(plansPanel.locator('.planen-agenda-link')).toContainText(
    LATE_TITLE,
  );
  await expect(plansPanel.locator('.planen-undated-link')).toContainText(
    IDEA_TITLE,
  );
  await expect(plansPanel.locator('.planen-history')).toContainText(
    COMPLETED_TITLE,
  );
  await captureR3Evidence(page, testInfo, 'r3-overview-dense-390-light.png');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
  const wishesPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentWishes,
  });
  await expect(
    wishesPanel.getByText(EARLY_TITLE, { exact: true }),
  ).toBeVisible();
  await expect(wishesPanel.getByText(IDEA_TITLE)).toHaveCount(0);
  await expect(wishesPanel.getByText(COMPLETED_TITLE)).toHaveCount(0);
  await captureR3Evidence(page, testInfo, 'r3-wishes-390-light.png');

  await page.goto('/today');
  const todayTitles = page.locator(
    '.today-section-upcoming .today-agenda-title',
  );
  await expect(todayTitles).toHaveText([EARLY_TITLE, LATE_TITLE]);
});

test('Wish conversion opens the authoritative Plan result and preserves return continuity', async ({
  page,
}) => {
  const calls = await installPlanningMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await page.getByRole('link', { name: new RegExp(EARLY_TITLE) }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/wishes/${WISH_ID}$`));

  await page.getByText(m5s3.wish.actionsHeading).click();
  await page.getByLabel(m5s3.wish.planTitle).fill('Requested autumn Plan');
  await page.getByRole('button', { name: m5s3.wish.convert }).click();

  await expect(page).toHaveURL(new RegExp(`/plan/plans/${CONVERTED_PLAN_ID}$`));
  await expect(
    page.getByRole('heading', { name: CONVERTED_PLAN_TITLE, level: 1 }),
  ).toBeVisible();
  expect(calls.conversionIfMatch).toBe('2');
  expect(calls.conversionBody).toMatchObject({
    title: 'Requested autumn Plan',
  });

  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('planning segments keep their relationship-native empty states', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page, { empty: true });
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await expect(page.getByText(m5s3.overview.plansEmpty)).toBeVisible();
  await captureR3Evidence(page, testInfo, 'r3-overview-empty-390-light.png');
  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(page.getByText(m5s3.overview.wishesEmpty)).toBeVisible();
});

for (const scenario of [
  {
    name: '360-dark',
    viewport: { width: 360, height: 800 },
    colorScheme: 'dark' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: '430-reduced-motion',
    viewport: { width: 430, height: 860 },
    colorScheme: 'light' as const,
    reducedMotion: 'reduce' as const,
  },
  {
    name: '1280-expanded',
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
]) {
  test(`R3 overview evidence: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({
      colorScheme: scenario.colorScheme,
      reducedMotion: scenario.reducedMotion,
    });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await installPlanningMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.goto('/plan');

    await expect(page.locator('.planen-next-link')).toContainText(EARLY_TITLE);
    await expect(page.locator('.planen-undated-link')).toContainText(
      IDEA_TITLE,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await captureR3Evidence(page, testInfo, `r3-overview-${scenario.name}.png`);
  });
}

));
  await expect(
    page.getByRole('heading', { name: PLACE_NAME, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(PLACE_DESCRIPTION)).toBeVisible();
  await expect(page.getByText(PLACE_ADDRESS)).toBeVisible();
  await expect(page.locator('details.planning-technical-details')).not.toHaveAttribute(
    'open',
    '',
  );
  await captureR3Evidence(page, testInfo, 'planning-p2-place-390-light.png');

  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/chapters/${CHAPTER_ID}import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const EARLY_PLAN_ID = '44444444-4444-4444-8444-444444444444';
const LATE_PLAN_ID = '55555555-5555-4555-8555-555555555555';
const IDEA_PLAN_ID = '66666666-6666-4666-8666-666666666666';
const COMPLETED_PLAN_ID = '77777777-7777-4777-8777-777777777777';
const WISH_ID = '88888888-8888-4888-8888-888888888888';
const CONVERTED_PLAN_ID = '99999999-9999-4999-8999-999999999999';
const PLACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAPTER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const EARLY_TITLE = 'Autumn hike';
const LATE_TITLE = 'Concert in October';
const IDEA_TITLE = 'Try a new recipe';
const COMPLETED_TITLE = 'Day trip we already took';
const CONVERTED_PLAN_TITLE = 'Authoritative converted autumn Plan';
const PLACE_NAME = 'Riverside cabin';
const PLACE_DESCRIPTION = 'Where we spent a quiet weekend together.';
const PLACE_ADDRESS = '12 River Lane';
const CHAPTER_TITLE = 'Summer by the lake';
const CHAPTER_DESCRIPTION = 'A season we still talk about.';

function localFutureIso(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(18, 0, 0, 0);
  return value.toISOString();
}

const EARLY_DATE = localFutureIso(10);
const LATE_DATE = localFutureIso(17);
const TEST_NOW = new Date().toISOString();

const secondaryPlace = {
  address: PLACE_ADDRESS,
  capabilities: { canComment: true, canDelete: false, canEdit: false },
  createdAt: TEST_NOW,
  createdBy: ACCOUNT_ID,
  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
  description: PLACE_DESCRIPTION,
  id: PLACE_ID,
  latitude: 49.1234,
  longitude: 7.5678,
  name: PLACE_NAME,
  spaceId: SPACE_ID,
  updatedAt: TEST_NOW,
  version: 1,
};

const secondaryChapter = {
  capabilities: { canComment: true, canDelete: false, canEdit: false },
  createdAt: TEST_NOW,
  createdBy: ACCOUNT_ID,
  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
  description: CHAPTER_DESCRIPTION,
  endOn: '2026-08-31',
  id: CHAPTER_ID,
  placeId: PLACE_ID,
  spaceId: SPACE_ID,
  startOn: '2026-06-01',
  title: CHAPTER_TITLE,
  updatedAt: TEST_NOW,
  version: 1,
};

function planDetail({
  id,
  title,
  status,
  plannedStart,
  experiencedOn = null,
  sourceWishId = null,
}: {
  id: string;
  title: string;
  status: 'IDEA' | 'PLANNED' | 'COMPLETED';
  plannedStart: string | null;
  experiencedOn?: string | null;
  sourceWishId?: string | null;
}) {
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: TEST_NOW,
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    description: null,
    experiencedOn,
    id,
    placeId: null,
    plannedEnd: null,
    plannedStart,
    sourceWishId,
    spaceId: SPACE_ID,
    status,
    title,
    updatedAt: TEST_NOW,
    version: 1,
  };
}

const earlyPlan = planDetail({
  id: EARLY_PLAN_ID,
  title: EARLY_TITLE,
  status: 'PLANNED',
  plannedStart: EARLY_DATE,
  sourceWishId: WISH_ID,
});
const latePlan = planDetail({
  id: LATE_PLAN_ID,
  title: LATE_TITLE,
  status: 'PLANNED',
  plannedStart: LATE_DATE,
});
const ideaPlan = planDetail({
  id: IDEA_PLAN_ID,
  title: IDEA_TITLE,
  status: 'IDEA',
  plannedStart: null,
});
const completedPlan = planDetail({
  id: COMPLETED_PLAN_ID,
  title: COMPLETED_TITLE,
  status: 'COMPLETED',
  plannedStart: LATE_DATE,
  experiencedOn: '2026-07-26',
});
const convertedPlan = planDetail({
  id: CONVERTED_PLAN_ID,
  title: CONVERTED_PLAN_TITLE,
  status: 'IDEA',
  plannedStart: null,
  sourceWishId: WISH_ID,
});

type PlanningMockCalls = {
  conversionBody: Record<string, unknown> | null;
  conversionIfMatch: string | null;
};

async function installPlanningMocks(
  page: Page,
  options: { empty?: boolean; secondaryDomains?: boolean } = {},
): Promise<PlanningMockCalls> {
  const calls: PlanningMockCalls = {
    conversionBody: null,
    conversionIfMatch: null,
  };
  let converted = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

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
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
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

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      // Explicit, so this Today-order/provenance test stays independent of
      // the product default (#854) and keeps exercising both upcoming items.
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      const upcoming = options.empty
        ? []
        : [
            {
              createdAt: TEST_NOW,
              id: EARLY_PLAN_ID,
              occurredOn: null,
              scheduledAt: EARLY_DATE,
              titleOrText: EARLY_TITLE,
              type: 'PLAN',
            },
            {
              createdAt: TEST_NOW,
              id: LATE_PLAN_ID,
              occurredOn: null,
              scheduledAt: LATE_DATE,
              titleOrText: LATE_TITLE,
              type: 'PLAN',
            },
          ];
      await fulfillJson({
        keepsake: null,
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        thinkingOfYouAvailableAt: null,
        upcoming,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({
        hasMore: false,
        items:
          options.empty || converted
            ? []
            : [
                {
                  capabilities: {
                    canComment: true,
                    canDelete: true,
                    canEdit: true,
                  },
                  createdAt: TEST_NOW,
                  createdBy: ACCOUNT_ID,
                  creator: { id: ACCOUNT_ID, displayName: 'Anna' },
                  id: WISH_ID,
                  spaceId: SPACE_ID,
                  status: 'OPEN',
                  title: EARLY_TITLE,
                  updatedAt: TEST_NOW,
                  version: 2,
                },
              ],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}`
    ) {
      await fulfillJson({
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        id: WISH_ID,
        spaceId: SPACE_ID,
        status: converted ? 'PLANNED' : 'OPEN',
        title: EARLY_TITLE,
        updatedAt: TEST_NOW,
        version: converted ? 3 : 2,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}/plan`
    ) {
      calls.conversionBody = request.postDataJSON() as Record<string, unknown>;
      calls.conversionIfMatch = request.headers()['if-match'] ?? null;
      converted = true;
      await fulfillJson(
        {
          wish: {
            capabilities: {
              canComment: true,
              canDelete: true,
              canEdit: true,
            },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Anna' },
            id: WISH_ID,
            spaceId: SPACE_ID,
            status: 'PLANNED',
            title: EARLY_TITLE,
            updatedAt: TEST_NOW,
            version: 3,
          },
          plan: convertedPlan,
        },
        201,
      );
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      const requestedStatus = url.searchParams.get('status');
      let items: unknown[] = [];
      if (!options.empty && requestedStatus === 'PLANNED') {
        // Deliberately not chronological, and includes a defensive rogue
        // completed row so the client selector proves the section contract.
        items = [latePlan, completedPlan, earlyPlan];
      } else if (!options.empty && requestedStatus === 'IDEA') {
        items = converted ? [convertedPlan, ideaPlan] : [ideaPlan];
      }
      await fulfillJson({ hasMore: false, items, nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${CONVERTED_PLAN_ID}`
    ) {
      await fulfillJson(convertedPlan);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({
        hasMore: false,
        items: options.secondaryDomains ? [secondaryPlace] : [],
        nextCursor: null,
      });
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}`
    ) {
      await fulfillJson(secondaryPlace);
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/memories`,
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/heart-moments`,
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/milestones`,
      ].includes(pathname)
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/${CHAPTER_ID}`
    ) {
      await fulfillJson(secondaryChapter);
      return;
    }

    if (
      options.secondaryDomains &&
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/chapters/${CHAPTER_ID}/content`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test('Plans leads with the nearest intention, then later and undated Plans, while Wishes stays a separate domain', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  // Plans is the default segment (#892) and must not mix in Wish items -
  // those belong to the Wishes domain even though the old future-map grouped
  // them together. The Wishes panel is rendered-but-hidden (not unmounted, so
  // the #810/#856 hash handoff can still find it), so scope to the visible
  // Plans panel rather than the page as a whole.
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentPlans }),
  ).toHaveAttribute('aria-selected', 'true');

  const plansPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentPlans,
  });
  await expect(
    plansPanel.getByRole('heading', { name: m5s3.overview.nextHeading }),
  ).toBeVisible();
  await expect(plansPanel.locator('.planen-next-link')).toContainText(
    EARLY_TITLE,
  );
  await expect(plansPanel.locator('.planen-agenda-link')).toContainText(
    LATE_TITLE,
  );
  await expect(plansPanel.locator('.planen-undated-link')).toContainText(
    IDEA_TITLE,
  );
  await expect(plansPanel.locator('.planen-history')).toContainText(
    COMPLETED_TITLE,
  );
  await captureR3Evidence(page, testInfo, 'r3-overview-dense-390-light.png');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
  const wishesPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentWishes,
  });
  await expect(
    wishesPanel.getByText(EARLY_TITLE, { exact: true }),
  ).toBeVisible();
  await expect(wishesPanel.getByText(IDEA_TITLE)).toHaveCount(0);
  await expect(wishesPanel.getByText(COMPLETED_TITLE)).toHaveCount(0);
  await captureR3Evidence(page, testInfo, 'r3-wishes-390-light.png');

  await page.goto('/today');
  const todayTitles = page.locator(
    '.today-section-upcoming .today-agenda-title',
  );
  await expect(todayTitles).toHaveText([EARLY_TITLE, LATE_TITLE]);
});

test('Wish conversion opens the authoritative Plan result and preserves return continuity', async ({
  page,
}) => {
  const calls = await installPlanningMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await page.getByRole('link', { name: new RegExp(EARLY_TITLE) }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/wishes/${WISH_ID}$`));

  await page.getByText(m5s3.wish.actionsHeading).click();
  await page.getByLabel(m5s3.wish.planTitle).fill('Requested autumn Plan');
  await page.getByRole('button', { name: m5s3.wish.convert }).click();

  await expect(page).toHaveURL(new RegExp(`/plan/plans/${CONVERTED_PLAN_ID}$`));
  await expect(
    page.getByRole('heading', { name: CONVERTED_PLAN_TITLE, level: 1 }),
  ).toBeVisible();
  expect(calls.conversionIfMatch).toBe('2');
  expect(calls.conversionBody).toMatchObject({
    title: 'Requested autumn Plan',
  });

  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('planning segments keep their relationship-native empty states', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page, { empty: true });
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await expect(page.getByText(m5s3.overview.plansEmpty)).toBeVisible();
  await captureR3Evidence(page, testInfo, 'r3-overview-empty-390-light.png');
  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(page.getByText(m5s3.overview.wishesEmpty)).toBeVisible();
});

for (const scenario of [
  {
    name: '360-dark',
    viewport: { width: 360, height: 800 },
    colorScheme: 'dark' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: '430-reduced-motion',
    viewport: { width: 430, height: 860 },
    colorScheme: 'light' as const,
    reducedMotion: 'reduce' as const,
  },
  {
    name: '1280-expanded',
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
]) {
  test(`R3 overview evidence: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({
      colorScheme: scenario.colorScheme,
      reducedMotion: scenario.reducedMotion,
    });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await installPlanningMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.goto('/plan');

    await expect(page.locator('.planen-next-link')).toContainText(EARLY_TITLE);
    await expect(page.locator('.planen-undated-link')).toContainText(
      IDEA_TITLE,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await captureR3Evidence(page, testInfo, `r3-overview-${scenario.name}.png`);
  });
}

));

  await page.setViewportSize({ width: 430, height: 860 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(
    page.getByRole('heading', { name: CHAPTER_TITLE, level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await captureR3Evidence(
    page,
    testInfo,
    'planning-p2-chapter-430-dark-reduced.png',
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await captureR3Evidence(
    page,
    testInfo,
    'planning-p2-chapter-1280-expanded.png',
  );
});

test('Wishes panel requests and shows only OPEN Wishes; PLANNED/COMPLETED are excluded (#892)', async ({
  page,
}) => {
  let requestedStatus: string | null = null;
  await installPlanningMocks(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/wishes**`, async (route) => {
    requestedStatus = new URL(route.request().url()).searchParams.get('status');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hasMore: false,
        nextCursor: null,
        items: [
          {
            capabilities: { canComment: true, canDelete: true, canEdit: true },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Anna' },
            id: WISH_ID,
            spaceId: SPACE_ID,
            status: 'OPEN',
            title: EARLY_TITLE,
            updatedAt: TEST_NOW,
            version: 2,
          },
          // A defensively-tested rogue historical row: even if a status
          // filter ever returned one, it must never reach the UI (#892).
          {
            capabilities: { canComment: true, canDelete: true, canEdit: true },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Anna' },
            id: `${WISH_ID}-planned`,
            spaceId: SPACE_ID,
            status: 'PLANNED',
            title: LATE_TITLE,
            updatedAt: TEST_NOW,
            version: 2,
          },
        ],
      }),
    });
  });
  await page.goto('/today');
  await signIn(page);
  await page.goto('/plan');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  const wishesPanel = page.getByRole('tabpanel', {
    name: m5s3.overview.segmentWishes,
  });
  await expect(
    wishesPanel.getByText(EARLY_TITLE, { exact: true }),
  ).toBeVisible();
  await expect(wishesPanel.getByText(LATE_TITLE)).toHaveCount(0);

  expect(requestedStatus).toBe('OPEN');
});
