import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import copy from '../../src/i18n/locales/relationshipReflections';
import de from '../../src/i18n/locales/de';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import planningCopy from '../../src/i18n/locales/m5s3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_ID,
  PARTNER_ID,
  SPACE_ID,
  ME,
  PARTNER,
  CAPABILITIES,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

const TITLE = 'Our weekend by the sea';
const PLAN = '44444444-4444-4444-8444-444444444444';
const BASE = `/api/v1/spaces/${SPACE_ID}`;
const DAY = '2099-11-10';
async function fixture(
  page: Page,
  options: {
    pro?: boolean;
    hidden?: boolean;
    failWrite?: boolean;
    description?: string;
  } = {},
) {
  const unexpected = await installMocks(page);
  let highlighted = false;
  let version = 1;
  let patches = 0;
  let passportReads = 0;
  let coverAttached = false;
  let placeId: string | null = null;
  let savedPlace: Record<string, unknown> | null = null;
  const cover = {
    id: 'plan-cover-image',
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: 4000,
    width: 800,
    height: 600,
    hasThumbnail: true,
    isSensitive: false,
  };
  const plan = () => ({
    id: PLAN,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    title: TITLE,
    description:
      options.description ?? 'Time together, fresh sea air and long walks.',
    plannedOn: DAY,
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    placeId,
    coverAttachment: coverAttached ? cover : null,
    sourceWishId: null,
    anticipationEnabled: highlighted,
    status: 'PLANNED',
    version,
    createdAt: '2026-10-29T12:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
    capabilities: CAPABILITIES,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === `${BASE}/entitlements`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: options.pro === false ? 'FREE' : 'PREMIUM',
          status: 'ACTIVE',
          effectiveUntil: null,
          isInGracePeriod: false,
          capabilities: options.pro === false ? [] : ['relationship.passport'],
        },
      });
    if (path === `${BASE}/relationship-passport`) {
      passportReads++;
      return route.fulfill({
        json: {
          partner: PARTNER,
          relationshipDuration: {
            startedOn: '2023-06-17',
            daysTogether: 1230,
            displayMode: 'DAYS',
          },
          memories: 128,
          heartMoments: 12,
          milestones: 4,
          completedPlans: 24,
          places: 18,
        },
      });
    }
    if (path === `${BASE}/profile-preferences`)
      return route.fulfill({ json: [] });
    if (path === `${BASE}/configuration`)
      return route.fulfill({
        headers: { ETag: '"1"' },
        json: {
          spaceId: SPACE_ID,
          version: 1,

          supportGesturesEnabled: false,
          energyCheckInEnabled: false,
          vibeCheckEnabled: false,
          sharedAchievementsEnabled: false,
          dailyContextTimezone: null,
          canManageSpaceConfiguration: false,
          dailyQuestionsEnabled: false,
          loveNotesEnabled: false,
          energyVisibilityMode: 'IMMEDIATE',
          vibeVisibilityMode: 'IMMEDIATE',
        },
      });
    if (path === `${BASE}/dashboard/preferences`)
      return route.fulfill({
        json: {
          items: [
            { moduleKey: 'upcoming', visible: !options.hidden, itemLimit: 1 },
          ],
        },
      });
    if (path === `${BASE}/activity`)
      return route.fulfill({
        json: { items: [], nextCursor: null, hasMore: false },
      });
    if (path === `${BASE}/dashboard`)
      return route.fulfill({
        json: {
          space: { spaceId: SPACE_ID, partner: PARTNER },
          relationshipDuration: null,
          keepsake: {
            type: 'MEMORY',
            id: 'mem-canal',
            titleOrText: 'Our day by the lake',
            occurredOn: '2026-10-12',
            scheduledAt: null,
            createdAt: '2026-10-12T12:00:00Z',
            previewAttachmentId: 'att-canal-1',
            previewIsSensitive: false,
          },
          retrospective: null,
          recentShared: [],
          upcoming: [
            {
              type: 'PLAN',
              id: PLAN,
              titleOrText: TITLE,
              scheduledOn: DAY,
              scheduledAt: null,
              occurredOn: null,
              createdAt: null,
            },
          ],
          anticipation: highlighted
            ? { planId: PLAN, title: TITLE, eventOn: DAY, daysRemaining: 12 }
            : null,
          sharedStorySummary: {
            memories: 128,
            heartMoments: 12,
            milestones: 4,
          },
          thinkingOfYouAvailableAt: null,
          viewerLocalDate: '2099-10-29',
        },
      });
    if (path === `${BASE}/profiles/${PARTNER_ID}`)
      return route.fulfill({
        json: {
          accountId: PARTNER_ID,
          id: 'profile-partner',
          displayName: PARTNER.displayName,
          preferences: [],
          profileAttachmentId: null,
          version: 1,
        },
      });
    if (path.includes('/attachments/') && path.endsWith('/content'))
      return route.fulfill({
        contentType: 'image/jpeg',
        body: readFileSync(
          fileURLToPath(
            new URL(
              '../../../backend/demo_assets/images/lake-sunrise.jpg',
              import.meta.url,
            ),
          ),
        ),
      });
    if (path === `${BASE}/plans/${PLAN}` && method === 'GET')
      return route.fulfill({ json: plan() });
    if (path === `${BASE}/plans/${PLAN}` && method === 'PATCH') {
      patches++;
      expect(request.headers()['if-match']).toBe(String(version));
      if (options.failWrite)
        return route.fulfill({
          status: 503,
          json: {
            type: 'service_unavailable',
            status: 503,
            title: 'Unavailable',
            detail: 'Synthetic outage',
            code: 'SERVICE_UNAVAILABLE',
          },
        });
      const update = request.postDataJSON();
      highlighted = update.anticipationEnabled ?? highlighted;
      if ('attachments' in update)
        coverAttached = update.attachments.length > 0;
      if ('coverAttachmentId' in update)
        coverAttached = update.coverAttachmentId !== null;
      if ('placeId' in update) placeId = update.placeId;
      version++;
      return route.fulfill({ json: plan() });
    }
    if (path === `${BASE}/plans`)
      return route.fulfill({
        json: {
          items:
            new URL(request.url()).searchParams.get('status') === 'PLANNED'
              ? [plan()]
              : [],
          hasMore: false,
          nextCursor: null,
        },
      });
    if (path === `${BASE}/attachments` && method === 'POST')
      return route.fulfill({
        json: {
          attachment: {
            ...cover,
            version: 1,
            createdAt: '2026-10-29T12:00:00Z',
            durationSeconds: null,
          },
          method: 'STREAM',
          uploadUrl: `${BASE}/attachments/plan-cover-image/content`,
          expiresAt: null,
          requiredHeaders: {},
        },
      });
    if (
      path === `${BASE}/attachments/plan-cover-image` ||
      path === `${BASE}/attachments/plan-cover-image/finalize`
    )
      return route.fulfill({
        json: {
          ...cover,
          version: 1,
          createdAt: '2026-10-29T12:00:00Z',
          durationSeconds: null,
        },
      });
    if (path === `${BASE}/attachments/plan-cover-image/read-access`)
      return route.fulfill({
        json: {
          method: 'STREAM',
          url: `${BASE}/attachments/plan-cover-image/content`,
          expiresAt: null,
        },
      });
    if (path === `${BASE}/places/lookup`)
      return route.fulfill({
        json: {
          items: [
            {
              name: 'Sankt Peter-Ording',
              address: 'Beach Road 1',
              latitude: 54.31,
              longitude: 8.61,
            },
          ],
          attribution: '© OpenStreetMap contributors',
        },
      });
    if (path === `${BASE}/places` && method === 'POST') {
      savedPlace = {
        ...request.postDataJSON(),
        id: 'map-place',
        spaceId: SPACE_ID,
        createdBy: ACCOUNT_ID,
        creator: ME,
        description: null,
        version: 1,
        createdAt: '2026-10-29T12:00:00Z',
        updatedAt: '2026-10-29T12:00:00Z',
        capabilities: CAPABILITIES,
      };
      return route.fulfill({ status: 201, json: savedPlace });
    }
    if (path === `${BASE}/places`)
      return route.fulfill({
        json: {
          items: savedPlace ? [savedPlace] : [],
          hasMore: false,
          nextCursor: null,
        },
      });
    if (path === `${BASE}/places` || path === `${BASE}/wishes`)
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    return route.fallback();
  });
  return {
    unexpected,
    patches: () => patches,
    passportReads: () => passportReads,
  };
}

