import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s6 from '../../src/i18n/locales/m5s6';
import storageQuota from '../../src/i18n/locales/storageQuota';
import AxeBuilder from '../support/axe';
import { fulfillDefaultProductContext } from '../support/productContext';
import { fulfillSettingsOverviewStatuses } from '../support/settingsOverview';

/*
 * Settings › Data import journeys for #2141 B2+N2 (approved UI preflight,
 * states 5–11 and 13): import without videos, no room, and recovering skipped
 * videos. The server decides; the API is mocked with its live preview fields.
 */

const copy = m5s6.transfer;

/** Locale copy with its placeholders filled, as the UI renders it. */
function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(values[key]),
  );
}
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';
const IMPORT_ID = '01a1ff11-f4f7-7e9b-b7ed-e1f581e613b5';
const GB = 1_000_000_000;

type Summary = Record<string, unknown>;

function summary(overrides: Summary = {}): Summary {
  return {
    scope: 'SHARED',
    recordCounts: { memories: 120, plans: 8 },
    mediaCount: 348,
    sourceMemberCount: 2,
    alreadyPresentCount: 36,
    videoCount: 0,
    videoBytes: 0,
    videosNeedPro: false,
    skippedVideoCount: 0,
    recoverableVideoCount: 0,
    recoveredVideoCount: 0,
    unrecoveredVideoCount: 0,
    recoverableVideoBytes: 0,
    storageNeeded: 1.2 * GB,
    storageNeededWithoutVideos: 1.2 * GB,
    storageAvailable: 3.2 * GB,
    storageQuotaExceeded: false,
    storageFitsWithoutVideos: true,
    ...overrides,
  };
}

function importDetail(
  status: string,
  value: Summary,
  errorCode: string | null = null,
) {
  return {
    id: IMPORT_ID,
    status,
    scope: 'SHARED',
    createdAt: '2026-11-21T10:00:00Z',
    validatedAt: '2026-11-21T10:01:00Z',
    completedAt: status === 'COMPLETED' ? '2026-11-21T10:03:00Z' : null,
    expiresAt: '2026-11-22T10:00:00Z',
    artifactSize: 1024,
    errorCode,
    summary: value,
  };
}

interface Journey {
  preview: Summary;
  completed?: Summary;
  skipped?: { count: number; totalSize: number };
  videosAllowed?: boolean;
  /** The Space's storage; unmetered (Self-Hosted) unless given. */
  storage?: { used: number; quota: number | null; available: number | null };
  capabilities?: string[];
}

interface Recorded {
  applied: Array<{ mode: string }>;
  dismissed: number;
}

async function installMocks(page: Page, journey: Journey): Promise<Recorded> {
  const recorded: Recorded = { applied: [], dismissed: 0 };
  let status = 'READY_TO_APPLY';
  let skipped = journey.skipped ?? { count: 0, totalSize: 0 };
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
          accessToken: 'transfer-access-token',
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          refreshToken: 'transfer-refresh-token',
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
    if (pathname === `${base}/transfer/skipped-videos`) {
      if (request.method() === 'DELETE') {
        recorded.dismissed += 1;
        skipped = { count: 0, totalSize: 0 };
        await route.fulfill({ status: 204 });
        return;
      }
      await respond(skipped);
      return;
    }
    if (pathname === `${base}/attachment-upload-policy`) {
      await respond({
        acceptedMimeTypes: ['video/mp4'],
        videoMaxBytes: 250 * 1024 * 1024,
        videoMaxDurationSeconds: 180,
        videoProcessingEnabled: true,
        videoUploadAllowed: journey.videosAllowed === true,
      });
      return;
    }
    if (
      pathname === `${base}/transfer/imports` &&
      request.method() === 'POST'
    ) {
      status = 'READY_TO_APPLY';
      await respond(importDetail(status, journey.preview));
      return;
    }
    if (pathname === `${base}/transfer/imports/${IMPORT_ID}/apply`) {
      recorded.applied.push(request.postDataJSON() as { mode: string });
      status = 'COMPLETED';
      await respond(importDetail('APPLYING', journey.preview));
      return;
    }
    if (pathname === `${base}/transfer/imports/${IMPORT_ID}`) {
      await respond(
        importDetail(
          status,
          status === 'COMPLETED'
            ? (journey.completed ?? journey.preview)
            : journey.preview,
        ),
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
      `Unexpected transfer-journey request: ${request.method()} ${pathname}`,
    );
  });
  return recorded;
}

