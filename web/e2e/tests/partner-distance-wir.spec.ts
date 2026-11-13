import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/partnerLocation';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { mockMapTiles } from '../support/mapTiles';
import {
  captureScreenshot,
  installMocks,
  PARTNER,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/**
 * #1792 partner distance, Wir slice: the distance line inside the couple
 * hero, the viewer-only display preference in Settings › Wir and the
 * dedicated "where we are" map task. Positions travel only in request bodies,
 * and nothing is polled.
 */

type Band =
  | { kind: 'NEARBY' }
  | { kind: 'RANGE'; minKm: number; maxKm: number }
  | { kind: 'APPROXIMATE'; approximateKm: number };

type Scenario = {
  pro?: boolean;
  ownState?: 'OFF' | 'ACTIVE';
  ownLevel?: 'OFF' | 'DISTANCE' | 'DISTANCE_AND_MAP';
  distance?: { band: Band; asOf: Date } | null;
  map?: boolean;
  capturedAt?: Date;
};

type Server = {
  distanceBodies: Record<string, unknown>[];
  mapReads: number;
  settingsWrites: number;
  urls: string[];
};

const settingsPath = `/api/v1/spaces/${SPACE_ID}/partner-location/settings`;
const distancePath = `/api/v1/spaces/${SPACE_ID}/partner-location/distance`;
const mapPath = `/api/v1/spaces/${SPACE_ID}/partner-location/map`;
const dashboardPath = `/api/v1/spaces/${SPACE_ID}/dashboard`;
const MAP_ROUTE = '/today/where-we-are';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const yesterdayAt = (hours: number, minutes: number) => {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  value.setHours(hours, minutes, 0, 0);
  return value;
};
const forPartner = (value: string) => value.replaceAll('{{partner}}', 'Alex');
const between = (distance: string) =>
  copy.distanceBetween.replace('{{distance}}', distance);

async function distanceMocks(
  page: Page,
  {
    pro = true,
    ownState = 'ACTIVE',
    ownLevel = 'DISTANCE',
    distance = {
      band: { kind: 'APPROXIMATE', approximateKm: 340 },
      asOf: minutesAgo(20),
    },
    map = true,
    capturedAt = minutesAgo(20),
  }: Scenario = {},
): Promise<Server> {
  await installMocks(page);
  await mockMapTiles(page);
  const server: Server = {
    distanceBodies: [],
    mapReads: 0,
    settingsWrites: 0,
    urls: [],
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.includes('partner-location')) server.urls.push(url.href);
    if (method === 'GET' && url.pathname.endsWith('/entitlements')) {
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: pro ? 'PREMIUM' : 'FREE',
          status: 'ACTIVE',
          effectiveUntil: null,
          isInGracePeriod: false,
          capabilities: pro ? ['core', 'presence.location'] : ['core'],
        },
      });
    }
    if (method === 'GET' && url.pathname === dashboardPath) {
      return route.fulfill({
        json: {
          recentShared: [],
          relationshipDuration: {
            startedOn: '2023-08-23',
            daysTogether: 1178,
            displayMode: 'DAYS',
          },
          retrospective: null,
          space: { partner: PARTNER, spaceId: SPACE_ID },
          upcoming: [],
          viewerLocalDate: '2026-11-13',
        },
      });
    }
    // Neutral Wir neighbours, so the hero is reviewed without error noise.
    if (
      method === 'GET' &&
      url.pathname === `/api/v1/spaces/${SPACE_ID}/recaps`
    ) {
      return route.fulfill({
        json: { canCompose: false, editions: [], periods: [], hasMore: false },
      });
    }
    if (method === 'GET' && url.pathname.endsWith('/dashboard/preferences')) {
      return route.fulfill({ json: { items: [] } });
    }
    if (method === 'GET' && url.pathname.endsWith('/activity')) {
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    }
    if (url.pathname === settingsPath && method === 'GET') {
      return route.fulfill({
        json: {
          available: pro,
          level: ownLevel,
          state: ownState,
          indefinite: true,
          expiresAt: null,
          generation: 3,
          lastPublishedAt: minutesAgo(5).toISOString(),
        },
      });
    }
    if (url.pathname === settingsPath && method === 'PUT') {
      server.settingsWrites += 1;
      return route.fulfill({ status: 500 });
    }
    if (url.pathname === distancePath && method === 'POST') {
      server.distanceBodies.push(
        request.postDataJSON() as Record<string, unknown>,
      );
      return route.fulfill({
        json: distance
          ? {
              available: true,
              band: distance.band,
              asOf: distance.asOf.toISOString(),
            }
          : { available: false },
      });
    }
    if (url.pathname === mapPath && method === 'GET') {
      server.mapReads += 1;
      return route.fulfill({
        json: map
          ? {
              available: true,
              latitude: 53.55,
              longitude: 10.0,
              radiusMeters: 1500,
              capturedAt: capturedAt.toISOString(),
            }
          : { available: false },
      });
    }
    if (url.pathname.includes('partner-location')) {
      return route.fulfill({
        json: {
          available: pro,
          level: ownLevel,
          state: ownState,
          indefinite: true,
          expiresAt: null,
          generation: 3,
          lastPublishedAt: null,
        },
      });
    }
    return route.fallback();
  });
  return server;
}

