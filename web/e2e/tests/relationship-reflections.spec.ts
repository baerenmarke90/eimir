import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import planningCopy from '../../src/i18n/locales/m5s3';
import lifelineCopy from '../../src/i18n/locales/m5s5';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import recapCopy from '../../src/i18n/locales/recaps';
import copy from '../../src/i18n/locales/relationshipReflections';
import storyProducts from '../../src/i18n/locales/storyProducts';
import AxeBuilder from '../support/axe';
import { editViaMenu } from '../support/itemMenu';
import { mockMapTiles } from '../support/mapTiles';
import { openComposerMediaSources } from '../support/mediaIntake';
import { openComposerPlace } from '../support/memoryDiary';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  PARTNER,
  PARTNER_ID,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const fillLifeline = (
  template: string,
  values: Record<string, string | number>,
) => template.replace(/{{(\w+)}}/g, (_, key: string) => String(values[key]));
const lifelinePosition = (position: number, total: number) =>
  fillLifeline(lifelineCopy.dashboard.storyLifelinePosition, {
    position,
    total,
  });
const lifelineEntry = (position: number, total: number) =>
  fillLifeline(lifelineCopy.dashboard.storyLifelineEntryLabel, {
    position,
    total,
  });

const TITLE = 'Our weekend by the sea';
const PLAN = '44444444-4444-4444-8444-444444444444';
const BASE = `/api/v1/spaces/${SPACE_ID}`;
const DAY = '2099-11-10';

