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
          own: {
            energyLevel: ownEnergy,
            vibe: null,
            version: ownEnergy === null ? 0 : 1,
          },
          energy: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner,
          },
          vibe: null,
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
          own: {
            energyLevel: ownEnergy,
            vibe: null,
            version: ownEnergy === null ? 0 : 1,
          },
          energy: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner,
          },
          vibe: null,
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

function energyBadgeAriaValue(value: number): string {
  return dailyEnergy.badgeAriaValue.replace('{{value}}', String(value));
}

test('Daily Energy attaches quiet batteries to both avatars and opens one accessible slider', async ({
  page,
}, testInfo) => {
  const state = await installMocks(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const hero = page.locator('.today-hero');
  await expect(hero).toBeVisible();
  await expect(page.locator('.today-section-energy')).toHaveCount(0);

  const ownBattery = hero.getByRole('button', {
    name: dailyEnergy.badgeAriaEmpty,
  });
  const partnerBattery = hero.getByTestId('daily-energy-partner-battery');
  await expect(ownBattery).toBeVisible();
  await expect(partnerBattery).toBeVisible();
  await expect(partnerBattery).toHaveAttribute('data-state', 'hidden');
  expect(await partnerBattery.getAttribute('data-energy')).toBeNull();

  const ownTargetBox = await ownBattery.boundingBox();
  expect(ownTargetBox).not.toBeNull();
  if (!ownTargetBox) throw new Error('Missing own Energy battery bounds');
  expect(ownTargetBox.height).toBeGreaterThanOrEqual(44);
  expect(ownTargetBox.width).toBeGreaterThanOrEqual(44);

  const primaryAvatar = hero.locator('.partner-avatar-primary');
  const secondaryAvatar = hero.locator('.partner-avatar-secondary');
  const ownChip = ownBattery.locator('.daily-energy-avatar-chip');
  const partnerChip = partnerBattery.locator('.daily-energy-avatar-chip');
  const [primaryBox, secondaryBox, ownChipBox, partnerChipBox] =
    await Promise.all([
      primaryAvatar.boundingBox(),
      secondaryAvatar.boundingBox(),
      ownChip.boundingBox(),
      partnerChip.boundingBox(),
    ]);
  expect(primaryBox).not.toBeNull();
  expect(secondaryBox).not.toBeNull();
  expect(ownChipBox).not.toBeNull();
  expect(partnerChipBox).not.toBeNull();
  if (!primaryBox || !secondaryBox || !ownChipBox || !partnerChipBox) {
    throw new Error('Missing avatar Energy geometry');
  }

  const ownCenterX = ownChipBox.x + ownChipBox.width / 2;
  const partnerCenterX = partnerChipBox.x + partnerChipBox.width / 2;
  expect(ownCenterX).toBeGreaterThan(primaryBox.x);
  expect(ownCenterX).toBeLessThan(primaryBox.x + primaryBox.width);
  expect(partnerCenterX).toBeGreaterThan(secondaryBox.x);
  expect(partnerCenterX).toBeLessThan(secondaryBox.x + secondaryBox.width);
  const primaryBottom = primaryBox.y + primaryBox.height;
  const secondaryBottom = secondaryBox.y + secondaryBox.height;
  expect(ownChipBox.y).toBeLessThan(primaryBottom);
  expect(ownChipBox.y + ownChipBox.height).toBeGreaterThan(primaryBottom);
  expect(partnerChipBox.y).toBeLessThan(secondaryBottom);
  expect(partnerChipBox.y + partnerChipBox.height).toBeGreaterThan(
    secondaryBottom,
  );

  await ownBattery.click();

  const popover = page.getByTestId('daily-energy-popover');
  await expect(popover).toBeVisible();
  await expect(hero).toHaveCSS('z-index', '20');
  await expect(popover).not.toContainText('%');
  await expect(popover.locator('.daily-energy-current-value')).toHaveCount(0);
  await expect(popover.locator('.daily-energy-scale')).toHaveCount(0);
  await expect(
    popover.locator('[data-testid="daily-energy-partner"]'),
  ).toHaveCount(0);

  const slider = popover.getByRole('slider', {
    name: dailyEnergy.selectLegend,
  });
  await expect(slider).toHaveAttribute('min', '10');
  await expect(slider).toHaveAttribute('max', '100');
  await expect(slider).toHaveAttribute('step', '10');
  await expect(slider).toHaveValue('50');

  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('70');
  await page.keyboard.press('Tab');

  await expect.poll(state.patchCount).toBe(1);
  expect(state.lastIfMatch()).toBe('"2026-09-21:absent"');
  expect(state.lastEnergy()).toBe(70);

  await expect(
    hero.getByRole('button', {
      name: energyBadgeAriaValue(70),
    }),
  ).toBeVisible();
  await expect(partnerBattery).toHaveAttribute('data-state', 'visible');
  await expect(partnerBattery).toHaveAttribute('data-energy', '20');
  await expect(hero).not.toContainText('70 %');
  await expect(hero).not.toContainText('20 %');

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page })
    .include('.today-hero')
    .analyze();
  expect(result.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(
      'today-daily-energy-avatar-batteries-390-light.png',
    ),
    fullPage: true,
  });

  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(hero.getByTestId('daily-energy-own-battery')).toBeFocused();
});

