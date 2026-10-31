import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import calendarCopy from '../../src/i18n/locales/calendarPlan';
import gameCopy from '../../src/i18n/locales/games';
import mapCopy from '../../src/i18n/locales/memoryMap';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  PARTNER_ID,
  SPACE_ID,
  signIn,
  TINY_PNG,
} from '../support/storyTimelineFixture';

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`saved memory map at ${width} ${theme}: immediate map, grouped sources and return`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: width === 430 ? 'no-preference' : 'reduce',
    });
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
            {
              memoryId: 'mem-walk',
              title: 'One more walk together',
              happenedOn: '2026-06-12',
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
    const place = page.getByRole('button', { name: 'Lake · 2 Erinnerungen' });
    await expect(place).toBeVisible();
    await expect(page.locator('.memory-map-marker')).toHaveCount(1);
    await expect.poll(() => tileReads).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Karte laden' })).toHaveCount(
      0,
    );
    await captureScreenshot(
      page,
      info,
      `memory-map-places-${width}-${theme}.png`,
      {
        fullPage: true,
      },
    );
    await place.hover();
    if (width !== 430) await expect(place).toHaveCSS('transform', 'none');
    await place.click();
    const memory = page.getByRole('link', { name: /Afternoon by the canal/ });
    await expect(memory).toHaveAttribute('href', '/story/memories/mem-canal');
    await expect(page.locator('.memory-map-selection ul')).toHaveCSS(
      'animation-name',
      width === 430 ? 'eimir-disclosure-reveal' : 'none',
    );
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
    await page.locator('.shell-detail-back').click();
    await expect(page).toHaveURL(/\/story\/map\?place=/);
    await expect(
      page.getByRole('link', { name: /Afternoon by the canal/ }),
    ).toBeVisible();
  });
}

test('failed map tiles keep memories usable at 320px with large text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMocks(page);
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 503, body: '' }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            memoryId: 'mem-canal',
            title: 'A long afternoon together by the canal after our walk',
            happenedOn: '2026-10-30',
            placeId: 'lake',
            placeName: 'Our favourite quiet place by the water',
            latitude: 49.45,
            longitude: 7.16,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await signIn(page);
  await page.getByRole('link', { name: mapCopy.entry, exact: true }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.locator('.place-map-canvas [role="status"]')).toBeVisible();
  await page
    .getByRole('button', { name: /Our favourite quiet place by the water/ })
    .click();
  await expect(
    page.getByRole('link', { name: /A long afternoon together/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await captureScreenshot(
    page,
    info,
    'memory-map-320-dark-large-tile-error.png',
    {
      fullPage: true,
    },
  );
  expect(
    (await new AxeBuilder({ page }).include('.memory-map-page').analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: mapCopy.allPlaces }).click();
  await expect(
    page.getByRole('button', {
      name: /Our favourite quiet place by the water/,
    }),
  ).toBeVisible();
});

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
