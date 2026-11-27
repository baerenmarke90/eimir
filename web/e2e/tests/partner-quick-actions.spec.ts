import AxeBuilder from '../support/axe';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import onceCopy from '../../src/i18n/locales/onceMessages';
import people from '../../src/i18n/locales/people';
import relationshipComponents from '../../src/i18n/locales/relationshipComponents';
import storyProducts from '../../src/i18n/locales/storyProducts';
import wirCheckInCopy from '../../src/i18n/locales/wirCheckIn';
import wishSelection from '../../src/i18n/locales/wishSelection';
import localizedFixtures from '../fixtures/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import { captureScreenshot } from '../support/storyTimelineFixture';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

const copy = relationshipComponents.partnerQuickActions;

async function installMocks(
  page: Page,
  {
    hasExtendedCapability = false,
    thinkingOfYouAvailableAt = null,
    accountName = 'Anna',
    partnerName = 'Ben',
    accountProfileAttachmentId = null,
    partnerProfileAttachmentId = null,
    holdFirstGesture = false,
    failFirstGesture = false,
    supportGesturesEnabled = true,
    vibeCheckEnabled = false,
    unreadCounts = [0],
    notificationItems = () => [],
  }: {
    hasExtendedCapability?: boolean;
    thinkingOfYouAvailableAt?: string | null;
    accountName?: string;
    partnerName?: string;
    accountProfileAttachmentId?: string | null;
    partnerProfileAttachmentId?: string | null;
    holdFirstGesture?: boolean;
    failFirstGesture?: boolean;
    supportGesturesEnabled?: boolean;
    vibeCheckEnabled?: boolean;
    /** Successive unread counts; the last value repeats. */
    unreadCounts?: number[];
    notificationItems?: () => unknown[];
  } = {},
) {
  let unreadReads = 0;
  let notificationListReads = 0;
  let entitlementGetCount = 0;
  const sentActions: Array<{ kind: string; clientRequestId: string }> = [];
  const gestures: Array<{ kind: string; clientRequestId: string }> = [];
  let releaseGesture!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseGesture = resolve;
  });

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
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
        account: { displayName: accountName, id: ACCOUNT_ID },
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
      await json({ displayName: accountName, id: ACCOUNT_ID });
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
          { id: ACCOUNT_ID, displayName: accountName },
          { id: PARTNER_ID, displayName: partnerName },
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
          supportGesturesEnabled,
          version: 1,
          vibeCheckEnabled,
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
        displayName: isPartner ? partnerName : accountName,
        id: isPartner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: isPartner
          ? partnerProfileAttachmentId
          : accountProfileAttachmentId,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      (pathname ===
        `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}/avatar/content` ||
        pathname ===
          `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}/avatar/content`)
    ) {
      const isPartner = pathname.includes(PARTNER_ID);
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: isPartner
          ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 160"><rect width="80" height="160" fill="#d8c5e7"/><circle cx="40" cy="52" r="22" fill="#7a5b95"/></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><rect width="160" height="80" fill="#f5cabb"/><circle cx="54" cy="40" r="22" fill="#8a4d5d"/></svg>',
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
          partner: { id: PARTNER_ID, displayName: partnerName },
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
      const index = Math.min(unreadReads, unreadCounts.length - 1);
      unreadReads += 1;
      await json({ unreadCount: unreadCounts[index] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications`
    ) {
      notificationListReads += 1;
      await json({ items: notificationItems(), nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/daily-check-in/today`
    ) {
      await json(
        {
          checkedOn: '2026-11-15',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: null, vibe: null, vibeNote: null, version: 1 },
          energy: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'NO_CHECK_IN' },
          },
          vibe: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'NO_CHECK_IN' },
            partnerNote: null,
          },
        },
        200,
        { ETag: '"2026-11-15:check-in:1"' },
      );
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
      gestures.push({
        kind: 'THINKING',
        clientRequestId: body.clientRequestId,
      });
      if (holdFirstGesture && gestures.length === 1) await held;
      if (failFirstGesture && gestures.length === 1) {
        await json(
          {
            code: 'INTERNAL_ERROR',
            detail: 'Response could not be confirmed.',
            status: 503,
            title: 'Unavailable',
            type: 'about:blank',
          },
          503,
        );
        return;
      }
      thinkingOfYouAvailableAt = new Date(
        Date.now() + 30 * 60_000,
      ).toISOString();
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
      gestures.push(body);
      if (holdFirstGesture && gestures.length === 1) await held;
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

  await mockEmptyPartnerNickname(page, SPACE_ID, PARTNER_ID);

  return {
    entitlementGetCount: () => entitlementGetCount,
    notificationListReads: () => notificationListReads,
    sentActions: () => sentActions,
    gestures: () => gestures,
    releaseGesture,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
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

function triggerLocator(page: Page, partnerName = 'Ben') {
  return page.getByRole('button', {
    name: copy.trigger.replace('{{partner}}', partnerName),
  });
}

for (const scenario of [
  {
    kind: 'THINKING',
    label: copy.thinking,
    pending: copy.sendingThinking,
    confirmed: copy.sentThinking,
    width: 390,
    theme: 'light',
  },
  {
    kind: 'KISS',
    label: copy.kiss,
    pending: copy.sendingKiss,
    confirmed: copy.sentKiss,
    width: 360,
    theme: 'light',
  },
  {
    kind: 'CHECK_IN',
    label: copy.checkIn,
    pending: copy.sendingCheckIn,
    confirmed: copy.sentCheckIn,
    width: 430,
    theme: 'dark',
  },
] as const) {
  test(`gesture ${scenario.kind}: pending survives navigation, excludes duplicate sends and confirms only after the server`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({ colorScheme: scenario.theme });
    const network = await installMocks(page, {
      hasExtendedCapability: true,
      holdFirstGesture: true,
    });
    await signIn(page);
    await triggerLocator(page).click();
    let surface = page.getByRole('dialog', {
      name: copy.title.replace('{{partner}}', 'Ben'),
    });
    const action = surface.getByRole('button', {
      name: new RegExp(scenario.label.replace('?', '\\?')),
    });
    await action.focus();
    await action.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(surface.getByText(scenario.pending)).toBeVisible();
    await expect(action).toBeFocused();
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    const onceEntry = surface.getByRole('link', {
      name: new RegExp(onceCopy.title),
    });
    await expect(onceEntry).toHaveAttribute('aria-disabled', 'true');
    await onceEntry.evaluate((link: HTMLAnchorElement) => link.click());
    await expect(page).toHaveURL('/today');
    await expect(surface).toBeVisible();
    await expect(surface.getByText(scenario.confirmed)).toHaveCount(0);
    await expect.poll(() => network.gestures().length).toBe(1);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `gesture-${scenario.kind}-pending-${scenario.width}-${scenario.theme}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(surface).toHaveCount(0);
    await expect(triggerLocator(page)).toBeFocused();
    await page
      .getByRole('link', { name: de.more.eyebrow, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);
    await triggerLocator(page).click();
    surface = page.getByRole('dialog', {
      name: copy.title.replace('{{partner}}', 'Ben'),
    });
    await expect(surface.getByText(scenario.pending)).toBeVisible();
    await surface
      .getByRole('button', { name: new RegExp(copy.thinking) })
      .evaluate((button: HTMLButtonElement) => button.click());
    expect(network.gestures()).toHaveLength(1);
    network.releaseGesture();
    // Confirmed by the server: the sheet closes, the gesture flies to the
    // partner and the confirmation is posted (the in-sheet line closes with it).
    await expect(page.locator('.snackbar')).toContainText(scenario.confirmed);
    await expect(surface).toHaveCount(0);
    await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.screenshot({
      path: testInfo.outputPath(
        `gesture-${scenario.kind}-confirmed-${scenario.width}-${scenario.theme}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await triggerLocator(page).click();
    surface = page.getByRole('dialog', {
      name: copy.title.replace('{{partner}}', 'Ben'),
    });
    await expect(surface.getByText(scenario.pending)).toHaveCount(0);
    await expect(
      surface.getByRole('button', {
        name: new RegExp(scenario.label.replace('?', '\\?')),
      }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(surface).toHaveCount(0);
    await expect(triggerLocator(page)).toBeFocused();
  });
}

test('system Back closes the Expanded quick-actions popover without leaving Wir (#1907)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMocks(page);
  await signIn(page);
  const popover = page.locator('.partner-quick-actions-popover');
  await triggerLocator(page).click();
  await expect(popover).toBeVisible();
  const openIndex = await page.evaluate(() => window.history.state?.idx);
  await page.goBack();
  await expect(popover).toHaveCount(0);
  await expect(page).toHaveURL(/\/today$/);
  expect(await page.evaluate(() => window.history.state?.idx)).toBe(openIndex);
  // Escape releases the entry too, so the next Back is not swallowed.
  await triggerLocator(page).click();
  await expect(popover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(window.history.state?.__eimirEditorEntry)),
    )
    .toBe(false);
});