async function openData(page: Page, query = `?import=${IMPORT_ID}`) {
  await page.goto(`/more/settings/data${query}`);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(
    page.getByRole('heading', { name: copy.import.heading, exact: true }),
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

async function expectAccessible(page: Page, scope = '.transfer-import-stack') {
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

test('a Free couple imports without the videos and sees the skipped ones', async ({
  page,
}, info) => {
  const recorded = await installMocks(page, {
    preview: summary({
      videoCount: 6,
      videoBytes: 0.48 * GB,
      videosNeedPro: true,
    }),
    completed: summary({
      videoCount: 6,
      videosNeedPro: true,
      skippedVideoCount: 6,
    }),
  });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 360) await openData(page);
    await expect(page.getByText(copy.import.videosNeedPro.title)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(
      page,
      info,
      `2141-import-videos-need-pro-${width}-light.png`,
      '.transfer-callout',
    );
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await capture(
    page,
    info,
    '2141-import-videos-need-pro-390-dark-reduced.png',
    '.transfer-callout',
  );
  await expectAccessible(page);
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await expectAccessible(page);

  await page
    .getByRole('checkbox', { name: copy.import.confirmWithoutVideos })
    .check();
  await page
    .getByRole('button', { name: copy.import.applyWithoutVideos })
    .click();
  await expect(page.getByText(copy.import.completed.title)).toBeVisible();
  await expect(
    page.getByText(fill(copy.import.completed.skipped_other, { count: 6 })),
  ).toBeVisible();
  expect(recorded.applied).toEqual([{ mode: 'WITHOUT_VIDEOS' }]);
  await capture(
    page,
    info,
    '2141-import-completed-430-light.png',
    '.transfer-done',
  );

  // Return: the result leads to the moments; Back comes back to Data.
  await page
    .getByRole('link', { name: copy.import.completed.toMoments })
    .click();
  await expect(page).toHaveURL(/\/story/);
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: copy.import.heading, exact: true }),
  ).toBeVisible();
});

test('an import that does not fit offers space or Pro and changes nothing', async ({
  page,
}, info) => {
  const recorded = await installMocks(page, {
    preview: summary({
      storageNeeded: 3.4 * GB,
      storageNeededWithoutVideos: 3.4 * GB,
      storageAvailable: 0.8 * GB,
      storageQuotaExceeded: true,
      storageFitsWithoutVideos: false,
    }),
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await openData(page);
  await expect(page.getByText(copy.import.noRoom.title)).toBeVisible();
  // Large text reflows at the narrowest width without horizontal scrolling.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
  await capture(
    page,
    info,
    '2141-import-no-room-320-light-200-text.png',
    '.transfer-callout',
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: copy.import.morePro }),
  ).toHaveAttribute('href', '/more/pro?context=storage');
  await expectAccessible(page);
  await capture(
    page,
    info,
    '2141-import-no-room-390-light.png',
    '.transfer-callout',
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(
    page,
    info,
    '2141-import-no-room-390-dark.png',
    '.transfer-callout',
  );
  expect(recorded.applied).toEqual([]);
});

test('an import that fits only without videos says so and imports the rest', async ({
  page,
}, info) => {
  const recorded = await installMocks(page, {
    preview: summary({
      videoCount: 6,
      storageNeeded: 1.6 * GB,
      storageNeededWithoutVideos: 1.1 * GB,
      storageAvailable: 1.4 * GB,
      storageQuotaExceeded: true,
    }),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openData(page);
  await expect(
    page.getByText(copy.import.fitsWithoutVideos.title),
  ).toBeVisible();
  await capture(
    page,
    info,
    '2141-import-fits-without-videos-1280-light.png',
    '.transfer-callout',
  );
  await page
    .getByRole('checkbox', { name: copy.import.confirmWithoutVideos })
    .check();
  await page
    .getByRole('button', { name: copy.import.applyWithoutVideos })
    .click();
  await expect(page.getByText(copy.import.completed.title)).toBeVisible();
  expect(recorded.applied).toEqual([{ mode: 'WITHOUT_VIDEOS' }]);
});

test('the importer recovers skipped videos with Pro and can hide the note', async ({
  page,
}, info) => {
  const recorded = await installMocks(page, {
    preview: summary({
      recoverableVideoCount: 6,
      recoverableVideoBytes: 0.48 * GB,
    }),
    completed: summary({ recoveredVideoCount: 6 }),
    skipped: { count: 6, totalSize: 0.48 * GB },
    videosAllowed: true,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await openData(page, '');
  await expect(
    page.getByRole('heading', { name: copy.skipped.heading, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(copy.skipped.bodyPro)).toBeVisible();
  await expectAccessible(page);
  await capture(
    page,
    info,
    '2141-skipped-videos-pro-390-light.png',
    '.transfer-skipped',
  );

  await page.locator('#transfer-recover-file').setInputFiles({
    name: 'eimir-export.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('bundle'),
  });
  await expect(
    page.getByText(fill(copy.import.recover.lead_other, { count: 6 })),
  ).toBeVisible();
  await capture(
    page,
    info,
    '2141-recover-preview-390-light.png',
    '.transfer-surface.transfer-reveal',
  );
  await page
    .getByRole('button', {
      name: fill(copy.import.recover.action_other, { count: 6 }),
    })
    .click();
  await expect(
    page.getByText(fill(copy.import.completed.recovered_other, { count: 6 })),
  ).toBeVisible();
  expect(recorded.applied).toEqual([{ mode: 'VIDEOS_ONLY' }]);

  await page.getByRole('button', { name: copy.skipped.dismiss }).click();
  const sheet = page.getByRole('dialog', { name: copy.skipped.dismissTitle });
  await expect(sheet).toBeVisible();
  await capture(page, info, '2141-skipped-dismiss-sheet-390-light.png');
  await sheet
    .getByRole('button', { name: copy.skipped.dismissConfirm })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.skipped.heading, exact: true }),
  ).toHaveCount(0);
  expect(recorded.dismissed).toBe(1);
});

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

test('Self-Hosted shows no storage section', async ({ page }) => {
  await installMocks(page, { preview: summary() });
  await page.setViewportSize({ width: 390, height: 900 });
  await openData(page, '');
  await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
  await expect(page.locator('.storage-section')).toHaveCount(0);
});
