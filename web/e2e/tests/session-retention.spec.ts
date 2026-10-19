import { expect, test } from '@playwright/test';
import { fulfillDefaultAppIcon } from '../support/appIcon';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alex',
};
const spaceId = '22222222-2222-4222-8222-222222222222';
const sessionKey = 'eimir-session-v1';

for (const rejected of [false, true]) {
  test(`restoration keeps credentials during an outage and clears only definitive rejection: ${rejected}`, async ({
    page,
  }) => {
    let recovered = false;
    let refreshes = 0;
    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, json: body });
      if (
        path === '/api/v1/instance/status' ||
        path === '/api/v1/auth/instance-access'
      ) {
        return json({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
      }
      if (path === '/api/v1/auth/refresh') {
        refreshes += 1;
        if (!recovered)
          return json(
            { code: 'UNAUTHENTICATED', title: 'Unavailable' },
            rejected ? 401 : 503,
          );
        return json({
          accessToken: 'rotated-access',
          refreshToken: 'rotated-refresh',
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
      }
      if (path === '/api/v1/auth/me') return json(account);
      if (path === '/api/v1/auth/capabilities')
        return json({ serverAdmin: false });
      if (path === '/api/v1/auth/memberships')
        return json([
          { accountId: account.id, spaceId, status: 'ACTIVE', role: 'MEMBER' },
        ]);
      const space = {
        id: spaceId,
        createdAt: '2026-10-01T12:00:00Z',
        partners: [account],
      };
      if (path === '/api/v1/spaces') return json([space]);
      if (path === `/api/v1/spaces/${spaceId}`) return json(space);
      if (path.includes('/profile-identity/'))
        return json({
          accountId: account.id,
          displayName: 'Alex',
          profileAttachmentId: null,
          version: 1,
        });
      if (path.endsWith('/partner-nickname'))
        return json({ nickname: null, version: 0 });
      return json({ code: 'NOT_FOUND', title: 'Not found' }, 404);
    });
    await page.goto('/');
    await page.evaluate(
      ({ account, spaceId, sessionKey }) => {
        window.sessionStorage.setItem(
          sessionKey,
          JSON.stringify({
            account,
            spaceId,
            tokens: {
              accessToken: 'expired-access',
              refreshToken: 'retained-refresh',
              accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
              refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          }),
        );
      },
      { account, spaceId, sessionKey },
    );
    await page.goto('/more/settings');
    await expect.poll(() => refreshes).toBeGreaterThan(0);
    if (rejected) {
      await expect
        .poll(() =>
          page.evaluate((key) => sessionStorage.getItem(key), sessionKey),
        )
        .toBeNull();
      await expect(page.locator('.product-shell')).toHaveCount(0);
      return;
    }
    await expect(page.locator('.product-shell')).toBeVisible();
    expect(
      await page.evaluate(
        (key) => JSON.parse(sessionStorage.getItem(key)!).tokens.refreshToken,
        sessionKey,
      ),
    ).toBe('retained-refresh');
    recovered = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(sessionStorage.getItem(key)!).tokens.refreshToken,
          sessionKey,
        ),
      )
      .toBe('rotated-refresh');
    await page.reload();
    await expect(page.locator('.product-shell')).toBeVisible();
    expect(
      await page.evaluate(
        (key) => JSON.parse(sessionStorage.getItem(key)!).tokens.refreshToken,
        sessionKey,
      ),
    ).toBe('rotated-refresh');
    if (process.env.VISUAL_EVIDENCE_DIR) {
      for (const [name, width, height, colorScheme] of [
        ['compact-light', 390, 844, 'light'],
        ['expanded-dark', 1280, 900, 'dark'],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.screenshot({
          path: `${process.env.VISUAL_EVIDENCE_DIR}/${name}.png`,
        });
      }
    }
  });
}
