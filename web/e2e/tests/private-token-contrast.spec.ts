import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const HEART_MOMENT_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-09T10:00:00Z';

async function installMocks(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];

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
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
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
      await fulfillJson({ items: [] });
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
        author: { displayName: 'Anna', id: ACCOUNT_ID },
        authorId: ACCOUNT_ID,
        capabilities: {
          canComment: false,
          canDelete: false,
          canEdit: false,
        },
        createdAt: TEST_NOW,
        emotion: 'LOVED',
        happenedOn: '2026-09-08',
        id: HEART_MOMENT_ID,
        spaceId: SPACE_ID,
        text: 'A quiet moment just for me',
        updatedAt: TEST_NOW,
        version: 1,
        visibility: 'OWNER_ONLY',
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
        detail: `The private contrast test did not define ${method} ${pathname}.`,
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

test('private visibility text remains WCAG AA on its semantic tinted surface', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installMocks(page);

  await page.goto(`/story/heart-moments/${HEART_MOMENT_ID}`);
  await signIn(page);
  await expect(page).toHaveURL(
    new RegExp(`/story/heart-moments/${HEART_MOMENT_ID}$`),
  );

  const badge = page.locator('.visibility-private');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('role', 'status');

  const result = await new AxeBuilder({ page })
    .include('.visibility-private')
    .withTags(['wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = result.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes.length} node(s)`,
    )
    .join('\n');
  expect(result.violations, summary || 'No axe violations').toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
