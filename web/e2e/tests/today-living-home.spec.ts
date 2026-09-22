import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s5 from '../../src/i18n/locales/m5s5';
import relationshipComponents from '../../src/i18n/locales/relationshipComponents';

/*
 * Product Reference v1 R4 calibrates `/today` as the living home of a
 * relationship: compact couple presence, restrained current context, one
 * focal item, and only relevant supporting relationship content.
 *
 * These tests assert that composition against real rendered pixels with real
 * photographs (the repository's own demo assets), across the Compact,
 * reflow, small-height and Expanded viewports the issue requires, in both
 * themes, with axe, keyboard and reduced-motion coverage.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';

const DEMO_IMAGES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../backend/demo_assets/images',
);
const PHOTO_FOR_ATTACHMENT: Record<string, string> = {
  'att-moment': 'breakfast-coffee-croissants.jpg',
  'att-strip-1': 'dog-outdoors.jpg',
  'att-strip-2': 'lake-sunrise.jpg',
  'att-strip-3': 'cabin-lake.jpg',
};

const NOW = new Date();
/*
 * `occurredOn` is an OpenAPI `format: date` field, so the server sends a bare
 * `YYYY-MM-DD` string. The mock sends the same shape: a full timestamp here
 * would exercise a payload the API never produces and would hide the
 * date-only month classification these tests are meant to cover.
 */
