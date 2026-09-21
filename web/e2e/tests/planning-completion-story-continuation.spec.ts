import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import { captureR3Evidence } from './r3-evidence';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-12T07:00:00Z';
const EXPERIENCED_ON = '2026-09-11';

type CompletionMockOptions = {
  sharedAchievement?: boolean;
  completeStatus?: number;
};

async function installMocks(
  page: Page,
  options: CompletionMockOptions = {},
): Promise<void> {
  let completed = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const fulfillJson = async (
      body: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        headers,
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
          accessToken: 'planning-completion-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'planning-completion-refresh-token',
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'planning-completion-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'planning-completion-refresh-token-refreshed',
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
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}`
    ) {
      await fulfillJson({
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        description: 'Remember the blanket.',
        experiencedOn: completed ? EXPERIENCED_ON : null,
        id: PLAN_ID,
        placeId: null,
        plannedEnd: null,
        plannedStart: null,
        sourceWishId: null,
        spaceId: SPACE_ID,
        status: completed ? 'COMPLETED' : 'PLANNED',
        title: 'Picnic in the park',
        updatedAt: TEST_NOW,
        version: 4,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}/complete`
    ) {
      if (options.completeStatus && options.completeStatus >= 400) {
        await fulfillJson(
          {
            code: 'PLAN_COMPLETION_FAILED',
            detail: 'Completion failed.',
            status: options.completeStatus,
            title: 'Completion failed',
          },
          options.completeStatus,
        );
        return;
      }

      completed = true;
      await fulfillJson(
        {
          capabilities: { canComment: true, canDelete: true, canEdit: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { id: ACCOUNT_ID, displayName: 'Anna' },
          description: 'Remember the blanket.',
          experiencedOn: EXPERIENCED_ON,
          id: PLAN_ID,
          placeId: null,
          plannedEnd: null,
          plannedStart: null,
          sourceWishId: null,
          spaceId: SPACE_ID,
          status: 'COMPLETED',
          title: 'Picnic in the park',
          updatedAt: TEST_NOW,
          version: 4,
        },
        200,
        options.sharedAchievement
          ? { 'X-Eimir-Shared-Achievement': 'plan-completed' }
          : {},
      );
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Planning completion test does not define ${method} ${pathname}.`,
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
  { name: '320-reflow', viewport: { width: 320, height: 720 }, theme: 'light' },
  { name: '360-light', viewport: { width: 360, height: 800 }, theme: 'light' },
  { name: '390-light', viewport: { width: 390, height: 844 }, theme: 'light' },
  { name: '390-dark', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { name: '430-light', viewport: { width: 430, height: 900 }, theme: 'light' },
  {
    name: '1440-expanded-light',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
  },
];

async function prepareScenario(
  page: Page,
  scenario: VisualScenario,
  options: CompletionMockOptions = {},
): Promise<void> {
  await page.setViewportSize(scenario.viewport);
  await page.addInitScript((theme) => {
    window.localStorage.setItem('eimir.theme', theme);
  }, scenario.theme);
  await installMocks(page, options);
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);

  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();

  await expect(
    page.getByRole('heading', {
      name: options.sharedAchievement
        ? m5s3.plan.sharedAchievementTitle
        : m5s3.plan.completedTitle,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.planStory.memoryAction }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.planStory.milestoneAction }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.planStory.later }),
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
    `r3-plan-completion-${name}.png`,
    false,
  );
}

for (const scenario of visualScenarios) {
  test(`shared achievement completion: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await prepareScenario(page, scenario, { sharedAchievement: true });
    if (scenario.name === '390-light') await assertNoWcagViolations(page);
    await captureEvidence(page, testInfo, `shared-achievement-${scenario.name}`);
  });
}

test('completed Plan continuation opens canonical Memory capture and cancellation leaves completion authoritative', async ({
  page,
}) => {
  await prepareScenario(page, visualScenarios[0]);

  await page.getByRole('button', { name: m5s3.planStory.memoryAction }).click();
  await expect(page).toHaveURL(/\/story\/memories\/new$/);
  await expect(
    page.getByRole('heading', { name: de.memory.heading }),
  ).toBeVisible();

  await page.getByRole('button', { name: de.common.cancel }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN_ID}$`));
  await expect(page.getByText(m5s3.plan.completedBody)).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.planStory.memoryAction }),
  ).toHaveCount(0);
});

test('server-confirmed shared achievement is announced in context without replacing completion actions', async ({
  page,
}) => {
  await prepareScenario(page, visualScenarios[0], { sharedAchievement: true });

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toBeVisible();
  await expect(
    page.getByText(
      m5s3.plan.sharedAchievementBody.replace(
        '{{title}}',
        'Picnic in the park',
      ),
    ),
  ).toBeVisible();
  await expect(page.locator('.plan-story-continuation')).toHaveClass(
    /is-shared-achievement/,
  );
  await expect(
    page.getByRole('button', { name: m5s3.planStory.memoryAction }),
  ).toBeVisible();
  await assertNoWcagViolations(page);
  await assertNoHorizontalOverflow(page);
});

test('shared achievement reflows at 320 px with 200 percent text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installMocks(page, { sharedAchievement: true });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.goto(`/plan/plans/${PLAN_ID}`);

  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('shared achievement respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareScenario(page, visualScenarios[0], { sharedAchievement: true });

  const animationName = await page
    .locator('.plan-story-continuation.is-shared-achievement')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');
});

test('failed completion never renders shared achievement success', async ({
  page,
}) => {
  await page.setViewportSize(visualScenarios[0].viewport);
  await installMocks(page, { sharedAchievement: true, completeStatus: 500 });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);

  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(0);
  await expect(page.locator('.plan-story-continuation')).toHaveCount(0);
});

test('Later dismisses the continuation and restores focus to stable Plan navigation', async ({
  page,
}) => {
  await prepareScenario(page, visualScenarios[0]);

  const backLink = page.getByRole('button', { name: m5s3.common.back });
  await page.getByRole('button', { name: m5s3.planStory.later }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.completedTitle }),
  ).toHaveCount(0);
  await expect(backLink).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN_ID}$`));
});