for (const [width, theme, largeText] of [
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', false],
  [1280, 'dark', false],
  [320, 'light', false],
  [390, 'dark', true],
] as const) {
  test(`special Plan -> Wir -> detail -> return and Pro passport at ${width} ${theme}${largeText ? ' large text' : ''}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    const state = await fixture(page);
    await signIn(page);
    await page.goto(`/plan/plans/${PLAN}`);
    const control = page.getByRole('switch', {
      name: copy.anticipation.show,
    });
    await expect(control).toHaveCount(0);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await expect(control).not.toBeChecked();
    await control.focus();
    await page.keyboard.press('Space');
    await expect(control).toBeChecked();
    expect(state.patches()).toBe(0);
    await page
      .getByRole('button', { name: planningCopy.common.saveChanges })
      .click();
    await expect(control).toHaveCount(0);
    expect(state.patches()).toBe(1);
    await captureScreenshot(
      page,
      info,
      `anticipation-plan-${width}-${theme}.png`,
      { fullPage: true },
    );
    await page.getByRole('link', { name: 'Wir', exact: true }).click();
    const countdown = page.locator('.anticipation-card');
    await expect(countdown).toContainText(
      copy.anticipation.days_other.replace('{{count}}', '12'),
    );
    await expect(countdown).toContainText('10.11.2099');
    await expect(
      page.locator('.today-agenda-row').filter({ hasText: TITLE }),
    ).toHaveCount(0);
    await captureScreenshot(
      page,
      info,
      `anticipation-wir-${width}-${theme}.png`,
      { fullPage: true },
    );
    await countdown.click();
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN}$`));
    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto('/more/profile');
    if (largeText)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const passport = page.getByRole('region', { name: copy.passport.title });
    await passport
      .getByRole('switch', { name: copy.passport.statisticsToggle })
      .click();
    await expect(
      passport.getByRole('link', {
        name: `128 ${copy.passport.memories_other}`,
      }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `passport-pro-${width}-${theme}${largeText ? '-large-text' : ''}.png`,
      {
        fullPage: true,
      },
    );
    if (largeText)
      await captureScreenshot(passport, info, 'passport-card-large-text.png');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
    ).toBe(false);
    const results = await new AxeBuilder({ page })
      .include('.relationship-passport')
      .analyze();
    expect(results.violations).toEqual([]);
    await passport
      .getByRole('link', { name: `128 ${copy.passport.memories_other}` })
      .click();
    await expect(page).toHaveURL(/\/story\?tab=timeline&type=MEMORY$/);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: copy.passport.title }),
    ).toBeVisible();
    await expect(
      page.locator('.profile-preferences-section .ui-state-error'),
    ).toHaveCount(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('Free profile explains Pro without requesting passport counts', async ({
  page,
}, info) => {
  const state = await fixture(page, { pro: false });
  await signIn(page);
  await page.goto('/more/profile');
  await expect(page.getByText(copy.passport.locked)).toBeVisible();
  await expect(page.locator('.passport-metrics')).toHaveCount(0);
  expect(state.passportReads()).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(page, info, 'passport-free.png', { fullPage: true });
  expect(state.unexpected).toEqual([]);
});

test('Plan overview bounds prose, preserves full detail, and restores a cold snapshot before slow revalidation', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const description = 'Time together, fresh sea air and long walks. '
    .repeat(20)
    .trim();
  const state = await fixture(page, { description });
  let planReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === `${BASE}/plans`) planReads++;
  });
  await signIn(page);
  await page.goto('/plan');
  const focal = page.locator('.planen-next-link');
  await expect(focal).toContainText(TITLE);
  const excerpt = page.locator('.planen-next-description');
  expect((await excerpt.innerText()).length).toBeLessThanOrEqual(181);
  expect(await excerpt.innerText()).not.toBe(description);
  const lineHeight = await excerpt.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).lineHeight),
  );
  expect((await excerpt.boundingBox())?.height).toBeLessThanOrEqual(
    lineHeight * 3 + 1,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(page, info, 'planning-bounded-description-390.png', {
    fullPage: true,
  });
  await focal.click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  const beforeReturn = planReads;
  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page.locator('.planen-next-link')).toContainText(TITLE);
  expect(planReads).toBe(beforeReturn);

  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    if (new URL(route.request().url()).pathname === `${BASE}/plans`)
      await delayed;
    await route.fallback();
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.overview-cache-notice')).toContainText(
      'Gespeicherte Übersicht',
    );
    await expect(page.locator('.planen-next-link')).toContainText(TITLE);
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureScreenshot(page, info, 'planning-warm-snapshot-390.png', {
      fullPage: true,
    });
  } finally {
    release();
  }
  await expect(page.locator('.overview-cache-notice')).toHaveCount(0);
  await expect(page.locator('.planen-next-link')).toContainText(TITLE);
  expect(state.unexpected).toEqual([]);
});

