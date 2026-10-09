import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import { captureR3Evidence } from './r3-evidence';

const WISH_EVIDENCE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/product/design/evidence/508/wish-completion',
);

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const WISH_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-12T09:00:00Z';
const WISH_TITLE = 'Nordlichter sehen';

async function installMocks(
  page: Page,
  options: { hold?: Promise<void>; failure?: number; offline?: boolean } = {},
) {
  let completed = false;
  let completionRequests = 0;

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
      completionRequests += 1;
      await options.hold;
      if (options.offline) {
        await route.abort('internetdisconnected');
        return;
      }
      if (options.failure) {
        if (options.failure === 409) completed = true;
        await fulfillJson(
          {
            code:
              options.failure === 409
                ? 'RESOURCE_VERSION_CONFLICT'
                : 'INTERNAL_ERROR',
            status: options.failure,
            title: 'Completion failed',
          },
          options.failure,
        );
        return;
      }
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
        detail: `Wish completion test does not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
  return { requestCount: () => completionRequests };
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

function heldResponse() {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { hold, release };
}

async function openWish(page: Page, scenario: VisualScenario) {
  await page.setViewportSize(scenario.viewport);
  await page.addInitScript(
    (theme) => localStorage.setItem('eimir.theme', theme),
    scenario.theme,
  );
  await signIn(page);
  await page.goto(`/plan/wishes/${WISH_ID}`);
  await page.getByText(m5s3.wish.actionsHeading).click();
  await expect(
    page.getByRole('button', { name: m5s3.wish.complete, exact: true }),
  ).toBeEnabled();
}

async function capturePendingEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  const fileName = `planning-wish-completion-${name}.png`;
  const output = testInfo.outputPath(fileName);
  await page.screenshot({ path: output, fullPage: true });
  await testInfo.attach(fileName, { path: output, contentType: 'image/png' });
  fs.mkdirSync(WISH_EVIDENCE_DIR, { recursive: true });
  fs.copyFileSync(output, path.join(WISH_EVIDENCE_DIR, fileName));
}

const pendingScenarios = [
  ...visualScenarios,
  {
    name: '360-light',
    viewport: { width: 360, height: 780 },
    theme: 'light' as const,
  },
  {
    name: '430-dark',
    viewport: { width: 430, height: 932 },
    theme: 'dark' as const,
  },
];
for (const scenario of pendingScenarios) {
  test(`Wish pending completion locks competing writes: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    const held = heldResponse();
    const mocks = await installMocks(page, held);
    if (scenario.name === '320-reflow')
      await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWish(page, scenario);
    if (scenario.name === '320-reflow')
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const title = page.getByLabel(m5s3.wish.planTitle);
    await title.fill('Keep this future Plan');
    const complete = page.getByRole('button', {
      name: m5s3.wish.complete,
      exact: true,
    });
    await complete.focus();
    await complete.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(mocks.requestCount).toBe(1);
    const status = page
      .getByRole('status', { name: '' })
      .filter({ hasText: m5s3.wish.completePending });
    await expect(status).toHaveCount(1);
    await expect(status).toBeVisible();
    await expect(
      page.getByText(m5s3.wish.status.OPEN, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: m5s3.wish.completing, exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: de.common.edit, exact: true }),
    ).toBeDisabled();
    await expect(title).toBeDisabled();
    await expect(title).toHaveValue('Keep this future Plan');
    await expect(
      page.getByRole('button', { name: m5s3.wish.convert, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: m5s3.wish.createMemory }),
    ).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    if (scenario.name.startsWith('390')) await assertNoWcagViolations(page);
    await capturePendingEvidence(page, testInfo, `pending-${scenario.name}`);
    // Critical status stays visible even when operational details are collapsed.
    await page.getByText(m5s3.wish.actionsHeading).click();
    await expect(status).toBeVisible();
    held.release();
    const heading = page.getByRole('heading', {
      name: m5s3.wish.completionTitle,
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(status).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    if (scenario.name === '320-reflow') {
      await expect(page.locator('.eimir-motion-success')).toHaveCSS(
        'animation-name',
        'none',
      );
    }
    if (scenario.name === '390-light')
      await capturePendingEvidence(page, testInfo, 'confirmed-390-light');
    await page.getByRole('button', { name: m5s3.wish.completionDone }).click();
    await expect(page.getByText(m5s3.wish.completedBody)).toBeVisible();
    await expect(
      page.getByRole('button', { name: m5s3.common.back }),
    ).toBeFocused();
    expect(mocks.requestCount()).toBe(1);
  });
}

