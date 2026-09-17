import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigation from '../../src/i18n/locales/navigation';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';

type MockCalls = {
  wishCreates: number;
  planCreates: number;
  lastPlanBody?: Record<string, unknown>;
};

async function installPlanningMocks(
  page: Page,
  options: { failFirstPlanSave?: boolean } = {},
): Promise<MockCalls> {
  const calls: MockCalls = { wishCreates: 0, planCreates: 0 };
  let failFirstPlanSave = options.failFirstPlanSave ?? false;

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
          accessToken: 'planning-focused-create-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'planning-focused-create-refresh-token',
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
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({
        hasMore: false,
        nextCursor: null,
        items: [
          {
            address: null,
            capabilities: { canDelete: true, canEdit: true },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
            description: null,
            id: 'place-berlin',
            latitude: null,
            longitude: null,
            name: 'Berlin',
            spaceId: SPACE_ID,
            updatedAt: TEST_NOW,
            version: 1,
          },
        ],
      });
      return;
    }
    if (method === 'POST' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      calls.wishCreates += 1;
      const body = request.postDataJSON() as { title: string };
      await fulfillJson(
        {
          capabilities: { canDelete: true, canEdit: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          id: 'wish-created',
          spaceId: SPACE_ID,
          status: 'OPEN',
          title: body.title,
          updatedAt: TEST_NOW,
          version: 1,
        },
        201,
      );
      return;
    }
    if (method === 'POST' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      calls.planCreates += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.lastPlanBody = body;
      if (failFirstPlanSave) {
        failFirstPlanSave = false;
        await fulfillJson(
          {
            code: 'PLAN_SAVE_FAILED',
            detail: 'Forced save failure.',
            status: 500,
            title: 'Save failed',
          },
          500,
        );
        return;
      }
      await fulfillJson(
        {
          capabilities: { canDelete: true, canEdit: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          description: body.description ?? null,
          experiencedOn: null,
          id: 'plan-created',
          placeId: body.placeId ?? null,
          plannedEnd: null,
          plannedOn: null,
          plannedStart: null,
          sourceWishId: null,
          spaceId: SPACE_ID,
          status: 'IDEA',
          title: body.title,
          updatedAt: TEST_NOW,
          version: 1,
        },
        201,
      );
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Planning focused-create test does not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const scenario of [
  { name: '320-light', width: 320, height: 720, theme: 'light' },
  { name: '390-dark', width: 390, height: 844, theme: 'dark' },
  { name: 'expanded', width: 1280, height: 900, theme: 'light' },
] as const) {
  test(`focused Plan creation remains calm and accessible: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.addInitScript((theme) => {
      window.localStorage.setItem('eimir.theme', theme);
    }, scenario.theme);
    await installPlanningMocks(page);
    await signIn(page);
    await page.goto('/plan/plans/new');

    const intention = page.getByLabel(m5s3.plan.intentionLabel);
    await expect(intention).toBeVisible();
    await expect(intention).not.toBeFocused();
    await expect(page.locator('.product-topbar')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      scenario.theme,
    );
    await expectNoHorizontalOverflow(page);

    if (scenario.name === '320-light') {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
    }
    await captureR3Evidence(
      page,
      testInfo,
      `r3-create-plan-${scenario.name}.png`,
    );
  });
}

test('local add and Quick Create both open the focused task and browser Back returns to origin', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan');

  await page.getByRole('link', { name: m5s3.overview.addPlan }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/new$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/plan$/);

  await page.goto('/today');
  await page.getByRole('button', { name: navigation.newContent }).click();
  await page.getByText(navigation.quickCreateWish, { exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
  await expect(page.getByLabel(m5s3.wish.intentionLabel)).not.toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
});

test('an undated Plan is valid while optional context remains available', async ({
  page,
}) => {
  const calls = await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan/plans/new');

  await page.getByLabel(m5s3.plan.intentionLabel).fill('Weekend in Berlin');
  await page.getByText(m5s3.plan.addDetails).click();
  await page.getByLabel(m5s3.common.description).fill('Zeit nur für uns');
  await page.getByLabel(m5s3.common.place).selectOption('place-berlin');
  await page.getByRole('button', { name: m5s3.common.save }).click();

  await expect(page).toHaveURL(/\/plan\/plans\/plan-created$/);
  expect(calls.planCreates).toBe(1);
  expect(calls.lastPlanBody).toMatchObject({
    title: 'Weekend in Berlin',
    description: 'Zeit nur für uns',
    placeId: 'place-berlin',
  });
  expect(calls.lastPlanBody).not.toHaveProperty('schedule');
});

test('failed save preserves the focused task and dirty cancellation requires confirmation', async ({
  page,
}) => {
  await installPlanningMocks(page, { failFirstPlanSave: true });
  await signIn(page);
  await page.goto('/plan/plans/new');

  const intention = page.getByLabel(m5s3.plan.intentionLabel);
  await intention.fill('Unser nächstes Abenteuer');
  await page.getByRole('button', { name: m5s3.common.save }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(intention).toHaveValue('Unser nächstes Abenteuer');

  await page.getByRole('button', { name: de.common.cancel }).click();
  await expect(
    page.getByRole('alertdialog', { name: taskBoundary.discardTitle }),
  ).toBeVisible();
  await page.getByRole('button', { name: taskBoundary.keepEditing }).click();
  await expect(intention).toHaveValue('Unser nächstes Abenteuer');
});

test('the focused task remains reachable at 200% layout zoom', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan/plans/new');
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });
  await expectNoHorizontalOverflow(page);
  await expect(page.getByLabel(m5s3.plan.intentionLabel)).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.common.save }),
  ).toBeVisible();
  await captureR3Evidence(
    page,
    testInfo,
    'r3-create-plan-200pct-expanded.png',
    false,
  );
});
