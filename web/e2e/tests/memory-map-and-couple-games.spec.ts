import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import mapCopy from '../../src/i18n/locales/memoryMap';
import gameCopy from '../../src/i18n/locales/games';
import calendarCopy from '../../src/i18n/locales/calendarPlan';
import {
  ACCOUNT_ID,
  PARTNER_ID,
  SPACE_ID,
  TINY_PNG,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`saved memory map at ${width} ${theme}: consent, grouped sources and return`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await installMocks(page);
    let tileReads = 0;
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      tileReads++;
      await route.fulfill({ contentType: 'image/png', body: TINY_PNG });
    });
    await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              memoryId: 'mem-canal',
              title: 'Afternoon by the canal',
              happenedOn: '2026-10-30',
              placeId: 'lake',
              placeName: 'Lake',
              latitude: 49.45,
              longitude: 7.16,
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await signIn(page);
    await page.getByRole('link', { name: mapCopy.entry }).click();
    await expect(
      page.getByRole('heading', { name: mapCopy.title }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Lake · 1 Erinnerung' }),
    ).toBeVisible();
    expect(tileReads).toBe(0);
    await page.getByRole('button', { name: 'Lake · 1 Erinnerung' }).click();
    const memory = page.getByRole('link', { name: /Afternoon by the canal/ });
    await expect(memory).toHaveAttribute('href', '/story/memories/mem-canal');
    await page.getByRole('button', { name: 'Karte laden' }).click();
    await expect(page.locator('.memory-map-marker')).toHaveCount(1);
    await expect.poll(() => tileReads).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await captureScreenshot(page, info, `memory-map-${width}-${theme}.png`, {
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include('.memory-map-page').analyze())
        .violations,
    ).toEqual([]);
    await memory.click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal/);
    await page.goBack();
    await expect(page).toHaveURL(/\/story\/map\?place=/);
    await expect(
      page.getByRole('link', { name: /Afternoon by the canal/ }),
    ).toBeVisible();
  });
}

test('map entitlement denial explains Pro without loading external tiles', async ({
  page,
}) => {
  await installMocks(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
    route.fulfill({
      status: 403,
      json: {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: 'Capability required.',
        code: 'PREMIUM_ENTITLEMENT_REQUIRED',
      },
    }),
  );
  await signIn(page);
  await page.getByRole('link', { name: mapCopy.entry }).click();
  await expect(page.getByText(mapCopy.proTitle)).toBeVisible();
  await expect(page.locator('.place-map-viewport')).toHaveCount(0);
});

test('all five Pro games are playable and authored sessions finish and restart', async ({
  page,
}, info) => {
  await installMocks(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/entitlements`, (route) =>
    route.fulfill({
      json: {
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['games.couple'],
      },
    }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}`, (route) =>
    route.fulfill({
      json: {
        id: SPACE_ID,
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      },
    }),
  );
  await signIn(page);
  await page.goto('/games');
  await expect(page.locator('.games-entry-status')).toHaveText(
    Array(5).fill(gameCopy.status.playNow),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, info, 'games-390-light.png', {
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await captureScreenshot(page, info, 'games-1280-dark.png', {
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const game of ['happiness', 'timeTravel'] as const) {
    await page
      .getByRole('button', { name: new RegExp(gameCopy.entries[game].title) })
      .click();
    await expect(page.getByText(gameCopy.local[game].first)).toBeVisible();
    for (let index = 0; index < 6; index++)
      await page.getByRole('button', { name: gameCopy.local.skip }).click();
    await expect(page.getByText(gameCopy.local.finishTitle)).toBeVisible();
    await page.getByRole('button', { name: gameCopy.local.restart }).click();
    await expect(page.getByText(gameCopy.local[game].second)).toBeVisible();
    await page.getByRole('button', { name: gameCopy.local.back }).click();
  }
});

test('dated plan hands off an RFC calendar file without changing the plan', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/plans/calendar-plan`,
    (route) =>
      route.fulfill({
        json: {
          id: 'calendar-plan',
          spaceId: SPACE_ID,
          title: 'Weekend at the lake',
          description: 'A quiet day',
          status: 'PLANNED',
          plannedOn: '2026-11-14',
          plannedStart: null,
          plannedEnd: null,
          placeId: null,
          sourceWishId: null,
          createdBy: ACCOUNT_ID,
          creator: { id: ACCOUNT_ID, displayName: 'Lea' },
          createdAt: '2026-10-30T10:00:00Z',
          updatedAt: '2026-10-31T10:00:00Z',
          version: 1,
          capabilities: { canEdit: true, canDelete: true, canComment: false },
        },
      }),
  );
  await signIn(page);
  await page.goto('/plan/plans/calendar-plan');
  await expect(
    page.getByRole('link', { name: calendarCopy.add }),
  ).toBeVisible();
  const calendar = await page
    .getByRole('link', { name: calendarCopy.add })
    .getAttribute('href');
  const content = await page.evaluate(
    async (url) => await (await fetch(url ?? '')).text(),
    calendar,
  );
  expect(content).toContain('DTSTART;VALUE=DATE:20261114');
  expect(content).toContain('DTEND;VALUE=DATE:20261115');
  expect(content).toContain('SUMMARY:Weekend at the lake');
  await captureScreenshot(page, info, 'calendar-plan-390-light.png', {
    fullPage: true,
  });
});
