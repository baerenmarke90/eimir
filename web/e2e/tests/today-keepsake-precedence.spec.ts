import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';

// Regression coverage for #840: after Couple Presence, a genuinely
// current/upcoming relationship signal (the Shared Planning Horizon) must
// precede a merely generic Keepsake fallback. A genuine date-specific
// retrospective is not a generic fallback and keeps its established
// prominence ahead of the planning area.

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-09T10:00:00Z';

async function expectNoWcagViolations(page: Page): Promise<void> {
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

async function expectHorizontalReflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(hasOverflow, 'Page must not overflow horizontally').toBe(false);
}

type DashboardScenario = Record<string, unknown>;

async function installDashboardMocks(
  page: Page,
  dashboard: DashboardScenario,
): Promise<void> {
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
        account: { displayName: 'Lea', id: ACCOUNT_ID },
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
      await fulfillJson({ displayName: 'Lea', id: ACCOUNT_ID });
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
        relationshipStartedOn: '2025-04-01T00:00:00Z',
        showRelationshipDuration: true,
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
        displayName: 'Lea',
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
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
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
      await fulfillJson(dashboard);
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The Today precedence test did not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signInAndOpenToday(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.today-hero')).toBeVisible();
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const filename = `today-r4-${name}.png`;
  const screenshot = await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
  const exportDirectory = process.env.SCREENSHOT_EXPORT_DIR;
  if (exportDirectory) {
    mkdirSync(exportDirectory, { recursive: true });
    writeFileSync(path.join(exportDirectory, filename), screenshot);
  }
}

const upcomingPlan = {
  id: 'plan-1',
  type: 'PLAN',
  titleOrText: 'Weekend trip to Vienna',
  scheduledAt: '2026-09-14T10:00:00Z',
  occurredOn: null,
  createdAt: TEST_NOW,
};

const genericKeepsake = {
  id: 'mem-photo',
  type: 'MEMORY',
  titleOrText: 'Sunset by the lake',
  occurredOn: '2026-09-06T12:00:00Z',
  createdAt: TEST_NOW,
  previewAttachmentId: null,
};

const dateSpecificRetrospective = {
  id: 'heart-1',
  type: 'HEART_MOMENT',
  titleOrText: 'One year ago: our first concert',
  createdAt: '2025-09-09T18:00:00Z',
};

const baseSpace = {
  partner: { id: 'partner-1', displayName: 'Alex' },
  spaceId: SPACE_ID,
};

/*
 * Product Reference v1 R4 retains the useful #840/#850 regression invariant:
 * a generic Keepsake never outranks genuinely current/upcoming context. The
 * roles are now availability-driven rather than a promise that every section
 * permanently exists.
 */
test.describe('Today R4: current/upcoming context outranks a generic Keepsake', () => {
  test('a genuinely current/upcoming signal precedes the Keepsake on Compact', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installDashboardMocks(page, {
      space: baseSpace,
      relationshipDuration: {
        daysTogether: 512,
        displayMode: 'DAYS',
        startedOn: '2025-04-01T00:00:00Z',
      },
      thinkingOfYouAvailableAt: null,
      upcoming: [upcomingPlan],
      keepsake: genericKeepsake,
      recentShared: [],
      retrospective: null,
    });
    await signInAndOpenToday(page);

    const planningArea = page.locator('.today-section-upcoming');
    const keepsakeSection = page.locator('.today-section-moment');
    await expect(planningArea).toBeVisible();
    await expect(keepsakeSection).toBeVisible();

    const order = await page.evaluate(() => {
      const planning = document.querySelector('.today-section-upcoming');
      const keepsake = document.querySelector('.today-section-moment');
      if (!planning || !keepsake) return null;
      return planning.compareDocumentPosition(keepsake) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? 'planning-first'
        : 'keepsake-first';
    });
    expect(order).toBe('planning-first');

    await expectHorizontalReflow(page);
    // #841 corrected the shared-kind badge text token (was
    // `--color-shared-accent`, now `--color-shared`), so the generic
    // Keepsake card's color-contrast is asserted here again.
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'signal-before-keepsake-390-light');

    await page.setViewportSize({ width: 320, height: 844 });
    await expectHorizontalReflow(page);
    await capture(page, testInfo, 'signal-before-keepsake-320-reflow');
  });

  test('the Keepsake becomes the first content section when no current/upcoming signal exists', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installDashboardMocks(page, {
      space: baseSpace,
      relationshipDuration: {
        daysTogether: 512,
        displayMode: 'DAYS',
        startedOn: '2025-04-01T00:00:00Z',
      },
      thinkingOfYouAvailableAt: null,
      upcoming: [],
      keepsake: genericKeepsake,
      recentShared: [],
      retrospective: null,
    });
    await signInAndOpenToday(page);

    await expect(page.locator('.today-section-upcoming')).toHaveCount(0);
    await expect(page.locator('.today-section-moment')).toBeVisible();

    const keepsakeIsFirstContentSection = await page.evaluate(() => {
      const content = document.querySelector('.today-content');
      if (!content) return false;
      const firstSection = content.querySelector('.today-section');
      return firstSection?.classList.contains('today-section-moment') ?? false;
    });
    expect(keepsakeIsFirstContentSection).toBe(true);

    // This Keepsake carries no ready photo, so its real text becomes the
    // focal content rather than an empty image frame or generic placeholder.
    await expect(page.locator('.today-moment-text')).toBeVisible();
    await expect(page.getByText(genericKeepsake.titleOrText)).toBeVisible();
    await expect(page.locator('.today-moment-figure')).toHaveCount(0);

    await expectHorizontalReflow(page);
    // See #841 note above: the shared-kind badge token fix means this
    // Keepsake-only view is now asserted axe-clean too.
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'keepsake-only-390-light');
  });

  test('a genuine date-specific retrospective fills the single `Gerade bei euch` slot below Demnächst (#850 supersedes #840 ordering)', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installDashboardMocks(page, {
      space: baseSpace,
      relationshipDuration: {
        daysTogether: 512,
        displayMode: 'DAYS',
        startedOn: '2025-04-01T00:00:00Z',
      },
      thinkingOfYouAvailableAt: null,
      upcoming: [upcomingPlan],
      keepsake: null,
      recentShared: [],
      retrospective: dateSpecificRetrospective,
    });
    await signInAndOpenToday(page);

    const order = await page.evaluate(() => {
      const living = document.querySelector('.today-section-living');
      const planning = document.querySelector('.today-section-upcoming');
      if (!living || !planning) return null;
      return planning.compareDocumentPosition(living) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? 'planning-first'
        : 'living-first';
    });
    expect(order).toBe('planning-first');

    // The retrospective is still shown, exactly once, as the one contextual
    // module - it is not dropped and not duplicated.
    await expect(page.locator('.today-living-retrospective')).toHaveCount(1);
    await expect(page.locator('.today-section-living')).toHaveCount(1);
    await expect(
      page.getByText('One year ago: our first concert'),
    ).toBeVisible();
    // No Keepsake exists in this scenario, so the photo feature is absent.
    await expect(page.locator('.today-moment-figure')).toHaveCount(0);

    await expectHorizontalReflow(page);
    await capture(page, testInfo, 'retrospective-before-planning-390-dark');
  });

  test('Expanded (1440) preserves the corrected precedence as adaptation, not redesign', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await installDashboardMocks(page, {
      space: baseSpace,
      relationshipDuration: {
        daysTogether: 512,
        displayMode: 'DAYS',
        startedOn: '2025-04-01T00:00:00Z',
      },
      thinkingOfYouAvailableAt: null,
      upcoming: [upcomingPlan],
      keepsake: genericKeepsake,
      recentShared: [],
      retrospective: null,
    });
    await signInAndOpenToday(page);

    const order = await page.evaluate(() => {
      const planning = document.querySelector('.today-section-upcoming');
      const keepsake = document.querySelector('.today-section-moment');
      if (!planning || !keepsake) return null;
      return planning.compareDocumentPosition(keepsake) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? 'planning-first'
        : 'keepsake-first';
    });
    expect(order).toBe('planning-first');

    await capture(page, testInfo, 'signal-before-keepsake-1440-expanded');
  });

  test('sparse space (no upcoming, no keepsake, no retrospective) remains coherent', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installDashboardMocks(page, {
      space: baseSpace,
      relationshipDuration: null,
      thinkingOfYouAvailableAt: null,
      upcoming: [],
      keepsake: null,
      recentShared: [],
      retrospective: null,
    });
    await signInAndOpenToday(page);

    await expect(page.locator('.new-space-experience')).toBeVisible();
    await expect(page.locator('.today-section-upcoming')).toHaveCount(0);
    await expect(page.locator('.today-section-moment')).toHaveCount(0);
    await expect(page.locator('.today-section-living')).toHaveCount(0);
    await expect(page.locator('.today-section-monthly')).toHaveCount(0);

    await expectHorizontalReflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'empty-new-relationship-390-light');
  });
});
