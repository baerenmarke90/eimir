import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

type MockOptions = {
  sharedAchievementsEnabled?: boolean;
  completionFailuresBeforeSuccess?: number;
  /** Holds every completion response until `releaseCompletion()`. */
  holdCompletion?: boolean;
  /** HTTP status of the failing completion attempts (default 500). */
  failureStatus?: number;
  /** A 409 means another member already completed the Plan. */
  conflictCompletesPlan?: boolean;
};

type MockState = {
  completionCalls: number;
  planReads: number;
  releaseCompletion: () => void;
};

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  let completed = false;
  const sharedAchievementsEnabled = options.sharedAchievementsEnabled ?? true;
  const completionFailuresBeforeSuccess =
    options.completionFailuresBeforeSuccess ?? 0;
  const gates: Array<() => void> = [];
  const state: MockState = {
    completionCalls: 0,
    planReads: 0,
    releaseCompletion: () => {
      for (const open of gates.splice(0)) open();
    },
  };
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
        contentType: 'application/json',
        headers,
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
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await fulfillJson(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: null,
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 1,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'IMMEDIATE',
        },
        200,
        { ETag: '"1"' },
      );
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
      state.planReads += 1;
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
      state.completionCalls += 1;
      if (options.holdCompletion) {
        await new Promise<void>((open) => gates.push(open));
      }
      if (state.completionCalls <= completionFailuresBeforeSuccess) {
        const failureStatus = options.failureStatus ?? 500;
        if (failureStatus === 409 && options.conflictCompletesPlan) {
          completed = true;
        }
        await fulfillJson(
          {
            code: 'E2E_PLAN_COMPLETE_FAILED',
            detail: 'Synthetic completion failure.',
            status: failureStatus,
            title: 'Synthetic completion failure',
          },
          failureStatus,
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
        sharedAchievementsEnabled
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

  return state;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.body.querySelectorAll('*'))
        .filter((node) => node.getBoundingClientRect().right > clientWidth + 1)
        .slice(0, 8)
        .map(
          (node) =>
            `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}[${(node.textContent ?? '').slice(0, 30)}|r=${Math.round(node.getBoundingClientRect().right)}]`,
        ),
    };
  });
  expect(
    dimensions.scrollWidth,
    `Overflowing elements: ${dimensions.overflowing.join(', ')}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
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
  reducedMotion?: boolean;
  fontScale?: number;
};

const visualScenarios: VisualScenario[] = [
  { name: '390-light', viewport: { width: 390, height: 844 }, theme: 'light' },
  { name: '390-dark', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { name: '320-reflow', viewport: { width: 320, height: 720 }, theme: 'light' },
  { name: '360-light', viewport: { width: 360, height: 800 }, theme: 'light' },
  { name: '430-light', viewport: { width: 430, height: 900 }, theme: 'light' },
  {
    name: '390-reduced-motion',
    viewport: { width: 390, height: 844 },
    theme: 'light',
    reducedMotion: true,
  },
  {
    name: '390-200-percent',
    viewport: { width: 390, height: 1100 },
    theme: 'light',
    fontScale: 2,
  },
  {
    name: '1440-expanded-light',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
  },
];

async function prepareScenario(
  page: Page,
  scenario: VisualScenario,
): Promise<void> {
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({
    reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
  });
  await page.addInitScript((theme) => {
    window.localStorage.setItem('eimir.theme', theme);
  }, scenario.theme);
  await installMocks(page);
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);
  if (scenario.fontScale) {
    await page.addStyleTag({
      content: `html { font-size: ${scenario.fontScale * 100}% !important; }`,
    });
  }

  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toBeVisible();
  await expect(page.locator('.shared-achievement-confirmation')).toHaveCount(1);
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
  if (scenario.reducedMotion) {
    const animationName = await page
      .locator('.shared-achievement-confirmation')
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(animationName).toBe('none');
  }
  // Measure the settled success surface, after its non-blocking entrance fade.
  await page
    .locator('.shared-achievement-confirmation')
    .evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => animation.finished),
      );
    });
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
  test(`completed Plan continuation: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await prepareScenario(page, scenario);
    if (scenario.name === '390-light') await assertNoWcagViolations(page);
    await captureEvidence(page, testInfo, scenario.name);
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

test('Later dismisses the continuation and restores focus to stable Plan navigation', async ({
  page,
}) => {
  await prepareScenario(page, visualScenarios[0]);

  const backLink = page.getByRole('button', { name: m5s3.common.back });
  await page.getByRole('button', { name: m5s3.planStory.later }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(0);
  await expect(backLink).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN_ID}$`));
});

test('disabled Shared Achievements keeps normal Plan completion without celebration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'light');
  });
  await installMocks(page, { sharedAchievementsEnabled: false });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);

  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.completedTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(0);
});

test('failed completion shows no celebration and a deliberate retry celebrates exactly once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'light');
  });
  const state = await installMocks(page, {
    sharedAchievementsEnabled: true,
    completionFailuresBeforeSuccess: 1,
  });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);

  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
  const complete = page.getByRole('button', { name: m5s3.plan.complete });
  await complete.click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(0);
  await expect(complete).toBeVisible();

  await complete.click();

  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(1);
  expect(state.completionCalls).toBe(2);
});

const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'evidence',
  '508',
  'plan-completion',
);

async function savePlanCompletionEvidence(
  page: Page,
  testInfo: TestInfo,
  fileName: string,
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  // The off-screen skip link would otherwise be stitched into the capture.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: outputPath, fullPage: true });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.copyFileSync(outputPath, path.join(EVIDENCE_DIR, fileName));
}

function pendingStatus(page: Page) {
  return page.getByRole('status').filter({
    hasText: m5s3.plan.completePending.split('{{date}}')[0],
  });
}

async function openActionsAndChooseDay(page: Page): Promise<void> {
  await page.getByText(m5s3.plan.actionsHeading).click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(EXPERIENCED_ON);
}

async function assertCompetingWritesLocked(page: Page): Promise<void> {
  await expect(page.getByLabel(m5s3.plan.experiencedOn)).toHaveAttribute(
    'readonly',
    '',
  );
  for (const name of [
    m5s3.plan.reschedule,
    m5s3.plan.unschedule,
    de.common.edit,
  ]) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
  await expect(page.getByLabel(m5s3.plan.plannedDate)).toBeDisabled();
  const action = page.getByRole('button', { name: m5s3.common.saving });
  await expect(action).toHaveAttribute('aria-disabled', 'true');
  await expect(action).toBeFocused();
}

type PendingScenario = VisualScenario & { evidence: string };

const pendingScenarios: PendingScenario[] = [
  {
    name: '390-light',
    evidence: 'plan-completion-pending-390-light',
    viewport: { width: 390, height: 844 },
    theme: 'light',
  },
  {
    name: '390-dark',
    evidence: 'plan-completion-pending-390-dark',
    viewport: { width: 390, height: 844 },
    theme: 'dark',
  },
  {
    name: '320-dark-200-percent-reduced-motion',
    evidence: 'plan-completion-pending-320-dark-200pct',
    viewport: { width: 320, height: 900 },
    theme: 'dark',
    reducedMotion: true,
    fontScale: 2,
  },
  {
    name: '1280-expanded-light',
    evidence: 'plan-completion-pending-1280-light',
    viewport: { width: 1280, height: 900 },
    theme: 'light',
  },
];

for (const scenario of pendingScenarios) {
  test(`pending Plan completion claims one request and confirms only from the server: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({
      reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
    });
    await page.addInitScript((theme) => {
      window.localStorage.setItem('eimir.theme', theme);
    }, scenario.theme);
    const state = await installMocks(page, { holdCompletion: true });
    await signIn(page);
    await page.goto(`/plan/plans/${PLAN_ID}`);
    if (scenario.fontScale) {
      await page.addStyleTag({
        content: `html { font-size: ${scenario.fontScale * 100}% !important; }`,
      });
    }
    await openActionsAndChooseDay(page);

    // Two activations in the same task still make one authoritative request.
    const completeAction = page.getByRole('button', {
      name: m5s3.plan.complete,
    });
    await completeAction.focus();
    await completeAction.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await expect(pendingStatus(page)).toHaveCount(1);
    await expect(pendingStatus(page)).toBeVisible();
    await expect(pendingStatus(page)).toContainText('11.09.2026');
    await assertCompetingWritesLocked(page);
    await expect(page.getByLabel(m5s3.plan.experiencedOn)).toHaveValue(
      EXPERIENCED_ON,
    );
    // Not claimed before the server answers.
    await expect(
      page.getByText(m5s3.plan.completedTitle, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: m5s3.planStory.memoryAction }),
    ).toHaveCount(0);
    expect(state.completionCalls).toBe(1);
    await assertNoHorizontalOverflow(page);
    if (scenario.name === '390-light' || scenario.name === '390-dark') {
      await assertNoWcagViolations(page);
    }
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      scenario.theme,
    );
    await savePlanCompletionEvidence(
      page,
      testInfo,
      `${scenario.evidence}.png`,
    );

    state.releaseCompletion();
    await expect(
      page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
    ).toBeVisible();
    await expect(pendingStatus(page)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: m5s3.planStory.memoryAction }),
    ).toBeVisible();
    expect(state.completionCalls).toBe(1);
    await assertNoHorizontalOverflow(page);
    if (scenario.reducedMotion) {
      const animationName = await page
        .locator('.shared-achievement-confirmation')
        .evaluate((node) => getComputedStyle(node).animationName);
      expect(animationName).toBe('none');
    }
    if (scenario.name !== '390-dark') {
      await savePlanCompletionEvidence(
        page,
        testInfo,
        `${scenario.evidence.replace('-pending-', '-confirmed-')}.png`,
      );
    }
  });
}

