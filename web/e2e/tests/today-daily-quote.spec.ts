import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { PUBLIC_START_ROUTE } from '../../src/client/publicStart';
import dailyQuote from '../../src/i18n/locales/dailyQuote';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import localizedFixture from '../fixtures/locales/de';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

interface DailyQuoteMockOptions {
  capabilities?: string[];
  quoteAvailable?: boolean;
  preferenceEnabled?: boolean;
  quoteFailures?: number;
  design?: 'warm' | 'modern' | 'classic';
  quoteText?: string;
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

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await json({
        displayName:
          currentAccountId === ACCOUNT_ID ? 'Anna Berger' : 'Ben Winter',
        id: currentAccountId,
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

    if (method === 'GET' && pathname === `${space}/appearance/wir-design`) {
      await json({ designId: options.design ?? 'warm', version: 0 }, 200, {
        ETag: '"appearance:0"',
      });
      return;
    }

    if (await fulfillDefaultAppIcon(route)) return;

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
                    ? (options.quoteText ?? 'A calm thought for today.')
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
  await submitSignIn(page, email);
}

async function submitSignIn(page: Page, email: string) {
  await page.getByLabel(de.login.email).fill(email);
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectQuoteSurfaceAccessible(
  page: Page,
  { wholeDocument = true }: { wholeDocument?: boolean } = {},
): Promise<void> {
  const card = page.locator('.daily-quote-card');
  if (await card.count()) {
    const geometry = await card.evaluate((node) => {
      const header = node.querySelector('.daily-quote-header');
      const content = node.querySelector('.daily-quote-content');
      if (!header || !content)
        throw new Error('The quote needs a heading above its content.');
      const block = node.querySelector('blockquote');
      const paragraph = block?.querySelector('p');
      const root = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      return {
        headingAbove:
          header.getBoundingClientRect().bottom <=
          content.getBoundingClientRect().top,
        border: block ? getComputedStyle(block).borderLeftWidth : '0px',
        outerBorder: getComputedStyle(node).borderInlineStartWidth,
        outerBackground: getComputedStyle(node).backgroundColor,
        quoteScale: paragraph
          ? parseFloat(getComputedStyle(paragraph).fontSize) / root
          : 0,
      };
    });
    expect(geometry.headingAbove).toBe(true);
    expect(geometry.border).toBe('0px');
    expect(geometry.outerBorder).toBe('0px');
    expect(geometry.outerBackground).toBe('rgba(0, 0, 0, 0)');
    expect(geometry.quoteScale).toBeLessThanOrEqual(1.25);
  }
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

for (const design of ['warm', 'modern', 'classic'] as const)
  for (const theme of ['light', 'dark'])
    test(`long quote keeps one surface and a contained heading: ${design} ${theme}`, async ({
      page,
    }, info) => {
      const quoteText = localizedFixture.dailyQuote;
      await installMocks(page, { design, quoteText });
      await page.addInitScript(
        (value) => localStorage.setItem('eimir.theme', value),
        theme,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await signIn(page);
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        design,
      );
      await expect(page.locator('.daily-quote-block')).toContainText(quoteText);
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await expectQuoteSurfaceAccessible(page);
      }
      await page.locator('.daily-quote-card').screenshot({
        path: info.outputPath(`quote-${design}-${theme}.png`),
      });
      await page.setViewportSize({ width: 320, height: 760 });
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await expectQuoteSurfaceAccessible(page);
      const contained = await page
        .locator('.daily-quote-header')
        .evaluate((header) => {
          const box = header.getBoundingClientRect();
          return Array.from(header.children).every((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left >= box.left - 1 && rect.right <= box.right + 1;
          });
        });
      expect(contained).toBe(true);
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
  await page
    .locator('.daily-quote-preferences-sheet')
    .getByText('Mindfulness', { exact: true })
    .click();
  await expect(mindfulness).toBeChecked();
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
  await page
    .locator('.daily-quote-preferences-sheet')
    .getByText('Mindfulness', { exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: /Mindfulness/u }),
  ).toBeChecked();
  await page.getByRole('button', { name: dailyQuote.done }).click();
  await expect.poll(() => requests.patches.length).toBe(1);

  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === PUBLIC_START_ROUTE),
    page.getByRole('button', { name: de.header.logout }).click(),
  ]);
  await expect(page.getByLabel(de.login.email)).toBeVisible();
  await submitSignIn(page, 'ben@example.org');

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

test('Today clarity: live countdown, honest dates and docked navigation across themes and sizes', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date('2026-10-29T08:00:00Z') });
  let memoryTitle = 'Erinnerung vom 27.10.2026';
  await installMocks(page);
  await page.route('**/attachments/attachment-clarity/read-access', (route) =>
    route.fulfill({
      json: {
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/attachment-clarity/content`,
        expiresAt: null,
      },
    }),
  );
  await page.route('**/attachments/attachment-clarity/content*', (route) =>
    route.fulfill({
      contentType: 'image/jpeg',
      path: fileURLToPath(
        new URL(
          '../../../backend/demo_assets/images/dog-outdoors.jpg',
          import.meta.url,
        ),
      ),
    }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/dashboard`, (route) =>
    route.fulfill({
      json: {
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben Winter' },
        },
        relationshipDuration: { daysTogether: 168, startedOn: '2026-05-14' },
        retrospective: null,
        recentShared: [],
        keepsake: {
          id: 'memory-clarity',
          type: 'MEMORY',
          titleOrText: memoryTitle,
          previewAttachmentId: 'attachment-clarity',
          previewIsSensitive: true,
          occurredOn: '2026-10-27',
          scheduledAt: null,
          createdAt: null,
        },
        upcoming: [
          {
            id: 'anniversary-clarity',
            type: 'ANNIVERSARY',
            titleOrText: null,
            occurredOn: '2027-05-14',
            scheduledAt: null,
            createdAt: null,
          },
        ],
        anticipation: {
          planId: 'plan-clarity',
          title: 'Ghost Night',
          eventOn: '2026-11-21',
          eventAt: '2026-11-21T19:00:00Z',
          daysRemaining: 23,
        },
        viewerLocalDate: '2026-10-29',
        thinkingOfYouAvailableAt: null,
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const quote = page.locator('.daily-quote-card');
  await expect(quote.getByRole('heading')).toHaveText(dailyQuote.title);
  await expect(
    quote.locator('.pro-mark, .today-section-kicker, .daily-quote-categories'),
  ).toHaveCount(0);
  const moment = page.locator('.today-moment');
  await expect(quote.getByText('A calm thought for today.')).toBeVisible();
  await expect(moment.locator('img')).toHaveCount(1);
  await expect(moment).toContainText('27.10.2026');
  await expect(moment).not.toContainText('Erinnerung vom');
  await expect(moment.locator('.today-moment-date')).toHaveCount(0);
  await expect(moment.locator('.today-moment-title')).toHaveText('27.10.2026');
  await expect(page.locator('.today-agenda-row')).toContainText(
    'Euer Jahrestag',
  );
  await expect(page.locator('.today-agenda-row')).toContainText('14. Mai 2027');
  const timer = page.getByRole('timer');
  await expect(timer).toHaveAttribute('aria-live', 'off');
  const seconds = timer.locator('.anticipation-digit').last();
  const before = await seconds.textContent();
  await page.clock.runFor(1100);
  await expect(seconds).not.toHaveText(before ?? '');

  for (const width of [320, 360, 390, 430, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const dock = page.locator('.mobile-bottom-shell');
      if (width < 1024) {
        const box = await dock.boundingBox();
        expect(box?.x).toBe(0);
        expect(box?.width).toBe(width);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(844);
        expect(
          await dock.evaluate((el) => getComputedStyle(el).borderRadius),
        ).toBe('0px');
      } else await expect(dock).toBeHidden();
      await expectQuoteSurfaceAccessible(page);
      await page.screenshot({
        path: testInfo.outputPath(`today-clarity-${width}-${theme}.png`),
        fullPage: true,
      });
      if (width === 390 && theme === 'light') {
        await page.locator('.today-section-upcoming').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath('today-clarity-docked-390-viewport.png'),
        });
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
    document.documentElement.style.setProperty(
      '--safe-area-inset-bottom',
      '34px',
    );
  });
  await expectQuoteSurfaceAccessible(page);
  const geometry = await page
    .locator('.mobile-bottom-shell')
    .evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      bottom: el.getBoundingClientRect().bottom,
      padding: parseFloat(getComputedStyle(el).paddingBottom),
      measured: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--shell-bottom-nav-measured-height',
        ),
      ),
    }));
  expect(geometry.bottom).toBe(640);
  expect(geometry.padding).toBeGreaterThanOrEqual(34);
  expect(geometry.measured).toBe(geometry.height);
  await page.screenshot({
    path: testInfo.outputPath('today-clarity-320-large-text-safe-area.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  memoryTitle = 'An evening by the lake';
  await page.reload();
  await expect(moment.locator('.today-moment-title')).toHaveText(memoryTitle);
  await expect(moment.locator('.today-moment-date')).toHaveText('27.10.2026');
  await expect(quote.getByText('A calm thought for today.')).toBeVisible();
  await expect(moment.locator('img')).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath('today-clarity-authored-title-390-light.png'),
    fullPage: true,
  });
});

