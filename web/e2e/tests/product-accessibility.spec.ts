import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';
import notificationSettings from '../../src/i18n/locales/notificationSettings';
import profileIdentity from '../../src/i18n/locales/profileIdentity';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';

async function expectNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ])
    .analyze();

  const summary = result.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes.length} node(s)`,
    )
    .join('\n');

  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.clientWidth) {
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.right > document.documentElement.clientWidth + 1
          );
        })
        .slice(0, 15)
        .map((element) => ({
          element: `${element.tagName.toLowerCase()}.${element.className}`,
          right: Math.round(element.getBoundingClientRect().right),
        })),
    );
    expect(
      dimensions.scrollWidth,
      JSON.stringify(offenders),
    ).toBeLessThanOrEqual(dimensions.clientWidth);
  }
}

type SpaceConfigurationPatch = {
  supportGesturesEnabled?: boolean;
  vibeCheckEnabled?: boolean;
  energyCheckInEnabled?: boolean;
  dailyContextTimezone?: string | null;
  vibeVisibilityMode?: 'IMMEDIATE' | 'MUTUAL_REVEAL';
  energyVisibilityMode?: 'IMMEDIATE' | 'MUTUAL_REVEAL';
};

async function installAuthorizedApiMocks(
  page: Page,
): Promise<
  string[] & { spaceConfigurationPatches: SpaceConfigurationPatch[] }
> {
  const spaceConfigurationPatches: SpaceConfigurationPatch[] = [];
  const unexpectedRequests: string[] = [];
  // Non-enumerable so the many `expect(unexpectedRequests).toEqual([])`
  // assertions keep comparing only the recorded unexpected requests.
  Object.defineProperty(unexpectedRequests, 'spaceConfigurationPatches', {
    value: spaceConfigurationPatches,
  });
  let supportGesturesEnabled = true;
  let vibeCheckEnabled = false;
  let energyCheckInEnabled = false;
  let dailyContextTimezone: string | null = null;
  let vibeVisibilityMode: 'IMMEDIATE' | 'MUTUAL_REVEAL' = 'IMMEDIATE';
  let energyVisibilityMode: 'IMMEDIATE' | 'MUTUAL_REVEAL' = 'IMMEDIATE';
  let spaceConfigurationVersion = 7;
  let reminderEmailEnabled = false;
  let commentPushEnabled = false;
  let quietHours: {
    enabled: boolean;
    start: string | null;
    end: string | null;
    timeZone: string;
  } = { enabled: false, start: null, end: null, timeZone: 'Europe/Berlin' };
  const spaceConfigurationBody = () =>
    JSON.stringify({
      canManageSpaceConfiguration: true,
      dailyContextTimezone,
      dailyQuestionsEnabled: false,
      energyCheckInEnabled,
      energyVisibilityMode,
      loveNotesEnabled: false,
      sharedAchievementsEnabled: false,
      spaceId: SPACE_ID,
      supportGesturesEnabled,
      version: spaceConfigurationVersion,
      vibeCheckEnabled,
      vibeVisibilityMode,
    });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
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
        account: {
          displayName: 'Anna',
          id: ACCOUNT_ID,
        },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({
        displayName: 'Anna',
        id: ACCOUNT_ID,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        accessToken: 'browser-e2e-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        refreshToken: 'browser-e2e-refresh-token-refreshed',
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"${spaceConfigurationVersion}"` },
        body: spaceConfigurationBody(),
      });
      return;
    }

    if (
      method === 'PATCH' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      const ifMatch = request.headers()['if-match'];
      const expectedEtag = `"${spaceConfigurationVersion}"`;
      if (ifMatch !== expectedEtag) {
        unexpectedRequests.push(
          `PATCH ${pathname} used If-Match ${ifMatch ?? '<missing>'}; expected ${expectedEtag}`,
        );
        await fulfillJson(
          {
            code: 'RESOURCE_VERSION_CONFLICT',
            detail: 'The browser fixture received a stale configuration write.',
            status: 409,
            title: 'Conflict',
          },
          409,
        );
        return;
      }
      const body = request.postDataJSON() as SpaceConfigurationPatch;
      spaceConfigurationPatches.push(body);
      const nextTimezone =
        body.dailyContextTimezone !== undefined
          ? body.dailyContextTimezone
          : dailyContextTimezone;
      const nextVibe = body.vibeCheckEnabled ?? vibeCheckEnabled;
      const nextEnergy = body.energyCheckInEnabled ?? energyCheckInEnabled;
      // Mirror the server's atomic validation of the complete resulting state.
      if ((nextVibe || nextEnergy) && nextTimezone === null) {
        await fulfillJson(
          {
            code: 'SPACE_DAILY_CONTEXT_TIMEZONE_REQUIRED',
            detail: 'Daily Check-in modules require a shared time zone.',
            status: 422,
            title: 'Unprocessable',
          },
          422,
        );
        return;
      }
      if (body.supportGesturesEnabled !== undefined) {
        supportGesturesEnabled = body.supportGesturesEnabled;
      }
      vibeCheckEnabled = nextVibe;
      energyCheckInEnabled = nextEnergy;
      dailyContextTimezone = nextTimezone;
      vibeVisibilityMode = body.vibeVisibilityMode ?? vibeVisibilityMode;
      energyVisibilityMode = body.energyVisibilityMode ?? energyVisibilityMode;
      spaceConfigurationVersion += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"${spaceConfigurationVersion}"` },
        body: spaceConfigurationBody(),
      });
      return;
    }

    if (
      method === 'GET' &&
      /\/rules\/(relationship_anniversary_reminder|partner_birthday_reminder)\/preference$/.test(
        pathname,
      )
    ) {
      await fulfillJson({
        ruleKey: pathname.split('/').at(-2),
        enabled: true,
        parameters: { daysBefore: [30, 7, 1], localTime: '09:00:00' },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/notification-preferences') {
      await fulfillJson({
        catalogVersion: 2,
        quietHours,
        capabilities: [
          {
            channel: 'IN_APP',
            available: true,
            reason: null,
            destination: null,
          },
          {
            channel: 'PUSH',
            available: false,
            reason: 'PUSH_ENDPOINT_MISSING',
            destination: null,
          },
          {
            channel: 'EMAIL',
            available: true,
            reason: null,
            destination: 'anna@example.org',
          },
        ],
        items: [
          'COMMENT_CREATED',
          'REMINDER_DUE',
          'THINKING_OF_YOU',
          'PARTNER_KISS',
          'PARTNER_CHECK_IN',
        ].map((kind) => ({
          kind,
          deliveryClass:
            kind === 'COMMENT_CREATED' ? 'DIGESTIBLE' : 'IMMEDIATE',
          channels: [
            { channel: 'IN_APP', enabled: true, configurable: true },
            {
              channel: 'PUSH',
              enabled: kind === 'COMMENT_CREATED' && commentPushEnabled,
              configurable: true,
            },
            {
              channel: 'EMAIL',
              enabled: kind === 'REMINDER_DUE' && reminderEmailEnabled,
              configurable: kind !== 'COMMENT_CREATED',
            },
          ],
        })),
      });
      return;
    }

    if (
      method === 'PATCH' &&
      pathname === '/api/v1/notification-preferences/quiet-hours'
    ) {
      const body = request.postDataJSON() as {
        enabled: boolean;
        start?: string | null;
        end?: string | null;
      };
      if (
        Object.keys(body).some(
          (key) => !['enabled', 'start', 'end'].includes(key),
        )
      ) {
        unexpectedRequests.push(
          'Quiet Hours PATCH contained an unapproved field',
        );
      }
      quietHours = {
        enabled: body.enabled,
        start: body.enabled ? `${body.start}:00` : null,
        end: body.enabled ? `${body.end}:00` : null,
        timeZone: quietHours.timeZone,
      };
      await fulfillJson(quietHours);
      return;
    }

    if (
      method === 'PATCH' &&
      pathname === '/api/v1/notification-preferences/COMMENT_CREATED/PUSH'
    ) {
      const body = request.postDataJSON() as { enabled: boolean };
      if (Object.keys(body).join(',') !== 'enabled') {
        unexpectedRequests.push(
          'Comment Push PATCH contained an unapproved field',
        );
      }
      commentPushEnabled = body.enabled;
      await fulfillJson({
        kind: 'COMMENT_CREATED',
        channel: 'PUSH',
        enabled: commentPushEnabled,
      });
      return;
    }

    if (
      method === 'PATCH' &&
      pathname === '/api/v1/notification-preferences/REMINDER_DUE/EMAIL'
    ) {
      const body = request.postDataJSON() as { enabled: boolean };
      if (Object.keys(body).join(',') !== 'enabled') {
        unexpectedRequests.push(
          'Notification PATCH contained an unapproved recipient',
        );
      }
      reminderEmailEnabled = body.enabled;
      await fulfillJson({
        kind: 'REMINDER_DUE',
        channel: 'EMAIL',
        enabled: reminderEmailEnabled,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/invitations`
    ) {
      await fulfillJson([]);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        {
          role: 'MEMBER',
          spaceId: SPACE_ID,
          status: 'ACTIVE',
        },
      ]);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: {
          partner: null,
          spaceId: SPACE_ID,
        },
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    const planningCapabilities = {
      canComment: false,
      canDelete: true,
      canEdit: true,
    };
    const planningCreator = { id: ACCOUNT_ID, displayName: 'Anna' };
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/places/place-1`
    ) {
      await fulfillJson({
        address: 'Parkweg 1',
        capabilities: planningCapabilities,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: planningCreator,
        description: 'Unser Picknickplatz',
        id: 'place-1',
        latitude: null,
        longitude: null,
        name: 'Volkspark',
        spaceId: SPACE_ID,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/places/place-1/`)
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections/collection-1`
    ) {
      await fulfillJson({
        capabilities: planningCapabilities,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: planningCreator,
        id: 'collection-1',
        items: [],
        spaceId: SPACE_ID,
        title: 'Packliste',
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/chapter-1`
    ) {
      await fulfillJson({
        capabilities: planningCapabilities,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: planningCreator,
        description: 'Sommergeschichten',
        endOn: null,
        id: 'chapter-1',
        placeId: null,
        spaceId: SPACE_ID,
        startOn: '2026-06-01',
        title: 'Sommer',
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/chapter-1/content`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/search`,
        `/api/v1/spaces/${SPACE_ID}/notifications`,
        `/api/v1/spaces/${SPACE_ID}/story`,
        `/api/v1/spaces/${SPACE_ID}/timeline`,
        `/api/v1/spaces/${SPACE_ID}/collections`,
        `/api/v1/spaces/${SPACE_ID}/plans`,
        `/api/v1/spaces/${SPACE_ID}/places`,
        `/api/v1/spaces/${SPACE_ID}/wishes`,
      ].includes(pathname)
    ) {
      await fulfillJson({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        status: 'FREE',
        tier: 'FREE',
        capabilities: [],
        isInGracePeriod: false,
      });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: 'The browser test did not define this API request.',
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return unexpectedRequests;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
}

async function navigateWithinApp(page: Page, path: string): Promise<void> {
  if (path === '/plan') {
    await page
      .getByRole('link', { name: navigation.plan, exact: true })
      .click();
    await expect(page).toHaveURL(/\/plan$/);
    return;
  }

  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page).toHaveURL(/\/more$/);
  await page.locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test('compact sign-in is keyboard operable, wraps German copy, and is axe-clean', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(
    page.getByRole('heading', {
      name: de.login.introHeading,
      level: 1,
    }),
  ).toBeVisible();

  await page.getByLabel(de.login.email).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(de.login.password)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: de.login.submit }),
  ).toBeFocused();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
});