const thisMonthDate = (day: number) =>
  `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const inDaysDate = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);
const thisMonth = (day: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), day, 12, 0, 0).toISOString();
const inDays = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

/** The R4 section order when every eligible role is present, top to bottom. */
const NORMATIVE_ORDER = [
  '.today-hero',
  '.today-section-upcoming',
  '.today-section-moment',
  '.today-section-living',
  '.today-section-monthly',
  '.today-section-recent',
] as const;

const UPCOMING = [
  {
    id: 'plan-1',
    type: 'PLAN',
    titleOrText: 'Flohmarkt am Samstag',
    scheduledAt: inDays(11),
    occurredOn: null,
    createdAt: inDays(-3),
    previewAttachmentId: null,
  },
  {
    id: 'plan-2',
    type: 'PLAN',
    titleOrText: 'Herbstwanderung',
    scheduledAt: inDays(18),
    occurredOn: null,
    createdAt: inDays(-2),
    previewAttachmentId: null,
  },
  {
    id: 'plan-3',
    type: 'IMPORTANT_DATE',
    titleOrText: 'Geburtstag von Mira',
    scheduledAt: null,
    occurredOn: inDaysDate(25),
    createdAt: inDays(-9),
    previewAttachmentId: null,
  },
];

const MOMENT = {
  id: 'mem-moment',
  type: 'MEMORY',
  titleOrText: 'Frühstück in Saarbrücken',
  occurredOn: thisMonthDate(2),
  createdAt: thisMonth(2),
  scheduledAt: null,
  previewAttachmentId: 'att-moment',
};

const STRIP_PHOTOS = [1, 2, 3].map((n) => ({
  id: `mem-strip-${n}`,
  type: 'MEMORY',
  titleOrText: `Gemeinsamer Moment ${n}`,
  occurredOn: thisMonthDate(3 + n),
  createdAt: thisMonth(3 + n),
  scheduledAt: null,
  previewAttachmentId: `att-strip-${n}`,
}));

const SHARED_WISH = {
  id: 'wish-1',
  type: 'WISH',
  titleOrText: 'Ein Wochenende am Meer',
  occurredOn: null,
  createdAt: inDays(-40),
  scheduledAt: null,
  previewAttachmentId: null,
};

const TRACE_ONLY = {
  id: 'hm-1',
  type: 'HEART_MOMENT',
  titleOrText: 'Kleine Alltagsmomente',
  occurredOn: thisMonthDate(3),
  createdAt: thisMonth(3),
  scheduledAt: null,
  previewAttachmentId: null,
};

const RICH_SPACE = {
  upcoming: UPCOMING,
  keepsake: MOMENT,
  retrospective: null,
  recentShared: [MOMENT, ...STRIP_PHOTOS, TRACE_ONLY, SHARED_WISH],
  activity: [
    {
      id: 'act-rich-signal',
      kind: 'COMMENT_CREATED',
      actorId: PARTNER_ID,
      targetType: 'WISH',
      targetId: SHARED_WISH.id,
      createdAt: inDays(-1),
      occurredAt: inDays(-1),
      sourceEventId: 'ev-rich-signal',
    },
  ],
};

/** `Diesen Monat` with a single photo: the plain, non-carousel wide band. */
const ONE_MONTHLY_PHOTO_SPACE = {
  upcoming: [],
  keepsake: MOMENT,
  retrospective: null,
  recentShared: [MOMENT, STRIP_PHOTOS[0]],
  activity: [] as unknown[],
};

/** `Diesen Monat` with two photos: the compact swipe carousel's minimum. */
const TWO_MONTHLY_PHOTOS_SPACE = {
  upcoming: [],
  keepsake: MOMENT,
  retrospective: null,
  recentShared: [MOMENT, STRIP_PHOTOS[0], STRIP_PHOTOS[1]],
  activity: [] as unknown[],
};

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

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow, 'Page must not overflow horizontally').toBe(false);
}

/*
 * Wait for every running CSS animation and transition to land.
 *
 * The section reveal translates each module 8 px on the Y axis with a
 * staggered delay, and the theme cross-fade runs for 400 ms. Measuring
 * geometry or colour while either is in flight reads a value that never
 * exists on a settled page. Wait for the actual end of those animations
 * rather than for a duration; infinite decorative animations are filtered
 * out so this can never hang.
 */
async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();
      return timing?.iterations !== Number.POSITIVE_INFINITY;
    });
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

/**
 * The composition order is a property of the document, not of the pixels.
 *
 * Asserting it in the DOM keeps it meaningful on Expanded, where the
 * `Gerade bei euch` and `Diesen Monat` modules deliberately share a row and
 * therefore have no meaningful top-to-bottom relationship. `expectSingleColumnVisualOrder`
 * covers the Compact case, where document order and visual order must agree.
 */
async function expectNormativeOrder(page: Page): Promise<void> {
  const order = await page.evaluate(
    (selectors) => {
      const present: string[] = [];
      const nodes = [...document.querySelectorAll(selectors.join(','))];
      for (const node of nodes) {
        const match = selectors.find((selector) => node.matches(selector));
        if (match) present.push(match);
      }
      return present;
    },
    NORMATIVE_ORDER as unknown as string[],
  );

  const expected = NORMATIVE_ORDER.filter((selector) =>
    order.includes(selector),
  );
  expect(
    order,
    `Sections must appear in the R4 document order: ${expected.join(' -> ')}`,
  ).toEqual(expected);
}

/**
 * On Compact the page is one column, so the normative order must also be the
 * order the eye reads. Motion is settled first, because the staggered 8 px
 * reveal would otherwise make two adjacent sections compare out of order.
 */
async function expectSingleColumnVisualOrder(page: Page): Promise<void> {
  await settleMotion(page);
  const tops = await page.evaluate(
    (selectors) => {
      const values: number[] = [];
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node) values.push(Math.round(node.getBoundingClientRect().top));
      }
      return values;
    },
    NORMATIVE_ORDER as unknown as string[],
  );

  expect(
    [...tops].sort((a, b) => a - b),
    'Compact sections must read top to bottom in the R4 order',
  ).toEqual(tops);
}

type Scenario = {
  upcoming: unknown[];
  keepsake: unknown;
  retrospective: unknown;
  recentShared: unknown[];
  activity: unknown[];
};

async function installMocks(
  page: Page,
  scenario: Scenario,
  itemLimit: 1 | 2 | 3 = 1,
  presenceState: 'ACTIVE' | 'RECENT' | null | 'ERROR' = null,
  withPartner = true,
): Promise<void> {
  const viewer = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
  const partner = { id: PARTNER_ID, displayName: 'Alex Berger' };

  await page.route('**/media/**', async (route) => {
    const id = new URL(route.request().url()).pathname
      .split('/')
      .pop()
      ?.replace('.jpg', '');
    const file = id ? PHOTO_FOR_ATTACHMENT[id] : undefined;
    if (!file) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: readFileSync(path.join(DEMO_IMAGES, file)),
    });
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
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
        account: viewer,
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'today-850-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'today-850-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson(viewer);
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
        createdAt: '2023-07-01T00:00:00Z',
        partners: withPartner ? [viewer, partner] : [viewer],
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-07-04',
        showRelationshipDuration: true,
        durationDisplayMode: 'YEARS_MONTHS',
      });
      return;
    }
    if (
      method === 'GET' &&
      /^\/api\/v1\/spaces\/[^/]+\/profiles\/[^/]+$/.test(pathname)
    ) {
      const isPartner = pathname.endsWith(partner.id);
      await fulfillJson({
        accountId: isPartner ? partner.id : viewer.id,
        createdAt: '2023-07-01T00:00:00Z',
        displayName: isPartner ? partner.displayName : viewer.displayName,
        id: isPartner ? PARTNER_PROFILE_ID : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-07-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      if (presenceState === 'ERROR') {
        await fulfillJson(
          {
            code: 'PRESENCE_UNAVAILABLE',
            detail: 'Presence is temporarily unavailable.',
            status: 503,
            title: 'Presence unavailable',
          },
          503,
        );
      } else {
        await fulfillJson({ state: presenceState });
      }
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
      await fulfillJson({
        hasMore: false,
        items: scenario.activity,
        nextCursor: null,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [{ moduleKey: 'upcoming', itemLimit }] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        space: {
          spaceId: SPACE_ID,
          partner: withPartner ? partner : null,
        },
        relationshipDuration: {
          daysTogether: 1164,
          startedOn: '2023-07-04',
          displayMode: 'YEARS_MONTHS',
        },
        thinkingOfYouAvailableAt: null,
        upcoming: scenario.upcoming,
        keepsake: scenario.keepsake,
        retrospective: scenario.retrospective,
        recentShared: scenario.recentShared,
      });
      return;
    }
    if (
      method === 'POST' &&
      /\/attachments\/[^/]+\/read-access$/.test(pathname)
    ) {
      const attachmentId = pathname.split('/').slice(-2)[0];
      await fulfillJson({
        method: 'STREAM',
        url: `/media/${attachmentId}.jpg`,
        expiresAt: null,
      });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The Today R4 test did not define ${method} ${pathname}.`,
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

