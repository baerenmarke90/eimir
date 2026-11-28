import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/partnerLocation';
import AxeBuilder from '../support/axe';
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
 * hero (or in its own place when moved), the Wir module in Settings › Wir,
 * the sharer's status chip for one-way sharing and the dedicated "where we
 * are" map task. Positions travel only in request bodies,
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
  mapReadGate?: Promise<void>;
  mapPosition?: { latitude: number; longitude: number };
  capturedAt?: Date;
};

type Server = {
  distanceBodies: Record<string, unknown>[];
  modulePreferences: { moduleKey: string; visible: boolean }[];
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
    mapReadGate,
    mapPosition = { latitude: 53.55, longitude: 10.0 },
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
    modulePreferences: [],
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
      return route.fulfill({ json: { items: server.modulePreferences } });
    }
    const moduleMatch = url.pathname.match(
      /\/dashboard\/preferences\/([a-z_]+)$/,
    );
    if (method === 'PATCH' && moduleMatch && moduleMatch[1] !== 'order') {
      const body = request.postDataJSON() as { visible: boolean };
      const item = { moduleKey: moduleMatch[1], visible: body.visible };
      server.modulePreferences = [
        ...server.modulePreferences.filter(
          (entry) => entry.moduleKey !== item.moduleKey,
        ),
        item,
      ];
      return route.fulfill({ json: item });
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
      // Wir reads map availability before it offers a link to the map.
      if (mapReadGate && new URL(page.url()).pathname === MAP_ROUTE) {
        await mapReadGate;
      }
      return route.fulfill({
        json: map
          ? {
              available: true,
              ...mapPosition,
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
  const { promise: mapReadGate, resolve: releaseMapRead } =
    Promise.withResolvers<void>();
  const server = await distanceMocks(page, {
    ownLevel: 'DISTANCE',
    mapReadGate,
  });
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

  const mapReadsBeforeOpen = server.mapReads;
  await line.click();
  await expect(page).toHaveURL(MAP_ROUTE);
  await expect(
    page.getByRole('heading', { name: copy.mapTitle, level: 1 }),
  ).toBeVisible();
  try {
    await expect(
      page.locator('.place-map-viewport .maplibregl-canvas'),
    ).toBeVisible();
    await expect
      .poll(() => server.mapReads)
      .toBeGreaterThan(mapReadsBeforeOpen);
    await expect(page.locator('.place-map-area.is-partner')).toHaveCount(0);
    await expect(
      page.getByText(forPartner(copy.mapPartnerNotSharing)),
    ).toHaveCount(0);
    await captureScreenshot(page, info, 'today-location-map-pending-390.png');
  } finally {
    releaseMapRead();
  }
  // The avatar labels are the bare names; the partner's own area is no longer
  // spelled out. They are short, so they must match exactly.
  await expect(
    page.getByText(forPartner(copy.mapPartnerArea), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(copy.mapYou, { exact: true })).toBeVisible();
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

  await page.getByRole('button', { name: de.common.back }).click();
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
  // A range band is put into words, not a numeric range (#1907 H4).
  await expect(hero(page).getByText(copy.distanceStonesThrow)).toBeVisible();
  await expect(hero(page).getByText(/\d+–\d+/)).toHaveCount(0);

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
  await distanceMocks(page, { distance: null, map: false, ownState: 'OFF' });
  await page.reload();
  await settleStartSheet(page);
  await expect(hero(page).getByRole('heading', { level: 2 })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(hero(page).locator('.partner-distance-signal')).toHaveCount(0);
});

test('one-way sharing: the sharer sees a status chip, never a distance', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page, {
    distance: null,
    map: false,
    ownState: 'ACTIVE',
  });
  await openWir(page);
  const chip = hero(page).getByRole('link', {
    name: forPartner(copy.distanceSharingLabel),
  });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(forPartner(copy.distanceSharing));
  await expect(chip).toHaveAttribute(
    'href',
    '/more/settings/relationship/location',
  );
  await expect(hero(page).getByText(/km/)).toHaveCount(0);
  // The status chip derives nothing from the partner's map area.
  expect(server.mapReads).toBe(0);
  await expectAxeClean(page, '.today-hero');
  await captureScreenshot(page, info, 'partner-distance-wir-sharing-390.png');
});

test('Settings › Wir shows, hides and moves the distance module', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page);
  await openWir(page);
  await expect(
    hero(page).getByRole('link', { name: new RegExp(between('340 km')) }),
  ).toBeVisible();

  await page.goto('/more/settings/today');
  const toggle = page.getByRole('checkbox', { name: copy.wirModuleLabel });
  await expect(toggle).toBeChecked();
  await expect(
    page.getByRole('button', { name: new RegExp(copy.wirModuleLabel) }),
  ).toBeVisible();
  await captureScreenshot(page, info, 'partner-distance-wir-settings-390.png');
  // Hiding moves the row into the collapsed "hidden" group like every other
  // module, so the click is checked through the saved preference.
  await toggle.click();
  await expect
    .poll(() => server.modulePreferences)
    .toContainEqual({ moduleKey: 'partner_distance', visible: false });

  await page.goto('/today');
  await settleStartSheet(page);
  await expect(hero(page).getByRole('heading', { level: 2 })).toBeVisible();
  const reads = server.distanceBodies.length;
  await page.waitForTimeout(500);
  await expect(page.locator('.partner-distance-signal')).toHaveCount(0);
  expect(server.distanceBodies.length).toBe(reads);
  // A Wir module preference never writes anyone's sharing.
  expect(server.settingsWrites).toBe(0);
});

