import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import profileIdentity from '../../src/i18n/locales/profileIdentity';
import storageQuota from '../../src/i18n/locales/storageQuota';
import AxeBuilder from '../support/axe';
import { fulfillDefaultProductContext } from '../support/productContext';
import { fulfillSettingsOverviewStatuses } from '../support/settingsOverview';

/*
 * Settings › Data is the storage page since the Transfer Bundle left the
 * product (ADR 0020, #2243 S3). These journeys keep the storage section of
 * #2141 Q5 covered: its states, the Pro wording, the Self-Hosted sentence and
 * the absence of any export or import control. The API is mocked.
 */

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';
const GB = 1_000_000_000;

interface Journey {
  /** The Space's storage; unmetered (Self-Hosted) unless given. */
  storage?: { used: number; quota: number | null; available: number | null };
  capabilities?: string[];
}

async function installMocks(page: Page, journey: Journey): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    if (await fulfillSettingsOverviewStatuses(route, SPACE_ID)) return;
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = (json: unknown) => route.fulfill({ json });
    const base = `/api/v1/spaces/${SPACE_ID}`;

    if (request.method() === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await respond({
        account: { id: ACCOUNT_ID, displayName: 'Lea' },
        tokens: {
          accessToken: 'storage-access-token',
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          refreshToken: 'storage-refresh-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        },
      });
      return;
    }
    if (pathname === '/api/v1/instance/status') {
      await respond({
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
    if (pathname === '/api/v1/auth/me') {
      await respond({ id: ACCOUNT_ID, displayName: 'Lea' });
      return;
    }
    if (pathname === '/api/v1/auth/capabilities') {
      await respond({ serverAdmin: false });
      return;
    }
    if (pathname === '/api/v1/auth/memberships') {
      await respond([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (pathname === base) {
      await respond({
        id: SPACE_ID,
        createdAt: '2025-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      });
      return;
    }
    if (pathname.endsWith('/notifications/unread-count')) {
      await respond({ unreadCount: 0 });
      return;
    }
    if (pathname.endsWith('/entitlements')) {
      const capabilities = journey.capabilities ?? [];
      await respond({
        spaceId: SPACE_ID,
        capabilities,
        isInGracePeriod: false,
        tier: capabilities.length ? 'PREMIUM' : 'FREE',
        status: 'ACTIVE',
      });
      return;
    }
    if (pathname === `${base}/storage`) {
      await respond(
        journey.storage ?? { used: 2 * GB, quota: null, available: null },
      );
      return;
    }
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 404,
        json: {
          type: 'not_found',
          title: 'Not found',
          status: 404,
          detail: 'Not mocked in this journey.',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
      return;
    }
    throw new Error(
      `Unexpected storage-journey request: ${request.method()} ${pathname}`,
    );
  });
}

async function openData(page: Page, query = '') {
  await page.goto(`/more/settings/data${query}`);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: profileIdentity.settingsData }),
  ).toBeVisible();
}

/** A phone-sized view of the state, centred on it as a member would scroll to it. */
async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  focus?: string,
) {
  const output = info.outputPath(name);
  if (focus)
    await page
      .locator(focus)
      .first()
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: output, animations: 'disabled' });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

async function expectAccessible(page: Page, scope = '.storage-section') {
  const result = await new AxeBuilder({ page })
    .include(scope)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const STORAGE_STATES = [
  {
    name: 'roomy',
    storage: { used: 1.8 * GB, quota: 5 * GB, available: 3.2 * GB },
  },
  {
    name: 'almost-full',
    storage: { used: 4.3 * GB, quota: 5 * GB, available: 0.7 * GB },
    title: storageQuota.almostFull.title,
  },
  {
    name: 'full',
    storage: { used: 5 * GB, quota: 5 * GB, available: 0 },
    title: storageQuota.full.title,
  },
] as const;

for (const state of STORAGE_STATES) {
  test(`the storage section shows ${state.name} and its ways out on Compact and Expanded`, async ({
    page,
  }, info) => {
    await installMocks(page, { preview: summary(), storage: state.storage });
    await page.setViewportSize({ width: 390, height: 900 });
    await openData(page, '');
    const section = page.locator('.storage-section');
    await expect(
      section.getByRole('heading', { name: storageQuota.heading }),
    ).toBeVisible();
    if ('title' in state)
      await expect(section.getByText(state.title)).toBeVisible();
    else await expect(section.getByText(storageQuota.counts)).toBeVisible();
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
    await capture(
      page,
      info,
      `2141-storage-${state.name}-390-light.png`,
      '.storage-section',
    );
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expectAccessible(page, '.storage-section');
    await capture(
      page,
      info,
      `2141-storage-${state.name}-390-dark-reduced.png`,
      '.storage-section',
    );
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    await expectAccessible(page, '.storage-section');
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await capture(
      page,
      info,
      `2141-storage-${state.name}-1280-light.png`,
      '.storage-section',
    );
    if (state.name === 'full') {
      // Return: the media overview is the way to free up space.
      await section.getByRole('link', { name: storageQuota.viewMedia }).click();
      await expect(page).toHaveURL(/\/story\/photos/);
      await page.goBack();
      await expect(section.getByText(state.title)).toBeVisible();
    }
  });
}

test('a Pro couple reads its 50 GB in words and sees no Pro offer', async ({
  page,
}, info) => {
  await installMocks(page, {
    preview: summary(),
    storage: { used: 12.4 * GB, quota: 50 * GB, available: 37.6 * GB },
    capabilities: ['storage.cloud_quota_50gb'],
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await openData(page, '');
  const section = page.locator('.storage-section');
  await expect(
    section.getByText(storageQuota.proIncluded.replace('{{quota}}', '50 GB')),
  ).toBeVisible();
  await expect(section.getByRole('link')).toHaveCount(0);
  await capture(
    page,
    info,
    '2141-storage-pro-390-light.png',
    '.storage-section',
  );
});

test('Self-Hosted says calmly that storage is not limited', async ({
  page,
}) => {
  await installMocks(page, {});
  await page.setViewportSize({ width: 390, height: 900 });
  await openData(page);
  const section = page.locator('.storage-section');
  await expect(section.getByText(storageQuota.unlimited)).toBeVisible();
  await expect(section.locator('.storage-meter')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('Settings › Data no longer offers any export or import', async ({
  page,
}) => {
  await installMocks(page, {
    storage: { used: 1.8 * GB, quota: 5 * GB, available: 3.2 * GB },
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await openData(page, `?export=old-export&import=old-import`);
  await expect(page.locator('.storage-section')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /export|import/i }),
  ).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});