test('failed pending completion removes the status, keeps the day and retries only deliberately', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'light');
  });
  const state = await installMocks(page, {
    holdCompletion: true,
    completionFailuresBeforeSuccess: 1,
  });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);
  await openActionsAndChooseDay(page);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();
  await expect(pendingStatus(page)).toBeVisible();

  state.releaseCompletion();
  await expect(pendingStatus(page)).toHaveCount(0);
  await expect(
    page.getByRole('alert').filter({ hasText: de.states.server.title }),
  ).toBeVisible();
  await expect(page.getByLabel(m5s3.plan.experiencedOn)).toHaveValue(
    EXPERIENCED_ON,
  );
  await expect(
    page.getByRole('button', { name: m5s3.plan.complete }),
  ).toHaveAttribute('aria-disabled', 'false');
  await expect(
    page.getByRole('button', { name: m5s3.plan.complete }),
  ).toBeFocused();
  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(0);
  expect(state.completionCalls).toBe(1);
  await assertNoWcagViolations(page);
  await savePlanCompletionEvidence(
    page,
    testInfo,
    'plan-completion-failure-390-light.png',
  );

  await page.getByRole('button', { name: m5s3.plan.complete }).click();
  await expect(pendingStatus(page)).toBeVisible();
  state.releaseCompletion();
  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(1);
  expect(state.completionCalls).toBe(2);
});