test('gesture failure survives leaving and returning; explicit retry reconciles the same request identity', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page, { failFirstGesture: true });
  await signIn(page);
  await triggerLocator(page).click();
  await page.getByRole('button', { name: copy.thinking }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: copy.sendError }),
  ).toBeVisible();
  const requestId = network.gestures()[0].clientRequestId;
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: de.more.eyebrow, exact: true }).click();
  await page.goBack();
  await triggerLocator(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: copy.sendError }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('gesture-failed-remount-390-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: copy.thinking }).click();
  await expect(
    page
      .getByRole('dialog', { name: copy.title.replace('{{partner}}', 'Ben') })
      .getByText(copy.sentThinking),
  ).toBeVisible();
  expect(network.gestures().map((gesture) => gesture.clientRequestId)).toEqual([
    requestId,
    requestId,
  ]);
});

test('offline gesture has no reconnect replay and requires explicit activation', async ({
  page,
}) => {
  const network = await installMocks(page);
  await signIn(page);
  await triggerLocator(page).click();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: copy.thinking }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: copy.offline }),
  ).toBeVisible();
  expect(network.gestures()).toEqual([]);
  await page.context().setOffline(false);
  await expect(page.getByRole('button', { name: copy.thinking })).toBeEnabled();
  await expect(
    page.getByRole('alert').filter({ hasText: copy.offline }),
  ).toBeVisible();
  expect(network.gestures()).toEqual([]);
  await page.getByRole('button', { name: copy.thinking }).click();
  await expect(
    page
      .getByRole('dialog', { name: copy.title.replace('{{partner}}', 'Ben') })
      .getByText(copy.sentThinking),
  ).toBeVisible();
  expect(network.gestures()).toHaveLength(1);
});

