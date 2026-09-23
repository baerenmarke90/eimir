import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import dailyQuote from '../../src/i18n/locales/dailyQuote';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

interface DailyQuoteMockOptions {
  capabilities?: string[];
  quoteAvailable?: boolean;
  preferenceEnabled?: boolean;
  quoteFailures?: number;
}

interface PreferencePatch {
  body: Record<string, unknown>;
  ifMatch: string | undefined;
}

async function installMocks(page: Page, options: DailyQuoteMockOptions = {}) {
  const capabilities = options.capabilities ?? ['daily.quote'];
  const quoteAvailable = options.quoteAvailable ?? true;
  let preferenceEnabled = options.preferenceEnabled ?? true;
  let currentAccountId = ACCOUNT_ID;
  const selectedCategories = new Map<string, string[]>([
    [ACCOUNT_ID, ['love']],
    [PARTNER_ID, ['love']],
  ]);
  let remainingQuoteFailures = options.quoteFailures ?? 0;
  const requests = {
    quote: 0,
    catalog: 0,
    preferences: 0,
    preferenceAccounts: [] as string[],
    patches: [] as PreferencePatch[],
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
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
    const space = `/api/v1/spaces/${SPACE_ID}`;

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
      currentAccountId =
        (request.postDataJSON() as { email: string }).email ===
        'ben@example.org'
          ? PARTNER_ID
          : ACCOUNT_ID;
      await json({
        account: {
          displayName:
            currentAccountId === ACCOUNT_ID ? 'Anna Berger' : 'Ben Winter',
          id: currentAccountId,
        },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'daily-quote-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'daily-quote-refresh-token',
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/sign-out') {
      await route.fulfill({ status: 204 });
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

    if (method === 'GET' && pathname === space) {
      await json({
        id: SPACE_ID,
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna Berger' },
          { id: PARTNER_ID, displayName: 'Ben Winter' },
        ],
      });
      return;
    }

    if (method === 'GET' && pathname === `${space}/configuration`) {
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
          supportGesturesEnabled: false,
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
      (pathname === `${space}/profiles/${ACCOUNT_ID}` ||
        pathname === `${space}/profiles/${PARTNER_ID}`)
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

    if (method === 'GET' && pathname === `${space}/dashboard/preferences`) {
      await json({ items: [] });
      return;
    }

    if (method === 'GET' && pathname === `${space}/dashboard`) {
      await json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben Winter' },
        },
        relationshipDuration: {
          daysTogether: 250,
          startedOn: '2026-01-01',
        },
        retrospective: null,
        recentShared: [],
        upcoming: [
          {
            id: '00000000-0000-0000-0000-000000000040',
            type: 'PLAN',
            titleOrText: 'Shared evening',
            scheduledAt: '2026-09-29T18:00:00Z',
          },
        ],
        thinkingOfYouAvailableAt: null,
      });
      return;
    }

    if (method === 'GET' && pathname === `${space}/activity`) {
      await json({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `${space}/notifications/unread-count`
    ) {
      await json({ unreadCount: 0 });
      return;
    }

    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `${space}/presence`
    ) {
      await json({ state: 'ACTIVE' });
      return;
    }

    if (method === 'GET' && pathname === `${space}/entitlements`) {
      await json({
        spaceId: SPACE_ID,
        status: capabilities.length > 0 ? 'ACTIVE' : 'FREE',
        tier: capabilities.length > 0 ? 'PREMIUM' : 'FREE',
        capabilities,
        isInGracePeriod: false,
      });
      return;
    }

    if (method === 'GET' && pathname === `${space}/daily-quote`) {
      requests.quote += 1;
      if (!capabilities.includes('daily.quote')) {
        await json(
          {
            code: 'PREMIUM_ENTITLEMENT_REQUIRED',
            status: 403,
            title: 'Forbidden',
          },
          403,
        );
        return;
      }
      if (remainingQuoteFailures > 0) {
        remainingQuoteFailures -= 1;
        await json(
          { code: 'QUOTE_UNAVAILABLE', status: 503, title: 'Unavailable' },
          503,
        );
        return;
      }
      await json({
        checkedOn: '2026-09-22',
        enabled: preferenceEnabled,
        quote:
          preferenceEnabled && quoteAvailable
            ? {
                id: 'quote-browser-001',
                text:
                  currentAccountId === ACCOUNT_ID
                    ? 'A calm thought for today.'
                    : 'A different thought for Ben.',
                authorDisplay: 'Example Author',
                sourceDisplay: 'Example Source',
                sourceId: 'classic_literature',
                categoryIds: ['love', 'mindfulness'],
                locale: 'de',
                rightsClassification: 'PUBLIC_DOMAIN',
                attributionRequired: true,
              }
            : null,
      });
      return;
    }

    if (method === 'GET' && pathname === `${space}/daily-quote/catalog`) {
      requests.catalog += 1;
      await json({
        categories: [
          {
            id: 'love',
            name: 'Love',
            description: 'Relationship thoughts',
          },
          {
            id: 'mindfulness',
            name: 'Mindfulness',
            description: 'Present-moment thoughts',
          },
        ],
        sources: [
          {
            id: 'classic_literature',
            name: 'Classic literature',
            description: 'Curated classic literature',
            rightsClassification: 'PUBLIC_DOMAIN',
          },
          {
            id: 'poetic_wisdom',
            name: 'Poetry and wisdom',
            description: 'Curated aphorisms',
            rightsClassification: 'PUBLIC_DOMAIN',
          },
        ],
      });
      return;
    }

    if (method === 'GET' && pathname === `${space}/daily-quote/preferences`) {
      requests.preferences += 1;
      requests.preferenceAccounts.push(currentAccountId);
      await json(
        {
          accountId: currentAccountId,
          enabled: preferenceEnabled,
          selectedSourceIds: ['classic_literature'],
          selectedCategoryIds: selectedCategories.get(currentAccountId),
          locale: null,
          version: 2,
        },
        200,
        {
          ETag: '"quote-pref:2"',
          'Cache-Control': 'private, no-store',
        },
      );
      return;
    }

    if (method === 'PATCH' && pathname === `${space}/daily-quote/preferences`) {
      const body = request.postDataJSON() as Record<string, unknown>;
      requests.patches.push({
        body,
        ifMatch: request.headers()['if-match'],
      });
      if (typeof body.enabled === 'boolean') {
        preferenceEnabled = body.enabled;
      }
      if (Array.isArray(body.selectedCategoryIds)) {
        selectedCategories.set(
          currentAccountId,
          body.selectedCategoryIds as string[],
        );
      }
      await json(
        {
          accountId: currentAccountId,
          enabled: preferenceEnabled,
          selectedSourceIds: body.selectedSourceIds ?? ['classic_literature'],
          selectedCategoryIds: selectedCategories.get(currentAccountId),
          locale: null,
          version: 3,
        },
        200,
        {
          ETag: '"quote-pref:3"',
          'Cache-Control': 'private, no-store',
        },
      );
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

  return Object.assign(requests, { capabilities });
}

async function signIn(page: Page, email = 'anna@example.org') {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill(email);
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectQuoteSurfaceAccessible(
  page: Page,
  { wholeDocument = true }: { wholeDocument?: boolean } = {},
): Promise<void> {
  await expect(
    page
      .locator('.daily-quote-card')
      .getByRole('heading', { level: 2, name: dailyQuote.title }),
  ).toBeVisible();

  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.daily-quote-card *, .daily-quote-preferences-sheet *',
      ),
    )
      .filter((element) => !(element instanceof SVGElement))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className),
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      })
      .filter(
        (box) =>
          box.width > 0 && (box.left < -1 || box.right > root.clientWidth + 1),
      )
      .slice(0, 8);

    return {
      overflowing,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });

  expect(
    result.overflowing,
    `Elements outside viewport: ${JSON.stringify(result.overflowing, null, 2)}`,
  ).toEqual([]);
  if (wholeDocument) {
    expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test('Pro Daily Quote follows the approved Today composition across Compact widths', async ({
  page,
}, testInfo) => {
  const requests = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await signIn(page);

  await expect(page.getByText('A calm thought for today.')).toBeVisible();
  await expect(page.getByText('Example Author')).toBeVisible();
  expect(requests.quote).toBeGreaterThan(0);

  const quoteBox = await page.locator('.daily-quote-card').boundingBox();
  const upcomingBox = await page
    .locator('.today-section-upcoming')
    .boundingBox();
  expect(quoteBox).not.toBeNull();
  expect(upcomingBox).not.toBeNull();
  expect(quoteBox?.y ?? 0).toBeLessThan(upcomingBox?.y ?? Number.MAX_VALUE);

  // Regression guard for #1200: the agenda tile clips its own content to its
  // rounded corners, so an icon/text box reaching the padding edge cannot
  // show a square corner outside the rounded silhouette.
  expect(
    await page
      .locator('.today-agenda-row')
      .first()
      .evaluate((element) => getComputedStyle(element).overflow),
  ).toBe('hidden');

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectQuoteSurfaceAccessible(page);
    await page.screenshot({
      path: testInfo.outputPath(`today-daily-quote-${width}-light.png`),
      fullPage: true,
    });
  }
});

