import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import copy from '../../src/i18n/locales/wirDesign';
import energyCopy from '../../src/i18n/locales/dailyEnergy';
import {
  PARTNER_ID,
  SPACE_ID,
  PARTNER,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

async function fixture(
  page: Page,
  options: { pro?: boolean; initial?: string; failure?: number } = {},
) {
  const unexpected = await installMocks(page, { strict: true });
  let current = options.initial ?? 'warm';
  let version = 0;
  let pro = options.pro !== false;
  let failure = options.failure ?? 0;
  const writes: string[] = [];
  const base = `/api/v1/spaces/${SPACE_ID}`;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `${base}/appearance/wir-design`) {
      if (request.method() === 'PATCH') {
        writes.push(request.postDataJSON().designId);
        expect(request.headers()['if-match']).toBe(`"appearance:${version}"`);
        if (failure)
          return route.fulfill({
            status: failure,
            json: {
              title: 'Synthetic outage',
              status: failure,
              code:
                failure === 409
                  ? 'RESOURCE_VERSION_CONFLICT'
                  : 'SERVICE_UNAVAILABLE',
            },
          });
        expect(pro || request.postDataJSON().designId === 'warm').toBe(true);
        current = request.postDataJSON().designId;
        version++;
      }
      return route.fulfill({
        json: { designId: current, version },
        headers: { ETag: `"appearance:${version}"` },
      });
    }
    if (path === `${base}/entitlements`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: pro ? 'PREMIUM' : 'FREE',
          status: 'ACTIVE',
          isInGracePeriod: false,
          capabilities: [
            'daily.quote',
            ...(pro ? ['theme.bespoke_packs'] : []),
          ],
        },
      });
    if (path === `${base}/configuration`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          version: 1,
          canManageSpaceConfiguration: false,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          supportGesturesEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: 'IMMEDIATE',
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'IMMEDIATE',
        },
        headers: { ETag: '"1"' },
      });
    if (path === `${base}/profiles/${PARTNER_ID}`)
      return route.fulfill({
        json: {
          id: 'partner-profile',
          accountId: PARTNER_ID,
          displayName: PARTNER.displayName,
          profileAttachmentId: null,
          preferences: [],
          version: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      });
    if (path === `${base}/daily-quote/catalog`)
      return route.fulfill({ json: { categories: [], sources: [] } });
    if (path === `${base}/daily-check-in/today`)
      return route.fulfill({
        json: {
          checkedOn: '2026-10-29',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: null, vibe: 'GOOD', vibeNote: null, version: 1 },
          energy: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'NO_CHECK_IN' },
          },
          vibe: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'VISIBLE', value: 'GOOD' },
            partnerNote: null,
          },
        },
        headers: { ETag: '"today:1"' },
      });
    if (path === `${base}/daily-quote`)
      return route.fulfill({
        json: {
          checkedOn: '2026-10-29',
          enabled: true,
          quote: {
            id: 'fixture-quote',
            text: 'A calm thought for our day together.',
            authorDisplay: 'Example Author',
            sourceDisplay: 'Example Source',
            sourceId: 'classic_literature',
            categoryIds: ['love'],
            locale: 'de',
            rightsClassification: 'PUBLIC_DOMAIN',
            attributionRequired: true,
          },
        },
      });
    if (path === `${base}/dashboard/preferences`)
      return route.fulfill({ json: { items: [] } });
    if (path === `${base}/profile-preferences`)
      return route.fulfill({ json: [] });
    if (path === `${base}/activity`)
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (path === `${base}/dashboard`)
      return route.fulfill({
        json: {
          space: { spaceId: SPACE_ID, partner: PARTNER },
          relationshipDuration: {
            startedOn: '2023-07-04',
            daysTogether: 1213,
            displayMode: 'DAYS',
          },
          retrospective: null,
          keepsake: {
            type: 'MEMORY',
            id: 'mem-canal',
            titleOrText: 'Our morning by the lake',
            occurredOn: '2026-10-12',
            previewAttachmentId: 'att-canal-1',
            previewIsSensitive: true,
          },
          upcoming: [
            {
              type: 'PLAN',
              id: 'special-plan',
              titleOrText: 'A special weekend',
              scheduledOn: '2099-11-10',
            },
          ],
          anticipation: {
            planId: 'special-plan',
            title: 'A special weekend',
            eventOn: '2099-11-10',
            daysRemaining: 12,
          },
          recentShared: [],
          sharedStorySummary: { memories: 3, heartMoments: 2, milestones: 1 },
          viewerLocalDate: '2026-10-29',
        },
      });
    return route.fallback();
  });
  return {
    writes,
    unexpected,
    setPro: (v: boolean) => {
      pro = v;
    },
    setFailure: (v: number) => {
      failure = v;
    },
  };
}
async function open(page: Page) {
  await page.goto('/more/settings/appearance');
  await expect(page.getByText(copy.loading, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: copy.change }).click();
  await expect(page.getByRole('dialog', { name: copy.choices })).toBeVisible();
  await expect(page.getByText(copy.proLoading, { exact: true })).toHaveCount(0);
}
async function reflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
      })
      .map((node) => ({
        tag: node.tagName,
        className: node.getAttribute('class'),
        width: Math.round(node.getBoundingClientRect().width),
      }))
      .slice(0, 20),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    JSON.stringify(overflow),
  ).toBe(true);
}
for (const [width, theme, large] of [
  [320, 'light', false],
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', false],
  [1280, 'dark', false],
  [390, 'dark', true],
] as const) {
  test(`three personal designs save, return and reload at ${width} ${theme}${large ? ' large text' : ''}`, async ({
    page,
  }, info) => {
    // Three full save/return/reload cycles and three axe passes share this journey.
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const f = await fixture(page);
    await signIn(page);
    if (large)
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () =>
          document.documentElement.style.setProperty(
            'font-size',
            '200%',
            'important',
          ),
        );
      });
    await page.goto('/today');
    await expect(page.locator('.today-page')).toHaveAttribute(
      'data-wir-design',
      'warm',
    );
    for (const design of ['warm', 'modern', 'classic'] as const) {
      if (design !== 'warm') {
        await open(page);
        const radio = page.getByRole('radio', {
          name: new RegExp(copy.names[design]),
        });
        await radio.focus();
        await page.keyboard.press('Space');
        await expect(radio).toBeChecked();
        await captureScreenshot(
          page,
          info,
          `selector-${design}-${width}-${theme}${large ? '-large' : ''}.png`,
        );
        await page
          .getByRole('button', { name: copy.save, exact: true })
          .click();
        await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
        await page
          .getByRole('button', { name: copy.close, exact: true })
          .click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.goto('/today');
      }
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        design,
      );
      await expect(page.locator('.daily-vibe-checkin')).toBeVisible();
      await expect(page.locator('.daily-quote-card')).toBeVisible();
      await expect(page.locator('.anticipation-card')).toBeVisible();
      await reflow(page);
      const battery = page
        .locator('.today-hero')
        .getByRole('button', { name: energyCopy.badgeAriaEmpty });
      await battery.click();
      await expect(page.getByTestId('daily-energy-popover')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('daily-energy-popover')).toHaveCount(0);
      await captureScreenshot(
        page,
        info,
        `wir-${design}-${width}-${theme}${large ? '-large' : ''}.png`,
        { fullPage: true },
      );
      const issues = await new AxeBuilder({ page })
        .include('.today-page')
        .analyze();
      expect(issues.violations).toEqual([]);
      await page.reload();
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        design,
      );
    }
    expect(f.writes).toEqual(['modern', 'classic']);
    expect(f.unexpected).toEqual([]);
  });
}
test('Free can preview, cancel, retain a saved Pro design and reset to Geborgen', async ({
  page,
}) => {
  const f = await fixture(page, { pro: false, initial: 'classic' });
  await signIn(page);
  await open(page);
  await page
    .getByRole('radio', { name: new RegExp(copy.names.modern) })
    .check();
  await expect(page.getByRole('button', { name: copy.discover })).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: copy.close, exact: true }).click();
  await page.goto('/today');
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-design',
    'classic',
  );
  await open(page);
  await page.getByRole('radio', { name: new RegExp(copy.names.warm) }).check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(f.writes).toEqual(['warm']);
  expect(f.unexpected).toEqual([]);
});
test('failure keeps the draft and confirmed retry changes the visible design', async ({
  page,
}) => {
  const f = await fixture(page, { failure: 503 });
  await signIn(page);
  await open(page);
  await page
    .getByRole('radio', { name: new RegExp(copy.names.modern) })
    .check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.error, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.saved, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('radio', { name: new RegExp(copy.names.modern) }),
  ).toBeChecked();
  f.setFailure(0);
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(f.writes).toEqual(['modern', 'modern']);
  expect(f.unexpected).toEqual([]);
});