test('a moved distance module renders in its own place below the hero', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page);
  // Saved order: the distance after the daily quote instead of the hero.
  server.modulePreferences = [
    'relationship_presence',
    'shared_experience',
    'daily_quote',
    'partner_distance',
    'keepsake',
    'upcoming',
    'pinned_collection',
    'retrospective',
    'relationship_signal',
    'monthly_highlights',
    'recent_shared',
    'shared_story_summary',
  ].map((moduleKey) => ({ moduleKey, visible: true }));
  await openWir(page);
  await expect(hero(page).locator('.partner-distance-signal')).toHaveCount(0);
  const moved = page.locator(
    '.today-partner-distance .partner-distance-signal',
  );
  await expect(moved).toBeVisible();
  await expect(moved).toContainText(between('340 km'));
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

test('partner shares nothing: the map still opens from the settings link', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page, { map: false });
  await openWir(page);
  await page.goto(MAP_ROUTE);
  await expect(
    page.getByRole('heading', { name: copy.mapTitle, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('.place-map-viewport')).toBeVisible();
  await expect(
    page.getByText(forPartner(copy.mapPartnerNotSharing), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(copy.mapUnavailableTitle)).toHaveCount(0);
  await expect(page.getByRole('link', { name: copy.mapAdjust })).toBeVisible();
  expect(server.mapReads).toBeGreaterThan(0);
  await captureScreenshot(
    page,
    info,
    'partner-distance-map-partner-not-sharing-390.png',
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.place-map-viewport')).toBeVisible();
  await captureScreenshot(
    page,
    info,
    'partner-distance-map-partner-not-sharing-1280.png',
  );
});

const connection = (page: Page) => page.locator('.place-map-connection');

async function openMapFromWir(page: Page, distance: string) {
  await openWir(page);
  await hero(page)
    .getByRole('link', { name: new RegExp(`^${distance}`) })
    .click();
  await expect(page).toHaveURL(MAP_ROUTE);
  await expect(page.locator('.place-map-area.is-partner')).toHaveCount(1);
  await expect(page.locator('.place-map-area.is-own')).toHaveCount(1);
}

test('both sharing: the map connects the two avatars by distance', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const server = await distanceMocks(page, { ownLevel: 'DISTANCE_AND_MAP' });
  await openMapFromWir(page, between('340 km'));

  // Far: a dotted arc below the avatars, drawn in, with a slow travelling glow.
  await expect(connection(page)).toHaveClass(/\bis-far\b/);
  await expect(connection(page)).toHaveAttribute('aria-hidden', 'true');
  const markerAfter = await connection(page).evaluate(
    (element) =>
      element.nextElementSibling?.classList.contains('maplibregl-marker') ??
      false,
  );
  expect(markerAfter).toBe(true);
  const glow = connection(page).locator(
    '.place-map-connection-glow:not(.is-trail)',
  );
  await expect(glow).toHaveCSS(
    'animation-name',
    'eimir-motion-map-connection-travel',
  );
  await expect(glow).toHaveCSS('animation-duration', '6s');
  await expect(glow).toHaveCSS('animation-iteration-count', '3');
  await expect(
    page.getByText(forPartner(copy.mapConnectionLine), { exact: false }),
  ).toBeAttached();
  // The arc adds no request and puts no coordinate into a URL.
  expect(server.urls.join(' ')).not.toMatch(/50\.94|6\.96|53\.55/);

  // "Show us" plays the motion again.
  await page.getByRole('button', { name: copy.mapShowUs }).click();
  await expect(connection(page)).toHaveClass(/\bis-playing\b/);

  // Reduced motion: the arc is complete at once and the glow never shows.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(glow).toHaveCSS('animation-duration', '0s');
  await expect(glow).toHaveCSS('opacity', '0');
  await expect(
    connection(page).locator('.place-map-connection-reveal'),
  ).toHaveCSS('stroke-dashoffset', '0px');
  await captureScreenshot(page, info, 'partner-connection-far-390.png');
});

test('both sharing nearby: a heart instead of a line', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await grantBrowserLocation(page);
  await distanceMocks(page, {
    distance: { band: { kind: 'NEARBY' }, asOf: minutesAgo(15) },
    mapPosition: { latitude: 50.955, longitude: 6.985 },
  });
  await openMapFromWir(page, copy.distanceNear);
  // Nearby never shows a number, not even on the map.
  await expect(page.locator('.partner-map-between-km')).toHaveCount(0);
  await expect(connection(page)).toHaveClass(/\bis-near\b/);
  await expect(
    connection(page).locator('.place-map-connection-heart'),
  ).toBeVisible();
  await expect(
    connection(page).locator('.place-map-connection-line'),
  ).toBeHidden();
  await expect(page.getByText(copy.mapConnectionNear)).toBeAttached();
  await captureScreenshot(page, info, 'partner-connection-near-390.png');
});