test('personal Daily Quote preferences stay caller-only and round-trip If-Match', async ({
  page,
}, testInfo) => {
  const requests = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  await expect(
    page.getByRole('heading', { name: dailyQuote.sheetTitle }),
  ).toBeVisible();
  await expect(
    page.getByText(dailyQuote.privacy.replace('{{name, firstName}}', 'Ben')),
  ).toBeVisible();

  const preferencesSheet = page.locator('.daily-quote-preferences-sheet');
  const mindfulness = preferencesSheet.getByRole('checkbox', {
    name: /Mindfulness/u,
  });
  await preferencesSheet.getByText('Mindfulness', { exact: true }).click();
  await expect(mindfulness).toBeChecked();
  await expectQuoteSurfaceAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath('today-daily-quote-preferences-390-light.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: dailyQuote.done }).click();

  await expect.poll(() => requests.patches.length).toBe(1);
  expect(requests.patches[0]?.ifMatch).toBe('"quote-pref:2"');
  expect(requests.patches[0]?.body).toEqual(
    expect.objectContaining({
      selectedCategoryIds: ['love', 'mindfulness'],
      selectedSourceIds: ['classic_literature'],
    }),
  );
  expect(JSON.stringify(requests.patches)).not.toContain(PARTNER_ID);
});

test('personal visibility hides the Wir card and Settings -> Wir restores it', async ({
  page,
}) => {
  const requests = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  const sheet = page.locator('.daily-quote-preferences-sheet');
  const sheetToggle = sheet.getByRole('switch', {
    name: dailyQuote.enabledLabel,
  });
  await expect(sheetToggle).toHaveAttribute('aria-checked', 'true');
  await sheetToggle.click();
  await page.getByRole('button', { name: dailyQuote.done }).click();

  await expect(page.locator('.daily-quote-card')).toHaveCount(0);
  expect(requests.patches.at(-1)?.body).toEqual(
    expect.objectContaining({ enabled: false }),
  );

  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page).toHaveURL(/\/more$/);
  await page
    .getByRole('link', { name: navigation.settings, exact: true })
    .click();
  await expect(page).toHaveURL(/\/more\/settings$/);
  await page.locator('.settings-index a[href="/more/settings/today"]').click();
  await expect(page).toHaveURL(/\/more\/settings\/today$/);

  const settingsToggle = page
    .locator('#settings-daily-quote')
    .getByRole('switch', { name: dailyQuote.enabledLabel });
  await expect(settingsToggle).toHaveAttribute('aria-checked', 'false');
  await settingsToggle.click();
  await expect(settingsToggle).toHaveAttribute('aria-checked', 'true');
  expect(requests.patches.at(-1)?.body).toEqual({ enabled: true });

  await page.getByRole('link', { name: navigation.today, exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText('A calm thought for today.')).toBeVisible();
});

test('Free Spaces see quiet discovery without quote or preference reads', async ({
  page,
}, testInfo) => {
  const requests = await installMocks(page, { capabilities: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await expect(page.getByText(dailyQuote.discovery)).toBeVisible();
  await expect(page.getByText(dailyQuote.discoveryMeta)).toBeVisible();
  await expect(
    page.getByRole('button', { name: dailyQuote.settingsAria }),
  ).toHaveCount(0);
  expect(requests.quote).toBe(0);
  expect(requests.catalog).toBe(0);
  expect(requests.preferences).toBe(0);
  await expectQuoteSurfaceAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath('today-daily-quote-free-390-light.png'),
    fullPage: true,
  });
});

test('Pro no-quote response is neutral and does not become an error prompt', async ({
  page,
}, testInfo) => {
  await installMocks(page, { quoteAvailable: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await expect(page.getByText(dailyQuote.empty)).toBeVisible();
  await expect(page.getByText(dailyQuote.emptyMeta)).toBeVisible();
  await expect(
    page.getByRole('button', { name: dailyQuote.retry }),
  ).toHaveCount(0);
  await expectQuoteSurfaceAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath('today-daily-quote-empty-390-light.png'),
    fullPage: true,
  });
});

test('a quote service failure keeps Today usable and a retry restores the quote', async ({
  page,
}) => {
  const requests = await installMocks(page, { quoteFailures: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await expect(page.getByText(dailyQuote.unavailable)).toBeVisible();
  await expect(page.getByText('A calm thought for today.')).toHaveCount(0);
  await expect(page.locator('.today-section-upcoming')).toBeVisible();
  await expectQuoteSurfaceAccessible(page);
  await page.getByRole('button', { name: dailyQuote.retry }).click();

  await expect(page.getByText('A calm thought for today.')).toBeVisible();
  expect(requests.quote).toBe(2);
  await expectQuoteSurfaceAccessible(page);
});

test('losing the quote capability shows discovery and restores personal preferences on return', async ({
  page,
}) => {
  const requests = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByText('A calm thought for today.')).toBeVisible();

  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  const mindfulness = page.getByRole('checkbox', { name: /Mindfulness/u });
  await mindfulness.check();
  await page.getByRole('button', { name: dailyQuote.done }).click();
  await expect.poll(() => requests.patches.length).toBe(1);
  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  await expect(
    page.getByRole('checkbox', { name: /Mindfulness/u }),
  ).toBeChecked();
  const personalReads = requests.preferences;

  requests.capabilities.splice(0);
  await page.reload();
  await expect(page.getByText(dailyQuote.discovery)).toBeVisible();
  await expect(
    page.getByRole('button', { name: dailyQuote.settingsAria }),
  ).toHaveCount(0);
  expect(requests.preferences).toBe(personalReads);
  expect(requests.patches).toHaveLength(1);
  await expectQuoteSurfaceAccessible(page);

  requests.capabilities.push('daily.quote');
  await page.reload();
  await expect(page.getByText('A calm thought for today.')).toBeVisible();
  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  await expect(
    page.getByRole('checkbox', { name: /Mindfulness/u }),
  ).toBeChecked();
  await expectQuoteSurfaceAccessible(page);
});

test('signing into the partner account cannot reuse the previous account quote or selection', async ({
  page,
}) => {
  const requests = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  await page.getByRole('checkbox', { name: /Mindfulness/u }).check();
  await page.getByRole('button', { name: dailyQuote.done }).click();
  await expect.poll(() => requests.patches.length).toBe(1);

  await page.getByRole('button', { name: navigation.profileMenu }).click();
  await page.getByRole('button', { name: de.header.logout }).click();
  await expect(page.getByLabel(de.login.email)).toBeVisible();
  await signIn(page, 'ben@example.org');

  await expect(page.getByText('A different thought for Ben.')).toBeVisible();
  await expect(page.getByText('A calm thought for today.')).toHaveCount(0);
  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  await expect(
    page.getByRole('checkbox', { name: /Mindfulness/u }),
  ).not.toBeChecked();
  expect(requests.preferenceAccounts).toContain(PARTNER_ID);
  await expectQuoteSurfaceAccessible(page);
});

test('Daily Quote reflows at 320px large text and adapts to Expanded', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await expect(page.getByText('A calm thought for today.')).toBeVisible();
  await expectQuoteSurfaceAccessible(page, { wholeDocument: false });
  await page.screenshot({
    path: testInfo.outputPath('today-daily-quote-320-dark-200pct-reduced.png'),
    fullPage: true,
  });

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await expectQuoteSurfaceAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath('today-daily-quote-1280-light.png'),
    fullPage: true,
  });
});
