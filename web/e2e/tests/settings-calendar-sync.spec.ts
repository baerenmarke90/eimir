import AxeBuilder from '../support/axe';
import { expect, type Page, type Route, test } from '@playwright/test';
import calendarSync from '../../src/i18n/locales/calendarSync';
import de from '../../src/i18n/locales/de';
import proPaywall from '../../src/i18n/locales/proPaywall';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillEmptyMomentPlaces } from '../support/photoSources';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  CAPABILITIES,
  captureScreenshot,
} from '../support/storyTimelineFixture';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-01T10:00:00Z';
const SHARED = '/calendars/anna/shared/';
const CHANGED_CONFLICT = calendarSync.conflict.EVENT_CHANGED.replace(
  '{{title}}',
  'Lake brunch',
);

interface CalendarScenario {
  canSync: boolean;
  sponsoredByMe: boolean;
  connected: boolean;
  targetSet: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'SUSPENDED';
  conflict: boolean;
  rejectCredentials: boolean;
  google: boolean;
  googlePending: boolean;
  calendarPrimary: boolean;
  provider: 'CALDAV' | 'GOOGLE';
  requests: { method: string; path: string; body: unknown }[];
}

function scenario(overrides: Partial<CalendarScenario> = {}): CalendarScenario {
  return {
    canSync: true,
    sponsoredByMe: true,
    connected: false,
    targetSet: false,
    status: 'ACTIVE',
    conflict: false,
    rejectCredentials: false,
    google: false,
    googlePending: false,
    calendarPrimary: false,
    provider: 'CALDAV',
    requests: [],
    ...overrides,
  };
}

function view(state: CalendarScenario) {
  const target = state.targetSet
    ? {
        service: state.provider,
        calendarName: state.calendarPrimary
          ? 'anna@gmail.example'
          : 'Unser Kalender',
        calendarPrimary: state.calendarPrimary,
        sponsor: {
          id: state.sponsoredByMe ? ACCOUNT_ID : 'partner',
          displayName: state.sponsoredByMe ? 'Anna' : 'Ben',
        },
        sponsoredByMe: state.sponsoredByMe,
        connectionId: state.sponsoredByMe ? CONNECTION_ID : null,
        status: state.status,
        statusReason: state.status === 'PAUSED' ? 'PAUSED' : null,
        lastSuccessAt: TEST_NOW,
        syncedCount: 12,
        pendingCount: 0,
        failedCount: 0,
        keptCount: 0,
        conflicts: state.conflict
          ? [{ planId: PLAN_ID, reason: 'EVENT_CHANGED' }]
          : [],
      }
    : null;
  return {
    available: true,
    canSync: state.canSync,
    services: state.google ? ['CALDAV', 'GOOGLE'] : ['CALDAV'],
    connections:
      state.connected && state.sponsoredByMe
        ? [
            {
              id: CONNECTION_ID,
              service: state.provider,
              label:
                state.provider === 'GOOGLE'
                  ? 'anna@gmail.example'
                  : 'anna · dav.example.org',
              status: state.googlePending ? 'PENDING' : 'ACTIVE',
            },
          ]
        : [],
    target,
    targetToken: state.targetSet
      ? 'target:1'
      : `${SPACE_ID}:calendar-target:absent`,
  };
}