test('both sharing regionally: a solid arc with a shorter trip', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  await distanceMocks(page, {
    distance: {
      band: { kind: 'RANGE', minKm: 25, maxKm: 50 },
      asOf: minutesAgo(15),
    },
    mapPosition: { latitude: 51.23, longitude: 6.78 },
  });
  await openMapFromWir(page, copy.distanceShortTrip);
  // The map keeps the kilometres below the words (#1907 H4).
  await expect(page.locator('.partner-map-between')).toContainText(
    copy.distanceShortTrip,
  );
  await expect(page.locator('.partner-map-between-km')).toHaveText('25–50 km');
  await captureScreenshot(
    page.locator('.partner-map-sheet'),
    info,
    'partner-map-sheet-km-25-50-390.png',
  );
  await expect(connection(page)).toHaveClass(/\bis-regional\b/);
  await expect(
    connection(page).locator('.place-map-connection-glow:not(.is-trail)'),
  ).toHaveCSS('animation-duration', '3.2s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await captureScreenshot(page, info, 'partner-connection-regional-390.png');
});

test('tapping a person brings them into view; "show us" returns to both', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await grantBrowserLocation(page);
  await distanceMocks(page, { ownLevel: 'DISTANCE_AND_MAP' });
  await openMapFromWir(page, between('340 km'));

  const surface = page.locator('.partner-map-surface');
  const partnerArea = page.locator('.place-map-area.is-partner');
  const partnerCircle = partnerArea.locator('.place-map-area-circle');
  const ownArea = page.locator('.place-map-area.is-own');
  const partnerAvatar = surface.getByRole('button', {
    name: forPartner(copy.mapZoomToPartner),
    exact: true,
  });
  const ownAvatar = surface.getByRole('button', {
    name: copy.mapZoomToOwn,
    exact: true,
  });
  const circleWidth = async () =>
    (await partnerCircle.boundingBox())?.width ?? 0;
  // Only the avatar takes the tap; the area keeps passing gestures through.
  await expect(partnerArea).toHaveCSS('pointer-events', 'none');
  await expect(partnerAvatar).toHaveCSS('pointer-events', 'auto');
  await expect(ownAvatar).toBeInViewport();
  const overview = await circleWidth();

  // The partner's avatar: the camera fits their approximate area.
  await partnerAvatar.click();
  await expect.poll(circleWidth).toBeGreaterThan(Math.max(200, overview * 2));
  await expect(ownArea).not.toBeInViewport();
  await captureScreenshot(page, info, 'partner-map-person-focus-390.png');

  // The own row in the sheet: the camera centres on the viewer.
  await page
    .locator('.partner-map-sheet')
    .getByRole('button', {
      name: new RegExp(`^${copy.mapYou}.*${copy.mapZoomToOwn}$`),
    })
    .click();
  await expect(ownArea).toBeInViewport();
  await expect(partnerArea).not.toBeInViewport();
  const map = await page.locator('.place-map-viewport').boundingBox();
  const own = await ownArea.boundingBox();
  if (!map || !own) throw new Error('Map and own marker must be laid out');
  expect(Math.abs(own.x - (map.x + map.width / 2))).toBeLessThan(4);
  expect(Math.abs(own.y - (map.y + map.height / 2))).toBeLessThan(4);

  // "Show us" returns to the two of you.
  await page.getByRole('button', { name: copy.mapShowUs }).click();
  await expect(ownArea).toBeInViewport();
  await expect(partnerArea).toBeInViewport();
  await expect.poll(circleWidth).toBeLessThan(overview + 2);

  // The keyboard reaches the same action.
  await partnerAvatar.focus();
  await page.keyboard.press('Enter');
  await expect.poll(circleWidth).toBeGreaterThan(Math.max(200, overview * 2));
  await expectAxeClean(page, '.partner-map-sheet');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await captureScreenshot(page, info, 'partner-map-person-focus-dark-390.png');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(partnerAvatar).toBeInViewport();
  await captureScreenshot(page, info, 'partner-map-person-focus-1280.png');

  // 200 % text: the person rows reflow and stay the way to a person.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.waitForTimeout(400);
  await expectNoHorizontalOverflow(page);
  const ownRow = page.locator('.partner-map-sheet').getByRole('button', {
    name: new RegExp(`^${copy.mapYou}.*${copy.mapZoomToOwn}$`),
  });
  const rowBox = await ownRow.boundingBox();
  expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await ownRow.click();
  await expect(ownArea).toBeInViewport();
  // A full-page capture of a scrolled page would show the fixed skip link.
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(
    page,
    info,
    'partner-map-person-focus-390-large.png',
    {
      fullPage: true,
    },
  );
});

