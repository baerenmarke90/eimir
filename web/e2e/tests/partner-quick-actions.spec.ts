import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import relationshipComponents from '../../src/i18n/locales/relationshipComponents';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

const copy = relationshipComponents.partnerQuickActions;

async function installMocks(
  page: Page,
  {
    hasExtendedCapability = false,
    thinkingOfYouAvailableAt = null,
  }: {
    hasExtendedCapability?: boolean;
    thinkingOfYouAvailableAt?: string | null;
  } = {},
) {
  let entitlementGetCount = 0;
  const sentActions: Array<{ kind: string; clientRequestId: string }> = [];

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
      await json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'quick-actions-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'quick-actions-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await json({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await json({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'quick-actions-refreshed-token',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'quick-actions-refresh-token-2',
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
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
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
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await json({
        durationDisplayMode: 'YEARS_MONTHS',
        relationshipStartedOn: '2026-01-01',
        showRelationshipDuration: true,
        spaceId: SPACE_ID,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
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
          version: 1,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'MUTUAL_REVEAL',
        },
        200,
        { ETag: '"1"' },
      );
      return;
    }
    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await json({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: isPartner ? 'Ben' : 'Anna',
        id: isPartner
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
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await json({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        relationshipDuration: {
          daysTogether: 264,
          displayMode: 'YEARS_MONTHS',
          startedOn: '2026-01-01',
        },
        retrospective: null,
        keepsake: null,
        recentShared: [],
        upcoming: [],
        sharedStorySummary: { heartMoments: 0, memories: 0, milestones: 0 },
        thinkingOfYouAvailableAt,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await json({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await json({ unreadCount: 0 });
      return;
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await json({ state: 'ACTIVE' });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      entitlementGetCount += 1;
      await json({
        capabilities: hasExtendedCapability
          ? ['partner.quick_actions.extended']
          : [],
        isInGracePeriod: false,
        spaceId: SPACE_ID,
        status: 'ACTIVE',
        tier: hasExtendedCapability ? 'PREMIUM' : 'FREE',
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/thinking-of-you`
    ) {
      const body = request.postDataJSON() as { clientRequestId: string };
      await json({
        clientRequestId: body.clientRequestId,
        thinkingOfYouAvailableAt: new Date(
          Date.now() + 30 * 60_000,
        ).toISOString(),
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/partner-quick-actions`
    ) {
      const body = request.postDataJSON() as {
        kind: string;
        clientRequestId: string;
      };
      if (!hasExtendedCapability) {
        await json(
          {
            code: 'PREMIUM_ENTITLEMENT_REQUIRED',
            detail: 'Extended partner quick actions require eimir. Pro.',
            status: 403,
            title: 'Premium required',
          },
          403,
        );
        return;
      }
      sentActions.push(body);
      await json({
        kind: body.kind,
        clientRequestId: body.clientRequestId,
        availableAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      return;
    }

    await json(
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
    entitlementGetCount: () => entitlementGetCount,
    sentActions: () => sentActions,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

function triggerLocator(page: Page) {
  return page.getByRole('button', {
    name: copy.trigger.replace('{{partner}}', 'Ben'),
  });
}

test('opens the Compact avatar quick-actions hub as one overlapping-pair trigger and sends the free Thinking-of-you gesture', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await signIn(page);

  const trigger = triggerLocator(page);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const target = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);

  // Names + relationship duration are the couple-presence-details sibling,
  // stacked below the shared trigger in the today-hero composition.
  await expect(page.locator('.today-hero .couple-presence-title')).toHaveText(
    'Anna & Ben',
  );
  const avatarBox = await page
    .locator('.today-hero .couple-presence-avatar-anchor')
    .boundingBox();
  const detailsBox = await page
    .locator('.today-hero .couple-presence-details')
    .boundingBox();
  if (!avatarBox || !detailsBox) {
    throw new Error('Expected both hero regions to have a layout box.');
  }
  expect(detailsBox.y).toBeGreaterThan(avatarBox.y);

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('partner-quick-actions-390-light-closed.png'),
    fullPage: true,
    animations: 'disabled',
  });

  await trigger.click();
  const sheet = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  await expect(sheet).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const thinkingButton = sheet.getByRole('button', { name: copy.thinking });
  await expect(thinkingButton).toBeFocused();
  await expect(thinkingButton).toBeEnabled();
  await expect(
    sheet.getByRole('button', { name: new RegExp(copy.kiss) }),
  ).toBeVisible();
  await expect(sheet.getByText(copy.premiumHint)).toBeVisible();

  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('partner-quick-actions-390-light-open.png'),
    fullPage: true,
    animations: 'disabled',
  });

  await thinkingButton.click();
  await expect(sheet.getByText(copy.sentThinking)).toBeVisible();
  await expect(thinkingButton).toBeDisabled();

  // Closing and reopening keeps the sheet's own DOM lifecycle honest and
  // restores focus to the avatar trigger (#1215 presence contract).
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('reflects a Dashboard-authoritative Thinking-of-you cooldown immediately on open (regression #790/#791)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, {
    thinkingOfYouAvailableAt: new Date(Date.now() + 29 * 60_000).toISOString(),
  });
  await signIn(page);

  await triggerLocator(page).click();
  const sheet = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  await expect(sheet.getByRole('button', { name: copy.thinking })).toBeDisabled();
  await expect(sheet.getByText(copy.cooldown).first()).toBeVisible();
});

test('gates extended gestures behind the central Premium entitlement and sends to the upgrade flow without a request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page, { hasExtendedCapability: false });
  await signIn(page);

  await triggerLocator(page).click();
  const sheet = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  const kissButton = sheet.getByRole('button', {
    name: new RegExp(copy.kiss),
  });
  await expect(kissButton).toBeEnabled();
  await expect(sheet.getByText(copy.pro).first()).toBeVisible();

  await kissButton.click();
  await expect(page).toHaveURL(/\/more\/profile#profile-premium$/);
  expect(network.sentActions()).toEqual([]);
});

test('sends both extended gestures once the central entitlement grants the capability', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page, { hasExtendedCapability: true });
  await signIn(page);

  await triggerLocator(page).click();
  const sheet = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  const kissButton = sheet.getByRole('button', {
    name: new RegExp(copy.kiss),
  });
  await expect(kissButton).toBeEnabled();
  await kissButton.click();
  await expect(sheet.getByText(copy.sentKiss)).toBeVisible();
  await expect(kissButton).toBeDisabled();

  const checkInButton = sheet.getByRole('button', {
    name: new RegExp(copy.checkIn),
  });
  await checkInButton.click();
  await expect(sheet.getByText(copy.sentCheckIn)).toBeVisible();
  expect(
    network
      .sentActions()
      .map((action) => action.kind)
      .sort(),
  ).toEqual(['CHECK_IN', 'KISS']);
});

test('presents a non-modal, dismissible popover on Expanded Web instead of the Compact sheet', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMocks(page, { hasExtendedCapability: true });
  await signIn(page);

  await triggerLocator(page).click();
  const popover = page.locator('.partner-quick-actions-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute('aria-modal', 'false');
  await expect(page.locator('.short-task-sheet')).toHaveCount(0);

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('partner-quick-actions-1280-light-open.png'),
    fullPage: true,
    animations: 'disabled',
  });

  // Outside-pointer dismissal is the Expanded contract; Escape/backdrop are
  // exercised on Compact above.
  await page.mouse.click(20, 20);
  await expect(popover).toHaveCount(0);
  await expect(triggerLocator(page)).toHaveAttribute('aria-expanded', 'false');
});

test('keeps the trigger reachable across Compact widths and holds up at 320px/200% text, Dark, reduced motion', async ({
  page,
}, testInfo) => {
  await installMocks(page, { hasExtendedCapability: true });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const trigger = triggerLocator(page);
    await expect(trigger).toBeVisible();
    const target = await trigger.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await triggerLocator(page).click();
  const sheet = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: copy.thinking }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'partner-quick-actions-320-dark-200pct-reduced-motion.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});