test('Daily Energy avatar batteries and popover reflow at 320px with 200 percent text', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 844 });
  await signIn(page);

  const largeTextStyle = await page.addStyleTag({
    content: 'html { font-size: 200% !important; }',
  });

  const hero = page.locator('.today-hero');
  const ownBattery = hero.getByRole('button', {
    name: dailyEnergy.badgeAriaEmpty,
  });
  const partnerBattery = hero.getByTestId('daily-energy-partner-battery');
  await expect(ownBattery).toBeVisible();
  await expect(partnerBattery).toBeVisible();
  await ownBattery.click();

  const popover = page.getByTestId('daily-energy-popover');
  await expect(popover).toBeVisible();
  await expect(hero).toHaveCSS('z-index', '20');
  await expect(popover).not.toContainText('%');
  await expect(
    popover.getByRole('slider', { name: dailyEnergy.selectLegend }),
  ).toBeVisible();

  const viewportWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  const popoverGeometry = await popover.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(popoverGeometry.scrollWidth).toBeLessThanOrEqual(
    popoverGeometry.clientWidth,
  );

  const popoverBox = await popover.boundingBox();
  expect(popoverBox).not.toBeNull();
  if (!popoverBox) throw new Error('Missing Daily Energy popover bounds');
  expect(popoverBox.x).toBeGreaterThanOrEqual(0);
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(
    viewportWidth + 1,
  );

  const heroBox = await hero.boundingBox();
  expect(heroBox).not.toBeNull();
  if (!heroBox) throw new Error('Missing Today hero bounds');
  expect(heroBox.x).toBeGreaterThanOrEqual(0);
  expect(heroBox.x + heroBox.width).toBeLessThanOrEqual(viewportWidth + 1);

  const result = await new AxeBuilder({ page })
    .include('[data-testid="daily-energy-popover"]')
    .analyze();
  expect(result.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(
      'today-daily-energy-avatar-batteries-320-dark-large-text.png',
    ),
    fullPage: true,
  });

  await largeTextStyle.evaluate((node) => node.remove());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

  await expect(popover).toBeVisible();
  const expandedViewportWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  const expandedPopoverBox = await popover.boundingBox();
  expect(expandedPopoverBox).not.toBeNull();
  if (!expandedPopoverBox) {
    throw new Error('Missing expanded Daily Energy popover bounds');
  }
  expect(expandedPopoverBox.x).toBeGreaterThanOrEqual(0);
  expect(expandedPopoverBox.x + expandedPopoverBox.width).toBeLessThanOrEqual(
    expandedViewportWidth + 1,
  );

  const expandedResult = await new AxeBuilder({ page })
    .include('.today-hero')
    .analyze();
  expect(expandedResult.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(
      'today-daily-energy-avatar-batteries-1280-light.png',
    ),
    fullPage: true,
  });
});