test('Expanded and narrow reduced-motion pending surfaces remain readable and dismissible', async ({
  page,
}, testInfo) => {
  const network = await installMocks(page, {
    hasExtendedCapability: true,
    holdFirstGesture: true,
  });
  // Reduced motion from the start: no flight, the in-sheet confirmation stays.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await triggerLocator(page).click();
  await page.getByRole('button', { name: copy.thinking }).click();
  await expect(page.getByText(copy.sendingThinking)).toBeVisible();
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('gesture-pending-1280-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const surface = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  await expect(surface.getByText(copy.sendingThinking)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'gesture-pending-320-dark-200pct-reduced-motion.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  for (const label of [copy.thinking, copy.kiss, copy.checkIn]) {
    const action = surface.getByRole('button', {
      name: new RegExp(label.replace('?', '\\?')),
    });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
  }
  network.releaseGesture();
  await expect(surface.getByText(copy.sentThinking)).toBeVisible();
  await expect(surface.locator('.eimir-motion-success')).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.keyboard.press('Escape');
  await expect(surface).toHaveCount(0);
  await expect(triggerLocator(page)).toBeFocused();
});

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
  await expect(trigger).toBeFocused();
});

test('preserves the pair composition with one real avatar, one fallback, and long names on Compact', async ({
  page,
}, testInfo) => {
  const accountName = 'Alexandra-Christina-Maximiliana';
  const partnerName = 'Maximilian-Alexander-Benedikt';

  await page.setViewportSize({ width: 360, height: 780 });
  await installMocks(page, {
    accountName,
    partnerName,
    accountProfileAttachmentId: '00000000-0000-0000-0000-000000000101',
  });
  await signIn(page);

  await expect(triggerLocator(page, partnerName)).toBeVisible();
  await expect(
    page.locator('.today-hero .partner-avatar-primary .partner-avatar-img'),
  ).toBeVisible();
  await expect(
    page.locator(
      '.today-hero .partner-avatar-secondary .partner-avatar-initials',
    ),
  ).toBeVisible();
  await expect(page.locator('.today-hero .couple-presence-title')).toHaveText(
    `${accountName} & ${partnerName}`,
  );
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'partner-quick-actions-360-long-names-mixed-avatars.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

test('keeps two differently cropped real avatars readable as one overlapping pair', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, {
    accountProfileAttachmentId: '00000000-0000-0000-0000-000000000101',
    partnerProfileAttachmentId: '00000000-0000-0000-0000-000000000102',
  });
  await signIn(page);

  await expect(page.locator('.today-hero .partner-avatar-img')).toHaveCount(2);
  await expect(triggerLocator(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'partner-quick-actions-390-real-avatars-different-crops.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
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
  await expect(
    sheet.getByRole('button', { name: copy.thinking }),
  ).toBeDisabled();
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
  await expect(page).toHaveURL(/\/more\/pro$/);
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
  // Confirmed: the sheet closes and the kiss flies; the cooldown holds it back.
  await expect(page.locator('.snackbar')).toContainText(copy.sentKiss);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0, {
    timeout: 15_000,
  });
  await triggerLocator(page).click();
  await expect(kissButton).toBeDisabled();

  const checkInButton = sheet.getByRole('button', {
    name: new RegExp(copy.checkIn),
  });
  await checkInButton.click();
  await expect(page.locator('.snackbar')).toContainText(copy.sentCheckIn);
  expect(
    network
      .sentActions()
      .map((action) => action.kind)
      .sort(),
  ).toEqual(['CHECK_IN', 'KISS']);
});

test('hands an open Compact sheet to Expanded without duplicate surfaces or stale modality, then returns to Compact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, { hasExtendedCapability: true });
  await signIn(page);

  const trigger = triggerLocator(page);
  await trigger.click();
  const sheet = page.locator('.partner-quick-actions-sheet.short-task-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-presence', 'open');
  await expect(page.locator('.partner-quick-actions-popover')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(sheet).toHaveAttribute('data-presence', 'exiting');
  await expect(page.locator('.partner-quick-actions-popover')).toHaveCount(0);
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    'partner-quick-actions-sheet',
  );
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe('hidden');

  await expect(sheet).toHaveCount(0);
  const popover = page.locator('.partner-quick-actions-popover');
  await expect(popover).toBeVisible();
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    'partner-quick-actions-popover',
  );
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe('hidden');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(popover).toHaveAttribute('data-presence', 'exiting');
  await expect(page.locator('.partner-quick-actions-sheet')).toHaveCount(0);
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    'partner-quick-actions-popover',
  );

  await expect(popover).toHaveCount(0);
  await expect(page.locator('.partner-quick-actions-sheet')).toBeVisible();
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    'partner-quick-actions-sheet',
  );
});