test('an earlier partner snapshot keeps a muted connection without motion', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await grantBrowserLocation(page);
  await distanceMocks(page, {
    distance: {
      band: { kind: 'APPROXIMATE', approximateKm: 340 },
      asOf: minutesAgo(20 * 60),
    },
    capturedAt: minutesAgo(20 * 60),
  });
  await openMapFromWir(page, between('340 km'));
  await expect(connection(page)).toHaveClass(/\bis-earlier\b/);
  await expect(
    connection(page).locator('.place-map-connection-glow:not(.is-trail)'),
  ).toHaveCSS('animation-name', 'none');
  await expect(
    connection(page).locator('.place-map-connection-reveal'),
  ).toHaveCSS('animation-name', 'none');
  await captureScreenshot(
    page,
    info,
    'partner-connection-earlier-390-dark.png',
  );
});

test('one-way or no sharing: no connection and no hint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  // The partner shares the map, the viewer shares nothing.
  await distanceMocks(page, { ownState: 'OFF', ownLevel: 'OFF' });
  await signIn(page);
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.waitForTimeout(300);
  await settleStartSheet(page);
  await page.goto(MAP_ROUTE);
  await expect(page.locator('.place-map-area.is-partner')).toHaveCount(1);
  await expect(page.locator('.place-map-area.is-own')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(connection(page)).toHaveCount(0);
  await expect(page.getByText(forPartner(copy.mapConnectionLine))).toHaveCount(
    0,
  );
});