/** The single entries of the latest lifeline period, read when it opens. */
const LIFELINE_ENTRIES = {
  total: 9,
  items: [
    ['MEMORY', 'lifeline-3', 'Autumn walk', 'lifeline-photo'],
    ['HEART_MOMENT', 'period-heart', 'Thank you for the tea', null],
    ['MILESTONE', 'period-milestone', 'Three years', null],
    ['MEMORY', 'period-4', 'Mushroom hunt', null],
    ['MEMORY', 'period-5', 'Rainy Sunday', null],
    ['MEMORY', 'period-6', 'Cinema night', null],
    ['HEART_MOMENT', 'period-7', 'Good news shared', null],
    ['MEMORY', 'period-8', 'Lantern walk', null],
    ['MEMORY', 'period-9', 'First frost', null],
  ].map(([type, id, titleOrText, previewAttachmentId], index) => ({
    type,
    id,
    titleOrText,
    occurredOn: `2026-10-${String(26 + Math.min(index, 3)).padStart(2, '0')}`,
    scheduledAt: null,
    createdAt: null,
    previewAttachmentId,
    previewIsSensitive: false,
    previewHasThumbnail: false,
  })),
};

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
    anticipation: highlighted ? 'ALWAYS' : 'AUTOMATIC',
    anticipationEnabled: highlighted,
    status: 'PLANNED',
    version,
    createdAt: '2026-10-29T12:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
    capabilities: CAPABILITIES,
  });
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === `${BASE}/recaps`)
      return route.fulfill({
        json: {
          canCompose: options.pro !== false,
          editions: [],
          periods: [],
          hasMore: false,
        },
      });
    if (path === `${BASE}/recaps/prepare`)
      return route.fulfill({ status: 202, body: 'null' });
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
    if (path === `${BASE}/story-lifeline`) {
      const memory = (id: string, title: string, occurredOn: string) => ({
        type: 'MEMORY',
        id,
        titleOrText: title,
        occurredOn,
        scheduledAt: null,
        createdAt: null,
      });
      // Three weeks whose parts add up to the shared totals below.
      return route.fulfill({
        json: {
          startsOn: '2023-06-17',
          today: '2026-10-29',
          weeks: [
            {
              weekStart: '2023-06-12',
              memories: 40,
              heartMoments: 4,
              milestones: 2,
              highlight: memory('lifeline-1', 'Our first summer', '2023-06-17'),
            },
            {
              weekStart: '2025-01-06',
              memories: 44,
              heartMoments: 4,
              milestones: 1,
              highlight: memory(
                'lifeline-2',
                'New Year in the snow',
                '2025-01-08',
              ),
            },
            {
              weekStart: '2026-10-26',
              memories: 44,
              heartMoments: 4,
              milestones: 1,
              highlight: memory('lifeline-3', 'Autumn walk', '2026-10-27'),
            },
          ],
        },
      });
    }
    if (path === `${BASE}/story-lifeline/entries`)
      return route.fulfill({ json: LIFELINE_ENTRIES });
    if (path === `${BASE}/attachments/lifeline-photo/read-access`)
      return route.fulfill({
        json: {
          method: 'STREAM',
          url: `${BASE}/attachments/lifeline-photo/content`,
          expiresAt: null,
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
      if ('anticipation' in update)
        highlighted = update.anticipation === 'ALWAYS';
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
            new URL(request.url()).searchParams.get('overviewScope') ===
              'OPEN' ||
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
    const control = page.getByRole('radio', {
      name: copy.anticipation.always,
    });
    await expect(control).toHaveCount(0);
    await editViaMenu(page, de.common.edit);
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
    await expect(page.locator('.anticipation-card')).toHaveCount(1);
    await expect(page.locator('.today-hero').getByText(TITLE)).toHaveCount(0);
    await expect(
      page.locator('.today-agenda-row').filter({ hasText: TITLE }),
    ).toHaveCount(0);
    await captureScreenshot(
      page,
      info,
      `anticipation-wir-${width}-${theme}.png`,
      { fullPage: true },
    );
    const upcomingSection = page.locator('.today-section-upcoming');
    await upcomingSection.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    await upcomingSection.screenshot({
      path: info.outputPath(`anticipation-section-${width}-${theme}.png`),
    });
    await countdown.click();
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN}$`));
    await page.getByRole('button', { name: de.common.back }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto('/more/profile');
    await expect(page.locator('.profile-page')).toBeVisible();
    await expect(page.locator('.profile-passport-entry')).toHaveCount(0);
    if (largeText)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    await captureScreenshot(
      page,
      info,
      `profile-without-passport-${width}-${theme}.png`,
      { fullPage: true },
    );
    await page.goto('/more');
    // #1861: the story overview is a page of its own, first in its Mehr group.
    await page
      .getByRole('link', { name: new RegExp(`^${copy.passport.title}`) })
      .click();
    await expect(page).toHaveURL(/\/story\/our-story$/);
    if (largeText)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const passport = page.getByRole('region', {
      name: copy.passport.title,
      exact: true,
    });
    // The shared counts are always part of the overview; there is no opt-in.
    await expect(passport.getByRole('switch')).toHaveCount(0);
    await expect(
      passport.locator('.passport-metrics').getByRole('link', {
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
      .locator('.passport-metrics')
      .getByRole('link', { name: `128 ${copy.passport.memories_other}` })
      .click();
    await expect(page).toHaveURL(/\/story\?tab=timeline&type=MEMORY$/);
    await page.goBack();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: copy.passport.title,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator('.profile-preferences-section .ui-state-error'),
    ).toHaveCount(0);
    expect(state.unexpected).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const)
  test(`Eure Geschichte opens single lifeline entries with kind shapes at 390 ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    const state = await fixture(page);
    await signIn(page);
    await page.goto('/story/our-story');
    const passport = page.getByRole('region', {
      name: copy.passport.title,
      exact: true,
    });
    // The three Story kinds keep their shape in the counts; others stay plain.
    const storyMetrics = passport.locator('.passport-metric-story');
    await expect(storyMetrics).toHaveCount(3);
    await expect(
      storyMetrics.locator('.story-kind-memories circle'),
    ).toHaveCount(1);
    await expect(
      storyMetrics.locator('.story-kind-heartMoments path'),
    ).toHaveCount(1);
    await expect(
      storyMetrics.locator('.story-kind-milestones path'),
    ).toHaveCount(1);
    await expect(
      passport.locator('.passport-metrics li:not(.passport-metric-story) svg'),
    ).toHaveCount(0);
    const story = passport.locator('.shared-story-summary');
    await expect(story.locator('.shared-story-summary-caption')).toHaveText(
      '144 festgehaltene Momente seit Juni 2023',
    );
    await expect(
      story.getByRole('link', { name: '128 Erinnerungen', exact: true }),
    ).toBeVisible();
    const lifeline = story.getByRole('slider');
    await lifeline.focus();
    await page.keyboard.press('ArrowLeft');
    const preview = story.getByRole('link', { name: /Autumn walk/ });
    await expect(preview.first()).toBeVisible();
    // The full variant lists the period below the band, oldest first.
    const rows = story.locator('.shared-story-lifeline-row');
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toHaveClass(/is-selected/);
    await expect(rows.first()).toHaveAttribute(
      'href',
      '/story/memories/lifeline-3',
    );
    await expect(rows.nth(1)).toContainText(copy.passport.heartMoments_one);
    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(story.locator('.shared-story-lifeline-all')).toHaveAttribute(
      'href',
      '/story?tab=timeline&year=2026&order=ASC',
    );
    // Photos now load on this page too, in the floating card and the list.
    const floating = story.locator('.shared-story-lifeline-preview-main');
    await expect
      .poll(() =>
        floating
          .locator('img')
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(lifeline).toHaveAttribute(
      'aria-valuetext',
      new RegExp(`${lifelinePosition(1, 9)}$`),
    );
    await captureScreenshot(page, info, `lifeline-full-${theme}.png`, {
      fullPage: true,
    });
    // Up on the band chooses the next single entry.
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(1)).toHaveClass(/is-selected/);
    await expect(lifeline).toHaveAttribute(
      'aria-valuetext',
      new RegExp(
        `${lifelineCopy.dashboard.storyLifelineKindHeartMoment}: Thank you for the tea, ${lifelinePosition(2, 9)}$`,
      ),
    );
    await expect(
      story.locator(
        '.shared-story-lifeline-column.is-current .shared-story-lifeline-dot.is-selected.story-kind-heartMoments',
      ),
    ).toHaveCount(1);
    // The pagination dots reach any entry without a gesture.
    await story.getByRole('button', { name: lifelineEntry(5, 9) }).click();
    await expect(
      story.getByRole('button', { name: lifelineEntry(5, 9) }),
    ).toHaveAttribute('aria-current', 'true');
    await expect(floating).toContainText('Rainy Sunday');
    await expect(
      story.locator('.shared-story-lifeline-row.is-selected'),
    ).toContainText('Rainy Sunday');
    await story.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await story.screenshot({
      path: info.outputPath(`lifeline-full-entry-${theme}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
    ).toBe(false);
    const results = await new AxeBuilder({ page })
      .include('.relationship-passport')
      .analyze();
    expect(results.violations).toEqual([]);
    // Forced colours drop the kind colours; the shapes still tell them apart.
    await page.emulateMedia({ forcedColors: 'active' });
    const canvasText = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'CanvasText';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(
      story.locator('.shared-story-lifeline-dot .story-kind-glyph').first(),
    ).toHaveCSS('fill', canvasText);
    await story.screenshot({
      path: info.outputPath(`lifeline-full-forced-colors-${theme}.png`),
    });
    await page.emulateMedia({ forcedColors: 'none' });
    // A click elsewhere on the page closes the period.
    await page
      .getByRole('heading', { level: 1, name: copy.passport.title })
      .click();
    await expect(rows).toHaveCount(0);
    expect(state.unexpected).toEqual([]);
  });

test('Free Passport remains reachable from More without requesting Pro counts', async ({
  page,
}, info) => {
  const state = await fixture(page, { pro: false });
  await signIn(page);
  await page.goto('/more/profile');
  await expect(page.locator('.profile-passport-entry')).toHaveCount(0);
  await page.goto('/more');
  // #1790 E1: Mehr opens years and recaps together; the years index leads on.
  await page
    .getByRole('link', {
      name: de.more.destinations.yearsAndRecaps,
      exact: true,
    })
    .click();
  await page
    .getByRole('link', { name: new RegExp(de.storyYears.recapsEntryTitle) })
    .click();
  await expect(page.getByText(recapCopy.gateBody)).toBeVisible();
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
  const more = page.locator('.description-disclosure');
  await expect(more).toHaveAccessibleName(
    storyProducts.descriptionDisclosure.more,
  );
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  const beforeReturn = planReads;
  await page.getByRole('button', { name: de.common.back }).click();
  await expect(page.locator('.planen-next-link')).toContainText(TITLE);
  expect(planReads).toBe(beforeReturn);

  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
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
  const control = page.getByRole('radio', {
    name: copy.anticipation.always,
  });
  await editViaMenu(page, de.common.edit);
  await control.click();
  await page
    .getByRole('button', { name: planningCopy.common.saveChanges })
    .click();
  await expect(page.getByText(de.states.server.title)).toBeVisible();
  await expect(control).toBeChecked();
  expect(state.patches()).toBe(1);
});

test('hidden upcoming module also conceals a selected special event', async ({
  page,
}) => {
  const state = await fixture(page, { hidden: true });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN}`);
  await editViaMenu(page, de.common.edit);
  await page.getByRole('radio', { name: copy.anticipation.always }).click();
  await page
    .getByRole('button', { name: planningCopy.common.saveChanges })
    .click();
  await expect(
    page.getByRole('radio', { name: copy.anticipation.always }),
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
    await mockMapTiles(page);
    await signIn(page);
    await page.goto(`/plan/plans/${PLAN}`);
    await expect(
      page.getByRole('radio', { name: copy.anticipation.always }),
    ).toHaveCount(0);
    await expect(
      page.getByText(planningCopy.plan.actionsHeading, { exact: true }),
    ).toHaveCount(0);
    await editViaMenu(page, de.common.edit);
    await openComposerMediaSources(page);
    await page
      .locator('#plan-photos-source')
      .setInputFiles(
        fileURLToPath(
          new URL(
            '../../../backend/demo_assets/images/lake-sunrise.jpg',
            import.meta.url,
          ),
        ),
      );
    await openComposerPlace(page);
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
    await expect(sheet.locator('.maplibregl-map')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureScreenshot(page, info, `map-picker-${width}-${theme}.png`);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await sheet
      .getByRole('button', { name: photoPlaces.saveSharedPlace, exact: true })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.locator('input[type="hidden"][name="placeId"]'),
    ).toHaveValue('map-place');
    await expect(page.locator('.composer-place-context')).toContainText(
      'Sankt Peter-Ording',
    );
    await page.getByRole('radio', { name: copy.anticipation.always }).click();
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
      page.getByRole('radio', { name: copy.anticipation.always }),
    ).toHaveCount(0);
    await expect(
      page.locator('.plan-photo-gallery .media-gallery-carousel-content'),
    ).toBeVisible();
    await expect(page.locator('.planen-detail-when-where')).toContainText(
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

test.describe('lifeline touch gestures', () => {
  test.use({ hasTouch: true });

  for (const [route, width, theme] of [
    ['/today', 360, 'light'],
    ['/story/our-story', 1280, 'dark'],
  ] as const) {
    test(`keeps lifeline swipes local on ${route}`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({
        colorScheme: theme,
        reducedMotion: 'no-preference',
      });
      const state = await fixture(page);
      await signIn(page);
      if (route === '/today') {
        await page.goto('/more/settings/today');
        await page
          .getByRole('checkbox', { name: copy.passport.wirStatisticsTitle })
          .check();
      }
      await page.goto(route);
      const summary = page.locator('.shared-story-summary');
      const band = summary.getByRole('slider');
      await band.press('End');
      const preview = summary.locator('.shared-story-lifeline-preview-main');
      await expect(preview).toContainText('Autumn walk');
      await expect(band).toHaveAttribute(
        'aria-valuetext',
        new RegExp(`${lifelinePosition(1, 9)}$`),
      );
      await band.evaluate((node) =>
        node.scrollIntoView({ block: 'center', behavior: 'instant' }),
      );

      const touch = await context.newCDPSession(page);
      const position = () =>
        page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      const before = await position();
      const previewBox = await preview.boundingBox();
      if (!previewBox) throw new Error('Missing lifeline preview');
      const x = previewBox.x + previewBox.width * 0.75;
      const y = previewBox.y + previewBox.height / 2;
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (const distance of [30, 100]) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x - distance, y }],
        });
      }
      await expect(
        summary.locator('.shared-story-lifeline-preview-swipe'),
      ).toHaveClass(/is-dragging/);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      await expect(page.locator('[data-primary-tab-dragging]')).toHaveCount(0);
      expect(await position()).toEqual(before);
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await expect(preview).toContainText('Thank you for the tea');
      expect(new URL(page.url()).pathname).toBe(route);
      expect(await position()).toEqual(before);

      const previousPeriod = await band.getAttribute('aria-valuenow');
      const bandBox = await band.boundingBox();
      if (!bandBox) throw new Error('Missing lifeline band');
      // The finger can land anywhere on the active band for a vertical step.
      const bandX = bandBox.x + bandBox.width * 0.1;
      const bandY = bandBox.y + bandBox.height - 8;
      const swipeBand = async (distance: number) => {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: bandX, y: bandY }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: bandX, y: bandY + distance }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
      };
      await swipeBand(-16);
      await expect(preview).toContainText('Three years');
      expect(await band.getAttribute('aria-valuenow')).toBe(previousPeriod);
      expect(await position()).toEqual(before);
      await captureScreenshot(
        page,
        info,
        `lifeline-touch-${width}-${theme}.png`,
        { animations: 'disabled' },
      );
      await swipeBand(16);
      await expect(preview).toContainText('Thank you for the tea');
      expect(await band.getAttribute('aria-valuenow')).toBe(previousPeriod);
      expect(state.unexpected).toEqual([]);
      await touch.detach();
    });
  }
});

