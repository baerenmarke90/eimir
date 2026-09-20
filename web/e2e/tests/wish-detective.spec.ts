import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-13T10:00:00Z';
const SECRET_WISH_TITLE = 'Stargazing in the garden';
const POSSIBLE_ACCOUNT_WISH_TITLES = [
  SECRET_WISH_TITLE,
  'Picnic by the lake',
] as const;

function localized(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function installApiMocks(page: Page): Promise<void> {
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
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'wish-detective-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'wish-detective-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
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
        createdAt: TEST_NOW,
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
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
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
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
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['games.couple'],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/games/wishes/candidates`
    ) {
      await fulfillJson({
        items: [
          {
            wishId: '50000000-0000-4000-8000-000000000001',
            createdBy: ACCOUNT_ID,
            title: SECRET_WISH_TITLE,
          },
          {
            wishId: '50000000-0000-4000-8000-000000000002',
            createdBy: PARTNER_ID,
            title: 'Weekend by the sea',
          },
          {
            wishId: '50000000-0000-4000-8000-000000000003',
            createdBy: ACCOUNT_ID,
            title: 'Picnic by the lake',
          },
          {
            wishId: '50000000-0000-4000-8000-000000000004',
            createdBy: PARTNER_ID,
            title: 'Concert in Berlin',
          },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/story/timeline`
    ) {
      await fulfillJson({
        availableYears: [],
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Unexpected request: ${method} ${pathname}`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test.describe('Wish Detective Product Reference (#864)', () => {
  test('390/320 handoff keeps the secret hidden and stays accessible', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/games/wish-detective');

    await expect(
      page.getByRole('heading', {
        name: games.entries.wishes.title,
        level: 1,
      }),
    ).toBeVisible();
    const secretWishHeading = page.locator('#wish-detective-clue-title');
    await expect(secretWishHeading).toBeVisible();
    await expect(page.locator('.wish-detective-card')).toHaveCSS(
      'animation-name',
      'none',
    );
    const secretWishTitle =
      (await secretWishHeading.textContent())?.trim() ?? '';
    expect(POSSIBLE_ACCOUNT_WISH_TITLES).toContain(secretWishTitle);
    await expect(
      page.locator('.mobile-bottom-nav a.shell-nav-link').nth(3),
    ).toHaveAttribute('aria-current', 'page');

    const axeClue = await new AxeBuilder({ page })
      .include('.wish-detective-page')
      .analyze();
    expect(axeClue.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('wish-detective-clue-390-light.png'),
      fullPage: true,
    });

    await page
      .getByLabel(localized(games.wishDetective.clueLabel, { index: 1 }))
      .fill('Night');
    await page
      .getByLabel(localized(games.wishDetective.clueLabel, { index: 2 }))
      .fill('Blanket');
    await page
      .getByLabel(localized(games.wishDetective.clueLabel, { index: 3 }))
      .fill('Warm');
    await page
      .getByRole('button', { name: games.wishDetective.startHandoff })
      .click();

    await expect(page.getByText(secretWishTitle, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('heading', {
        name: localized(games.wishDetective.handoffTitle, { name: 'Alex' }),
      }),
    ).toBeVisible();
    const axeHandoff = await new AxeBuilder({ page })
      .include('.wish-detective-page')
      .analyze();
    expect(axeHandoff.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('wish-detective-handoff-390-light.png'),
      fullPage: true,
    });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(300);
    const axeDarkHandoff = await new AxeBuilder({ page })
      .include('.wish-detective-page')
      .analyze();
    expect(axeDarkHandoff.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('wish-detective-handoff-390-dark.png'),
      fullPage: true,
    });

    const handoffConfirm = page.getByRole('button', {
      name: localized(games.wishDetective.handoffConfirm, { name: 'Alex' }),
    });
    await handoffConfirm.focus();
    await expect(handoffConfirm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(secretWishTitle, { exact: true })).toHaveCount(
      0,
    );
    const guessInput = page.getByLabel(
      localized(games.wishDetective.guessLabel, { name: 'Anna' }),
    );
    await expect(guessInput).toBeVisible();
    expect(
      await guessInput.evaluate(
        (element) => document.activeElement === element,
      ),
    ).toBe(false);

    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
    const axe320 = await new AxeBuilder({ page })
      .include('.wish-detective-page')
      .analyze();
    expect(axe320.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('wish-detective-guess-320-dark.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px';
    });
    await expectNoHorizontalOverflow(page);
    await expect(guessInput).toBeVisible();
    await expect(
      page.getByRole('button', { name: games.wishDetective.pass }),
    ).toBeVisible();
    const axeLargeText = await new AxeBuilder({ page })
      .include('.wish-detective-page')
      .analyze();
    expect(axeLargeText.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('wish-detective-guess-390-dark-large-text.png'),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });

    await page.goBack();
    await page.goForward();
    await expect(
      page.getByRole('heading', {
        name: games.wishDetective.interruptedTitle,
        level: 2,
      }),
    ).toBeVisible();
    await expect(page.getByText(secretWishTitle, { exact: true })).toHaveCount(
      0,
    );
  });
});
