import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import recaps from '../../src/i18n/locales/recaps';
import m5s5 from '../../src/i18n/locales/m5s5';
const moduleContract: { moduleKeys: string[] } = JSON.parse(
  readFileSync(
    new URL(
      '../../src/client/dashboardModuleCatalog.contract.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

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
    if (await fulfillDefaultAppIcon(route)) return;
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/recaps`) {
      await fulfillJson({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/daily-quote`
    ) {
      await fulfillJson({
        checkedOn: '2026-09-09',
        enabled: false,
        quote: null,
      });
      return;
    }
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
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments/heart-1`
    ) {
      await fulfillJson({
        id: 'heart-1',
        spaceId: SPACE_ID,
        version: 1,
        text: 'One year ago: our first concert',
        emotion: 'HAPPY',
        happenedOn: '2025-09-09',
        visibility: 'SHARED',
        attachment: null,
        tags: [],
        authorId: ACCOUNT_ID,
        author: { id: ACCOUNT_ID, displayName: 'Lea' },
        createdAt: '2025-09-09T18:00:00Z',
        updatedAt: '2025-09-09T18:00:00Z',
        capabilities: { canEdit: false, canDelete: false, canComment: false },
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
  fullPage = true,
): Promise<void> {
  const filename = `today-r4-${name}.png`;
  const screenshot = await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage,
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
  previewIsSensitive: false,
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
 * #1189 deliberately changes the outer Today composition: personal shared
 * content appears before the practical planning horizon so the page does not
 * read as a stack of utilities. Upcoming context remains present and
 * authoritative; this suite locks that new presentation contract.
 */
test.describe('Today R4: personal content precedes the practical horizon', () => {
  test('a generic Keepsake precedes the practical horizon on Compact', async ({
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
    expect(order).toBe('keepsake-first');

    await expectHorizontalReflow(page);
    // #841 corrected the shared-kind badge text token (was
    // `--color-shared-accent`, now `--color-shared`), so the generic
    // Keepsake card's color-contrast is asserted here again.
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'keepsake-before-signal-390-light');

    await page.setViewportSize({ width: 320, height: 844 });
    await expectHorizontalReflow(page);
    await capture(page, testInfo, 'keepsake-before-signal-320-reflow');
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

  for (const scenario of [
    { width: 360, theme: 'light' },
    { width: 390, theme: 'dark' },
    { width: 430, theme: 'light' },
    { width: 1280, theme: 'dark' },
    { width: 320, theme: 'dark', largeText: true },
  ] as const) {
    test(`independent daily rediscovery below upcoming: ${scenario.width}-${scenario.theme}`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({
        colorScheme: scenario.theme,
        reducedMotion: 'reduce',
      });
      await page.setViewportSize({ width: scenario.width, height: 900 });
      await installDashboardMocks(page, {
        space: baseSpace,
        relationshipDuration: null,
        thinkingOfYouAvailableAt: null,
        upcoming: [upcomingPlan],
        keepsake: null,
        recentShared: [],
        retrospective: dateSpecificRetrospective,
      });
      await signInAndOpenToday(page);
      if ('largeText' in scenario)
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      const section = page.locator('.today-section-retrospective');
      await expect(section).toBeVisible();
      await expect(
        section.getByRole('heading', {
          name: m5s5.today.living.retrospectiveLabel,
        }),
      ).toHaveCount(1);
      await expect(page.locator('.today-section-living')).toHaveCount(0);
      const action = section.getByRole('link', {
        name: m5s5.today.living.retrospectiveAction,
      });
      await expect(action).toHaveClass(/button-link-primary/);
      await expect(action).toHaveAttribute(
        'href',
        '/story/heart-moments/heart-1',
      );
      const colors = await action.evaluate((node) => {
        const actual = getComputedStyle(node).backgroundColor;
        const probe = document.createElement('span');
        probe.style.backgroundColor = getComputedStyle(
          document.documentElement,
        ).getPropertyValue('--color-brand-strong');
        node.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { actual, expected };
      });
      expect(colors.actual).toBe(colors.expected);
      const order = await page
        .locator('.today-content > .today-section')
        .evaluateAll((nodes) => nodes.map((node) => node.className));
      expect(
        order.findIndex((value) =>
          value.includes('today-section-retrospective'),
        ),
      ).toBeGreaterThan(
        order.findIndex((value) => value.includes('today-section-upcoming')),
      );
      await expectHorizontalReflow(page);
      await expectNoWcagViolations(page);
      await section.scrollIntoViewIfNeeded();
      await section.evaluate((node) =>
        node.scrollIntoView({ block: 'center' }),
      );
      await capture(
        page,
        testInfo,
        `independent-rediscovery-${scenario.width}-${scenario.theme}`,
        false,
      );
      await action.click();
      await expect(page).toHaveURL(/\/story\/heart-moments\/heart-1$/);
      await expect(
        page.getByRole('heading', {
          name: 'One year ago: our first concert',
          exact: true,
        }),
      ).toBeVisible();
      await page.goBack();
      await expect(section).toBeVisible();
      await section
        .getByRole('button', {
          name: m5s5.today.living.retrospectiveDismissToday,
        })
        .click();
      await expect(section).toHaveCount(0);
      await page.reload();
      await expect(page.locator('.today-hero')).toBeVisible();
      await expect(section).toHaveCount(0);
    });
  }

  test('retrospective settings persist independent visibility and personal order beside the partner signal', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await installDashboardMocks(page, {
      space: baseSpace,
      relationshipDuration: null,
      thinkingOfYouAvailableAt: null,
      upcoming: [],
      keepsake: null,
      recentShared: [],
      retrospective: dateSpecificRetrospective,
    });
    let preferences = moduleContract.moduleKeys.map((moduleKey) => ({
      moduleKey,
      visible: true,
    }));
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/dashboard/preferences**`,
      async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (request.method() === 'PATCH') {
          const key = pathname.split('/').at(-1);
          const patch = request.postDataJSON();
          preferences = preferences.map((item) =>
            item.moduleKey === key ? { ...item, ...patch } : item,
          );
          await route.fulfill({
            json: preferences.find((item) => item.moduleKey === key),
          });
          return;
        }
        if (request.method() === 'PUT') {
          const keys = request.postDataJSON().moduleKeys as string[];
          preferences = keys.map(
            (key) => preferences.find((item) => item.moduleKey === key)!,
          );
        }
        await route.fulfill({ json: { items: preferences } });
      },
    );
    await page.route(`**/api/v1/spaces/${SPACE_ID}/activity*`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 'comment',
              kind: 'COMMENT_CREATED',
              actorId: 'partner-1',
              targetType: 'MEMORY',
              targetId: 'another-memory',
              createdAt: TEST_NOW,
              occurredAt: TEST_NOW,
              sourceEventId: 'event-comment',
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      }),
    );
    await signInAndOpenToday(page);
    await expect(page.locator('.today-section-retrospective')).toBeVisible();
    await expect(page.locator('.today-section-living')).toBeVisible();
    await capture(page, info, 'rediscovery-beside-partner-390-light');
    await page.goto('/more/settings/today');
    const retro = page.getByRole('checkbox', {
      name: m5s5.today.living.retrospectiveLabel,
      exact: true,
    });
    const signal = page.getByRole('checkbox', {
      name: m5s5.today.living.kicker,
      exact: true,
    });
    await retro.uncheck();
    await expect(retro).toBeEnabled();
    await expect(signal).toBeChecked();
    await page.goto('/today');
    await expect(page.locator('.today-hero')).toBeVisible();
    await expect(page.locator('.today-section-retrospective')).toHaveCount(0);
    await expect(page.locator('.today-section-living')).toBeVisible();
    await page.goto('/more/settings/today');
    await expect(retro).not.toBeChecked();
    await retro.check();
    await expect(retro).toBeEnabled();
    await signal.uncheck();
    await expect(signal).toBeEnabled();
    const grip = page.getByRole('button', {
      name: `${m5s5.today.living.retrospectiveLabel} verschieben`,
      exact: true,
    });
    await grip.focus();
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(() =>
        preferences.findIndex((item) => item.moduleKey === 'retrospective'),
      )
      .toBe(moduleContract.moduleKeys.indexOf('retrospective') + 1);
    await capture(page, info, 'rediscovery-settings-390-light');
    await page.goto('/today');
    await expect(page.locator('.today-hero')).toBeVisible();
    await expect(page.locator('.today-section-retrospective')).toBeVisible();
    await expect(page.locator('.today-section-living')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.today-section-retrospective')).toBeVisible();
  });

  test('Expanded (1440) preserves the personal-first precedence as adaptation, not redesign', async ({
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
    expect(order).toBe('keepsake-first');

    await capture(page, testInfo, 'keepsake-before-signal-1440-expanded');
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
    await expect(
      page.getByRole('link', { name: recaps.profileLink }),
    ).toHaveAttribute('href', '/more/passport');
    await expect(page.locator('.monthly-recap-invitation')).toHaveCount(0);
    await expect(page.getByRole('link', { name: recaps.watchNow })).toHaveCount(
      0,
    );

    await expectHorizontalReflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'empty-new-relationship-390-light');
  });
});