async function grantBrowserLocation(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({
    latitude: 50.94,
    longitude: 6.96,
    accuracy: 1500,
  });
}

/** The one-time start sheet may precede Wir for an entitled viewer. */
async function settleStartSheet(page: Page) {
  const sheet = page.getByRole('dialog', { name: copy.onboardingTitle });
  if (await sheet.isVisible().catch(() => false)) {
    await sheet.getByRole('button', { name: copy.onboardingLater }).click();
    await expect(sheet).toBeHidden();
  }
}

async function openWir(page: Page) {
  await signIn(page);
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.waitForTimeout(300);
  await settleStartSheet(page);
  await page.goto('/today');
  await expect(hero(page)).toBeVisible();
  await settleStartSheet(page);
}

function hero(page: Page) {
  return page.locator('.today-hero');
}

async function expectAxeClean(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);
  if (include) builder.include(include);
  const result = await builder.analyze();
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('far distance opens the map task; the map shows an area and returns to Wir', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page, { ownLevel: 'DISTANCE' });
  await openWir(page);

  const line = hero(page).getByRole('link', {
    name: new RegExp(`^${between('340 km')}`),
  });
  await expect(line).toBeVisible();
  // Current values carry no freshness hint.
  await expect(hero(page).locator('.partner-distance-meta')).toHaveCount(0);
  expect(server.distanceBodies.at(-1)).toMatchObject({
    latitude: 50.94,
    longitude: 6.96,
  });
  // Coordinates travel only in request bodies, never in URLs.
  expect(server.urls.join(' ')).not.toMatch(/50\.94|6\.96/);
  await expectAxeClean(page, '.today-hero');
  await captureScreenshot(page, info, 'partner-distance-wir-far-390.png');

  // Nothing is polled while Wir stays open.
  const reads = server.distanceBodies.length;
  await page.waitForTimeout(1500);
  expect(server.distanceBodies.length).toBe(reads);

  await line.click();
  await expect(page).toHaveURL(MAP_ROUTE);
  await expect(
    page.getByRole('heading', { name: copy.mapTitle, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(forPartner(copy.mapPartnerArea).replace('Alex', 'Alex')),
  ).toBeVisible();
  await expect(page.getByText(copy.mapYou)).toBeVisible();
  await expect(
    page.getByText(forPartner(copy.mapOwnSharesDistance)),
  ).toBeVisible();
  await expect(page.locator('.place-map-area.is-partner')).toHaveCount(1);
  await expect(page.locator('.place-map-area.is-own')).toHaveCount(1);
  await page.getByRole('button', { name: copy.mapShowUs }).click();
  await expect(
    page.getByRole('link', { name: copy.mapAdjust }),
  ).toHaveAttribute('href', '/more/settings/relationship/location');
  await expectAxeClean(page, '.partner-map-sheet');
  await captureScreenshot(page, info, 'partner-distance-map-390.png');

  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL('/today');
  await expect(line).toBeVisible();
  expect(server.settingsWrites).toBe(0);
});