test('partner without a map area: no connection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  await distanceMocks(page, { map: false, ownLevel: 'DISTANCE_AND_MAP' });
  await openWir(page);
  await page.goto(MAP_ROUTE);
  await expect(page.locator('.place-map-area.is-own')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.locator('.place-map-area.is-partner')).toHaveCount(0);
  await expect(connection(page)).toHaveCount(0);
});

/** The default Verbunden hero with both partners' daily marks (#1790). */
async function connectedHeroWithMarks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const space = `/api/v1/spaces/${SPACE_ID}`;
    if (pathname.endsWith('/appearance/wir-design'))
      return route.fulfill({ json: { designId: 'connected', version: 1 } });
    if (request.method() === 'GET' && pathname === `${space}/configuration`)
      return route.fulfill({
        json: {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'IMMEDIATE',
        },
        headers: { ETag: '"7"' },
      });
    if (pathname === `${space}/daily-check-in/today`)
      return route.fulfill({
        json: {
          checkedOn: '2026-11-13',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: 70, vibe: 'GOOD', vibeNote: null, version: 1 },
          energy: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'VISIBLE', value: 40 },
          },
          vibe: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'VISIBLE', value: 'OKAY' },
            partnerNote: null,
          },
        },
        headers: { ETag: '"2026-11-13:check-in-1:1"' },
      });
    return route.fallback();
  });
}

/** The shortest way from the word to either portrait's ring, in CSS px. */
async function wordClearance(page: Page) {
  return page.evaluate(() => {
    const word = document.querySelector('.wir-distance-word');
    if (!word) return Number.NaN;
    // The painted lines, not the box, which is as wide as the word may get.
    const range = document.createRange();
    range.selectNodeContents(word);
    const corners = [...range.getClientRects()].flatMap((box) => [
      [box.left, box.top],
      [box.right, box.top],
      [box.left, box.bottom],
      [box.right, box.bottom],
    ]);
    const distances = [
      ...document.querySelectorAll('.wir-stage .partner-avatar'),
    ].flatMap((portrait) => {
      const circle = portrait.getBoundingClientRect();
      const x = circle.left + circle.width / 2;
      const y = circle.top + circle.height / 2;
      return corners.map(
        ([cornerX, cornerY]) =>
          Math.hypot(cornerX - x, cornerY - y) - circle.width / 2 - 5,
      );
    });
    return Math.min(...distances);
  });
}