test('a completion conflict is recovered from a fresh read without celebration or a replayed request', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'light');
  });
  const state = await installMocks(page, {
    holdCompletion: true,
    completionFailuresBeforeSuccess: 1,
    failureStatus: 409,
    conflictCompletesPlan: true,
  });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);
  await openActionsAndChooseDay(page);
  await page.getByRole('button', { name: m5s3.plan.complete }).click();
  await expect(pendingStatus(page)).toBeVisible();
  const readsBeforeConflict = state.planReads;

  state.releaseCompletion();
  await expect(page.getByText(m5s3.plan.completedBody)).toBeVisible();
  await expect(pendingStatus(page)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: m5s3.planStory.memoryAction }),
  ).toHaveCount(0);
  expect(state.planReads).toBeGreaterThan(readsBeforeConflict);
  expect(state.completionCalls).toBe(1);
  await savePlanCompletionEvidence(
    page,
    testInfo,
    'plan-completion-conflict-recovered-390-light.png',
  );
});

test('keyboard activation sends one completion and keeps focus on the action while it is pending', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installMocks(page, { holdCompletion: true });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN_ID}`);
  await openActionsAndChooseDay(page);

  const complete = page.getByRole('button', { name: m5s3.plan.complete });
  await complete.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');

  await expect(pendingStatus(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.common.saving }),
  ).toBeFocused();
  expect(state.completionCalls).toBe(1);

  state.releaseCompletion();
  await expect(
    page.getByRole('heading', { name: m5s3.plan.sharedAchievementTitle }),
  ).toBeFocused();
  expect(state.completionCalls).toBe(1);
});