test('distance line states: nearby, range, earlier, own location missing, unavailable', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await grantBrowserLocation(page);

  await distanceMocks(page, {
    distance: { band: { kind: 'NEARBY' }, asOf: minutesAgo(10) },
    map: false,
  });
  await openWir(page);
  const nearby = hero(page).getByText(copy.distanceNear);
  await expect(nearby).toBeVisible();
  // Without the partner's map level the line is no map link.
  await expect(hero(page).locator('a.partner-distance-line')).toHaveCount(0);
  await captureScreenshot(page, info, 'partner-distance-wir-nearby-360.png');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await distanceMocks(page, {
    distance: {
      band: { kind: 'RANGE', minKm: 5, maxKm: 10 },
      asOf: minutesAgo(10),
    },
    map: false,
  });
  await page.reload();
  await settleStartSheet(page);
  await expect(hero(page).getByText(between('5–10 km'))).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await distanceMocks(page, {
    distance: {
      band: { kind: 'APPROXIMATE', approximateKm: 340 },
      asOf: yesterdayAt(21, 15),
    },
    map: false,
  });
  await page.reload();
  await settleStartSheet(page);
  const earlier = hero(page).locator('.partner-distance-line.is-earlier');
  await expect(earlier).toBeVisible();
  await expect(earlier).toContainText('gestern, 21:15');
  await expectAxeClean(page, '.today-hero');
  await captureScreenshot(page, info, 'partner-distance-wir-earlier-360.png');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.context().clearPermissions();
  const missing = await distanceMocks(page, { ownState: 'ACTIVE', map: false });
  await page.reload();
  await settleStartSheet(page);
  const ownMissing = hero(page).getByRole('link', {
    name: copy.distanceOwnMissingLabel,
  });
  await expect(ownMissing).toBeVisible();
  await expect(ownMissing).toHaveAttribute(
    'href',
    '/more/settings/relationship/location',
  );
  // Without the viewer's own position nothing is sent for a distance.
  expect(missing.distanceBodies).toEqual([]);
  await captureScreenshot(page, info, 'partner-distance-wir-missing-360.png');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await grantBrowserLocation(page);
  await distanceMocks(page, { distance: null, map: false });
  await page.reload();
  await settleStartSheet(page);
  await expect(hero(page).getByRole('heading', { level: 2 })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(hero(page).locator('.partner-distance-signal')).toHaveCount(0);
});

test('Settings › Wir hides the line for this viewer only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page);
  await openWir(page);
  await expect(
    hero(page).getByRole('link', { name: new RegExp(between('340 km')) }),
  ).toBeVisible();

  await page.goto('/more/settings/today');
  const toggle = page.getByRole('checkbox', { name: copy.wirToggleLabel });
  await expect(toggle).toBeChecked();
  await expect(page.getByText(copy.wirToggleHint)).toBeVisible();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();

  await page.goto('/today');
  await settleStartSheet(page);
  await expect(hero(page).getByRole('heading', { level: 2 })).toBeVisible();
  const reads = server.distanceBodies.length;
  await page.waitForTimeout(500);
  await expect(hero(page).locator('.partner-distance-signal')).toHaveCount(0);
  expect(server.distanceBodies.length).toBe(reads);
  // A display preference never writes anyone's sharing.
  expect(server.settingsWrites).toBe(0);
});

test('without Pro: no line, no distance read, neutral map state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page, { pro: false });
  await openWir(page);
  await expect(hero(page).getByRole('heading', { level: 2 })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(hero(page).locator('.partner-distance-signal')).toHaveCount(0);
  expect(server.distanceBodies).toEqual([]);

  await page.goto(MAP_ROUTE);
  await expect(page.getByText(copy.mapUnavailableTitle)).toBeVisible();
  await expect(page.getByRole('link', { name: copy.mapAdjust })).toBeVisible();
  expect(server.mapReads).toBe(0);
});

const evidence = [
  { width: 360, height: 800, theme: 'light' as const, large: false },
  { width: 390, height: 844, theme: 'light' as const, large: false },
  { width: 430, height: 932, theme: 'light' as const, large: false },
  { width: 390, height: 844, theme: 'dark' as const, large: false },
  { width: 390, height: 844, theme: 'light' as const, large: true },
  { width: 1280, height: 900, theme: 'light' as const, large: false },
  { width: 1280, height: 900, theme: 'dark' as const, large: false },
];

for (const variant of evidence) {
  const name = `${variant.width}-${variant.theme}${variant.large ? '-large' : ''}`;
  test(`evidence: Wir distance and map ${name}`, async ({ page }, info) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.emulateMedia({
      colorScheme: variant.theme,
      reducedMotion: 'reduce',
    });
    await grantBrowserLocation(page);
    await distanceMocks(page, { ownLevel: 'DISTANCE_AND_MAP' });
    await openWir(page);
    if (variant.large) {
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    }
    const line = hero(page).getByRole('link', {
      name: new RegExp(between('340 km')),
    });
    await expect(line).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, info, `partner-distance-wir-${name}.png`);

    await line.click();
    await expect(page).toHaveURL(MAP_ROUTE);
    if (variant.large) {
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    }
    await expect(page.locator('.place-map-area.is-partner')).toHaveCount(1);
    await expect(page.getByText(copy.mapYou)).toBeVisible();
    await page.waitForTimeout(400);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, info, `partner-distance-map-${name}.png`, {
      fullPage: true,
    });
  });
}
