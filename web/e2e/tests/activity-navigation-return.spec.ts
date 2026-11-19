import { expect, type Page, type Route, test } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';
import taskCopy from '../../src/i18n/locales/taskBoundary';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  PARTNER,
  PARTNER_ID,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/**
 * #1907 A2: Activity is a More destination. Opening it, switching its scope
 * and opening an item from it (or from the Wir recent trace) keeps the shell
 * Back and system Back on the place the couple came from.
 */
const base = `/api/v1/spaces/${SPACE_ID}`;
const ACTIVITY_ITEMS = [
  {
    id: 'activity-canal',
    sourceEventId: 'source-canal',
    kind: 'MEMORY_CREATED',
    actorId: PARTNER_ID,
    actor: PARTNER,
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    targetId: 'mem-canal',
    targetType: 'MEMORY',
    target: {
      targetId: 'mem-canal',
      targetType: 'MEMORY',
      title: 'Breakfast by the canal',
    },
  },
];

async function open(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await installMocks(page);
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  await page.route(`**${base}/activity*`, (route) =>
    route.fulfill({
      json: { items: ACTIVITY_ITEMS, hasMore: false, nextCursor: null },
    }),
  );
  await page.route(`**${base}/places?**`, (route) =>
    route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } }),
  );
  await signIn(page);
}

const shellBack = (page: Page) =>
  page.getByRole('button', { name: taskCopy.back, exact: true });
const primary = (page: Page, name: string) =>
  page.getByRole('link', { name, exact: true });
const activityRow = (page: Page) =>
  page.locator('#activity-results a.activity-result-link').first();

async function openActivityFromMore(page: Page) {
  await primary(page, navigation.more).click();
  await expect(page).toHaveURL(/\/more$/);
  await page
    .getByRole('link', { name: navigation.activity, exact: true })
    .click();
  await expect(page).toHaveURL(/\/today\/activity$/);
  await expect(activityRow(page)).toBeVisible();
}

for (const width of [390, 1280]) {
  test(`Activity opened from More keeps More active and returns to More at ${width}px`, async ({
    page,
  }, testInfo) => {
    await open(page, width);
    await openActivityFromMore(page);
    await expect(primary(page, navigation.more)).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(primary(page, navigation.today)).not.toHaveAttribute(
      'aria-current',
      'page',
    );
    await captureScreenshot(
      page,
      testInfo,
      `1907-a2-activity-more-active-${width}.png`,
      { animations: 'disabled' },
    );
    await shellBack(page).click();
    await expect(page).toHaveURL(/\/more$/);
  });
}

test('Activity scope switches add no Back steps and keep the More origin', async ({
  page,
}) => {
  await open(page);
  await openActivityFromMore(page);
  const own = page.getByRole('tab', { name: m5s5.activity.own });
  const shared = page.getByRole('tab', { name: m5s5.activity.shared });
  await own.click();
  await expect(page).toHaveURL(/\/today\/activity\?scope=own$/);
  await shared.click();
  await own.click();
  await expect(own).toHaveAttribute('aria-selected', 'true');

  // Back must use the opened item's origin even while its route code is in flight.
  const scripts = '**/assets/*.js';
  const gate = Promise.withResolvers<void>();
  const holdScript = async (route: Route) => {
    await gate.promise;
    await route.fallback();
  };
  await page.route(scripts, holdScript);
  try {
    await activityRow(page).click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    await shellBack(page).click();
    await expect(page).toHaveURL(/\/today\/activity\?scope=own$/);
  } finally {
    gate.resolve();
    await page.unroute(scripts, holdScript);
  }
  await expect(own).toHaveAttribute('aria-selected', 'true');
  await shellBack(page).click();
  await expect(page).toHaveURL(/\/more$/);

  // System Back leaves Activity in one step after several switches.
  await page
    .getByRole('link', { name: navigation.activity, exact: true })
    .click();
  await own.click();
  await shared.click();
  await expect(shared).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/more$/);
});

test('Wir recent tiles and the all-activity link return to Wir', async ({
  page,
}) => {
  await open(page);
  await primary(page, navigation.today).click();
  await expect(page).toHaveURL(/\/today$/);
  const tile = page.locator('.today-section-recent a.activity-result-link');
  await expect(tile.first()).toBeVisible();

  // Shell Back from the opened item lands on Wir at its reading position.
  await tile.first().scrollIntoViewIfNeeded();
  const readingPosition = await page.evaluate(() => window.scrollY);
  await tile.first().click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await shellBack(page).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(tile.first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(Math.max(0, readingPosition - 40));

  // System Back from the opened item lands on Wir as well.
  await tile.first().click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);

  // The all-activity link keeps Wir as its Back target.
  await page.locator('.today-recent-activity-link').click();
  await expect(page).toHaveURL(/\/today\/activity$/);
  await shellBack(page).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('Activity opened directly returns to More', async ({ page }) => {
  await open(page);
  await page.goto('/today/activity');
  await expect(activityRow(page)).toBeVisible();
  await expect(primary(page, navigation.more)).toHaveAttribute(
    'aria-current',
    'page',
  );
  await shellBack(page).click();
  await expect(page).toHaveURL(/\/more$/);
});

test('Places scope switches add no Back steps', async ({ page }) => {
  await open(page);
  await primary(page, navigation.more).click();
  await expect(page).toHaveURL(/\/more$/);
  await page.locator('a[href="/more/places"]').first().click();
  await expect(page).toHaveURL(/\/more\/places$/);
  const archived = page.getByRole('button', {
    name: m5s3.place.scopeARCHIVED,
    exact: true,
  });
  const all = page.getByRole('button', {
    name: m5s3.place.scopeALL,
    exact: true,
  });
  await archived.click();
  await expect(page).toHaveURL(/\/more\/places\?scope=ARCHIVED$/);
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/more$/);
});