test('failed Plan edit preserves the staged countdown without a success claim', async ({
  page,
}) => {
  const state = await fixture(page, { failWrite: true });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN}`);
  const control = page.getByRole('switch', {
    name: copy.anticipation.show,
  });
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  await control.click();
  await page
    .getByRole('button', { name: planningCopy.common.saveChanges })
    .click();
  await expect(page.getByText(de.states.server.title)).toBeVisible();
  await expect(control).toBeChecked();
  await expect(page.getByText(copy.anticipation.saved)).toHaveCount(0);
  expect(state.patches()).toBe(1);
});

test('hidden upcoming module also conceals a selected special event', async ({
  page,
}) => {
  const state = await fixture(page, { hidden: true });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN}`);
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  await page.getByRole('switch', { name: copy.anticipation.show }).click();
  await page
    .getByRole('button', { name: planningCopy.common.saveChanges })
    .click();
  await expect(
    page.getByRole('switch', { name: copy.anticipation.show }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Wir', exact: true }).click();
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.anticipation-card')).toHaveCount(0);
  expect(state.patches()).toBe(1);
});

for (const [width, theme] of [
  [390, 'light'],
  [1280, 'dark'],
] as const) {
  test(`one Plan editor saves a cover, map location and countdown at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    const state = await fixture(page);
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#e5ecdc" d="M0 0h256v256H0z"/><path stroke="#c1d1ab" stroke-width="25" d="M0 40L256 200M40 0L200 256"/><path stroke="#fff" stroke-width="7" d="M0 40L256 200M40 0L200 256"/></svg>',
      }),
    );
    await signIn(page);
    await page.goto(`/plan/plans/${PLAN}`);
    await expect(
      page.getByRole('switch', { name: copy.anticipation.show }),
    ).toHaveCount(0);
    await expect(
      page.getByText(planningCopy.plan.actionsHeading, { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await page
      .locator('#plan-photos')
      .setInputFiles(
        fileURLToPath(
          new URL(
            '../../../backend/demo_assets/images/lake-sunrise.jpg',
            import.meta.url,
          ),
        ),
      );
    await page.getByRole('button', { name: planningCopy.map.open }).click();
    const sheet = page.getByRole('dialog', { name: planningCopy.map.title });
    await expect(sheet).toBeVisible();
    await expect(page.locator('.place-map-viewport')).toHaveCount(0);
    await sheet.getByRole('searchbox').fill('Sankt Peter-Ording');
    await sheet
      .getByRole('button', { name: planningCopy.map.search, exact: true })
      .click();
    await sheet
      .getByRole('button', { name: /Sankt Peter-Ording.*Beach Road/ })
      .click();
    await expect(sheet.locator('.leaflet-container')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureScreenshot(page, info, `map-picker-${width}-${theme}.png`);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await sheet.getByRole('button', { name: planningCopy.map.confirm }).click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.getByLabel(planningCopy.common.place, { exact: true }),
    ).toHaveValue('map-place');
    await page.getByRole('switch', { name: copy.anticipation.show }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureScreenshot(
      page,
      info,
      `plan-unified-editor-${width}-${theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: planningCopy.common.saveChanges })
      .click();
    await expect(
      page.getByRole('switch', { name: copy.anticipation.show }),
    ).toHaveCount(0);
    await expect(
      page.locator('.plan-photo-gallery .media-gallery-carousel-content'),
    ).toBeVisible();
    await expect(page.locator('.planen-detail-meta')).toContainText(
      'Sankt Peter-Ording',
    );
    expect(state.patches()).toBe(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureScreenshot(
      page,
      info,
      `plan-cover-reading-${width}-${theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
    expect(state.unexpected).toEqual([]);
  });
}

for (const pro of [true, false])
  test(`Wir statistics remain a voluntary passport Pro option: ${pro}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await fixture(page, { pro });
    await signIn(page);
    await expect(page.locator('.shared-story-summary')).toHaveCount(0);
    await page.goto('/more/settings/today');
    const control = page.getByRole('switch', {
      name: copy.passport.wirStatisticsToggle,
    });
    await expect(control).toHaveAttribute('aria-checked', 'false');
    if (pro) {
      await expect(control).toBeEnabled();
      await control.click();
      await expect(control).toHaveAttribute('aria-checked', 'true');
      await page.goto('/today');
      await expect(page.locator('.shared-story-summary')).toBeVisible();
      await expect(page.locator('.shared-story-summary-number')).toHaveText([
        '128',
        '12',
        '4',
      ]);
      await captureScreenshot(page, info, 'wir-optional-statistics-390.png', {
        fullPage: true,
      });
      await page.goto('/more/settings/today');
      await control.click();
      await page.goto('/today');
      await expect(page.locator('.shared-story-summary')).toHaveCount(0);
    } else {
      await expect(control).toBeDisabled();
      await page.goto('/today');
      await expect(page.locator('.shared-story-summary')).toHaveCount(0);
    }
    expect(state.passportReads()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