test('presents a non-modal, dismissible popover on Expanded Web instead of the Compact sheet', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMocks(page, { hasExtendedCapability: true });
  await signIn(page);

  const trigger = triggerLocator(page);
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    'partner-quick-actions-popover',
  );
  await trigger.click();
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

  await page.keyboard.press('Tab');
  await expect(
    popover.getByRole('button', { name: copy.thinking }),
  ).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(popover).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    'partner-quick-actions-popover',
  );

  // Reopen to exercise outside-pointer dismissal independently of Escape.
  await trigger.click();
  await expect(popover).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(popover).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
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
  await captureScreenshot(page, testInfo, 'partner-actions-320-dark-large.png');
});

for (const [width, theme] of [
  [360, 'light'],
  [390, 'light'],
  [430, 'dark'],
  [1280, 'dark'],
] as const) {
  test(`partner one-time entry at ${width} ${theme}: rounded actions open the existing composer and return without sending`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const network = await installMocks(page, { hasExtendedCapability: true });
    const mutations: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/once-messages') &&
        request.method() !== 'GET'
      )
        mutations.push(request.method());
    });
    await page.route('**/once-messages/status', (route) =>
      route.fulfill({
        json: {
          ownEnabled: false,
          partnerEnabled: false,
          canSend: true,
          ownDeviceIds: [],
          recipientDevices: [],
          receptionVersion: 0,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
      }),
    );
    await signIn(page);
    await triggerLocator(page).click();
    const surface = page.getByRole('dialog', {
      name: copy.title.replace('{{partner}}', 'Ben'),
    });
    await expect(surface.locator('.partner-quick-action')).toHaveCount(4);
    for (const row of await surface.locator('.partner-quick-action').all()) {
      expect(
        await row.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
        ),
      ).toBeGreaterThanOrEqual(14);
    }
    await expect(surface.getByText(copy.intro)).toHaveCount(0);
    await expect(surface.getByText(copy.thinkingHint)).toHaveCount(0);
    await expect(surface.getByText(copy.checkInHint)).toHaveCount(0);
    const entry = surface.getByRole('link', {
      name: new RegExp(onceCopy.title),
    });
    await expect(entry).toContainText(onceCopy.singleView);
    await expect(entry.locator('.pro-mark')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await captureScreenshot(
      page,
      info,
      `partner-actions-${width}-${theme}.png`,
    );
    await entry.click();
    await expect(page).toHaveURL('/today/only-you/new');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: onceCopy.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(onceCopy.consent)).toBeVisible();
    await page.locator('.task-back-control').click();
    await expect(page).toHaveURL('/today');
    await expect(triggerLocator(page)).toBeFocused();
    expect(mutations).toEqual([]);
    expect(network.gestures()).toEqual([]);
  });
}

