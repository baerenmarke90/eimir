import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import serverAdmin from '../../src/i18n/locales/serverAdmin';
import AxeBuilder from '../support/axe';
import { installMocks } from '../support/storyTimelineFixture';

/*
 * ServerAdmin › System › Monitoring (redesign part 2, #2317). The monitoring
 * and overview routes are mocked with their live contract; history, liveness
 * and alerts are covered by the backend tests.
 */

const monitoring = serverAdmin.monitoring;
const areas = serverAdmin.areas;

type Overview = Record<string, unknown>;

function overview(overrides: Overview = {}): Overview {
  return {
    accountCount: 4,
    accountsLast24h: 1,
    accountsLast30d: 9,
    accountsLast7d: 3,
    activeSessionCount: 2,
    activeSpaceCount: 2,
    applicationStatus: 'ok',
    buildRevision: 'e2e',
    databaseProvider: 'postgresql',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'cloud',
    enabledAccountCount: 4,
    environment: 'test',
    expiringAdminGrantCount: 0,
    expiringAdminGrants: [],
    jobsFailed: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 4,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'not_probed',
    mediaStore: 'filesystem',
    mediaStoredBytes: 0,
    oidcAccountCount: 0,
    oidcConnectionCount: 0,
    oldestPendingJobAt: null,
    passkeyAccountCount: 0,
    processStartedAt: '2026-11-23T08:00:00Z',
    publicBaseUrl: 'https://eimir.test',
    recentFailedJobs: [],
    serverAdminAllowlistCount: 1,
    serverAdminVerifiedMatchCount: 1,
    workerLastSeenAt: null,
    videoWorkerStatus: 'no_heartbeat_signal',
    emailFailuresLastHour: 0,
    pushFailuresLastHour: 0,
    backupStatus: 'not_configured',
    storagePressure: [],
    storagePressureCount: 0,
    supportReportsNew: 0,
    supportReportsOperatorAvailable: false,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 4,
    warningCodes: [],
    workerStatus: 'no_heartbeat_signal',
    ...overrides,
  };
}

type Monitoring = Record<string, unknown>;

function point(hoursAgo: number, extra: Record<string, unknown> = {}) {
  return {
    at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    requests: 120,
    serverErrors: hoursAgo === 5 ? 6 : 0,
    p95Ms: 250,
    newAccounts: 1,
    activeSpaces: 3,
    storedBytes: 1_000_000_000,
    diskUsedBytes: 60_000_000_000 + (24 - hoursAgo) * 100_000_000,
    diskTotalBytes: 100_000_000_000,
    failedJobs: 0,
    failedEmails: 0,
    failedPushes: 0,
    ...extra,
  };
}

function monitoringData(
  range: string,
  filled: boolean,
  alertsEnabled = true,
): Monitoring {
  const points = filled
    ? Array.from({ length: 12 }, (_, index) => point(23 - index * 2))
    : [];
  return {
    range,
    points,
    storage: filled
      ? {
          usedBytes: 61_000_000_000,
          totalBytes: 100_000_000_000,
          fullInDays: 150,
        }
      : { usedBytes: 0, totalBytes: null, fullInDays: null },
    services: [
      { key: 'worker', status: 'ok', lastSeenAt: new Date().toISOString() },
      { key: 'video_worker', status: 'no_heartbeat_signal', lastSeenAt: null },
      { key: 'email', status: 'ok', lastSeenAt: null },
      { key: 'push', status: 'ok', lastSeenAt: null },
    ],
    alertsEnabled,
  };
}

async function install(
  page: Page,
  {
    data = overview(),
    filled = false,
  }: { data?: Overview; filled?: boolean } = {},
) {
  const recorded = {
    ranges: [] as string[],
    alertWrites: [] as unknown[],
    alertsEnabled: true,
  };
  await installMocks(page);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    if (request.method() === 'GET' && pathname === '/api/v1/auth/capabilities')
      return route.fulfill({ json: { serverAdmin: true } });
    if (
      request.method() === 'GET' &&
      pathname === '/api/v1/server-admin/overview'
    )
      return route.fulfill({ json: data });
    if (
      request.method() === 'GET' &&
      pathname === '/api/v1/server-admin/monitoring'
    ) {
      const range = url.searchParams.get('range') ?? '24h';
      recorded.ranges.push(range);
      return route.fulfill({
        json: monitoringData(range, filled, recorded.alertsEnabled),
      });
    }
    if (
      request.method() === 'PUT' &&
      pathname === '/api/v1/server-admin/settings/monitoring-alerts'
    ) {
      const body = request.postDataJSON() as { enabled: boolean };
      recorded.alertWrites.push(body);
      recorded.alertsEnabled = body.enabled;
      return route.fulfill({
        json: {
          registrationEnabled: true,
          maintenanceMode: false,
          effectiveRegistrationEnabled: true,
          monitoringAlertsEnabled: recorded.alertsEnabled,
          version: 2,
        },
      });
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

/** No horizontal page scrolling; the sub-page pills may scroll inside. */
async function expectReflow(page: Page) {
  const outside = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const scroller = element.parentElement?.closest('.server-admin-subnav');
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

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .include('#server-admin-main')
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

test('the operator reads monitoring, switches the range and turns alerts off', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const recorded = await install(page);
  await openSignedIn(page, '/server-admin?section=monitoring');

  // Open: a fresh installation shows a calm empty history, not zero lines.
  await expect(page.getByText(monitoring.emptyHistory)).toBeVisible();
  await expect(
    areaNavigation(page).getByRole('link', { name: areas.system }),
  ).toHaveAttribute('aria-current', 'page');

  // Interact: another range asks the server for it.
  await page.getByRole('button', { name: monitoring.ranges['30d'] }).click();
  await expect(
    page.getByRole('button', { name: monitoring.ranges['30d'] }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => recorded.ranges).toContain('30d');

  // Save: the alert switch writes once.
  const alerts = page.getByRole('checkbox', { name: monitoring.alertsLabel });
  await alerts.uncheck();
  await expect(alerts).not.toBeChecked();
  await expect.poll(() => recorded.alertWrites).toEqual([{ enabled: false }]);
});

test('a missing backup on the Situation leads to Monitoring', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, {
    data: overview({
      deployment: 'cloud',
      warningCodes: ['backup_not_configured'],
    }),
  });
  await openSignedIn(page, '/server-admin');

  await page
    .locator('.server-admin-needs-you')
    .getByRole('link', { name: serverAdmin.situation.backupNotConfigured })
    .click();
  await expect(page).toHaveURL(/[?&]section=monitoring(?:&|$)/);
  await expect(page.getByText(monitoring.emptyHistory)).toBeVisible();
});

test('Monitoring layout in Compact and Expanded, Light and Dark', async ({
  page,
}, info) => {
  await install(page, { filled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await openSignedIn(page, '/server-admin?section=monitoring');
  await expect(
    page.getByRole('img', { name: monitoring.errorRateTrend }),
  ).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectReflow(page);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await capture(page, info, `monitoring-compact-${width}-${theme}.png`);
      await expectAccessible(page);
    }
    await setTheme(page, 'light');
  }

  await page.setViewportSize({ width: 1280, height: 820 });
  await expectReflow(page);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `monitoring-expanded-1280-${theme}.png`);
    await expectAccessible(page);
  }
  await setTheme(page, 'light');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectReflow(page);
  await capture(page, info, 'monitoring-compact-360-large-text.png');
});
