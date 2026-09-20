import { expect, test, type Locator, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import profileIdentity from '../../src/i18n/locales/profileIdentity';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const HEART_MOMENT_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-01T10:00:00Z';

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(document.body.querySelectorAll('*'))
      .flatMap((element) => {
        if (!(element instanceof HTMLElement)) return [];
        const rect = element.getBoundingClientRect();
        if (rect.left >= -0.5 && rect.right <= clientWidth + 0.5) return [];
        const style = getComputedStyle(element);
        return [
          {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            display: style.display,
            position: style.position,
            minWidth: style.minWidth,
            whiteSpace: style.whiteSpace,
          },
        ];
      })
      .sort((left, right) => right.right - left.right)
      .slice(0, 12);
    return { clientWidth, scrollWidth, offenders };
  });
  expect(
    dimensions.scrollWidth,
    `Horizontal overflow offenders: ${JSON.stringify(dimensions.offenders)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectHiddenGeometry(input: Locator): Promise<void> {
  await expect(input).toHaveCSS('position', 'absolute');
  await expect(input).toHaveCSS('width', '1px');
  await expect(input).toHaveCSS('height', '1px');
  await expect(input).toHaveCSS('min-height', '0px');
  await expect(input).toHaveCSS('padding-top', '0px');
  await expect(input).toHaveCSS('border-top-width', '0px');
}

async function tabToElement(page: Page, id: string): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.keyboard.press('Tab');
    const activeId = await page.evaluate(
      () => document.activeElement?.id ?? '',
    );
    if (activeId === id) return;
  }

  throw new Error(`Keyboard focus did not reach #${id}.`);
}

async function expectKeyboardFilePicker(page: Page, id: string): Promise<void> {
  const input = page.locator(`#${id}`);
  await expectHiddenGeometry(input);
  await expect(input).not.toHaveAccessibleName('');

  await tabToElement(page, id);
  await expect(input).toBeFocused();

  const picker = page.locator(`label.file-picker[for="${id}"]`);
  await expect(picker).toBeVisible();
  await expect(picker).toHaveCSS('outline-style', 'solid');
  await expect(picker).toHaveCSS('outline-width', '3px');
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
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
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
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
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
      await fulfillJson([]);
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
      pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments/${HEART_MOMENT_ID}`
    ) {
      await fulfillJson({
        attachment: null,
        author: { accountId: ACCOUNT_ID, displayName: 'Anna' },
        authorId: ACCOUNT_ID,
        capabilities: { canEdit: true, canDelete: true },
        createdAt: TEST_NOW,
        emotion: 'LOVED',
        happenedOn: '2026-09-01',
        id: HEART_MOMENT_ID,
        spaceId: SPACE_ID,
        text: 'A small shared moment',
        updatedAt: TEST_NOW,
        version: 1,
        visibility: 'SHARED',
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

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
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

for (const colorScheme of ['light', 'dark'] as const) {
  test(`shared hidden file inputs stay accessible and overflow-free (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await installApiMocks(page);
    await page.goto('/today');
    await signIn(page);

    await page.goto('/more/profile');
    await page
      .getByRole('button', { name: profileIdentity.editProfile })
      .click();
    const changeAvatar = page
      .locator('.profile-identity-actions-row button')
      .filter({ hasText: profileIdentity.changeAvatar });
    await expect(changeAvatar).toBeVisible();
    await changeAvatar.focus();
    await expect(changeAvatar).toBeFocused();

    const profileInput = page.locator('#profile-avatar-file');
    await expectHiddenGeometry(profileInput);
    await expect(profileInput).toHaveAccessibleName(
      profileIdentity.changeAvatar,
    );
    await expect(profileInput).toHaveAttribute('tabindex', '-1');

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }

    await page.goto('/story/memories/new');
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();
    await page.setViewportSize(VIEWPORTS[1]);
    await expectKeyboardFilePicker(page, 'memory-create-images');

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }

    await page.goto(`/story/heart-moments/${HEART_MOMENT_ID}/edit`);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: storyProducts.heartMomentProduct.editHeading,
      }),
    ).toBeVisible();
    await page.setViewportSize(VIEWPORTS[1]);
    await expectKeyboardFilePicker(page, 'heart-moment-edit-photo');

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }
  });
}