test('Wir shows no separate one-time link and the header carries only the create entry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMocks(page, { supportGesturesEnabled: false });
  await page.route('**/once-messages/status', (route) =>
    route.fulfill({
      json: {
        ownEnabled: false,
        partnerEnabled: false,
        canSend: true,
        ownDeviceIds: [],
        recipientDevices: [],
        receptionVersion: 0,
        partner: { id: PARTNER_ID, displayName: 'Ben' },
      },
    }),
  );
  await signIn(page);
  await expect(triggerLocator(page)).toHaveCount(0);
  // Product Owner decision 2026-11-12: Wir carries no separate one-time
  // link; the composer stays reachable from the partner action sheet. The
  // Expanded header carries the create entry as its only control (Product
  // Owner decision 2026-11-27).
  await expect(
    page
      .locator('.today-content')
      .getByRole('link', { name: new RegExp(onceCopy.title) }),
  ).toHaveCount(0);
  await expect(page.locator('.shell-primary-action')).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button')).toHaveCount(1);
});

test('the one-time entry is independent of an unavailable extended-gesture entitlement read', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.route('**/entitlements', (route) => route.abort('failed'));
  await signIn(page);
  await triggerLocator(page).click();
  const surface = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  await expect(surface.getByText(copy.unavailablePremium)).toBeVisible();
  await expect(
    surface.getByRole('link', { name: new RegExp(onceCopy.title) }),
  ).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`partner photo completes the action-menu handoff and returns focus without sending at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const state = await installMocks(page, {
      partnerProfileAttachmentId: '00000000-0000-0000-0000-000000000031',
    });
    await signIn(page);
    const trigger = triggerLocator(page);
    await trigger.click();
    await page
      .getByRole('button', { name: people.photoAction, exact: true })
      .click();
    const gallery = page.getByRole('dialog', {
      name: storyProducts.gallery.dialogAria,
    });
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('img')).toBeVisible();
    await expect(
      gallery.getByRole('button', { name: storyProducts.gallery.close }),
    ).toBeFocused();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await captureScreenshot(page, info, `partner-photo-${width}-dark.png`);
    await page.keyboard.press('Escape');
    await expect(gallery).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(state.sentActions()).toEqual([]);
    expect(state.gestures()).toEqual([]);
  });
}

// Partner gesture receipt (#455): the recipient's calm, one-shot moment.
const receiptCopy = relationshipComponents.partnerGestureReceipt;
const receiptTitle = (key: 'thinking' | 'kiss' | 'checkIn') =>
  receiptCopy[key].title.replace('{{name}}', 'Ben');

function gestureNotification(id: string, kind: string) {
  return {
    id,
    kind,
    actorId: PARTNER_ID,
    actor: { id: PARTNER_ID, displayName: 'Ben' },
    // Created after the shell started: a genuinely new arrival.
    createdAt: new Date().toISOString(),
    readAt: null,
    sourceEventId: `event-${id}`,
    targetId: null,
    targetType: null,
  };
}

/** The shell's existing count refresh on focus, as after a push wake. */
async function refreshUnreadCount(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
}

function receiptLocator(page: Page) {
  return page.getByTestId('partner-gesture-receipt');
}

async function settleReceiptMotion(page: Page): Promise<void> {
  // The one-shot choreography ends after the gesture sequence.
  await page.waitForTimeout(2_800);
}

test('a foreground Wish invitation opens the private favorites directly', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  const notificationId = '00000000-0000-4000-8000-000000000021';
  const invitation = () => ({
    ...gestureNotification(notificationId, 'WISH_SELECTION_SHARED'),
    targetId: 'round-1',
    targetType: 'WISH_SELECTION',
  });
  await installMocks(page, {
    unreadCounts: [0, 1],
    notificationItems: () => [invitation()],
  });
  let opens = 0;
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/notifications/${notificationId}/open`,
    async (route) => {
      opens += 1;
      await route.fulfill({
        json: { ...invitation(), readAt: new Date().toISOString() },
      });
    },
  );
  await page.route(
    (url) => url.pathname === `/api/v1/spaces/${SPACE_ID}/wish-selection`,
    (route) =>
      route.fulfill({
        json: {
          id: 'round-1',
          version: 1,
          roundToken: 'round-1:1',
          title: null,
          candidates: localizedFixtures.wishSelection.wishes
            .slice(0, 2)
            .map((title, index) => ({
              wishId: `wish-${index}`,
              title,
              version: 1,
              status: 'OPEN',
              planId: null,
            })),
          own: {
            favoriteWishIds: [],
            favoriteDateIdeaIds: [],
            published: false,
            version: 0,
          },
          selectionToken: 'round-1:1:0',
          resultState: 'CHOOSING',
          commonWishIds: [],
          dateIdeaCandidates: [],
          commonDateIdeaIds: [],
        },
      }),
  );
  await signIn(page);
  await expect(triggerLocator(page)).toBeVisible();
  const banner = page.getByTestId('foreground-notification');
  await expect(banner).toHaveCount(0);

  await refreshUnreadCount(page);
  // The invitation carries the round's own question (#1907 J1).
  await expect(banner).toContainText(
    wishSelection.notice.sharedTitle.replace('{{name}}', 'Ben'),
  );
  await banner.hover();
  // Partner-caused notices share the calm receipt: badge on the avatar, no waves.
  await expect(banner).toHaveAttribute('data-variant', 'calm-ring');
  await expect(banner.locator('[data-glyph="icon"] svg')).toBeVisible();
  await expect(banner.locator('.partner-gesture-receipt-wave')).toHaveCount(0);
  expect(opens).toBe(0);
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await captureScreenshot(
    page,
    testInfo,
    'foreground-wish-invitation-390-light.png',
  );

  await banner.getByRole('button', { name: wishSelection.openOwn }).click();
  await expect(page).toHaveURL(/\/plan\/choose$/);
  await expect(
    page.getByRole('heading', { name: wishSelection.chooseTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: wishSelection.shareNone }),
  ).toBeVisible();
  expect(opens).toBe(1);
});

