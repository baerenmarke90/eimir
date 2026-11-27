import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import serverAdmin from '../../src/i18n/locales/serverAdmin';
import AxeBuilder from '../support/axe';
import { installMocks } from '../support/storyTimelineFixture';

/*
 * ServerAdmin › People (redesign part 3, #2324): one search over Accounts and
 * Spaces, the Space file and the individual Cloud storage quota. The routes
 * are mocked with their live contract; audit, escaping and quota enforcement
 * are covered by the backend tests.
 */

const people = serverAdmin.people;
const spaceFile = serverAdmin.spaceFile;
const quotaSheet = serverAdmin.quotaSheet;
const areas = serverAdmin.areas;

const GB = 1024 ** 3;
const SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789ab';
const ACCOUNT_ID = '019b2e1a-7c3d-7f00-8a11-0000000000aa';
const PARTNER_NAME = 'Lena Partnername';

/** Fills a locale template the way i18next does for these plain values. */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, value),
    template,
  );
}

const OVERRIDE_TEXT = fill(spaceFile.override, { quota: '80 GB' });
const PLAN_STORAGE_TEXT = fill(spaceFile.storageOf, {
  used: '46 GB',
  quota: '50 GB',
  percent: '92',
});

function overview(): Record<string, unknown> {
  return {
    accountCount: 2,
    accountsLast24h: 0,
    accountsLast30d: 2,
    accountsLast7d: 0,
    activeSessionCount: 1,
    activeSpaceCount: 1,
    applicationStatus: 'ok',
    buildRevision: 'e2e',
    databaseProvider: 'postgresql',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'cloud',
    enabledAccountCount: 2,
    environment: 'test',
    expiringAdminGrantCount: 0,
    expiringAdminGrants: [],
    jobsFailed: 0,
    jobsFailedUnseen: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 2,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'not_probed',
    mediaStore: 'filesystem',
    mediaStoredBytes: 0,
    oidcAccountCount: 0,
    oidcConnectionCount: 0,
    oldestPendingJobAt: null,
    passkeyAccountCount: 1,
    processStartedAt: '2026-11-23T08:00:00Z',
    publicBaseUrl: 'https://eimir.test',
    recentFailedJobs: [],
    serverAdminAllowlistCount: 1,
    serverAdminVerifiedMatchCount: 1,
    workerLastSeenAt: null,
    videoWorkerStatus: 'no_heartbeat_signal',
    emailFailuresLastHour: 0,
    pushFailuresLastHour: 0,
    backupStatus: 'configured',
    storagePressure: [],
    storagePressureCount: 0,
    supportReportsNew: 0,
    supportReportsOperatorAvailable: false,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 2,
    warningCodes: [],
    workerStatus: 'no_heartbeat_signal',
  };
}

const spaceSummary = {
  id: SPACE_ID,
  createdAt: '2026-03-01T10:00:00Z',
  lifecycleStatus: 'active',
  membershipCount: 2,
  activeMembershipCount: 2,
  historicalMembershipCount: 0,
  leftMembershipCount: 0,
  removedMembershipCount: 0,
  firstMembershipAt: '2026-03-01T10:00:00Z',
  lastMembershipChangeAt: '2026-03-02T10:00:00Z',
  anomalyCodes: [],
};

type Override = {
  quotaBytes: number;
  effectiveUntil: string | null;
  setAt: string;
};