test('compact authenticated shell keeps global quick create reachable and accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);

  await expect(page).toHaveURL(/\/today$/);
  // Today owns the page H1; Couple Presence remains the relationship hero.
  await expect(
    page.getByRole('heading', {
      name: m5s5.today.headerTitle,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.durationTitle,
      level: 2,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.newSpaceEmpty,
      level: 2,
    }),
  ).toBeVisible();

  const quickCreate = page.getByRole('button', {
    name: navigation.newContent,
  });
  await expect(quickCreate).toBeVisible();
  await quickCreate.focus();
  await page.keyboard.press('ArrowDown');

  const sheetDialog = page.getByRole('dialog', {
    name: navigation.quickCreateTitle,
  });
  await expect(sheetDialog).toBeVisible();

  const closeButton = page.getByRole('button', {
    name: navigation.closeMenu,
  });
  await expect(closeButton).toBeFocused();

  const memoryTarget = page.getByRole('link', {
    name: navigation.quickCreateMemory,
  });
  await expect(memoryTarget).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(memoryTarget).toBeFocused();
  await expect(
    page.getByRole('link', { name: navigation.quickCreateWish }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: navigation.quickCreatePrivateNote }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);

  await page.keyboard.press('Escape');
  await expect(quickCreate).toBeFocused();
  await expect(sheetDialog).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});