test('Verbunden hero: heart and light carry the distance, a tap shows the word', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await grantBrowserLocation(page);
  await distanceMocks(page, {
    distance: {
      band: { kind: 'RANGE', minKm: 5, maxKm: 10 },
      asOf: minutesAgo(10),
    },
  });
  await connectedHeroWithMarks(page);
  await openWir(page);
  // Nothing about the distance sits between the portraits' names or marks.
  await expect(hero(page).locator('.wir-stage-name')).toHaveCount(0);
  await expect(hero(page).locator('.wir-hero-distance')).toHaveCount(0);
  await expect(hero(page).locator('.wir-bridge-moon')).toHaveCount(1);
  await expect(page.locator('.wir-distance-light')).toHaveCount(1);
  await expect(hero(page).locator('.wir-distance-word')).toHaveCount(0);
  await expect(hero(page).locator('a.wir-bridge')).toHaveAttribute(
    'href',
    '/story/our-story',
  );
  await captureScreenshot(page, info, 'partner-distance-heart-390.png');

  await hero(page)
    .getByRole('button', { name: copy.distanceStonesThrow })
    .click();
  const value = hero(page).getByRole('link', {
    name: `${copy.distanceStonesThrow}. ${copy.distanceOpenMap}`,
  });
  await expect(value).toHaveText(copy.distanceStonesThrowShort);
  await expect(hero(page).locator('.wir-bridge-lead')).toHaveCSS(
    'opacity',
    '0',
  );
  // Focus keeps the word for the checks below.
  await value.focus();
  await captureScreenshot(page, info, 'partner-distance-heart-word-390.png');

  for (const [width, scale] of [
    [320, '100%'],
    [360, '100%'],
    [390, '130%'],
    [430, '100%'],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, scale);
    await expect
      .poll(() => wordClearance(page), { message: `${width} at ${scale}` })
      .toBeGreaterThanOrEqual(0);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(
      page,
      info,
      `partner-distance-heart-word-${width}-${scale.replace('%', '')}.png`,
    );
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await captureScreenshot(
    page,
    info,
    'partner-distance-heart-word-390-dark.png',
  );
  await expectAxeClean(page, '.today-hero');

  await value.click();
  await expect(page).toHaveURL(MAP_ROUTE);
});

test('Verbunden hero: a changed distance is shown once when the app opens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantBrowserLocation(page);
  const withBand = async (band: Band) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await distanceMocks(page, {
      distance: { band, asOf: minutesAgo(10) },
      map: false,
    });
    await connectedHeroWithMarks(page);
  };
  const reopen = async () => {
    await page.reload();
    await settleStartSheet(page);
    await expect(hero(page).locator('.wir-bridge-moon')).toBeAttached();
  };
  const word = hero(page).locator('.wir-distance-word');

  await withBand({ kind: 'APPROXIMATE', approximateKm: 340 });
  await openWir(page);
  await expect(hero(page).locator('.wir-bridge-moon')).toBeAttached();
  await page.waitForTimeout(3_000);
  await expect(word).toHaveCount(0);

  await withBand({ kind: 'RANGE', minKm: 5, maxKm: 10 });
  await reopen();
  await expect(word).toHaveText(copy.distanceStonesThrowShort, {
    timeout: 10_000,
  });
  await expect(word).toHaveCount(0, { timeout: 6_000 });

  // The same value on the next opening is simply there.
  await reopen();
  await page.waitForTimeout(3_000);
  await expect(word).toHaveCount(0);

  // A value that flips again right away moves without another hop.
  await withBand({ kind: 'NEARBY' });
  await reopen();
  await page.waitForTimeout(3_000);
  await expect(word).toHaveCount(0);
  await expect(
    hero(page).getByRole('button', { name: copy.distanceNear }),
  ).toBeAttached();
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
    // At 200 % text the line sits below the first screen and the fixed
    // navigation; centre it for the capture.
    await line.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await captureScreenshot(page, info, `partner-distance-wir-${name}.png`);

    await line.click();
    await expect(page).toHaveURL(MAP_ROUTE);
    if (variant.large) {
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    }
    await expect(page.locator('.place-map-area.is-partner')).toHaveCount(1);
    await expect(page.getByText(copy.mapYou, { exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, info, `partner-distance-map-${name}.png`, {
      fullPage: true,
    });
  });
}