function file(override: Override | null) {
  return {
    space: { ...spaceSummary, latestMembershipEndedAt: null },
    members: [
      {
        accountId: ACCOUNT_ID,
        primaryEmail: 'lena@example.com',
        emailVerified: true,
        authMethods: ['PASSKEY'],
        membershipStatus: 'ACTIVE',
        since: '2026-03-01T10:00:00Z',
        endedAt: null,
      },
      {
        accountId: '019b2e1a-7c3d-7f00-8a11-0000000000bb',
        primaryEmail: 'tom@example.com',
        emailVerified: true,
        authMethods: ['LOCAL_PASSWORD'],
        membershipStatus: 'ACTIVE',
        since: '2026-03-02T10:00:00Z',
        endedAt: null,
      },
    ],
    storage: {
      usedBytes: 46 * GB,
      quotaBytes: override ? override.quotaBytes : 50 * GB,
      tierQuotaBytes: 50 * GB,
      override,
      byMediaType: [
        { mediaType: 'IMAGE', bytes: 31 * GB },
        { mediaType: 'VIDEO', bytes: 14 * GB },
        { mediaType: 'AUDIO', bytes: 1 * GB },
      ],
    },
    entitlement: {
      spaceId: SPACE_ID,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      effectiveUntil: '2026-12-12T10:00:00Z',
      isInGracePeriod: false,
      capabilities: ['storage.cloud_quota_50gb'],
      grants: [
        {
          id: '019b2e1a-7c3d-7f00-8a11-00000000gg01',
          sourceType: 'GOOGLE_PLAY',
          status: 'ACTIVE',
          tier: 'PREMIUM',
          effectiveFrom: '2026-03-12T10:00:00Z',
          effectiveUntil: '2026-12-12T10:00:00Z',
          capabilities: null,
          externalReference: null,
          createdAt: '2026-03-12T10:00:00Z',
        },
      ],
    },
    timeline: [
      {
        at: '2026-11-22T10:00:00Z',
        kind: 'entitlement_grant',
        sourceType: 'GOOGLE_PLAY',
        tier: 'PREMIUM',
        effectiveUntil: '2026-12-12T10:00:00Z',
      },
    ],
  };
}

async function install(page: Page) {
  const recorded = {
    searches: [] as string[],
    quotaWrites: [] as unknown[],
    quotaClears: 0,
    override: null as Override | null,
  };
  await installMocks(page);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return route.fulfill({ json: { serverAdmin: true } });
    if (method === 'GET' && pathname === '/api/v1/server-admin/overview')
      return route.fulfill({ json: overview() });
    if (method === 'GET' && pathname === '/api/v1/server-admin/search') {
      recorded.searches.push(url.searchParams.get('q') ?? '');
      return route.fulfill({
        json: {
          accounts: [
            {
              id: ACCOUNT_ID,
              displayName: PARTNER_NAME,
              primaryEmail: 'lena@example.com',
              emailVerified: true,
              createdAt: '2026-03-01T10:00:00Z',
              disabledAt: null,
              deletionStatus: null,
              authMethods: ['PASSKEY'],
              activeSessionCount: 1,
              activeMembershipCount: 1,
            },
          ],
          spaces: [spaceSummary],
        },
      });
    }
    if (method === 'GET' && pathname === '/api/v1/server-admin/spaces')
      return route.fulfill({
        json: { items: [spaceSummary], total: 1, limit: 25, offset: 0 },
      });
    if (
      method === 'GET' &&
      pathname === `/api/v1/server-admin/spaces/${SPACE_ID}/file`
    )
      return route.fulfill({ json: file(recorded.override) });
    if (pathname === `/api/v1/server-admin/spaces/${SPACE_ID}/storage-quota`) {
      if (method === 'PUT') {
        const body = request.postDataJSON() as {
          quotaGb: number;
          effectiveUntil: string | null;
        };
        recorded.quotaWrites.push(body);
        recorded.override = {
          quotaBytes: body.quotaGb * GB,
          effectiveUntil: body.effectiveUntil,
          setAt: new Date().toISOString(),
        };
        return route.fulfill({ json: file(recorded.override).storage });
      }
      if (method === 'DELETE') {
        recorded.quotaClears += 1;
        recorded.override = null;
        return route.fulfill({ status: 204 });
      }
    }
    return route.fallback();
  });
  return recorded;
}

/** Opens a route and signs in; the app returns to it after the sign-in. */
async function openSignedIn(page: Page, route: string) {
  await page.goto(route);
  await page.getByLabel(de.login.email).fill('operator@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 1, name: serverAdmin.title }),
  ).toBeVisible();
}

function areaNavigation(page: Page) {
  // Only one of the two area navigations is visible at a time.
  return page
    .getByRole('navigation', { name: areas.aria })
    .filter({ visible: true });
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('eimir.theme', value);
    window.dispatchEvent(new Event('storage'));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

/** No horizontal page scrolling; the sub-page pills and tables may scroll inside. */
async function expectReflow(page: Page) {
  const outside = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const scroller = element.parentElement?.closest(
          '.server-admin-subnav, .server-admin-table-scroll',
        );
        return (
          box.width > 1 &&
          (box.right > window.innerWidth + 1 || box.left < -1) &&
          getComputedStyle(element).visibility !== 'hidden' &&
          !element.closest('.sr-only, .skip-link') &&
          !(scroller && getComputedStyle(scroller).overflowX === 'auto')
        );
      })
      .map((element) => element.className),
  );
  expect(outside).toEqual([]);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectAccessible(page: Page, selector = '#server-admin-main') {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const directory = process.env.VISUAL_EVIDENCE_DIR;
  if (!directory) return;
  const output = info.outputPath(name);
  await page.screenshot({ path: output, animations: 'disabled' });
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(output, path.join(directory, name));
}