test('borderless surfaces retain selection, saved preferences, keyboard focus and forced-color boundaries', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyQuote.sheetTitle });
  await expect(sheet).toBeVisible();
  const mindfulness = sheet.getByRole('checkbox', { name: /Mindfulness/u });
  await sheet.getByText('Mindfulness', { exact: true }).click();
  await expect(mindfulness).toBeChecked();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const frames = await page
      .locator(
        'button, .today-agenda-row, .short-task-sheet, .daily-quote-category, .daily-quote-source-check, .preference-switch-track',
      )
      .evaluateAll((elements) =>
        elements
          .filter(
            (el) =>
              el.getBoundingClientRect().width > 0 &&
              el.getBoundingClientRect().height > 0,
          )
          .flatMap((el) => {
            const style = getComputedStyle(el);
            return [
              'borderTopWidth',
              'borderRightWidth',
              'borderBottomWidth',
              'borderLeftWidth',
            ]
              .filter(
                (side) =>
                  parseFloat(
                    style[side as keyof CSSStyleDeclaration] as string,
                  ) > 0,
              )
              .map((side) => `${el.className}: ${side}`);
          }),
      );
    expect(frames).toEqual([]);
    await expectQuoteSurfaceAccessible(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `borderless-preferences-390-${colorScheme}.png`,
      ),
      fullPage: true,
    });
  }
  const save = sheet.getByRole('button', { name: dailyQuote.done });
  await page.keyboard.press('Tab');
  await save.focus();
  expect(
    await save.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth)),
  ).toBeGreaterThanOrEqual(2);
  await page.emulateMedia({ forcedColors: 'active' });
  expect(
    await sheet
      .locator('.daily-quote-category')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth)),
  ).toBeGreaterThanOrEqual(1);
  await expect(mindfulness).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath('borderless-preferences-forced-colors-focus.png'),
    fullPage: true,
  });
  await page.emulateMedia({ forcedColors: 'none' });
  await save.click();
  await expect(sheet).not.toBeVisible();
  await page.getByRole('button', { name: dailyQuote.settingsAria }).click();
  await expect(
    sheet.getByRole('checkbox', { name: /Mindfulness/u }),
  ).toBeChecked();
});