for (const pro of [true, false])
  test(`Wir statistics remain a voluntary passport Pro option: ${pro}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await fixture(page, { pro });
    await signIn(page);
    await expect(page.locator('.shared-story-summary')).toHaveCount(0);
    await page.goto('/more/settings/today');
    const control = page.getByRole('checkbox', {
      name: copy.passport.wirStatisticsTitle,
    });
    await expect(control).toHaveCount(1);
    await expect(control).not.toBeChecked();
    if (pro) {
      await expect(control).toBeEnabled();
      await control.click();
      await expect(control).toBeChecked();
      await page.goto('/today');
      await expect(page.locator('.shared-story-summary')).toBeVisible();
      const storyHeading = page.locator('#shared-story-summary-heading');
      await expect(storyHeading).toHaveClass('today-section-title');
      const sectionTypography = await page
        .locator('.today-section-title')
        .evaluateAll((headings) =>
          headings.map((heading) => {
            const style = getComputedStyle(heading);
            return [style.fontFamily, style.fontSize, style.fontWeight];
          }),
        );
      expect(sectionTypography.length).toBeGreaterThan(1);
      for (const typography of sectionTypography)
        expect(typography).toEqual(sectionTypography[0]);
      await expect(page.locator('.shared-story-summary-number')).toHaveText([
        '128',
        '12',
        '4',
      ]);
      await captureScreenshot(page, info, 'today-optional-statistics-390.png', {
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