async function installApiMocks(
  page: Page,
  state: CalendarScenario,
): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyMomentPlaces(route)) return;
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const fulfillJson = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const space = `/api/v1/spaces/${SPACE_ID}`;
    const sync = `${space}/calendar-sync`;
    if (pathname.startsWith(sync)) {
      state.requests.push({
        method,
        path: pathname.slice(sync.length),
        body: request.postDataJSON(),
      });
    }

    if (method === 'GET' && pathname === sync) {
      await fulfillJson(view(state));
      return;
    }
    if (method === 'POST' && pathname === `${sync}/connections/caldav`) {
      if (state.rejectCredentials) {
        await fulfillJson(
          {
            type: 'validation_error',
            code: 'CALENDAR_AUTH_FAILED',
            detail: 'The calendar connection failed.',
            status: 422,
            title: 'Invalid request',
          },
          422,
        );
        return;
      }
      state.connected = true;
      await fulfillJson(
        {
          connection: {
            id: CONNECTION_ID,
            service: 'CALDAV',
            label: 'anna · dav.example.org',
            status: 'ACTIVE',
          },
          calendars: [
            { ref: '/calendars/anna/work/', name: 'Arbeit', writable: false },
            { ref: SHARED, name: 'Unser Kalender', writable: true },
          ],
        },
        201,
      );
      return;
    }
    if (method === 'POST' && pathname === `${sync}/connections/google`) {
      await fulfillJson(
        {
          authorizationUrl:
            'https://accounts.google.com/o/oauth2/v2/auth?state=e2e-state',
        },
        201,
      );
      return;
    }
    if (
      method === 'POST' &&
      pathname === `${sync}/connections/${CONNECTION_ID}/confirm`
    ) {
      state.googlePending = false;
      await fulfillJson({
        connection: {
          id: CONNECTION_ID,
          service: 'GOOGLE',
          label: 'anna@gmail.example',
          status: 'ACTIVE',
        },
        calendars: [
          {
            ref: 'anna@gmail.example',
            name: 'anna@gmail.example',
            writable: true,
            primary: true,
          },
          {
            ref: 'shared@group.calendar.google.com',
            name: 'Unser Kalender',
            writable: true,
          },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `${sync}/connections/${CONNECTION_ID}/calendars`
    ) {
      await fulfillJson({
        calendars: [
          {
            ref: 'anna@gmail.example',
            name: 'anna@gmail.example',
            writable: true,
            primary: true,
          },
          {
            ref: 'shared@group.calendar.google.com',
            name: 'Unser Kalender',
            writable: true,
            primary: false,
          },
        ],
      });
      return;
    }
    if (method === 'PUT' && pathname === `${sync}/target`) {
      expect(request.headers()['if-match']).toBe(
        JSON.stringify(view(state).targetToken),
      );
      state.targetSet = true;
      await fulfillJson(view(state));
      return;
    }
    if (method === 'POST' && pathname === `${sync}/sync`) {
      await fulfillJson(view(state), 202);
      return;
    }
    if (method === 'POST' && pathname === `${sync}/target/pause`) {
      state.status = 'PAUSED';
      await fulfillJson(view(state));
      return;
    }
    if (method === 'POST' && pathname === `${sync}/plans/${PLAN_ID}/resolve`) {
      state.conflict = false;
      await fulfillJson({ state: 'PENDING', targetStatus: 'ACTIVE' });
      return;
    }
    if (method === 'GET' && pathname === `${sync}/plans/${PLAN_ID}`) {
      await fulfillJson({ state: 'SYNCED', targetStatus: 'ACTIVE' });
      return;
    }
    if (method === 'GET' && pathname === `${space}/plans/${PLAN_ID}`) {
      await fulfillJson({
        id: PLAN_ID,
        spaceId: SPACE_ID,
        title: 'Lake brunch',
        description: 'Bring a blanket.',
        creator: { id: ACCOUNT_ID, displayName: 'Anna' },
        capabilities: CAPABILITIES,
        discreet: false,
        discreetTitleMode: 'PREVIEW',
        experiencedOn: null,
        placeId: null,
        sourceWishId: null,
        status: 'PLANNED',
        plannedOn: '2026-11-21',
        plannedStart: null,
        plannedEnd: null,
        version: 2,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
      });
      return;
    }
    if (
      method === 'GET' &&
      [`${space}/places`, `${space}/plans/${PLAN_ID}/comments`].includes(
        pathname,
      )
    ) {
      await fulfillJson({ items: [], hasMore: false, nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `${space}/plans/${PLAN_ID}/collections`
    ) {
      await fulfillJson([]);
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }
    if (method === 'GET' && pathname === space) {
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }
    if (method === 'GET' && pathname === `${space}/partner-nickname`) {
      await fulfillJson({ partnerId: null, nickname: null, version: 0 });
      return;
    }
    if (method === 'GET' && pathname === `${space}/entitlements`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        tier: state.canSync ? 'PREMIUM' : 'FREE',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: state.canSync
          ? ['core', 'integration.external_sync']
          : ['core'],
      });
      return;
    }
    if (method === 'GET' && pathname === `${space}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }
    if (method === 'GET' && pathname === `${space}/profile-preferences`) {
      await fulfillJson({ items: [] });
      return;
    }
    if (method === 'GET' && pathname === `${space}/dashboard`) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `${space}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }
    if (method === 'POST' && pathname === `${space}/presence`) {
      await fulfillJson({ state: null });
      return;
    }
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function openCalendarSettings(page: Page, state: CalendarScenario) {
  await installApiMocks(page, state);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.goto('/more/settings/calendar');
  await expect(
    page.getByRole('heading', {
      name: calendarSync.settingsTitle,
      exact: true,
    }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

for (const [width, colorScheme] of [
  [390, 'light'],
  [390, 'dark'],
  [1280, 'light'],
] as const) {
  test(`a CalDAV calendar becomes the shared calendar (${width} ${colorScheme})`, async ({
    page,
  }, testInfo) => {
    const state = scenario();
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await openCalendarSettings(page, state);
    await captureScreenshot(
      page,
      testInfo,
      `calendar-sync-empty-${width}-${colorScheme}.png`,
    );

    const choice = page.getByRole('button', {
      name: new RegExp(calendarSync.providers.CALDAV_hint),
    });
    await choice.click();
    const sheet = page.getByRole('dialog', {
      name: calendarSync.caldav.sheetTitle,
    });
    await expect(sheet).toBeVisible();
    const check = sheet.getByRole('button', {
      name: calendarSync.caldav.check,
    });
    await expect(check).toBeDisabled();
    await sheet
      .getByLabel(calendarSync.caldav.address)
      .fill('https://dav.example.org/');
    await sheet.getByLabel(calendarSync.caldav.username).fill('anna');
    await sheet.getByLabel(calendarSync.caldav.password).fill('app-password');
    await sheet.getByLabel(calendarSync.caldav.consent).check();
    await check.click();

    const chooser = page.getByRole('dialog', {
      name: calendarSync.choose.title,
    });
    await expect(chooser).toBeVisible();
    await expect(chooser.getByRole('radio', { name: /Arbeit/ })).toBeDisabled();
    await expect(
      chooser.getByRole('radio', { name: 'Unser Kalender' }),
    ).toBeChecked();
    if (width === 390 && colorScheme === 'light')
      await captureScreenshot(
        page,
        testInfo,
        'calendar-sync-choose-390-light.png',
      );
    await chooser
      .getByRole('button', { name: calendarSync.choose.confirm })
      .click();

    await expect(page.getByText(calendarSync.connected.title)).toBeVisible();
    await expect(
      page.getByText('Unser Kalender', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('.calendar-sync-status')
        .filter({ hasText: calendarSync.status.synced }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: calendarSync.actions.syncNow }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const connect = state.requests.find(
      (entry) => entry.path === '/connections/caldav',
    );
    expect(connect?.body).toEqual({
      url: 'https://dav.example.org/',
      username: 'anna',
      password: 'app-password',
      consent: true,
    });
    expect(
      state.requests.find((entry) => entry.path === '/target')?.body,
    ).toEqual({
      connectionId: CONNECTION_ID,
      calendarRef: SHARED,
    });
    if (width === 390 && colorScheme === 'light') {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
    }
    await captureScreenshot(
      page,
      testInfo,
      `calendar-sync-connected-${width}-${colorScheme}.png`,
    );
  });
}

test('the partner sees the shared status, resolves a conflict and holds no credentials', async ({
  page,
}, testInfo) => {
  const state = scenario({
    targetSet: true,
    sponsoredByMe: false,
    conflict: true,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCalendarSettings(page, state);
  await expect(
    page.getByText(
      calendarSync.target.via
        .replace('{{provider}}', calendarSync.providers.CALDAV)
        .replace('{{name}}', 'Ben'),
    ),
  ).toBeVisible();
  await expect(
    page
      .locator('.calendar-sync-status')
      .filter({ hasText: calendarSync.status.attention }),
  ).toBeVisible();
  await expect(page.getByText(CHANGED_CONFLICT)).toBeVisible();
  // Only the sponsor can remove the provider access, even with options open.
  await page.getByText(calendarSync.actions.moreOptions).click();
  await expect(
    page.getByRole('button', {
      name: calendarSync.actions.disconnectProvider.replace(
        '{{provider}}',
        calendarSync.providers.CALDAV,
      ),
    }),
  ).toHaveCount(0);
  await captureScreenshot(
    page,
    testInfo,
    'calendar-sync-partner-conflict-390-light.png',
  );
  await page
    .getByRole('button', { name: calendarSync.conflict.overwrite })
    .click();
  await expect(page.getByText(CHANGED_CONFLICT)).toHaveCount(0);
  expect(
    state.requests.find((entry) => entry.path.endsWith('/resolve'))?.body,
  ).toEqual({
    action: 'OVERWRITE',
  });

  await page.getByRole('button', { name: calendarSync.actions.pause }).click();
  await expect(
    page.getByRole('button', { name: calendarSync.actions.resume }),
  ).toBeVisible();
});

test('a calendar short link opens the exact Plan after signing in', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installApiMocks(page, scenario({ targetSet: true }));
  const planReads: string[] = [];
  const planApiPath = `/api/v1/spaces/${SPACE_ID}/plans/${PLAN_ID}`;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === planApiPath) {
      planReads.push(request.headers().authorization);
    }
  });

  await page.goto('/p/MzMzMzMzQzODMzMzMzMzMw');
  await expect(page.getByLabel(de.login.email)).toBeVisible();
  expect(planReads).toHaveLength(0);
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();

  await expect(page).toHaveURL(`/plan/plans/${PLAN_ID}`);
  const heading = page.getByRole('heading', { name: 'Lake brunch' });
  await expect(heading).toBeVisible();
  await expect(page.getByText('Bring a blanket.')).toBeVisible();
  expect(planReads).toEqual(['Bearer browser-e2e-access-token']);
  await captureScreenshot(page, testInfo, 'calendar-backlink-390.png');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(heading).toBeVisible();
  await captureScreenshot(page, testInfo, 'calendar-backlink-1280.png');
});

test('a Free Space sees one calm Pro explanation and the handoff stays free', async ({
  page,
}) => {
  const state = scenario({ canSync: false });
  await page.setViewportSize({ width: 390, height: 900 });
  await openCalendarSettings(page, state);
  await expect(page.getByText(calendarSync.proRequired)).toBeVisible();
  await expect(page.getByText(calendarSync.handoffStaysFree)).toBeVisible();
  await expect(
    page.getByRole('link', { name: proPaywall.contextAction }),
  ).toHaveAttribute('href', '/more/pro?context=calendar');
  expect(state.requests.filter((entry) => entry.method !== 'GET')).toEqual([]);
});

test('rejected credentials are explained without losing the entered address', async ({
  page,
}) => {
  const state = scenario({ rejectCredentials: true });
  await page.setViewportSize({ width: 320, height: 720 });
  await openCalendarSettings(page, state);
  await page
    .getByRole('button', {
      name: new RegExp(calendarSync.providers.CALDAV_hint),
    })
    .click();
  const sheet = page.getByRole('dialog', {
    name: calendarSync.caldav.sheetTitle,
  });
  await sheet
    .getByLabel(calendarSync.caldav.address)
    .fill('https://dav.example.org/');
  await sheet.getByLabel(calendarSync.caldav.username).fill('anna');
  await sheet.getByLabel(calendarSync.caldav.password).fill('wrong');
  await sheet.getByLabel(calendarSync.caldav.consent).check();
  await sheet.getByRole('button', { name: calendarSync.caldav.check }).click();
  await expect(sheet.getByRole('alert')).toHaveText(
    calendarSync.errors.CALENDAR_AUTH_FAILED,
  );
  await expect(sheet.getByLabel(calendarSync.caldav.address)).toHaveValue(
    'https://dav.example.org/',
  );
  await expectNoHorizontalOverflow(page);
});

test('Google Calendar connects through consent, explicit account confirmation and calendar choice', async ({
  page,
  context,
}, testInfo) => {
  const state = scenario({ google: true });
  await context.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Google</title>' }),
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCalendarSettings(page, state);
  await page
    .getByRole('button', {
      name: new RegExp(calendarSync.providers.GOOGLE_hint),
    })
    .click();
  // Web consent runs in this tab, without a second window.
  await expect.poll(() => page.url()).toContain('accounts.google.com');
  expect(
    state.requests.find((entry) => entry.path === '/connections/google')?.body,
  ).toEqual({ returnTo: 'web' });

  // Google returns to the settings; the server now holds a pending connection.
  state.connected = true;
  state.googlePending = true;
  state.provider = 'GOOGLE';
  state.calendarPrimary = true;
  await page.goto('/more/settings/calendar?calendarGoogle=connected');
  await expect.poll(() => page.url()).not.toContain('calendarGoogle');
  const confirmCard = page.getByRole('region', {
    name: calendarSync.google.confirmTitle,
  });
  await expect(confirmCard).toContainText('anna@gmail.example');
  await captureScreenshot(
    page,
    testInfo,
    'calendar-sync-google-confirm-390-light.png',
  );
  await confirmCard
    .getByRole('button', { name: calendarSync.google.confirm })
    .click();

  const chooser = page.getByRole('dialog', { name: calendarSync.choose.title });
  await chooser
    .getByRole('radio', { name: calendarSync.target.primaryCalendar })
    .check();
  await chooser
    .getByRole('button', { name: calendarSync.choose.confirm })
    .click();
  const card = page.locator('.calendar-sync-card');
  await expect(
    card.getByRole('heading', { name: calendarSync.target.primaryCalendar }),
  ).toBeVisible();
  await expect(card).toContainText('anna@gmail.example');
  expect(
    state.requests.find((entry) => entry.path === '/target')?.body,
  ).toEqual({
    connectionId: CONNECTION_ID,
    calendarRef: 'anna@gmail.example',
  });
  await captureScreenshot(
    page,
    testInfo,
    'calendar-sync-google-connected-390-light.png',
  );

  // Another calendar or connection stays one step away.
  await card
    .getByRole('button', { name: calendarSync.actions.changeCalendar })
    .click();
  const again = page.getByRole('dialog', { name: calendarSync.choose.title });
  await expect(
    again.getByRole('radio', { name: 'Unser Kalender' }),
  ).toBeVisible();
  await expect(
    again.getByRole('button', { name: calendarSync.choose.connect_CALDAV }),
  ).toBeVisible();
  await captureScreenshot(
    page,
    testInfo,
    'calendar-sync-change-calendar-390-light.png',
  );
});