test('the Wish result shows its own symbol with reduced motion', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMocks(page, {
    unreadCounts: [0, 1],
    notificationItems: () => [
      gestureNotification('result', 'WISH_SELECTION_READY'),
    ],
  });
  await signIn(page);
  await expect(triggerLocator(page)).toBeVisible();
  await refreshUnreadCount(page);

  const banner = page.getByTestId('foreground-notification');
  await expect(banner).toContainText(wishSelection.notice.readyTitle);
  await expect(banner).toContainText(
    wishSelection.notice.readyDetail.replace('{{name}}', 'Ben'),
  );
  await banner.hover();
  await expect(banner).toHaveAttribute('data-variant', 'calm-ring');
  const symbol = banner.locator('[data-glyph="icon"]');
  await expect(symbol).toBeVisible();
  await expect(symbol).toHaveCSS('animation-name', 'none');
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await captureScreenshot(
    page,
    testInfo,
    'foreground-wish-result-1280-dark-reduced.png',
  );
});

for (const scenario of [
  {
    kind: 'THINKING_OF_YOU',
    title: receiptTitle('thinking'),
    detail: receiptCopy.thinking.detail,
    reply: receiptCopy.thinking.reply,
    sent: copy.sentThinking,
    variant: 'heart-pulse',
    width: 390,
    theme: 'light',
  },
  {
    kind: 'PARTNER_KISS',
    title: receiptTitle('kiss'),
    detail: receiptCopy.kiss.detail,
    reply: receiptCopy.kiss.reply,
    sent: copy.sentKiss,
    variant: 'kiss',
    width: 390,
    theme: 'dark',
  },
] as const) {
  test(`receipt ${scenario.kind}: arrives once app-wide, replies through the existing action`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({ colorScheme: scenario.theme });
    const network = await installMocks(page, {
      hasExtendedCapability: true,
      unreadCounts: [0, 1],
      notificationItems: () => [gestureNotification('g-1', scenario.kind)],
    });
    await signIn(page);
    await expect(triggerLocator(page)).toBeVisible();
    // Nothing is read or replayed at app start.
    expect(network.notificationListReads()).toBe(0);
    await expect(receiptLocator(page)).toHaveCount(0);

    await refreshUnreadCount(page);
    const receipt = receiptLocator(page);
    await expect(receipt).toBeVisible();
    // Resting the pointer on it pauses the reading time.
    await receipt.hover();
    await expect(receipt).toHaveAttribute('data-variant', scenario.variant);
    await expect(
      page.getByRole('complementary', { name: scenario.title }),
    ).toBeVisible();
    await expect(receipt).toContainText(scenario.detail);
    // No focus is taken from the page.
    expect(
      await page.evaluate(() =>
        Boolean(
          document.activeElement?.closest(
            '[data-testid="partner-gesture-receipt"]',
          ),
        ),
      ),
    ).toBe(false);
    await settleReceiptMotion(page);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await captureScreenshot(
      page,
      testInfo,
      `gesture-receipt-${scenario.variant}-${scenario.width}-${scenario.theme}.png`,
    );

    const reply = receipt.getByRole('button', { name: scenario.reply });
    const box = await reply.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await reply.click();
    await expect(receipt).toContainText(scenario.sent);
    expect(network.gestures()).toHaveLength(1);
    expect(network.gestures()[0].kind).toBe(
      scenario.kind === 'PARTNER_KISS' ? 'KISS' : 'THINKING',
    );

    // The same notification never animates again on a later refresh.
    await receipt.getByRole('button', { name: receiptCopy.close }).click();
    await expect(receiptLocator(page)).toHaveCount(0);
    await refreshUnreadCount(page);
    await page.waitForTimeout(300);
    await expect(receiptLocator(page)).toHaveCount(0);
  });
}