test('authenticated shell removes decorative motion when reduced motion is preferred', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);

  const mainAnimation = await page
    .locator('#main-content')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(mainAnimation).toBe('none');

  const quickCreate = page.getByRole('button', {
    name: navigation.newContent,
  });
  const quickCreateTransition = await quickCreate.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(quickCreateTransition).toBe('0s');

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('expanded authenticated shell keeps deep links, back, focus, and accessibility intact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  // Exercise the deployed SPA/direct-entry contract through an existing legacy
  // deep link. After authentication, the route model must canonicalize it.
  await page.goto('/dashboard');
  await signIn(page);

  await expect(page).toHaveURL(/\/today$/);
  // Today owns the page H1; Couple Presence remains the relationship hero.
  await expect(
    page.getByRole('heading', {
      name: m5s5.today.headerTitle,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.durationTitle,
      level: 2,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.newSpaceEmpty,
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.getByText(m5s5.dashboard.newSpaceIntro)).toBeVisible();

  const skipLink = page.getByRole('link', {
    name: de.navigation.skipToContent,
  });
  await skipLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page).toHaveURL(/\/more$/);
  await expect(
    page.getByRole('heading', { name: de.more.title, level: 1 }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/today(?:#main-content)?$/);
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.newSpaceEmpty,
      level: 2,
    }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Space configuration is touch operable, reload-safe, responsive, and axe-clean', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await page.goto('/more/settings/relationship');

  await expect(
    page.getByRole('heading', {
      name: profileIdentity.spaceConfigurationTitle,
      level: 2,
    }),
  ).toBeVisible();

  const supportGestureSwitch = page.getByRole('switch', {
    name: profileIdentity.supportGesturesToggle,
  });
  await expect(supportGestureSwitch).toHaveAttribute('aria-checked', 'true');
  const compactBounds = await supportGestureSwitch.boundingBox();
  expect(compactBounds?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(compactBounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-space-configuration-compact.png'),
    fullPage: true,
  });

  await supportGestureSwitch.click();
  await expect(supportGestureSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByRole('status').filter({
      hasText: profileIdentity.spaceConfigurationSaved,
    }),
  ).toBeVisible();

  await page.reload();
  const reloadedSwitch = page.getByRole('switch', {
    name: profileIdentity.supportGesturesToggle,
  });
  await expect(reloadedSwitch).toHaveAttribute('aria-checked', 'false');

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-space-configuration-expanded.png'),
    fullPage: true,
  });

  await reloadedSwitch.click();
  await expect(reloadedSwitch).toHaveAttribute('aria-checked', 'true');
  expect(unexpectedRequests).toEqual([]);
});

