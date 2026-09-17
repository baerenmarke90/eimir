import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const WISH_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-12T09:00:00Z';
const WISH_TITLE = 'Nordlichter sehen';

async function installMocks(page: Page): Promise<void> {
  let completed = false;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const fulfillJson = async (
      body: unknown,
      status = 200,
      headers?: Record<string, string>,
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
        headers,
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
          accessToken: 'wish-completion-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'wish-completion-refresh-token',
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'wish-completion-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'wish-completion-refresh-token-refreshed',
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

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}`
    ) {
      await fulfillJson(
        {
          capabilities: { canComment: false, canDelete: true, canEdit: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { id: ACCOUNT_ID, displayName: 'Anna' },
          id: WISH_ID,
          spaceId: SPACE_ID,
          status: completed ? 'COMPLETED' : 'OPEN',
          title: WISH_TITLE,
          updatedAt: TEST_NOW,
          version: completed ? 2 : 1,
        },
        200,
        { ETag: completed ? '"2"' : '"1"' },
      );
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/wishes/${WISH_ID}/complete`
    ) {
      if (request.headers()['if-match'] !== '1') {
        await fulfillJson(
          {
            code: 'RESOURCE_VERSION_CONFLICT',
            detail: 'Expected If-Match for the current Wish version.',
            status: 409,
            title: 'Conflict',
          },
          409,
        );
        return;
      }
      completed = true;
      await fulfillJson(
        {
          capabilities: { canComment: false, canDelete: true, canEdit: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { id: ACCOUNT_ID, displayName: 'Anna' },
          id: WISH_ID,
          spaceId: SPACE_ID,
          status: 'COMPLETED',
          title: WISH_TITLE,
          updatedAt: TEST_NOW,
          version: 2,
        },
        200,
        { ETag: '"2"' },
      );
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Wish completion test does not define ${method} ${pathname}.`,
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

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function assertNoWcagViolations(page: Page): Promise<void> {
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
  const summary = result.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes.length} node(s)`,
    )
    .join('\n');
  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

type VisualScenario = {
  name: string;
  viewport: { width: number; height: number };
  theme: 'light' | 'dark';
};

const visualScenarios: VisualScenario[] = [
  { name: '390-light', viewport: { width: 390, height: 844 }, theme: 'light' },
  { name: '390-dark', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { name: '320-reflow', viewport: { width: 320, height: 720 }, theme: 'light' },
  {
    name: '1440-expanded-light',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
  },
];

async function prepareCompletedScenario(
  page: Page,
  scenario: VisualScenario,
): Promise<void> {
  await page.setViewportSize(scenario.viewport);
  await page.addInitScript((theme) => {
    window.localStorage.setItem('eimir.theme', theme);
  }, scenario.theme);
  await installMocks(page);
  await signIn(page);
  await page.goto(`/plan/wishes/${WISH_ID}`);

  await page.getByText(m5s3.wish.actionsHeading).click();
  await expect(
    page.getByRole('button', { name: m5s3.wish.complete }),
  ).toBeVisible();
  await page.getByRole('button', { name: m5s3.wish.complete }).click();
  const completionHeading = page.getByRole('heading', {
    name: m5s3.wish.completionTitle,
  });
  await expect(completionHeading).toBeVisible();
  await expect(completionHeading).toBeFocused();
  await expect(
    page.getByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    scenario.theme,
  );
  await assertNoHorizontalOverflow(page);
}

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await captureR3Evidence(
    page,
    testInfo,
    `r3-wish-completion-${name}.png`,
    false,
  );
}

for (const scenario of visualScenarios) {
  test(`fulfilled Wish continuation: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await prepareCompletedScenario(page, scenario);
    if (scenario.name === '390-light') await assertNoWcagViolations(page);
    await captureEvidence(page, testInfo, scenario.name);
  });
}

test('fulfilled Wish opens canonical Memory create without publishing Wish text in the URL', async ({
  page,
}) => {
  await prepareCompletedScenario(page, visualScenarios[0]);

  await page.getByRole('button', { name: m5s3.wish.createMemory }).click();

  await expect(page).toHaveURL(/\/story\/memories\/new$/);
  const target = new URL(page.url());
  expect(target.pathname).toBe('/story/memories/new');
  expect([...target.searchParams.keys()]).toEqual([]);
});

test('Done dismisses the transient continuation and restores focus without offering it after reload', async ({
  page,
}) => {
  await prepareCompletedScenario(page, visualScenarios[0]);

  const backLink = page.getByRole('button', { name: m5s3.common.back });
  await page.getByRole('button', { name: m5s3.wish.completionDone }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.wish.completionTitle }),
  ).toHaveCount(0);
  await expect(page.getByText(m5s3.wish.completedBody)).toBeVisible();
  await expect(backLink).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/plan/wishes/${WISH_ID}$`));

  await page.reload();
  await expect(page.getByText(m5s3.wish.completedBody)).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.wish.createMemory }),
  ).toHaveCount(0);
});
