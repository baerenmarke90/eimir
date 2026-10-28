import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import copy from '../../src/i18n/locales/relationshipReflections';
import de from '../../src/i18n/locales/de';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
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
  options: { pro?: boolean; hidden?: boolean; failWrite?: boolean } = {},
) {
  const unexpected = await installMocks(page);
  let highlighted = false;
  let version = 1;
  let patches = 0;
  let passportReads = 0;
  const plan = () => ({
    id: PLAN,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    title: TITLE,
    description: 'Time together, fresh sea air and long walks.',
    plannedOn: DAY,
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    placeId: null,
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
      highlighted = request.postDataJSON().anticipationEnabled;
      version++;
      return route.fulfill({ json: plan() });
    }
    if (path === `${BASE}/plans`)
      return route.fulfill({
        json: { items: [plan()], hasMore: false, nextCursor: null },
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
    await expect(control).not.toBeChecked();
    await control.focus();
    await page.keyboard.press('Space');
    await expect(control).toBeChecked();
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
  await captureScreenshot(page, info, 'passport-free.png', { fullPage: true });
  expect(state.unexpected).toEqual([]);
});

test('failed highlight remains off with retry and no success claim', async ({
  page,
}) => {
  const state = await fixture(page, { failWrite: true });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN}`);
  const control = page.getByRole('switch', {
    name: copy.anticipation.show,
  });
  await control.click();
  await expect(page.getByText(de.states.server.title)).toBeVisible();
  await expect(control).not.toBeChecked();
  await expect(page.getByText(copy.anticipation.saved)).toHaveCount(0);
  expect(state.patches()).toBe(1);
});

test('hidden upcoming module also conceals a selected special event', async ({
  page,
}) => {
  const state = await fixture(page, { hidden: true });
  await signIn(page);
  await page.goto(`/plan/plans/${PLAN}`);
  await page.getByRole('switch', { name: copy.anticipation.show }).click();
  await page.getByRole('link', { name: 'Wir', exact: true }).click();
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.anticipation-card')).toHaveCount(0);
  expect(state.patches()).toBe(1);
});