test('failed Wish completion preserves conversion input and allows explicit retry', async ({
  page,
}, testInfo) => {
  const held = heldResponse();
  const options = { hold: held.hold, failure: 500 as number | undefined };
  const mocks = await installMocks(page, options);
  await openWish(page, visualScenarios[0]);
  await page.getByLabel(m5s3.wish.planTitle).fill('Future trip');
  await page
    .getByRole('button', { name: m5s3.wish.complete, exact: true })
    .click();
  await expect.poll(mocks.requestCount).toBe(1);
  held.release();
  await expect(
    page.getByRole('alert').getByText(de.states.server.title),
  ).toBeVisible();
  await expect(page.getByText(m5s3.wish.completePending)).toHaveCount(0);
  await expect(page.getByLabel(m5s3.wish.planTitle)).toBeEnabled();
  await expect(page.getByLabel(m5s3.wish.planTitle)).toHaveValue('Future trip');
  await capturePendingEvidence(page, testInfo, 'failure-390-light');
  options.failure = undefined;
  await page
    .getByRole('button', { name: m5s3.wish.complete, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeVisible();
  expect(mocks.requestCount()).toBe(2);
});

test('conflicted Wish completion reads partner fulfillment without replay or our continuation', async ({
  page,
}, testInfo) => {
  const held = heldResponse();
  const mocks = await installMocks(page, { ...held, failure: 409 });
  await openWish(page, visualScenarios[0]);
  await page
    .getByRole('button', { name: m5s3.wish.complete, exact: true })
    .click();
  await expect.poll(mocks.requestCount).toBe(1);
  held.release();
  await expect(page.getByText(m5s3.wish.completedBody)).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.wish.createMemory }),
  ).toHaveCount(0);
  await expect(page.getByText(m5s3.wish.completePending)).toHaveCount(0);
  expect(mocks.requestCount()).toBe(1);
  await capturePendingEvidence(page, testInfo, 'conflict-recovered-390-light');
});

test('keyboard completion keeps action focus while pending then focuses confirmed continuation', async ({
  page,
}) => {
  const held = heldResponse();
  const mocks = await installMocks(page, held);
  await openWish(page, visualScenarios[0]);
  const action = page.getByRole('button', {
    name: m5s3.wish.complete,
    exact: true,
  });
  await action.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect.poll(mocks.requestCount).toBe(1);
  await expect(
    page.getByRole('button', { name: m5s3.wish.completing, exact: true }),
  ).toBeFocused();
  held.release();
  await expect(
    page.getByRole('heading', { name: m5s3.wish.completionTitle }),
  ).toBeFocused();
});

test('offline completion fails visibly and reconnect requires an explicit new attempt', async ({
  page,
}) => {
  const options = { offline: true };
  const mocks = await installMocks(page, options);
  await openWish(page, visualScenarios[0]);
  const title = page.getByLabel(m5s3.wish.planTitle);
  await title.fill('Future trip');
  await page.context().setOffline(true);
  await page
    .getByRole('button', { name: m5s3.wish.complete, exact: true })
    .click();
  await expect(page.getByText(de.states.offline.title)).toBeVisible();
  await expect(page.getByText(m5s3.wish.completePending)).toHaveCount(0);
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Future trip');
  expect(mocks.requestCount()).toBe(1);

  options.offline = false;
  await page.context().setOffline(false);
  await expect(page.getByText(de.states.offline.title)).toBeVisible();
  expect(mocks.requestCount()).toBe(1);
  await page
    .getByRole('button', { name: m5s3.wish.complete, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeVisible();
  expect(mocks.requestCount()).toBe(2);
});
