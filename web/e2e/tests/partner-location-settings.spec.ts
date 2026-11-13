import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/partnerLocation';
import profileIdentity from '../../src/i18n/locales/profileIdentity';
import {
  captureScreenshot,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/**
 * #1792 partner distance, first UI slice: one-time start sheet, Settings ›
 * Relationship › Location & distance, Stop without Pro and the Android
 * background disclosure. Positions travel only in request bodies.
 */

type Settings = {
  available: boolean;
  level: 'OFF' | 'DISTANCE' | 'DISTANCE_AND_MAP';
  state: 'OFF' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PARTNER_CHANGED';
  indefinite: boolean;
  expiresAt: string | null;
  generation: number;
  lastPublishedAt: string | null;
};

type Server = {
  settings: Settings;
  writes: Record<string, unknown>[];
  snapshots: Record<string, unknown>[];
  urls: string[];
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Matches localized copy that starts a longer accessible name. */
const startsWith = (value: string) => new RegExp(`^${escapeRegExp(value)}`);
/** The active-share status line before its interpolated end time. */
const activeUntil = new RegExp(
  escapeRegExp(copy.statusActiveUntil.split('{{end}}')[0]),
);
const forPartner = (value: string) => value.replaceAll('{{partner}}', 'Alex');

const settingsPath = `/api/v1/spaces/${SPACE_ID}/partner-location/settings`;
const snapshotPath = `/api/v1/spaces/${SPACE_ID}/partner-location/snapshot`;

async function partnerLocationMocks(
  page: Page,
  { pro = true, initial = {} as Partial<Settings> } = {},
): Promise<Server> {
  await installMocks(page);
  const server: Server = {
    settings: {
      available: pro,
      level: 'OFF',
      state: 'OFF',
      indefinite: false,
      expiresAt: null,
      generation: 0,
      lastPublishedAt: null,
      ...initial,
    },
    writes: [],
    snapshots: [],
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
    if (url.pathname === settingsPath && method === 'GET') {
      return route.fulfill({ json: server.settings });
    }
    if (url.pathname === settingsPath && method === 'PUT') {
      const body = request.postDataJSON() as {
        level: Settings['level'];
        indefinite?: boolean;
        expiresAt?: string | null;
      };
      server.writes.push(body);
      server.settings = {
        ...server.settings,
        level: body.level,
        state: body.level === 'OFF' ? 'OFF' : 'ACTIVE',
        indefinite: Boolean(body.indefinite),
        expiresAt: body.level === 'OFF' ? null : (body.expiresAt ?? null),
        generation: server.settings.generation + 1,
        lastPublishedAt: null,
      };
      return route.fulfill({ json: server.settings });
    }
    if (url.pathname === snapshotPath && method === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>;
      server.snapshots.push(body);
      server.settings = {
        ...server.settings,
        lastPublishedAt: body.capturedAt as string,
      };
      return route.fulfill({ json: server.settings });
    }
    if (url.pathname.includes('partner-location')) {
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
  return server;
}

async function grantBrowserLocation(page: Page) {
  await page
    .context()
    .grantPermissions(['geolocation'], { origin: 'http://127.0.0.1' });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({
    latitude: 53.5511,
    longitude: 9.9937,
    accuracy: 1500,
  });
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

test('start sheet, settings share, duration change and Stop (browser)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await grantBrowserLocation(page);
  const server = await partnerLocationMocks(page);
  await signIn(page);

  const sheet = page.getByRole('dialog', { name: copy.onboardingTitle });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(forPartner(copy.onboardingIntro))).toBeVisible();
  await expect(
    sheet.getByRole('radio', { name: copy.durationEvening }),
  ).toBeChecked();
  await expectAxeClean(page, '.short-task-sheet');
  await captureScreenshot(page, info, 'partner-location-start-sheet-390.png');

  await sheet.getByRole('button', { name: copy.onboardingLater }).click();
  await expect(sheet).toBeHidden();
  expect(server.writes).toEqual([]);
  await page.reload();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(
    page.getByRole('dialog', { name: copy.onboardingTitle }),
  ).toHaveCount(0);

  await page.goto('/more/settings/relationship');
  await expect(
    page.getByRole('heading', {
      name: profileIdentity.settingsRelationship,
      level: 1,
    }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: new RegExp(copy.settingsTitle) })
    .click();
  await expect(page).toHaveURL(/\/more\/settings\/relationship\/location$/);
  await expect(
    page.getByRole('heading', { name: copy.settingsTitle, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('radio', { name: startsWith(copy.levelOff) }),
  ).toBeChecked();

  await page
    .getByRole('radio', { name: startsWith(copy.levelDistance) })
    .click();
  const confirm = page.getByRole('dialog', {
    name: copy.confirmDistanceTitle,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: copy.confirmShare }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(activeUntil)).toBeVisible();
  expect(server.writes.at(-1)).toMatchObject({
    level: 'DISTANCE',
    indefinite: false,
  });
  expect(server.writes.at(-1)?.expiresAt).toEqual(expect.any(String));
  await expect.poll(() => server.snapshots.length).toBe(1);
  expect(server.snapshots[0]).toMatchObject({ consentGeneration: 1 });
  // Coordinates never appear in a URL.
  expect(server.urls.join(' ')).not.toMatch(/53\.55|9\.99/);
  await expectAxeClean(page);
  await captureScreenshot(
    page,
    info,
    'partner-location-settings-active-390.png',
    {
      fullPage: true,
    },
  );

  await page.getByRole('button', { name: copy.changeDuration }).click();
  const duration = page.getByRole('dialog', { name: copy.durationTitle });
  await duration.getByText(copy.durationIndefinite).click();
  await expect(duration.getByText(copy.durationIndefiniteHint)).toBeVisible();
  await duration.getByRole('button', { name: copy.durationSave }).click();
  await expect(page.getByText(copy.statusActiveIndefinite)).toBeVisible();
  expect(server.writes.at(-1)).toMatchObject({
    level: 'DISTANCE',
    indefinite: true,
    expiresAt: null,
  });

  await page.getByRole('button', { name: copy.stop }).click();
  await expect(
    page.getByRole('radio', { name: startsWith(copy.levelOff) }),
  ).toBeChecked();
  expect(server.writes.at(-1)).toEqual({ level: 'OFF' });
  await expect(page.getByText(copy.statusActiveIndefinite)).toHaveCount(0);
});

test('without Pro: calm explanation, no start sheet, Stop for a stored share', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const server = await partnerLocationMocks(page, {
    pro: false,
    initial: { level: 'DISTANCE', state: 'SUSPENDED', generation: 4 },
  });
  await signIn(page);
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/more/settings/relationship/location');
  await expect(page.getByText(copy.proTitle)).toBeVisible();
  await expect(page.getByText(copy.proBody)).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText(copy.statusSuspended)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await captureScreenshot(
    page,
    info,
    'partner-location-settings-no-pro-360.png',
    {
      fullPage: true,
    },
  );

  await page.getByRole('button', { name: copy.stop }).click();
  await expect(page.getByText(copy.statusSuspended)).toHaveCount(0);
  expect(server.writes).toEqual([{ level: 'OFF' }]);
});

async function nativeLocation(page: Page) {
  await page.addInitScript(() => {
    const host = window as unknown as {
      CapacitorCustomPlatform: unknown;
      Capacitor: unknown;
      locationCalls: string[];
    };
    let background = { permission: 'prompt', enabled: false };
    host.CapacitorCustomPlatform = { name: 'android' };
    host.locationCalls = [];
    host.Capacitor = {
      PluginHeaders: [
        {
          name: 'App',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            ...['removeListener', 'getLaunchUrl', 'minimizeApp'].map(
              (name) => ({ name, rtype: 'promise' }),
            ),
          ],
        },
        {
          name: 'NativeSessionStorage',
          methods: ['read', 'write', 'clear'].map((name) => ({
            name,
            rtype: 'promise',
          })),
        },
        {
          name: 'ApproximateLocation',
          methods: [
            'checkPermissions',
            'requestPermissions',
            'current',
            'deviceId',
            'backgroundStatus',
            'requestBackgroundPermission',
            'enableBackground',
            'disableBackground',
            'openAppSettings',
          ].map((name) => ({ name, rtype: 'promise' })),
        },
      ],
      nativeCallback: () => '1',
      nativePromise: async (
        plugin: string,
        method: string,
        options: Record<string, string> = {},
      ) => {
        if (plugin === 'NativeSessionStorage') {
          if (method === 'write')
            sessionStorage.setItem('native-test-session', options.value);
          if (method === 'clear')
            sessionStorage.removeItem('native-test-session');
          return {
            value: sessionStorage.getItem('native-test-session') ?? undefined,
          };
        }
        if (plugin === 'App') return undefined;
        if (plugin !== 'ApproximateLocation') return {};
        host.locationCalls.push(method);
        if (method === 'checkPermissions' || method === 'requestPermissions')
          return { location: 'granted' };
        if (method === 'current')
          return {
            latitude: 53.5511,
            longitude: 9.9937,
            accuracyMeters: 1500,
            capturedAt: Date.now(),
          };
        if (method === 'deviceId') return { deviceId: 'synthetic-device' };
        if (method === 'backgroundStatus') return background;
        if (method === 'requestBackgroundPermission') {
          background = { ...background, permission: 'granted' };
          return { permission: 'granted' };
        }
        if (method === 'enableBackground')
          background = { ...background, enabled: true };
        if (method === 'disableBackground')
          background = { ...background, enabled: false };
        return {};
      },
    };
  });
}

test('Android: prominent disclosure precedes the background permission', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await nativeLocation(page);
  await partnerLocationMocks(page, {
    initial: { level: 'DISTANCE', state: 'ACTIVE', indefinite: true },
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/partner-location/device-credential`,
    (route) =>
      route.fulfill({
        json: {
          credential: 'synthetic-credential',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }),
  );
  await signIn(page);
  await page.goto('/more/settings/relationship/location');

  await expect(
    page.getByRole('heading', { name: copy.deviceTitleApp }),
  ).toBeVisible();
  await expect(page.getByText(copy.permissionChangeBrowser)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: copy.permissionChangeApp }),
  ).toBeVisible();
  const toggle = page.getByRole('switch', { name: copy.backgroundLabel });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await captureScreenshot(
    page,
    info,
    'partner-location-settings-android-390.png',
    {
      fullPage: true,
    },
  );

  await toggle.click();
  const disclosure = page.getByRole('dialog', { name: copy.disclosureTitle });
  await expect(disclosure).toBeVisible();
  await expect(
    disclosure.getByText(forPartner(copy.disclosureBody)),
  ).toBeVisible();
  await expect(
    disclosure.getByText(forPartner(copy.disclosurePurpose)),
  ).toBeVisible();
  const before = await page.evaluate(
    () => (window as unknown as { locationCalls: string[] }).locationCalls,
  );
  expect(before).not.toContain('requestBackgroundPermission');
  await expectAxeClean(page, '.short-task-sheet');
  await captureScreenshot(page, info, 'partner-location-disclosure-390.png');

  await disclosure
    .getByRole('button', { name: copy.disclosureContinue })
    .click();
  await expect(disclosure).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const calls = await page.evaluate(
    () => (window as unknown as { locationCalls: string[] }).locationCalls,
  );
  expect(calls.indexOf('requestBackgroundPermission')).toBeLessThan(
    calls.indexOf('enableBackground'),
  );
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
  test(`evidence: settings and start sheet ${name}`, async ({ page }, info) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.emulateMedia({
      colorScheme: variant.theme,
      reducedMotion: 'reduce',
    });
    await grantBrowserLocation(page);
    await partnerLocationMocks(page);
    await signIn(page);
    if (variant.large) {
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    }
    const sheet = page.getByRole('dialog', { name: copy.onboardingTitle });
    await expect(sheet).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `partner-location-start-sheet-${name}.png`,
    );
    await sheet.getByRole('button', { name: copy.onboardingShare }).click();
    await expect(sheet).toBeHidden();

    await page.goto('/more/settings/relationship/location');
    if (variant.large) {
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    }
    await expect(page.getByText(activeUntil)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(
      page,
      info,
      `partner-location-settings-${name}.png`,
      { fullPage: true },
    );
  });
}