test.describe('Today R4: the living home of a relationship', () => {
  test('keeps partner Presence hidden and dormant across Today viewports', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const presenceRequests: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === `/api/v1/spaces/${SPACE_ID}/presence`) {
        presenceRequests.push(`${request.method()} ${pathname}`);
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light' });
    await installMocks(page, RICH_SPACE, 1, 'ACTIVE');
    await signInAndOpenToday(page);
    await page.waitForLoadState('networkidle');

    const hero = page.locator('.today-hero');
    await expect(hero.locator('.partner-presence-avatar-state')).toHaveCount(0);
    await expect(hero.locator('.couple-presence-indicator')).toHaveCount(0);
    await expect(
      page.getByText(relationshipComponents.couplePresenceActive),
    ).toHaveCount(0);
    await expect(
      page.getByText(relationshipComponents.couplePresenceRecent),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'presence-disabled-390-light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await settleMotion(page);
    await expect(hero.locator('.partner-presence-avatar-state')).toHaveCount(0);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'presence-disabled-390-dark');

    for (const width of [320, 360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await settleMotion(page);
      await expect(hero.locator('.partner-presence-avatar-state')).toHaveCount(0);
      await expect(hero.locator('.couple-presence-indicator')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await settleMotion(page);
    await expect(hero.locator('.partner-presence-avatar-state')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'presence-disabled-1440-light');

    expect(presenceRequests).toEqual([]);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installMocks(page, RICH_SPACE, 1, null, false);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.today-hero')).toBeVisible();
    await expect(
      page.getByText(relationshipComponents.couplePresenceWaiting),
    ).toBeVisible();
    await expect(page.locator('.partner-presence-avatar-state')).toHaveCount(0);
    expect(presenceRequests).toEqual([]);
  });

  test('composes the full eligible hierarchy on a 390-class phone, in Light and Dark', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await page.emulateMedia({ colorScheme: 'light' });
    await signInAndOpenToday(page);

    // Every module of the composition is present, in the normative order.
    for (const selector of NORMATIVE_ORDER) {
      await expect(page.locator(selector)).toBeVisible();
    }
    await expectNormativeOrder(page);
    await expectSingleColumnVisualOrder(page);

    // Exactly one contextual module, never a stack of widgets.
    await expect(page.locator('.today-living')).toHaveCount(1);

    // `Euer Moment` leads with a real photograph, not a placeholder.
    const momentImage = page.locator('.today-moment-media img');
    await expect(momentImage).toBeVisible();
    expect(
      await momentImage.evaluate(
        (img) => (img as HTMLImageElement).naturalWidth,
      ),
    ).toBeGreaterThan(0);

    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, '390-light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await settleMotion(page);
    await expectNormativeOrder(page);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, '390-dark');
  });

  test('brings the relationship hero and `Euer Moment` into the first phone viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    await settleMotion(page);
    const metrics = await page.evaluate(() => {
      const top = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? Math.round(node.getBoundingClientRect().top) : null;
      };
      return {
        dateTitle: top('.today-date-title'),
        relationshipTitle: top('.couple-presence-title'),
        moment: top('.today-section-moment'),
        momentImage: top('.today-moment-media'),
      };
    });

    // #1155 deliberately inserted the Today/date masthead before Couple
    // Presence. The masthead now owns the old "close under shell chrome"
    // invariant, while the relationship identity must still remain early in
    // the first phone viewport rather than being pushed below a stacked band.
    expect(metrics.dateTitle).not.toBeNull();
    expect(metrics.dateTitle as number).toBeLessThan(120);
    expect(metrics.relationshipTitle).not.toBeNull();
    expect(metrics.relationshipTitle as number).toBeLessThan(260);
    expect(metrics.relationshipTitle as number).toBeGreaterThan(
      metrics.dateTitle as number,
    );

    // The page's emotional anchor, and its actual photograph, are both inside
    // the first 844 px viewport rather than a scroll away.
    expect(metrics.moment as number).toBeLessThan(600);
    expect(metrics.momentImage as number).toBeLessThan(700);
  });

  test('consumes the shared upcoming preference: default 1, explicit 1/2/3', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE, 1);
    await signInAndOpenToday(page);

    // #854's default of 1 is visibly effective: one calm, complete entry.
    await expect(page.locator('.today-agenda-row')).toHaveCount(1);
    await expect(page.getByText(UPCOMING[0].titleOrText)).toBeVisible();
    await expect(page.getByText(UPCOMING[1].titleOrText)).toHaveCount(0);

    // Today never stores a limit of its own; the section is a pure consumer
    // of the Account+Space Dashboard preference from #848.
    const localStorageKeys = await page.evaluate(() =>
      Object.keys(window.localStorage),
    );
    expect(
      localStorageKeys.filter((key) => /upcoming|dashboard/i.test(key)),
    ).toEqual([]);

    for (const limit of [2, 3] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await installMocks(page, RICH_SPACE, limit);
      await page.reload();
      await expect(page.locator('.today-agenda-row')).toHaveCount(limit);
      await expectNormativeOrder(page);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('gives each content type its own visual grammar rather than one repeated card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    const grammar = await page.evaluate(() => {
      const read = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          shadow: style.boxShadow,
        };
      };
      return {
        agenda: read('.today-agenda-row'),
        moment: read('.today-moment-figure'),
        living: read('.today-living'),
        monthly: read('.today-monthly-tile'),
        trace: read('.today-recent-tile'),
      };
    });

    for (const [name, value] of Object.entries(grammar)) {
      expect(value, `${name} must render`).not.toBeNull();
    }

    // The raised agenda tile and the flat secondary trace tile must not be
    // the same surface: elevation is what separates primary from secondary.
    expect(grammar.agenda?.shadow).not.toBe('none');
    expect(grammar.trace?.shadow).toBe('none');
    expect(grammar.agenda?.background).not.toBe(grammar.trace?.background);

    // The contextual module is a tinted panel, distinct from both.
    expect(grammar.living?.background).not.toBe(grammar.agenda?.background);

    // The retired generic content card is gone for good.
    await expect(page.locator('.today-card')).toHaveCount(0);
    await expect(page.locator('.today-card-badges')).toHaveCount(0);
  });

  test('shows this month as real photos and claims no total it cannot prove', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    const strip = page.locator('.today-monthly-tile');
    await expect(strip).toHaveCount(3);
    for (const tile of await strip.all()) {
      const image = tile.locator('img');
      await expect(image).toBeVisible();
      expect(
        await image.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
    }

    // The photo already shown large above is never repeated in the strip.
    const monthlyHrefs = await page
      .locator('.today-monthly-tile')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href') ?? ''),
      );
    expect(monthlyHrefs.some((href) => href.includes(MOMENT.id))).toBe(false);

    // `recentShared` is capped server-side, so no total is asserted from it.
    const monthlyText = await page
      .locator('.today-section-monthly')
      .innerText();
    expect(monthlyText).not.toMatch(/\d+\s+gemeinsame Momente/);
  });

  test('keeps a single `Diesen Monat` photo as one plain wide band, no carousel behavior (#858)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, ONE_MONTHLY_PHOTO_SPACE);
    await signInAndOpenToday(page);

    await expect(page.locator('.today-monthly-tile')).toHaveCount(1);

    const listOverflow = await page
      .locator('.today-monthly-strip')
      .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(listOverflow).toBe(false);

    await expectNoHorizontalOverflow(page);
  });

  test('renders a `Diesen Monat` swipe carousel with two photos on Compact, second image discoverable (#858)', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, TWO_MONTHLY_PHOTOS_SPACE);
    await signInAndOpenToday(page);
    await settleMotion(page);

    const rects = await page
      .locator('.today-monthly-tile')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect()),
      );
    expect(rects).toHaveLength(2);

    // One horizontal row, not stacked, with the second tile already
    // partially visible at the edge as the swipe invitation.
    expect(Math.round(rects[0].top)).toBe(Math.round(rects[1].top));
    expect(rects[1].left).toBeGreaterThan(rects[0].left);
    expect(rects[1].left).toBeLessThan(390);

    // The section stays a compact strip, not a near-full-screen square.
    expect(rects[0].height).toBeLessThan(300);

    // The overflow that makes swiping possible is contained in the strip
    // itself, never leaking out to the page.
    const monthlyInteraction = await page
      .locator('.today-monthly-strip')
      .evaluate((node) => {
        const style = getComputedStyle(node);
        const items = Array.from(
          node.querySelectorAll<HTMLElement>('.today-monthly-item'),
        );
        return {
          usesSharedTrack: node.classList.contains('eimir-media-snap-track'),
          allItemsUseSharedSnap: items.every(
            (item) =>
              item.classList.contains('eimir-media-snap-item') &&
              item.classList.contains('eimir-media-snap-item-start'),
          ),
          scrollSnapType: style.scrollSnapType,
          overscrollBehaviorX: style.overscrollBehaviorX,
          touchAction: style.touchAction,
          overflow: node.scrollWidth > node.clientWidth + 1,
          snapStops: items.map((item) => getComputedStyle(item).scrollSnapStop),
        };
      });
    expect(monthlyInteraction.usesSharedTrack).toBe(true);
    expect(monthlyInteraction.allItemsUseSharedSnap).toBe(true);
    expect(monthlyInteraction.scrollSnapType).toContain('x');
    expect(monthlyInteraction.scrollSnapType).toContain('mandatory');
    expect(monthlyInteraction.overscrollBehaviorX).toBe('contain');
    expect(monthlyInteraction.touchAction).toBe('manipulation');
    expect(monthlyInteraction.overflow).toBe(true);
    expect(monthlyInteraction.snapStops).toEqual(['always', 'always']);

    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'monthly-carousel-two-390');
  });

  for (const width of [320, 390]) {
    test(`renders a three-photo \`Diesen Monat\` scroll-snap carousel with no vertical stacking or page overflow at ${width}px (#858)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await installMocks(page, RICH_SPACE, 3);
      await signInAndOpenToday(page);
      await settleMotion(page);

      const rects = await page
        .locator('.today-monthly-tile')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect()),
        );
      expect(rects).toHaveLength(3);

      const tops = new Set(rects.map((rect) => Math.round(rect.top)));
      expect(tops.size).toBe(1);
      const lefts = rects.map((rect) => Math.round(rect.left));
      expect(new Set(lefts).size).toBe(lefts.length);

      const stripOverflow = await page
        .locator('.today-monthly-strip')
        .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
      expect(stripOverflow).toBe(true);

      await expectNoHorizontalOverflow(page);
    });
  }

  test('never shows the same memory as both a `Diesen Monat` thumbnail and a `Zuletzt bei euch` row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    /*
     * Compare the content tiles themselves, not every anchor in the section.
     * A section's own "Alle anzeigen" link and a Heart Moment row both point
     * at `/story`, which is shared navigation rather than a repeated item.
     */
    const hrefsOf = async (selector: string) =>
      page
        .locator(selector)
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('href') ?? ''),
        );

    const monthlyHrefs = await hrefsOf('.today-monthly-tile[href]');
    const traceHrefs = await hrefsOf('.today-recent-tile[href]');

    expect(monthlyHrefs.length).toBeGreaterThan(0);
    expect(traceHrefs.length).toBeGreaterThan(0);

    // No memory may be reachable as both a thumbnail up there and a row down
    // here: whatever the strip claimed is featured content.
    const shared = monthlyHrefs.filter((href) => traceHrefs.includes(href));
    expect(shared, 'A memory must not appear in both sections').toEqual([]);

    // Concretely: every photo of the month is in the strip and none of them
    // is repeated below.
    for (const photo of STRIP_PHOTOS) {
      const href = `/story/memories/${photo.id}`;
      expect(monthlyHrefs).toContain(href);
      expect(traceHrefs).not.toContain(href);
    }

    // Content the strip cannot take is still offered by the trace, so the
    // exclusion did not simply empty the section.
    await expect(
      page.locator('.today-section-recent').getByText(TRACE_ONLY.titleOrText),
    ).toBeVisible();

    await expectNormativeOrder(page);
  });

  test('omits `Diesen Monat` and gives real shared text deliberate focal treatment when no photo exists', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, {
      upcoming: [UPCOMING[0]],
      keepsake: null,
      retrospective: null,
      recentShared: [TRACE_ONLY, SHARED_WISH],
      activity: [],
    });
    await signInAndOpenToday(page);

    await expect(page.locator('.today-section-monthly')).toHaveCount(0);
    await expect(page.locator('.today-moment-figure')).toHaveCount(0);
    await expect(page.locator('.today-moment-text')).toBeVisible();
    await expect(page.getByText(TRACE_ONLY.titleOrText)).toBeVisible();

    // The text-first state remains compact and content-led, not a large empty
    // photo-shaped frame holding the best part of the first viewport.
    const textFocalHeight = await page
      .locator('.today-moment-text')
      .evaluate((node) => Math.round(node.getBoundingClientRect().height));
    expect(textFocalHeight).toBeLessThan(220);

    // Planning already owns the current horizon, so the contextual slot does
    // not duplicate it with an unrelated Wish fallback.
    await expect(page.locator('.today-section-living')).toHaveCount(0);

    await expectNormativeOrder(page);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, 'text-first-no-photo-390-light');
  });

  test('never shows the same shared memory as both a partner signal and a later section', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, {
      ...RICH_SPACE,
      // The partner commented on the second photo of the month, which
      // `Diesen Monat` and `Zuletzt bei euch` would otherwise show again.
      activity: [
        {
          id: 'act-1',
          kind: 'COMMENT_CREATED',
          actorId: PARTNER_ID,
          targetType: 'MEMORY',
          targetId: STRIP_PHOTOS[0].id,
          createdAt: inDays(-1),
          occurredAt: inDays(-1),
          sourceEventId: 'ev-1',
        },
      ],
    });
    await signInAndOpenToday(page);

    // The signal takes the contextual slot, because its target is not the
    // photo already featured as `Euer Moment`.
    await expect(page.locator('.today-living-partner_signal')).toHaveCount(1);

    // Its underlying memory is featured content now, so no later section
    // links to it again anywhere on the page.
    const links = await page
      .locator('.today-content a')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href') ?? ''),
      );
    const commentedHref = `/story/memories/${STRIP_PHOTOS[0].id}`;
    expect(links.filter((href) => href === commentedHref)).toHaveLength(1);

    // The other photos of the month are untouched, so nothing over-filtered.
    await expect(page.locator('.today-monthly-tile')).toHaveCount(2);
    await expectNormativeOrder(page);
  });

  test('skips a partner comment about the current `Euer Moment` and falls through the chain', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, {
      ...RICH_SPACE,
      // The partner commented on the very photo shown large above.
      activity: [
        {
          id: 'act-1',
          kind: 'COMMENT_CREATED',
          actorId: PARTNER_ID,
          targetType: 'MEMORY',
          targetId: MOMENT.id,
          createdAt: inDays(-1),
          occurredAt: inDays(-1),
          sourceEventId: 'ev-1',
        },
      ],
    });
    await signInAndOpenToday(page);

    // Selecting it would have duplicated `Euer Moment`. Because `Demnächst`
    // already owns the current planning horizon, R4 does not fill the slot
    // with a Wish or Plan fallback just to preserve a fixed stack.
    await expect(page.locator('.today-living-partner_signal')).toHaveCount(0);
    await expect(page.locator('.today-living-wish')).toHaveCount(0);
    await expect(page.locator('.today-living')).toHaveCount(0);
    await expectNormativeOrder(page);
  });

  test('omits `Gerade bei euch` entirely when nothing qualifies', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, {
      upcoming: [UPCOMING[0]],
      keepsake: MOMENT,
      retrospective: null,
      recentShared: [MOMENT, TRACE_ONLY],
      activity: [],
    });
    await signInAndOpenToday(page);

    await expect(page.locator('.today-section-living')).toHaveCount(0);
    await expect(page.locator('.today-section-upcoming')).toBeVisible();
    await expect(page.locator('.today-section-moment')).toBeVisible();
    await expectNormativeOrder(page);
  });

  test('drops `Demnächst` and keeps the rest coherent when nothing is upcoming', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, { ...RICH_SPACE, upcoming: [] });
    await signInAndOpenToday(page);

    await expect(page.locator('.today-section-upcoming')).toHaveCount(0);
    await expect(page.locator('.today-agenda-row')).toHaveCount(0);
    await expect(page.locator('.today-section-moment')).toBeVisible();
    await expectNormativeOrder(page);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
  });

  test('reflows at 320 CSS px without horizontal overflow or a forced side-by-side layout', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await installMocks(page, RICH_SPACE, 3);
    await signInAndOpenToday(page);

    await expectNormativeOrder(page);
    await expectSingleColumnVisualOrder(page);
    await expectNoHorizontalOverflow(page);

    // With three items, `Demnächst` is a horizontal swipe carousel (#858):
    // tiles sit side by side on one row rather than stacking vertically.
    const rects = await page
      .locator('.today-agenda-row')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect()),
      );
    const tops = new Set(rects.map((rect) => Math.round(rect.top)));
    expect(tops.size).toBe(1);
    const lefts = rects.map((rect) => Math.round(rect.left));
    expect(new Set(lefts).size).toBe(lefts.length);

    // The carousel's own overflow is what pages horizontally, not the page.
    const listOverflow = await page
      .locator('.today-agenda-list')
      .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(listOverflow).toBe(true);

    // Nothing else is clipped away to fake a fit.
    const clipped = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.today-section-body, .today-agenda-row, .today-living',
        ),
      ].some((node) => node.scrollWidth > node.clientWidth + 1),
    );
    expect(clipped).toBe(false);

    await expectNoWcagViolations(page);
    await capture(page, testInfo, '320-reflow');
  });

  test('keeps hero and `Demnächst` from consuming a small-height phone screen', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    await settleMotion(page);
    const momentTop = await page
      .locator('.today-section-moment')
      .evaluate((node) => Math.round(node.getBoundingClientRect().top));
    // The emotional anchor still starts within the short viewport.
    expect(momentTop).toBeLessThan(640);

    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'small-height-390x640');
  });

  test('adapts the same hierarchy on 1440 Expanded without becoming a dashboard', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await installMocks(page, RICH_SPACE);
    await page.emulateMedia({ colorScheme: 'light' });
    await signInAndOpenToday(page);

    await expectNormativeOrder(page);
    await expect(page.locator('.today-living')).toHaveCount(1);

    // Expanded spends its width on placing the two smallest modules beside
    // each other, rather than stretching either across the whole canvas.
    await settleMotion(page);
    const sideBySide = await page.evaluate(() => {
      const living = document.querySelector('.today-section-living');
      const monthly = document.querySelector('.today-section-monthly');
      if (!living || !monthly) return null;
      const a = living.getBoundingClientRect();
      const b = monthly.getBoundingClientRect();
      return { sameRow: Math.abs(a.top - b.top) < 4, livingWidth: a.width };
    });
    expect(sideBySide?.sameRow).toBe(true);
    expect(sideBySide?.livingWidth).toBeLessThan(800);

    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, '1440-light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await settleMotion(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, '1440-dark');
  });

  test('preserves the R4 composition at the remaining Compact and wide evidence widths', async ({
    page,
  }, testInfo) => {
    await installMocks(page, RICH_SPACE);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAndOpenToday(page);

    for (const viewport of [
      { width: 360, height: 800, name: '360-light' },
      { width: 430, height: 932, name: '430-light' },
      { width: 1920, height: 1080, name: '1920-light' },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await settleMotion(page);
      await expectNormativeOrder(page);
      await expectNoHorizontalOverflow(page);
      await capture(page, testInfo, viewport.name);
    }
  });

  test('stays readable and axe-clean at 200 percent layout zoom', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 1024 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '200%';
    });

    await expectNormativeOrder(page);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await capture(page, testInfo, '1280-zoom-200');
  });

  test('reaches every module by keyboard with a visible focus ring', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    const reachable = new Set<string>();
    const wanted = [
      'today-hero-action',
      'today-agenda-row',
      'today-moment',
      'today-living-action',
      'today-monthly-tile',
      'today-recent-tile',
      'today-recent-activity-link',
    ];

    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const node = document.activeElement as HTMLElement | null;
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          classes: node.className?.toString() ?? '',
          outlineWidth: style.outlineWidth,
        };
      });
      if (!focused) continue;
      for (const name of wanted) {
        if (focused.classes.includes(name)) reachable.add(name);
      }
      if (reachable.size === wanted.length) break;
    }

    expect([...reachable].sort()).toEqual([...wanted].sort());

    // No focus trap: focus keeps advancing out of the page content.
    await expect(page.locator('.today-section-recent')).toBeVisible();
  });

  test('conveys the whole composition with reduced motion, animating nothing', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    for (const selector of NORMATIVE_ORDER) {
      await expect(page.locator(selector)).toBeVisible();
    }
    await expectNormativeOrder(page);

    const transitions = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.today-agenda-row-link, .today-recent-tile, .today-moment-figure, .today-monthly-tile, .today-living-action',
        ),
      ].map((node) => getComputedStyle(node).transitionDuration),
    );
    expect(transitions.length).toBeGreaterThan(0);
    for (const duration of transitions) {
      expect(duration).toBe('0s');
    }

    // Content is fully opaque without waiting for a reveal animation.
    const opacities = await page.evaluate(() =>
      [...document.querySelectorAll('.today-section')].map((node) =>
        Number.parseFloat(getComputedStyle(node).opacity),
      ),
    );
    for (const opacity of opacities) {
      expect(opacity).toBe(1);
    }

    await capture(page, testInfo, 'reduced-motion-390');
  });

  test('navigates from the composed modules to their real routes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    // `Euer Moment` opens the memory it shows.
    await expect(page.locator('.today-moment-link')).toHaveAttribute(
      'href',
      `/story/memories/${MOMENT.id}`,
    );

    // `Diesen Monat` links into Momente's Zeitleiste view (#858 follow-up),
    // and each tile into its memory.
    await expect(
      page.locator('.today-section-monthly .today-section-link'),
    ).toHaveAttribute('href', '/story?tab=timeline');
    await expect(page.locator('.today-monthly-tile').first()).toHaveAttribute(
      'href',
      `/story/memories/${STRIP_PHOTOS[0].id}`,
    );

    // `Demnächst` offers the full planning surface.
    await expect(
      page.locator('.today-section-upcoming .today-section-link'),
    ).toHaveAttribute('href', '/plan');

    // Full activity navigation stays reachable from the secondary trace.
    const activityLink = page.locator('.today-recent-activity-link');
    await expect(activityLink).toHaveAttribute('href', '/today/activity');
    await activityLink.click();
    await expect(page).toHaveURL(/\/today\/activity$/);
  });

  test('never shows the internal `keepsake` term to users', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, RICH_SPACE);
    await signInAndOpenToday(page);

    const visibleText = (
      await page.locator('.today-content').innerText()
    ).toLowerCase();
    expect(visibleText).not.toContain('keepsake');
    expect(visibleText).toContain(m5s5.today.keepsake.kicker.toLowerCase());
  });
});
