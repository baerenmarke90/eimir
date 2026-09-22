import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import demoDe from '../../src/i18n/locales/demo';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PROFILE_ID = '00000000-0000-0000-0000-000000000020';
const COLLECTION_ID = '00000000-0000-0000-0000-000000000050';
const ITEM_ID = '00000000-0000-0000-0000-000000000051';
const TEST_NOW = '2026-09-01T10:00:00Z';

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
}

test.describe('Browser Session Reload and Deep Route Restoration', () => {
  test('restores deep protected route on real page reload without login flash or session loss', async ({
    page,
  }) => {
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

      if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
        await fulfillJson({
          account: { displayName: 'Anna', id: ACCOUNT_ID },
          tokens: {
            accessExpiresAt: '2026-09-01T11:00:00Z',
            accessToken: 'session-access-token',
            refreshExpiresAt: '2026-09-08T10:00:00Z',
            refreshToken: 'session-refresh-token',
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        await fulfillJson({
          id: ACCOUNT_ID,
          displayName: 'Anna',
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
        await fulfillJson({
          accessExpiresAt: '2026-09-01T11:00:00Z',
          accessToken: 'session-access-token-refreshed',
          refreshExpiresAt: '2026-09-08T10:00:00Z',
          refreshToken: 'session-refresh-token-refreshed',
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

      if (
        method === 'GET' &&
        pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)
      ) {
        const isPartner = pathname.endsWith(PARTNER_ID);
        await fulfillJson({
          accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
          createdAt: TEST_NOW,
          displayName: isPartner ? 'Ben' : 'Anna',
          id: isPartner ? '00000000-0000-0000-0000-000000000022' : PROFILE_ID,
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
        pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
      ) {
        await fulfillJson({
          space: {
            spaceId: SPACE_ID,
            partner: {
              id: '00000000-0000-0000-0000-000000000002',
              displayName: 'Ben',
            },
          },
          relationshipDuration: null,
          retrospective: null,
          recentShared: [],
          upcoming: [],
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname ===
          `/api/v1/spaces/${SPACE_ID}/private/collections/${COLLECTION_ID}`
      ) {
        await fulfillJson({
          id: COLLECTION_ID,
          spaceId: SPACE_ID,
          title: 'Summer vacation checklist',
          icon: '🧳',
          version: 1,
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
          capabilities: {
            canEdit: true,
            canDelete: true,
          },
          items: [
            {
              id: ITEM_ID,
              collectionId: COLLECTION_ID,
              title: 'Passport and boarding pass',
              completed: false,
              position: 0,
              version: 1,
              createdAt: TEST_NOW,
              updatedAt: TEST_NOW,
            },
          ],
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/sign-out') {
        await fulfillJson({}, 204);
        return;
      }

      if (
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
      ) {
        await fulfillJson({ unreadCount: 0 });
        return;
      }

      await route.fallback();
    });

    // 1. Initial sign-in via UI
    await page.goto('/');
    await signIn(page);

    // 2. Open protected deep route
    const deepPath = `/more/private/collections/${COLLECTION_ID}`;
    await page.goto(deepPath);

    // 3. Confirm protected content is visible
    await expect(
      page.getByRole('heading', { name: 'Summer vacation checklist' }),
    ).toBeVisible();
    await expect(page.locator('.private-collection-item-title')).toHaveText(
      'Passport and boarding pass',
    );

    const currentUrl = page.url();
    expect(currentUrl).toContain(deepPath);

    // 4. Perform actual browser reload
    await page.reload();

    // 5. Verify exact route is preserved
    expect(page.url()).toBe(currentUrl);

    // 6. Verify protected content remains visible after reload
    await expect(
      page.getByRole('heading', { name: 'Summer vacation checklist' }),
    ).toBeVisible();
    await expect(page.locator('.private-collection-item-title')).toHaveText(
      'Passport and boarding pass',
    );

    // 7. Verify login screen was never shown
    await expect(page.getByLabel(de.login.email)).not.toBeVisible();
  });

  test('stays logged out after user sign-out followed by real page reload', async ({
    page,
  }) => {
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

      if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
        await fulfillJson({
          account: { displayName: 'Anna', id: ACCOUNT_ID },
          tokens: {
            accessExpiresAt: '2026-09-01T11:00:00Z',
            accessToken: 'session-access-token',
            refreshExpiresAt: '2026-09-08T10:00:00Z',
            refreshToken: 'session-refresh-token',
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        await fulfillJson({
          id: ACCOUNT_ID,
          displayName: 'Anna',
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

      if (
        method === 'GET' &&
        pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)
      ) {
        const isPartner = pathname.endsWith(PARTNER_ID);
        await fulfillJson({
          accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
          createdAt: TEST_NOW,
          displayName: isPartner ? 'Ben' : 'Anna',
          id: isPartner ? '00000000-0000-0000-0000-000000000022' : PROFILE_ID,
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
        pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
      ) {
        await fulfillJson({
          space: {
            spaceId: SPACE_ID,
            partner: {
              id: '00000000-0000-0000-0000-000000000002',
              displayName: 'Ben',
            },
          },
          relationshipDuration: null,
          retrospective: null,
          recentShared: [],
          upcoming: [],
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/sign-out') {
        await fulfillJson({}, 204);
        return;
      }

      if (
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
      ) {
        await fulfillJson({ unreadCount: 0 });
        return;
      }

      await route.fallback();
    });

    // 1. Initial sign-in
    await page.goto('/');
    await signIn(page);

    // 2. Open header profile menu and click logout
    const menuButton = page.getByRole('button', {
      name: navigation.profileMenu,
    });
    await menuButton.click();
    const logoutButton = page.getByRole('button', { name: de.header.logout });
    await logoutButton.click();

    // 3. Confirm login screen is visible
    await expect(page.getByLabel(de.login.email)).toBeVisible({
      timeout: 10000,
    });

    // 4. Perform actual browser reload
    await page.reload();

    // 5. Confirm user remains logged out after reload
    await expect(page.getByLabel(de.login.email)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('heading', { name: 'Summer vacation checklist' }),
    ).not.toBeVisible();
  });

  test('handles full demo flow: person selection, magic-link callback, deep route, and page reload', async ({
    page,
  }) => {
    const DEMO_TOKEN = 'demo-magic-token-lea';
    const DEMO_LEA_ACCOUNT_ID = '00000000-0000-0000-0000-000000000099';
    const DEMO_ALEX_PARTNER_ID = '00000000-0000-0000-0000-000000000098';

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

      // 1. Demo Entry request
      if (method === 'POST' && pathname === '/api/v1/demo/entry') {
        await fulfillJson({ token: DEMO_TOKEN });
        return;
      }

      // 2. Magic Link Consume
      if (method === 'POST' && pathname === '/api/v1/auth/magic-link/consume') {
        const body = request.postDataJSON() as { token?: string };
        expect(body?.token).toBe(DEMO_TOKEN);
        await fulfillJson({
          account: { displayName: 'Lea', id: DEMO_LEA_ACCOUNT_ID },
          tokens: {
            accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            accessToken: 'demo-access-token',
            refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
            refreshToken: 'demo-refresh-token',
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
        await fulfillJson({
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'demo-access-token-refreshed',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'demo-refresh-token-refreshed',
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        await fulfillJson({
          id: DEMO_LEA_ACCOUNT_ID,
          displayName: 'Lea',
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

      if (
        method === 'GET' &&
        pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)
      ) {
        const isPartner = pathname.endsWith(DEMO_ALEX_PARTNER_ID);
        await fulfillJson({
          accountId: isPartner ? DEMO_ALEX_PARTNER_ID : DEMO_LEA_ACCOUNT_ID,
          createdAt: TEST_NOW,
          displayName: isPartner ? 'Alex' : 'Lea',
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
        pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
      ) {
        await fulfillJson({
          space: {
            spaceId: SPACE_ID,
            partner: { id: DEMO_ALEX_PARTNER_ID, displayName: 'Alex' },
          },
          relationshipDuration: null,
          retrospective: null,
          recentShared: [],
          upcoming: [],
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname ===
          `/api/v1/spaces/${SPACE_ID}/private/collections/${COLLECTION_ID}`
      ) {
        await fulfillJson({
          id: COLLECTION_ID,
          spaceId: SPACE_ID,
          title: 'Summer vacation checklist',
          icon: '🧳',
          version: 1,
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
          capabilities: {
            canEdit: true,
            canDelete: true,
          },
          items: [
            {
              id: ITEM_ID,
              collectionId: COLLECTION_ID,
              title: 'Passport and boarding pass',
              completed: false,
              position: 0,
              version: 1,
              createdAt: TEST_NOW,
              updatedAt: TEST_NOW,
            },
          ],
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

      await route.fallback();
    });

    // 1. Open app in demo mode
    await page.addInitScript(() => {
      window.sessionStorage.setItem('eimir-demo-mode', 'true');
    });
    await page.goto('/');

    // 2. DemoEntry is visible (Lea persona button)
    const leaButton = page.getByRole('button', { name: demoDe.joinLea });
    await expect(leaButton).toBeVisible();

    // 3. Click Lea -> calls demo entry and redirects to /auth/magic-link?token=...
    await leaButton.click();

    // 4. Verify magic-link callback is processed and app opens (Today dashboard or default route).
    // Today owns the page H1; Couple Presence remains the relationship hero below it.
    await expect(
      page.getByRole('heading', { name: m5s5.today.headerTitle, level: 1 }),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page
        .locator('.couple-presence-card')
        .getByRole('heading', { name: /Alex/i, level: 2 }),
    ).toBeVisible();
    // DemoEntry person picker is gone
    await expect(
      page.getByRole('button', { name: demoDe.joinLea }),
    ).not.toBeVisible();

    // 5. Navigate to deep protected route
    await page.goto(`/more/private/collections/${COLLECTION_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Summer vacation checklist' }),
    ).toBeVisible({ timeout: 10000 });

    // 6. Perform actual browser reload
    await page.reload();

    // 7. Verify same route remains and demo session stays active
    await expect(
      page.getByRole('heading', { name: 'Summer vacation checklist' }),
    ).toBeVisible({ timeout: 10000 });
    // DemoEntry person picker does NOT appear
    await expect(
      page.getByRole('button', { name: demoDe.joinLea }),
    ).not.toBeVisible();
    await expect(page.getByLabel(de.login.email)).not.toBeVisible();
  });
});