test.describe('Space configuration Daily Check-in modules', () => {
  test.use({ timezoneId: 'Europe/Berlin' });

  test('manager enables Vibe and Energy with a confirmed shared day zone and keeps compact widths and large text usable', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const unexpectedRequests = await installAuthorizedApiMocks(page);

    await page.goto('/today');
    await signIn(page);
    await page.goto('/more/settings/relationship');

    const energySwitch = page.getByRole('switch', {
      name: profileIdentity.energyCheckInToggle,
    });
    const vibeSwitch = page.getByRole('switch', {
      name: profileIdentity.vibeCheckToggle,
    });
    const zoneSelect = page.getByRole('combobox', {
      name: profileIdentity.dailyContextTimezoneLabel,
    });
    await expect(energySwitch).toHaveAttribute('aria-checked', 'false');
    await expect(vibeSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(zoneSelect).toHaveCount(0);

    // First enable must carry the shared day zone; without it the server
    // rejects the write and the manager would be stuck.
    await energySwitch.click();
    await expect(energySwitch).toHaveAttribute('aria-checked', 'true');
    await expect(zoneSelect).toHaveValue('Europe/Berlin');

    // The zone is now Space state and is not sent again.
    await vibeSwitch.click();
    await expect(vibeSwitch).toHaveAttribute('aria-checked', 'true');

    // Visibility is chosen per module and only offered while it is switched on.
    const vibeVisibility = page.getByRole('group', {
      name: profileIdentity.visibilityLegend.replace(
        '{{module}}',
        profileIdentity.vibeCheckTitle,
      ),
    });
    await vibeVisibility
      .locator('.space-visibility-option', {
        hasText: profileIdentity.visibilityMutualReveal,
      })
      .click();
    await expect(
      vibeVisibility.getByRole('radio', {
        name: new RegExp(profileIdentity.visibilityMutualReveal),
      }),
    ).toBeChecked();
    expect(unexpectedRequests.spaceConfigurationPatches).toEqual([
      { energyCheckInEnabled: true, dailyContextTimezone: 'Europe/Berlin' },
      { vibeCheckEnabled: true },
      { vibeVisibilityMode: 'MUTUAL_REVEAL' },
    ]);

    await page.reload();
    await expect(energySwitch).toHaveAttribute('aria-checked', 'true');
    await expect(vibeSwitch).toHaveAttribute('aria-checked', 'true');
    await page.locator('.space-configuration-panel').screenshot({
      path: testInfo.outputPath('space-configuration-daily-modules-390.png'),
    });

    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
      for (const control of [
        energySwitch,
        vibeSwitch,
        zoneSelect,
        ...(await page.locator('.space-visibility-option').all()),
      ]) {
        const box = await control.boundingBox();
        expect(
          box?.width ?? 0,
          `${width}px control width`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box?.height ?? 0,
          `${width}px control height`,
        ).toBeGreaterThanOrEqual(44);
      }
      await expectNoWcagViolations(page);
    }

    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    // The complete Settings page, not an isolated panel: the shared heading,
    // the neighbouring relationship panels and the Space configuration must all
    // reflow inside the 320 px column at 200 percent text (#1162).
    await expectNoHorizontalOverflow(page);
    const overflowing = await page
      .locator('.settings-page')
      .evaluate((settingsPage) =>
        [settingsPage, ...settingsPage.querySelectorAll('*')]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.right > 321;
          })
          .map((element) => `${element.tagName}.${element.className}`),
      );
    expect(overflowing).toEqual([]);
    await expectNoWcagViolations(page);

    // Disable is not delete: switching off is a plain module choice and the
    // manager is told existing entries are kept.
    await expect(
      page.getByText(profileIdentity.spaceModulesKeepDataNote),
    ).toBeVisible();
    await energySwitch.click();
    await expect(energySwitch).toHaveAttribute('aria-checked', 'false');
    expect(unexpectedRequests.spaceConfigurationPatches.at(-1)).toEqual({
      energyCheckInEnabled: false,
    });
    expect(unexpectedRequests).toEqual([]);
  });
});

