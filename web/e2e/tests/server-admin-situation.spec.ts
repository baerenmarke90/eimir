import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import serverAdmin from '../../src/i18n/locales/serverAdmin';
import AxeBuilder from '../support/axe';
import { installMocks } from '../support/storyTimelineFixture';

/*
 * The ServerAdmin Situation and its areas (redesign part 1, #2315). The
 * overview is mocked with its live contract; the backend builds the
 * attention lists and is covered by its own tests.
 */

const SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789ab';

const situation = serverAdmin.situation;
const areas = serverAdmin.areas;

function countText(template: string, count: number): string {
  return template.replace('{{count, number}}', String(count));
}

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

/** Three things need the operator: reports, failed jobs and a full Space. */
const BUSY = overview({
  jobsFailed: 2,
  storagePressureCount: 1,
  storagePressure: [
    {
      spaceId: SPACE_ID,
      usedBytes: 46_000_000_000,
      quotaBytes: 50_000_000_000,
    },
  ],
  supportReportsNew: 3,
  supportReportsOperatorAvailable: true,
  warningCodes: ['failed_jobs_present', 'storage_quota_pressure'],
});

async function install(page: Page, data: Overview) {
  await installMocks(page);
  // Registered after the shared fixture, so these answer first.
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') return route.fallback();
    if (pathname === '/api/v1/auth/capabilities')
      return route.fulfill({ json: { serverAdmin: true } });
    if (pathname === '/api/v1/server-admin/overview')
      return route.fulfill({ json: data });
    if (pathname === '/api/v1/server-admin/jobs')
      return route.fulfill({
        json: { items: [], total: 0, limit: 25, offset: 0 },
      });
    if (pathname.startsWith('/api/v1/server-admin/activity'))
      return route.fulfill({
        json: { items: [], total: 0, limit: 25, offset: 0 },
      });
    return route.fallback();
  });
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

test('the operator sees what needs them and opens it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, BUSY);
  await openSignedIn(page, '/server-admin');

  // Open: the summary counts the three items, most urgent kinds first.
  await expect(
    page.getByRole('heading', {
      name: countText(situation.attention_other, 3),
    }),
  ).toBeVisible();
  const queue = page.locator('.server-admin-needs-you');
  await expect(queue.getByRole('link')).toHaveCount(3);
  await expect(queue.getByRole('link').first()).toHaveAttribute(
    'href',
    '/server-admin?section=reports&state=NEW',
  );
  // A missing worker signal is never shown as available.
  await expect(page.locator('.server-admin-service').nth(2)).toContainText(
    situation.noSignalYet,
  );

  // Interact: the failed jobs row leads into System › Jobs.
  await queue
    .getByRole('link', { name: countText(situation.failedJobs_other, 2) })
    .click();
  await expect(page).toHaveURL(/[?&]section=jobs\b/);
  await expect(
    areaNavigation(page).getByRole('link', { name: areas.system }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page
      .getByRole('navigation', { name: serverAdmin.subNavigation.aria })
      .getByRole('link', { name: serverAdmin.navigation.jobs }),
  ).toHaveAttribute('aria-current', 'page');

  // Return: Back restores the Situation.
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: situation.needsYouTitle }),
  ).toBeVisible();
});

test('old links land in their area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, overview());
  await openSignedIn(page, '/server-admin?section=activity&category=accounts');

  await expect(
    areaNavigation(page).getByRole('link', { name: areas.system }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page
      .getByRole('navigation', { name: serverAdmin.subNavigation.aria })
      .getByRole('link', { name: serverAdmin.navigation.activity }),
  ).toHaveAttribute('aria-current', 'page');
});

test('nothing needs you and no plugin', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, overview({ supportReportsNew: 2 }));
  await openSignedIn(page, '/server-admin');

  await expect(page.getByText(situation.nothingNeedsYou)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: situation.allGood }),
  ).toBeVisible();
  // Without the operator plugin there is no Help area, even with old reports.
  await expect(areaNavigation(page).getByRole('link')).toHaveCount(3);
});

test('Situation layout in Compact and Expanded, Light and Dark', async ({
  page,
}, info) => {
  await install(page, BUSY);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSignedIn(page, '/server-admin');

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      areaNavigation(page).getByRole('link', { name: areas.situation }),
    ).toBeVisible();
    await expectReflow(page);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await capture(page, info, `situation-compact-${width}-${theme}.png`);
      await expectAccessible(page);
    }
    await setTheme(page, 'light');
  }

  // Expanded: the side list replaces the bottom bar.
  await page.setViewportSize({ width: 1280, height: 820 });
  await expect(page.locator('.server-admin-area-nav-side')).toBeVisible();
  await expect(page.locator('.server-admin-area-bar')).toBeHidden();
  await expectReflow(page);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `situation-expanded-1280-${theme}.png`);
    await expectAccessible(page);
  }
  await setTheme(page, 'light');

  // Reduced motion and 200 % text at the smallest phone width.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectReflow(page);
  await capture(page, info, 'situation-compact-360-large-text.png');
});
