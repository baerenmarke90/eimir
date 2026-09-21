import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import dailyVibe from '../../src/i18n/locales/dailyVibe';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

async function installMocks(page: Page) {
  let ownVibe: string | null = null;
  let partnerState:
    | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
    | { state: 'VISIBLE'; value: string } = {
    state: 'HIDDEN_UNTIL_SELF_CHECK_IN',
  };
  let etag = '"2026-09-21:check-in-1:1"';
  let lastPatch: Record<string, unknown> | null = null;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const json = async (
      body: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await json({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: { localPassword: true, passkey: true, magicLink: true, oidc: false },
      });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'daily-vibe-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'daily-vibe-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await json({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/spaces/' + SPACE_ID) {
      await json({
        id: SPACE_ID,
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben' },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/configuration'
    ) {
      await json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'MUTUAL_REVEAL',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'MUTUAL_REVEAL',
        },
        200,
        { ETag: '"7"' },
      );
      return;
    }
    if (
      method === 'GET' &&
      (pathname ===
        '/api/v1/spaces/' + SPACE_ID + '/profiles/' + ACCOUNT_ID ||
        pathname ===
          '/api/v1/spaces/' + SPACE_ID + '/profiles/' + PARTNER_ID)
    ) {
      const partner = pathname.endsWith(PARTNER_ID);
      await json({
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: partner ? 'Ben' : 'Anna',
        id: partner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/dashboard/preferences'
    ) {
      await json({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/dashboard'
    ) {
      await json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        relationshipDuration: { daysTogether: 250, startedOn: '2026-01-01' },
        retrospective: null,
        recentShared: [],
        upcoming: [
          {
            id: '00000000-0000-0000-0000-000000000040',
            type: 'PLAN',
            titleOrText: 'Gemeinsamer Abend',
            scheduledAt: '2026-09-22T18:00:00Z',
          },
        ],
        thinkingOfYouAvailableAt: null,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/activity'
    ) {
      await json({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/notifications/unread-count'
    ) {
      await json({ unreadCount: 0 });
      return;
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/presence'
    ) {
      await json({ state: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/daily-check-in/today'
    ) {
      await json(
        {
          checkedOn: '2026-09-21',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: 60, vibe: ownVibe, version: 1 },
          energy: null,
          vibe: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner: partnerState,
          },
        },
        200,
        { ETag: etag, 'Cache-Control': 'private, no-store' },
      );
      return;
    }
    if (
      method === 'PATCH' &&
      pathname === '/api/v1/spaces/' + SPACE_ID + '/daily-check-in/today'
    ) {
      lastPatch = request.postDataJSON() as Record<string, unknown>;
      ownVibe =
        Object.prototype.hasOwnProperty.call(lastPatch, 'vibe')
          ? (lastPatch.vibe as string | null)
          : ownVibe;
      partnerState =
        ownVibe === null
          ? { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
          : { state: 'VISIBLE', value: 'STRESSED' };
      etag = '"2026-09-21:check-in-1:2"';
      await json(
        {
          checkedOn: '2026-09-21',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: 60, vibe: ownVibe, version: 2 },
          energy: null,
          vibe: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner: partnerState,
          },
        },
        200,
        { ETag: etag, 'Cache-Control': 'private, no-store' },
      );
      return;
    }

    await json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: 'Unexpected ' + method + ' ' + pathname,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return { lastPatch: () => lastPatch };
}

async function signIn(page: Page) {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('Daily Vibe stays relationship-first, uses the shared sheet, and preserves Energy', async ({
  page,
}, testInfo) => {
  const state = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await signIn(page);

  const hero = page.locator('.today-hero');
  const vibe = page.getByTestId('daily-vibe-checkin');
  const upcoming = page.locator('.today-section-upcoming');
  await expect(hero).toBeVisible();
  await expect(vibe).toBeVisible();
  await expect(upcoming).toBeVisible();

  const order = await page.evaluate(() => {
    const heroNode = document.querySelector('.today-hero');
    const vibeNode = document.querySelector('[data-testid="daily-vibe-checkin"]');
    const upcomingNode = document.querySelector('.today-section-upcoming');
    if (!heroNode || !vibeNode || !upcomingNode) return false;
    return Boolean(
      heroNode.compareDocumentPosition(vibeNode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) &&
      Boolean(
        vibeNode.compareDocumentPosition(upcomingNode) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
  });
  expect(order).toBe(true);

  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();

  for (const label of Object.values(dailyVibe.values)) {
    await expect(sheet.getByRole('button', { name: label })).toBeVisible();
  }

  const grip = sheet.getByRole('button', { name: dailyVibe.close });
  const box = await grip.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Missing Vibe sheet grip');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 4 });
  await page.mouse.move(x, y + 24, { steps: 3 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();

  await sheet.getByRole('button', { name: dailyVibe.values.GOOD }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByTestId('daily-vibe-partner').getByText(
      dailyVibe.values.STRESSED,
    ),
  ).toBeVisible();

  expect(state.lastPatch()).toEqual({ vibe: 'GOOD' });
  expect(state.lastPatch()).not.toHaveProperty('energyLevel');

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-390-light.png'),
    fullPage: true,
  });

  await page.getByRole('button', {
    name: dailyVibe.changeAria.replace(
      '{{value}}',
      dailyVibe.values.GOOD,
    ),
  }).click();
  await page.getByRole('button', { name: dailyVibe.remove }).click();
  await expect(
    page.getByTestId('daily-vibe-partner').getByText(
      dailyVibe.partnerHidden,
    ),
  ).toBeVisible();
  expect(state.lastPatch()).toEqual({ vibe: null });
});

test('Daily Vibe reflows at 320px with large text and Reduced Motion', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: dailyVibe.values.NEEDS_CONNECTION }),
  ).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-320-dark-large-text.png'),
    fullPage: true,
  });
});