const SETTINGS_PAGES = [
  { path: '/more/settings', heading: navigation.settings },
  {
    path: '/more/settings/relationship',
    heading: profileIdentity.settingsRelationship,
  },
  {
    path: '/more/settings/notifications',
    heading: profileIdentity.settingsNotifications,
  },
  { path: '/more/settings/today', heading: profileIdentity.settingsToday },
  { path: '/more/settings/appearance', heading: de.theme.label },
  { path: '/more/settings/data', heading: profileIdentity.settingsData },
  { path: '/more/settings/account', heading: profileIdentity.settingsAccount },
] as const;

async function expectSettingsControlsInsideViewport(page: Page): Promise<void> {
  const outside = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '.settings-page a[href], .settings-page button, .settings-page input, .settings-page select, .settings-page textarea',
      ),
    )
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 1 && box.height > 1;
      })
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > viewportWidth + 1;
      })
      .map(
        (element) =>
          element.getAttribute('aria-label') ||
          element.textContent?.trim().slice(0, 60) ||
          element.tagName,
      );
  });
  expect(outside, 'Settings controls outside the viewport').toEqual([]);
}

test.describe('Complete Settings pages reflow (#1162)', () => {
  test.use({ timezoneId: 'Europe/Berlin' });

  test('every Settings page fits the compact widths and 200 percent text without horizontal overflow', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const unexpectedRequests = await installAuthorizedApiMocks(page);
    await page.goto('/today');
    await signIn(page);

    for (const { path, heading } of SETTINGS_PAGES) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: heading, level: 1 }),
      ).toBeVisible();

      for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await expectNoHorizontalOverflow(page);
        await expectSettingsControlsInsideViewport(page);
      }

      await page.setViewportSize({ width: 320, height: 844 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await expectNoHorizontalOverflow(page);
      await expectSettingsControlsInsideViewport(page);
      // The page column itself must stay inside the viewport: an overflowing
      // child that only widens its own box would still be a defect.
      const columnRight = await page
        .locator('.settings-page')
        .evaluate((column) => column.getBoundingClientRect().right);
      expect(columnRight, `${path} column right edge`).toBeLessThanOrEqual(320);
      await expectNoWcagViolations(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
    }

    expect(unexpectedRequests).toEqual([]);
  });

  test('Settings selects and switches stay operable with a visible focus ring at 320 px and 200 percent text', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const unexpectedRequests = await installAuthorizedApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.goto('/more/settings/relationship');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });

    const vibeSwitch = page.getByRole('switch', {
      name: profileIdentity.vibeCheckToggle,
    });
    await vibeSwitch.scrollIntoViewIfNeeded();
    await vibeSwitch.focus();
    await expect(vibeSwitch).toBeFocused();
    const focusRing = await vibeSwitch.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        left: box.left,
        right: box.right,
      };
    });
    expect(focusRing.outlineStyle).not.toBe('none');
    expect(focusRing.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focusRing.left).toBeGreaterThanOrEqual(0);
    expect(focusRing.right).toBeLessThanOrEqual(320);

    await vibeSwitch.click();
    await expect(vibeSwitch).toHaveAttribute('aria-checked', 'true');
    const zoneSelect = page.getByRole('combobox', {
      name: profileIdentity.dailyContextTimezoneLabel,
    });
    await expect(zoneSelect).toBeVisible();
    const selectBox = await zoneSelect.boundingBox();
    expect(selectBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(selectBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((selectBox?.x ?? 0) + (selectBox?.width ?? 0)).toBeLessThanOrEqual(
      320,
    );
    await zoneSelect.selectOption('Europe/Berlin');
    await expect(zoneSelect).toHaveValue('Europe/Berlin');
    await expectNoHorizontalOverflow(page);
    expect(unexpectedRequests).toEqual([]);
  });
});

