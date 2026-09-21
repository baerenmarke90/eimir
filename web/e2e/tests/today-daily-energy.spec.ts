import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import dailyEnergy from '../../src/i18n/locales/dailyEnergy';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PROFILE_ID = '00000000-0000-0000-0000-000000000020';

type EnergyProjection =
  | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
  | { state: 'NO_CHECK_IN' }
  | { state: 'VISIBLE'; value: number };

async function installMocks(page: Page): Promise<{
  patchCount: () => number;
  lastIfMatch: () => string | null;
  lastEnergy: () => number | null | undefined;
}> {
  let ownEnergy: number | null = null;
  let partner: EnergyProjection = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' };
  let etag = '"2026-09-21:absent"';
  let patchCount = 0;
  let lastIfMatch: string | null = null;
  let lastEnergy: number | null | undefined;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    const fulfillJson = async (
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
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'daily-energy-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'daily-energy-refresh-token',
        },
      });
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({
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
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await fulfillJson(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: 'MUTUAL_REVEAL',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'MUTUAL_REVEAL',
        },
        200,
        { ETag: '"7"' },
      );
      return;
    }

    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await fulfillJson({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: isPartner ? 'Ben' : 'Anna',
        id: isPartner ? '00000000-0000-0000-0000-000000000022' : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        relationshipDuration: {
          daysTogether: 250,
          startedOn: '2026-01-01',
        },
        retrospective: null,
        recentShared: [],
        upcoming: [],
        thinkingOfYouAvailableAt: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/daily-check-in/today`
    ) {
      await fulfillJson(
        {
          checkedOn: '2026-09-21',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: ownEnergy, version: ownEnergy === null ? 0 : 1 },
          energy: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner,
          },
        },
        200,
        {
          ETag: etag,
          'Cache-Control': 'private, no-store',
        },
      );
      return;
    }

    if (
      method === 'PATCH' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/daily-check-in/today`
    ) {
      patchCount += 1;
      lastIfMatch = request.headers()['if-match'] ?? null;
      const body = request.postDataJSON() as { energyLevel?: number | null };
      lastEnergy = body.energyLevel;

      if (lastIfMatch !== etag) {
        await fulfillJson(
          {
            code: 'RESOURCE_VERSION_CONFLICT',
            detail: 'The Daily Check-in changed since it was read.',
            status: 409,
            title: 'Conflict',
          },
          409,
        );
        return;
      }

      ownEnergy = body.energyLevel ?? null;
      partner =
        ownEnergy === null
          ? { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
          : { state: 'VISIBLE', value: 20 };
      etag =
        ownEnergy === null
          ? '"2026-09-21:absent"'
          : '"2026-09-21:check-in-1:1"';

      await fulfillJson(
        {
          checkedOn: '2026-09-21',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: ownEnergy, version: ownEnergy === null ? 0 : 1 },
          energy: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner,
          },
        },
        200,
        {
          ETag: etag,
          'Cache-Control': 'private, no-store',
        },
      );
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Unexpected ${method} ${pathname}`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return {
    patchCount: () => patchCount,
    lastIfMatch: () => lastIfMatch,
    lastEnergy: () => lastEnergy,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('Daily Energy is a compact keyboard-accessible mutual-reveal moment on Today', async ({
  page,
}, testInfo) => {
  const state = await installMocks(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const section = page.locator('.today-section-energy');
  await expect(section).toBeVisible();
  await expect(
    section.getByRole('heading', { name: dailyEnergy.question }),
  ).toBeVisible();

  const radios = section.getByRole('radio');
  await expect(radios).toHaveCount(10);
  await expect(section.getByText('10 %')).toBeVisible();
  await expect(section.getByText('100 %')).toBeVisible();

  const touchHeights = await section
    .locator('.daily-energy-choice-visual')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  expect(touchHeights).toHaveLength(10);
  for (const height of touchHeights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }

  const partnerState = section.locator('[data-testid="daily-energy-partner"]');
  await expect(partnerState.getByText(dailyEnergy.hiddenTitle)).toBeVisible();
  await expect(partnerState.getByText(dailyEnergy.hiddenBody)).toBeVisible();
  await expect(partnerState.getByText('20 %')).toHaveCount(0);

  const target = section.getByRole('radio', { name: '70 Prozent' });
  await target.focus();
  await expect(target).toBeFocused();
  await page.keyboard.press('Space');

  await expect.poll(state.patchCount).toBe(1);
  expect(state.lastIfMatch()).toBe('"2026-09-21:absent"');
  expect(state.lastEnergy()).toBe(70);

  await expect(section.getByText(dailyEnergy.ownLabel)).toBeVisible();
  await expect(section.getByText('70 %')).toBeVisible();
  await expect(partnerState.getByText('20 %')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page })
    .include('.today-section-energy')
    .analyze();
  expect(result.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-energy-390-light.png'),
    fullPage: true,
  });
});

test('Daily Energy reflows at 320px with 200 percent text without horizontal overflow', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 844 });
  await signIn(page);

  await page.addStyleTag({
    content: 'html { font-size: 200% !important; }',
  });

  const section = page.locator('.today-section-energy');
  await expect(section).toBeVisible();
  const geometry = await section.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);

  const gridColumns = await section
    .locator('.daily-energy-grid')
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' '));
  expect(gridColumns).toHaveLength(2);

  const result = await new AxeBuilder({ page })
    .include('.today-section-energy')
    .analyze();
  expect(result.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-energy-320-dark-large-text.png'),
    fullPage: true,
  });
});
