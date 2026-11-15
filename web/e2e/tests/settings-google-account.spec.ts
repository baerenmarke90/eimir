import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import photoSources from '../../src/i18n/locales/photoSources';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillEmptyMomentPlaces } from '../support/photoSources';
import { captureScreenshot } from '../support/storyTimelineFixture';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const TEST_NOW = '2026-09-01T10:00:00Z';

interface GoogleAccountScenario {
  googleAvailable: boolean;
  email: string | null;
  version: number;
  saves: { email: string; consent: boolean; ifMatch: string | null }[];
  removals: (string | null)[];
  conflictOnNextWrite?: boolean;
  rejectNext?: boolean;
}

function scenario(googleAvailable = true): GoogleAccountScenario {
  return { googleAvailable, email: null, version: 0, saves: [], removals: [] };
}

function token(state: GoogleAccountScenario): string {
  return state.email
    ? `hint-row:${state.version}`
    : `${ACCOUNT_ID}:google-account:absent`;
}

async function installApiMocks(
  page: Page,
  state: GoogleAccountScenario,
): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyMomentPlaces(route)) return;
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

    if (method === 'GET' && pathname === `${space}/photo-sources`) {
      await fulfillJson({
        enabled: true,
        googleAvailable: state.googleAvailable,
        googleAccountEmail: state.email,
        googleAccountToken: token(state),
        immichConnected: false,
        immichConnectionToken: 'account:immich:absent',
        immichOrigin: null,
        canImport: true,
      });
      return;
    }
    if (pathname === `${space}/photo-sources/google/account`) {
      if (state.conflictOnNextWrite) {
        state.conflictOnNextWrite = false;
        state.email = 'changed.elsewhere@gmail.example';
        state.version++;
        await fulfillJson(
          {
            code: 'RESOURCE_VERSION_CONFLICT',
            detail: 'The Google account changed since it was read.',
            status: 409,
            title: 'Conflict',
          },
          409,
        );
        return;
      }
      if (state.rejectNext) {
        state.rejectNext = false;
        await fulfillJson(
          {
            code: 'VALIDATION_FAILED',
            detail: 'Enter a valid email address.',
            status: 422,
            title: 'Invalid request',
          },
          422,
        );
        return;
      }
      const ifMatch = request.headers()['if-match'] ?? null;
      expect(ifMatch).toBe(JSON.stringify(token(state)));
      if (method === 'PUT') {
        const body = request.postDataJSON() as {
          email: string;
          consent: boolean;
        };
        state.saves.push({ ...body, ifMatch });
        state.email = body.email;
        state.version++;
      } else if (method === 'DELETE') {
        state.removals.push(ifMatch);
        state.email = null;
        state.version++;
      }
      await route.fulfill({ status: 204 });
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

async function openMediaSettings(
  page: Page,
  state: GoogleAccountScenario,
): Promise<void> {
  await installApiMocks(page, state);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.goto('/more/settings/media');
  await expect(
    page.getByRole('heading', {
      name: photoSources.settingsTitle,
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

const ADDRESS = 'anna.private@gmail.example';

function googleSection(page: Page) {
  return page.getByRole('region', { name: photoSources.google, exact: true });
}

async function openLinkDialog(page: Page) {
  await googleSection(page)
    .getByRole('button', {
      name: photoSources.googleAccountLink,
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', {
    name: photoSources.googleAccountSheetTitle,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const [width, colorScheme] of [
  [390, 'light'],
  [390, 'dark'],
  [1280, 'light'],
] as const) {
  test(`the Google account is linked and disconnected in the media settings (${width} ${colorScheme})`, async ({
    page,
  }, testInfo) => {
    const state = scenario();
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await openMediaSettings(page, state);
    const section = googleSection(page);
    await expect(section).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(
      page,
      testInfo,
      `google-account-button-${width}-${colorScheme}.png`,
      { fullPage: true },
    );
    const dialog = await openLinkDialog(page);
    const link = dialog.getByRole('button', {
      name: photoSources.connect,
      exact: true,
    });
    await expect(link).toBeDisabled();
    await dialog
      .getByLabel(photoSources.googleAccountEmail, { exact: true })
      .fill(ADDRESS);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(
      page,
      testInfo,
      `google-account-dialog-${width}-${colorScheme}.png`,
    );
    await link.click();
    await expect(dialog).toHaveCount(0);
    await expect(
      section.getByText(photoSources.googleAccountLinked, { exact: true }),
    ).toBeVisible();
    await expect(section.getByText(ADDRESS, { exact: true })).toBeVisible();
    expect(state.saves).toEqual([
      {
        email: ADDRESS,
        consent: true,
        ifMatch: JSON.stringify(`${ACCOUNT_ID}:google-account:absent`),
      },
    ]);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(
      page,
      testInfo,
      `google-account-linked-${width}-${colorScheme}.png`,
      { fullPage: true },
    );
    const accessibility = await new AxeBuilder({ page })
      .include('.google-account-settings')
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await section
      .getByRole('button', {
        name: photoSources.googleAccountUnlink,
        exact: true,
      })
      .click();
    await expect(
      section.getByText(photoSources.googleAccountUnlinked, { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole('button', {
        name: photoSources.googleAccountLink,
        exact: true,
      }),
    ).toBeVisible();
    expect(state.removals).toEqual([JSON.stringify(`hint-row:1`)]);
    expect(state.email).toBeNull();
  });
}

test('a malformed address is explained and nothing is saved', async ({
  page,
}) => {
  const state = scenario();
  state.rejectNext = true;
  await openMediaSettings(page, state);
  const dialog = await openLinkDialog(page);
  await dialog
    .getByLabel(photoSources.googleAccountEmail, { exact: true })
    .fill('anna@gmail');
  await dialog
    .getByRole('button', { name: photoSources.connect, exact: true })
    .click();
  await expect(
    dialog.getByText(photoSources.googleAccountInvalid, { exact: true }),
  ).toBeVisible();
  expect(state.saves).toEqual([]);
});

test('a change from another window is reloaded instead of overwritten', async ({
  page,
}) => {
  const state = scenario();
  await openMediaSettings(page, state);
  const section = googleSection(page);
  const dialog = await openLinkDialog(page);
  state.conflictOnNextWrite = true;
  await dialog
    .getByLabel(photoSources.googleAccountEmail, { exact: true })
    .fill(ADDRESS);
  await dialog
    .getByRole('button', { name: photoSources.connect, exact: true })
    .click();
  await expect(
    section.getByText(photoSources.googleAccountChanged, { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText('changed.elsewhere@gmail.example', { exact: true }),
  ).toBeVisible();
  expect(state.saves).toEqual([]);
});

test('without the Google import the media settings show no Google section', async ({
  page,
}) => {
  await openMediaSettings(page, scenario(false));
  await expect(googleSection(page)).toHaveCount(0);
});