test('receipt PARTNER_CHECK_IN: "share how you feel" opens the existing own check-in', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const network = await installMocks(page, {
    hasExtendedCapability: true,
    vibeCheckEnabled: true,
    unreadCounts: [0, 1],
    notificationItems: () => [gestureNotification('c-1', 'PARTNER_CHECK_IN')],
  });
  await signIn(page);
  await expect(triggerLocator(page)).toBeVisible();
  // App-wide: the gesture arrives while the person is on Momente.
  await page
    .getByRole('navigation', { name: de.navigation.primary })
    .last()
    .getByRole('link', { name: de.navigation.story })
    .click();
  await expect(page).toHaveURL(/\/story/);
  await refreshUnreadCount(page);
  const receipt = receiptLocator(page);
  await expect(receipt).toBeVisible();
  await receipt.hover();
  await expect(receipt).toHaveAttribute('data-variant', 'calm-ring');
  await expect(receipt).toContainText(receiptTitle('checkIn'));
  await settleReceiptMotion(page);
  await captureScreenshot(
    page,
    testInfo,
    'gesture-receipt-calm-ring-430-dark-on-momente.png',
  );
  await receipt
    .getByRole('button', { name: receiptCopy.checkIn.reply })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole('dialog', { name: wirCheckInCopy.panelTitle }),
  ).toBeVisible();
  // Nothing was changed or sent on the person's behalf.
  expect(network.gestures()).toHaveLength(0);
  await captureScreenshot(
    page,
    testInfo,
    'gesture-receipt-calm-ring-430-dark-checkin-open.png',
  );
});

test('receipt: no interruption while writing, no replay of earlier gestures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page, {
    unreadCounts: [1, 2],
    notificationItems: () => [
      gestureNotification('while-writing', 'THINKING_OF_YOU'),
    ],
  });
  await signIn(page);
  await expect(triggerLocator(page)).toBeVisible();
  // A text field has focus, as in any composer.
  await page.evaluate(() => {
    const field = document.createElement('textarea');
    field.setAttribute('aria-label', 'composer');
    document.querySelector('main')?.append(field);
    field.focus();
  });
  await refreshUnreadCount(page);
  await page.waitForTimeout(500);
  await expect(receiptLocator(page)).toHaveCount(0);
  await expect(page.getByLabel('composer')).toBeFocused();
  // Nothing is fetched to build a later, delayed interruption either.
  expect(network.notificationListReads()).toBe(0);
});

test('receipt: 320 px, 200 % text and reduced motion keep everything static and reachable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMocks(page, {
    hasExtendedCapability: false,
    unreadCounts: [0, 1],
    notificationItems: () => [gestureNotification('k-1', 'PARTNER_KISS')],
  });
  await signIn(page);
  await expect(triggerLocator(page)).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await refreshUnreadCount(page);
  const receipt = receiptLocator(page);
  await expect(receipt).toBeVisible();
  // Static: no running animation, no decorative layers.
  expect(
    await receipt.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    ),
  ).toBe(0);
  await expect(receipt.locator('.partner-gesture-receipt-hero')).toBeHidden();
  // Without Pro the existing, restrained Pro discovery is offered.
  const reply = receipt.getByRole('button', {
    name: new RegExp(receiptCopy.kiss.reply),
  });
  await expect(reply).toContainText(copy.pro);
  await expect(reply).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await captureScreenshot(
    page,
    testInfo,
    'gesture-receipt-kiss-320-dark-200pct-reduced-motion.png',
  );
});