test('notification choices survive return and stay legible across themes and widths (#638, #515)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/more/settings/notifications');

  const email = page.getByRole('switch', {
    name: 'Fällige Erinnerungen: E-Mail',
  });
  await expect(email).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByText('anna@example.org', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.anniversary-reminder-form')).toHaveCount(2);
  await expect(page.locator('.rule-reminder-form')).toHaveCount(2);
  await expect(
    page.getByRole('link', {
      name: profileIdentity.settingsNotificationsAction,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('notification-settings-390-light.png'),
    fullPage: true,
  });

  const commentPush = page.getByRole('switch', { name: 'Kommentare: Push' });
  await expect(commentPush).toBeEnabled();
  await expect(commentPush).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByText(notificationSettings.commentPushDescription, {
      exact: false,
    }),
  ).toBeVisible();
  await commentPush.click();
  await expect(commentPush).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('status').filter({
      hasText: notificationSettings.saved
        .replace('{{event}}', notificationSettings.comment)
        .replace('{{channel}}', notificationSettings.push),
    }),
  ).toBeVisible();
  await page.screenshot({
    path: test
      .info()
      .outputPath('notification-settings-390-comment-opted-in.png'),
    fullPage: true,
  });

  const quietSwitch = page.getByRole('switch', {
    name: notificationSettings.quietHoursEnable,
  });
  await expect(quietSwitch).toHaveAttribute('aria-checked', 'false');
  await quietSwitch.click();
  const quietEnd = page.getByLabel(notificationSettings.quietHoursEnd);
  await quietEnd.fill('22:00');
  await expect(
    page.getByText(notificationSettings.quietHoursInvalid),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: notificationSettings.quietHoursSave }),
  ).toBeDisabled();
  await quietEnd.fill('07:00');
  await page
    .getByRole('button', { name: notificationSettings.quietHoursSave })
    .click();
  await expect(quietSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByText(notificationSettings.quietHoursSaved),
  ).toBeVisible();
  await expect(page.getByText('Täglich 22:00–07:00 Uhr.')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('notification-settings-390-light-saved.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
  await expectSettingsControlsInsideViewport(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await email.click();
  await expect(email).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('status').filter({
      hasText: notificationSettings.saved
        .replace('{{event}}', notificationSettings.reminder)
        .replace('{{channel}}', notificationSettings.email),
    }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: profileIdentity.settingsBackToIndex })
    .click();
  await page
    .getByRole('link', {
      name: profileIdentity.settingsNotifications,
    })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Fällige Erinnerungen: E-Mail' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('switch', { name: notificationSettings.quietHoursEnable }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('switch', { name: 'Kommentare: Push' }),
  ).toHaveAttribute('aria-checked', 'true');

  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: test.info().outputPath(`notification-settings-${width}-light.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: test.info().outputPath('notification-settings-390-dark.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: test.info().outputPath('notification-settings-1280-dark.png'),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({
    path: test.info().outputPath('notification-settings-1280-light.png'),
    fullPage: true,
  });
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.getByRole('switch', { name: 'Kommentare: Push' }).click();
  await expect(
    page.getByRole('switch', { name: 'Kommentare: Push' }),
  ).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(
    page.getByRole('switch', { name: 'Kommentare: Push' }),
  ).toHaveAttribute('aria-checked', 'false');
  expect(unexpectedRequests).toEqual([]);
});

test('planning sanctuary is compact, dark, reduced-motion, keyboard operable, and axe-clean', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 320, height: 800 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await page.getByRole('link', { name: navigation.plan, exact: true }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('heading', { name: m5s3.overview.title, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(m5s3.overview.plansEmpty)).toBeVisible();

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(page.getByText(m5s3.overview.wishesEmpty)).toBeVisible();
  await page.getByRole('tab', { name: m5s3.overview.segmentPlans }).click();

  const revealAnimation = await page
    .locator('.planen-panel')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(revealAnimation).toBe('none');

  const createPlan = page.getByRole('link', { name: m5s3.overview.addPlan });
  await createPlan.focus();
  await expect(createPlan).toBeFocused();
  const createPlanBox = await createPlan.boundingBox();
  expect(createPlanBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page.locator('#planning-create-title')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/plan$/);

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-overview-compact-dark.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/collections');
  await expect(
    page.getByRole('heading', { name: m5s3.collection.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-collections-compact-dark.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/places');
  await expect(
    page.getByRole('heading', { name: m5s3.place.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-places-compact-dark.png'),
    fullPage: true,
  });

  expect(unexpectedRequests).toEqual([]);
});

test('planning sanctuary stays accessible in expanded light mode at 200 percent layout zoom', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await page.getByRole('link', { name: navigation.plan, exact: true }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByRole('heading', { name: m5s3.overview.title, level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('planning-overview-expanded-light.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/collections');
  await expect(
    page.getByRole('heading', { name: m5s3.collection.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-collections-expanded-light.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/places');
  await expect(
    page.getByRole('heading', { name: m5s3.place.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-places-expanded-light.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/plan');
  await expect(
    page.getByRole('heading', { name: m5s3.overview.title, level: 1 }),
  ).toBeVisible();
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Place, Collection, and Chapter editors honor browser focus and history', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const unexpectedRequests = await installAuthorizedApiMocks(page);
  await page.goto('/');
  await signIn(page);

  await page.goto('/plan/places/place-1');
  const placeEdit = page.getByRole('button', { name: de.common.edit });
  await placeEdit.click();
  const placeName = page.getByLabel(m5s3.place.name);
  await expect(placeName).toBeFocused();
  await placeName.fill('Lakeside park');
  await page.goBack();
  const placeDiscard = page.getByRole('alertdialog');
  await expect(placeDiscard).toBeVisible();
  await placeDiscard
    .getByRole('button', { name: m5s3.common.keepEditing })
    .click();
  await expect(placeName).toHaveValue('Lakeside park');
  await page.keyboard.press('Escape');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: m5s3.common.discardConfirm })
    .click();
  await expect(placeEdit).toBeFocused();

  await page.goto('/plan/collections/collection-1');
  const collectionEdit = page.getByRole('button', { name: de.common.edit });
  await collectionEdit.click();
  await expect(page.getByLabel(m5s3.common.title)).toBeFocused();
  await page.goBack();
  await expect(collectionEdit).toBeFocused();

  await page.goto('/plan/chapters/chapter-1');
  const chapterEdit = page.getByRole('button', { name: de.common.edit });
  await chapterEdit.click();
  await expect(page.getByLabel(m5s3.common.title)).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-wave5-editor-history-compact.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(chapterEdit).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await chapterEdit.click();
  await expect(page.getByLabel(m5s3.common.title)).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-wave5-editor-history-expanded.png'),
    fullPage: false,
  });
  expect(unexpectedRequests).toEqual([]);
});

test('Place coordinate guidance meets AA contrast in compact light and dark editors', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  const unexpectedRequests = await installAuthorizedApiMocks(page);
  await page.goto('/');
  await signIn(page);

  const scenarios = [
    { colorScheme: 'light' as const, width: 390, height: 844 },
    { colorScheme: 'light' as const, width: 390, height: 520 },
    { colorScheme: 'dark' as const, width: 390, height: 844 },
    { colorScheme: 'light' as const, width: 1440, height: 900 },
  ];

  for (const { colorScheme, width, height } of scenarios) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });

    await page.goto('/more/places');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    await page.locator('summary', { hasText: m5s3.place.create }).click();
    const createHelp = page.locator('#create-place-coordinate-help');
    await expect(createHelp).toHaveClass(
      /(?:^|\s)planning-coordinate-help(?:\s|$)/,
    );
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `planning-place-coordinate-create-${colorScheme}-${width}x${height}.png`,
      ),
      fullPage: true,
    });

    await page.goto('/plan/places/place-1');
    await page.getByRole('button', { name: de.common.edit }).click();
    const editHelp = page.locator('#place-edit-coordinate-help');
    await expect(editHelp).toHaveClass(
      /(?:^|\s)planning-coordinate-help(?:\s|$)/,
    );
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `planning-place-coordinate-edit-${colorScheme}-${width}x${height}.png`,
      ),
      fullPage: true,
    });
  }

  expect(unexpectedRequests).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`shell navigation and utilities reflow in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const unexpectedRequests = await installAuthorizedApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);

    // Covers both sides of the existing breakpoint and #784's proposed transition.
    for (const width of [320, 390, 599, 600, 839, 840, 959, 960, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const navigationRegion = page.getByRole('navigation', {
        name: de.navigation.primary,
      });
      await expect(navigationRegion).toHaveCount(1);
      for (const [name, path] of [
        [navigation.today, '/today'],
        [navigation.story, '/story'],
        [navigation.plan, '/plan'],
        [navigation.more, '/more'],
      ]) {
        const link = navigationRegion.getByRole('link', { name, exact: true });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', path);
        const box = await link.boundingBox();
        if (!box)
          throw new Error(`Navigation target ${path} has no visible bounds.`);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(
        page.getByRole('button', { name: navigation.newContent }),
      ).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: navigation.newContent }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const inHeader = await navigationRegion.evaluate((element) =>
        Boolean(element.closest('header')),
      );
      expect(inHeader).toBe(width >= 840);
    }

    await page
      .getByRole('link', { name: navigation.plan, exact: true })
      .click();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(
      page.getByRole('link', { name: navigation.plan, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('link', { name: navigation.today, exact: true })
      .click();
    const header = page.getByRole('banner');
    const create = page.getByRole('button', { name: navigation.newContent });
    await create.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: navigation.quickCreateTitle });
    await expect(menu).toBeVisible();
    const memory = menu.getByRole('menuitem', {
      name: navigation.quickCreateMemory,
    });
    await expect(memory).toBeFocused();
    await expect(memory).toHaveAttribute('href', '/story/memories/new');
    await page.keyboard.press('End');
    await expect(
      menu.getByRole('menuitem', { name: navigation.quickCreateGiftIdea }),
    ).toBeFocused();
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`shell-create-expanded-${colorScheme}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(create).toBeFocused();
    await expect(menu).toHaveCount(0);

    const search = header.getByRole('link', {
      name: navigation.search,
      exact: true,
    });
    await search.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search$/);
    const searchInput = page.getByRole('searchbox', {
      name: m5s5.search.label,
    });
    await searchInput.focus();
    await searchInput.fill('Shared memory');
    await page.keyboard.press('Enter');
    await expect(searchInput).toBeFocused();
    await expect(
      page.getByRole('button', { name: m5s5.search.submit, exact: true }),
    ).toBeEnabled();
    await page.goBack();
    const notifications = header.getByRole('button', {
      name: navigation.notifications,
      exact: true,
    });
    await notifications.focus();
    await page.keyboard.press('Enter');
    await expect(header.locator('a[href="/more/notifications"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notifications).toBeFocused();
    const profile = header.getByRole('button', {
      name: navigation.profileMenu,
    });
    await profile.focus();
    await page.keyboard.press('Enter');
    await header.locator('a[href="/more/profile"]').click();
    await expect(page).toHaveURL(/\/more\/profile$/);
    await expect(
      page.getByRole('link', { name: navigation.more, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('link', { name: navigation.today, exact: true })
      .click();

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `shell-${width >= 840 ? 'expanded' : 'compact'}-${colorScheme}.png`,
        ),
      });
    }
    // Browser zoom halves the CSS viewport; unlike CSS zoom it changes media queries.
    await page.setViewportSize({ width: 720, height: 450 });
    await expect(
      page.getByRole('navigation', { name: de.navigation.primary }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    expect(unexpectedRequests).toEqual([]);
  });
}

// CSS layout zoom keeps the 390px CSS viewport but halves the usable layout
// width. A 320px root minimum used to survive that halving as 640 rendered
// pixels, which is exactly how #798 reproduced.
test('sign-in reflows below a 320px layout width at 200 percent zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.clientWidth).toBe(390);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyScrollWidth).toBeLessThan(320);
});

test('authenticated shell reflows below a 320px layout width at 200 percent zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await expect(page).toHaveURL(/\/today$/);
  await expectNoHorizontalOverflow(page);

  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(dimensions.clientWidth).toBe(390);
  expect(dimensions.bodyScrollWidth).toBeLessThan(320);
  expect(unexpectedRequests).toEqual([]);
});