test('the operator finds a Space, sets an individual quota and removes it again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const recorded = await install(page);
  await openSignedIn(page, '/server-admin?section=search');

  // Open: People starts at the search and marks itself current.
  await expect(
    areaNavigation(page).getByRole('link', { name: areas.people }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(people.hint)).toBeVisible();

  // Interact: an email part finds the Space; no name is shown.
  await page.getByRole('searchbox').fill('lena');
  await expect.poll(() => recorded.searches).toContain('lena');
  await page.getByRole('link', { name: /Space 019b…9ab/ }).click();
  await expect(page).toHaveURL(/[?&]space=019b2e1a/);
  await expect(
    page.getByRole('heading', { name: 'Space 019b…9ab' }),
  ).toBeVisible();
  await expect(page.getByText('lena@example.com')).toBeVisible();
  await expect(page.getByText(PARTNER_NAME)).toHaveCount(0);

  // Save: a value not above the plan says the plan stays (the higher value
  // applies, PO 2026-11-26), then 80 GB is saved.
  await page.getByRole('button', { name: spaceFile.adjustStorage }).click();
  const dialog = page.getByRole('dialog', { name: quotaSheet.title });
  const amount = dialog.getByLabel(quotaSheet.amount);
  await amount.fill('20');
  await expect(
    dialog.getByText(fill(quotaSheet.belowPlan, { tier: '50 GB' })),
  ).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await amount.fill('80');
  await expect(
    dialog.getByText(fill(quotaSheet.belowPlan, { tier: '50 GB' })),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: quotaSheet.save }).click();

  // Observe: the Space file shows the individual quota.
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => recorded.quotaWrites)
    .toEqual([{ quotaGb: 80, effectiveUntil: null }]);
  await expect(page.getByText(OVERRIDE_TEXT)).toBeVisible();

  // Return: removing it brings back the plan's storage.
  await page.getByRole('button', { name: spaceFile.adjustStorage }).click();
  await page
    .getByRole('dialog', { name: quotaSheet.title })
    .getByRole('button', { name: quotaSheet.remove })
    .click();
  await expect.poll(() => recorded.quotaClears).toBe(1);
  await expect(page.getByText(OVERRIDE_TEXT)).toHaveCount(0);
  await expect(page.getByText(PLAN_STORAGE_TEXT)).toBeVisible();
});

test('People search and Space file layout in Compact and Expanded, Light and Dark', async ({
  page,
}, info) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSignedIn(page, `/server-admin?section=spaces&space=${SPACE_ID}`);
  await expect(
    page.getByRole('heading', { name: 'Space 019b…9ab' }),
  ).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectReflow(page);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page
        .getByRole('heading', { name: 'Space 019b…9ab' })
        .scrollIntoViewIfNeeded();
      await capture(page, info, `space-file-compact-${width}-${theme}.png`);
      await expectAccessible(page);
    }
    await setTheme(page, 'light');
  }

  await page.getByRole('button', { name: spaceFile.adjustStorage }).click();
  const dialog = page.getByRole('dialog', { name: quotaSheet.title });
  await dialog.getByLabel(quotaSheet.amount).fill('20');
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `space-file-quota-sheet-390-${theme}.png`);
    await expectAccessible(page, '.server-admin-sheet');
  }
  await setTheme(page, 'light');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 820 });
  await expectReflow(page);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `space-file-expanded-1280-${theme}.png`);
    await expectAccessible(page);
  }
  await setTheme(page, 'light');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectReflow(page);
  await capture(page, info, 'space-file-compact-360-large-text.png');

  await areaNavigation(page).getByRole('link', { name: areas.people }).click();
  await page.getByRole('searchbox').fill('lena');
  await expect(
    page.getByRole('link', { name: /lena@example.com/ }),
  ).toBeVisible();
  await expectReflow(page);
  await capture(page, info, 'people-search-compact-360-large-text.png');
});