test('receipt: Expanded keeps the top navigation free', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installMocks(page, {
    unreadCounts: [0, 1],
    notificationItems: () => [gestureNotification('e-1', 'THINKING_OF_YOU')],
  });
  await signIn(page);
  await expect(triggerLocator(page)).toBeVisible();
  await refreshUnreadCount(page);
  const receipt = receiptLocator(page);
  await expect(receipt).toBeVisible();
  const header = await page.locator('.app-header').boundingBox();
  const surface = await receipt.boundingBox();
  expect(surface && header && surface.y >= header.y + header.height).toBe(true);
  await settleReceiptMotion(page);
  await captureScreenshot(
    page,
    testInfo,
    'gesture-receipt-heart-pulse-1280-light.png',
  );
});

/**
 * Gesture send flight: the symbol lifts out of the sheet, waits for the
 * server, then the sheet closes and it flies to the partner avatar. A failed
 * send returns it and the sheet stays.
 */
async function slowAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      animation.playbackRate = 0.25;
      return animation;
    };
  });
}

const gestureGhosts = (page: Page) =>
  page.locator('.wir-checkin-flight-layer .is-gesture');

for (const scenario of [
  {
    kind: 'THINKING',
    label: copy.thinking,
    confirmed: copy.sentThinking,
    width: 360,
    theme: 'light',
  },
  {
    kind: 'KISS',
    label: copy.kiss,
    confirmed: copy.sentKiss,
    width: 390,
    theme: 'dark',
  },
  {
    kind: 'CHECK_IN',
    label: copy.checkIn,
    confirmed: copy.sentCheckIn,
    width: 430,
    theme: 'light',
  },
] as const) {
  test(`gesture ${scenario.kind} flies to the partner avatar once the server confirmed it (${scenario.width} ${scenario.theme})`, async ({
    page,
  }, testInfo) => {
    await slowAnimations(page);
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({ colorScheme: scenario.theme });
    const network = await installMocks(page, {
      hasExtendedCapability: true,
      holdFirstGesture: true,
    });
    await signIn(page);
    await triggerLocator(page).click();
    const surface = page.getByRole('dialog', {
      name: copy.title.replace('{{partner}}', 'Ben'),
    });
    await surface
      .getByRole('button', {
        name: new RegExp(scenario.label.replace('?', '\\?')),
      })
      .click();

    // Waiting for the server: the symbol hovers in the top layer above the
    // open sheet, which stays; nothing is announced as sent yet.
    await expect(gestureGhosts(page)).toHaveCount(1);
    const layer = page.locator('.wir-checkin-flight-layer');
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(await layer.evaluate((node) => node.matches(':popover-open'))).toBe(
      true,
    );
    expect(
      await gestureGhosts(page)
        .first()
        .evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('none');
    await expect(surface).toBeVisible();
    await expect(page.locator('.snackbar')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `gesture-flight-${scenario.kind}-${scenario.width}-${scenario.theme}-hover.png`,
      ),
      animations: 'allow',
    });

    // Confirmed: the sheet closes, the symbol flies and lands on the partner.
    network.releaseGesture();
    await expect(surface).toHaveCount(0);
    await expect(page.locator('.snackbar')).toContainText(scenario.confirmed);
    await expect(gestureGhosts(page).first()).toBeVisible();
    if (scenario.kind === 'KISS') {
      // The second heart of the kiss starts from the own avatar.
      await expect
        .poll(() => gestureGhosts(page).count(), { timeout: 20_000 })
        .toBeGreaterThanOrEqual(2);
    }
    await page.screenshot({
      path: testInfo.outputPath(
        `gesture-flight-${scenario.kind}-${scenario.width}-${scenario.theme}-flying.png`,
      ),
      animations: 'allow',
    });
    await expect(gestureGhosts(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
    expect(network.gestures()).toHaveLength(1);
  });
}

test('a failed gesture sinks back into the sheet and flies nowhere', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, { failFirstGesture: true });
  await signIn(page);
  await triggerLocator(page).click();
  const surface = page.getByRole('dialog', {
    name: copy.title.replace('{{partner}}', 'Ben'),
  });
  await surface.getByRole('button', { name: copy.thinking }).click();
  await expect(surface.getByRole('alert')).toBeVisible();
  await expect(surface).toBeVisible();
  await expect(gestureGhosts(page)).toHaveCount(0);
  await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
  await expect(page.locator('[data-flight-source]')).toHaveCount(0);
  await expect(page.locator('.snackbar')).toHaveCount(0);
});
