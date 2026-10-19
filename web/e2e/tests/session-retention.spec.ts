import { expect, test } from '@playwright/test';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import de from '../../src/i18n/locales/de';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alex',
};
const spaceId = '22222222-2222-4222-8222-222222222222';
const sessionKey = 'eimir-session-v1';

for (const mode of ['proactive', 'resume', 'outage'] as const) {
  for (const width of [390, 1280]) {
    test(`keeps and saves a memory draft across ${mode} rotation at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({
        reducedMotion: 'reduce',
        colorScheme: width === 390 ? 'light' : 'dark',
      });
      let accessToken = 'initial-access';
      let recovered = mode !== 'outage';
      let refreshes = 0;
      let saves = 0;
      let memory: Record<string, unknown> | null = null;
      const memoryId = '33333333-3333-4333-8333-333333333333';
      const staleRequests: string[] = [];
      await page.clock.install();
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const json = (body: unknown, status = 200) =>
          route.fulfill({ status, json: body });
        if (path === '/api/v1/auth/refresh') {
          if (!recovered)
            return json({ title: 'Temporarily unavailable' }, 503);
          refreshes += 1;
          accessToken = 'rotated-access';
          return json({
            accessToken,
            refreshToken: 'rotated-refresh',
            accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          });
        }
        if (
          path === '/api/v1/auth/instance-access' ||
          path === '/api/v1/instance/status'
        ) {
          return json({
            maintenanceMode: false,
            registrationAvailable: true,
            accountCreation: 'self_service',
            auth: {
              localPassword: true,
              magicLink: true,
              oidc: false,
              passkey: false,
            },
          });
        }
        if (request.headers().authorization !== `Bearer ${accessToken}`) {
          staleRequests.push(path);
          return json(
            {
              code: 'AUTHENTICATION_REQUIRED',
              title: 'Authentication required',
            },
            401,
          );
        }
        if (await fulfillDefaultAppIcon(route)) return;
        if (path === '/api/v1/auth/me') return json(account);
        if (path === '/api/v1/auth/capabilities')
          return json({ serverAdmin: false });
        if (path === '/api/v1/auth/memberships')
          return json([
            {
              accountId: account.id,
              spaceId,
              status: 'ACTIVE',
              role: 'MEMBER',
            },
          ]);
        if (path.includes('/profile-identity/'))
          return json({
            accountId: account.id,
            displayName: 'Alex',
            profileAttachmentId: null,
            version: 1,
          });
        if (path.endsWith('/partner-nickname'))
          return json({ nickname: null, version: 0 });
        if (path.endsWith('/notifications/unread-count'))
          return json({ unreadCount: 0 });
        if (
          path === `/api/v1/spaces/${spaceId}/memories` &&
          request.method() === 'POST'
        ) {
          saves += 1;
          memory = {
            ...request.postDataJSON(),
            id: memoryId,
            spaceId,
            authorId: account.id,
            author: { accountId: account.id, displayName: 'Alex' },
            attachments: [],
            version: 1,
            capabilities: { canEdit: true, canDelete: true },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return json(memory, 201);
        }
        if (path === `/api/v1/spaces/${spaceId}/memories/${memoryId}`)
          return json(memory);
        return json({ code: 'NOT_FOUND', title: 'Not found' }, 404);
      });
      await page.goto('/');
      await page.evaluate(
        ({ account, spaceId, sessionKey }) => {
          sessionStorage.setItem(
            sessionKey,
            JSON.stringify({
              account,
              spaceId,
              tokens: {
                accessToken: 'initial-access',
                refreshToken: 'initial-refresh',
                accessExpiresAt: new Date(Date.now() + 120_000).toISOString(),
                refreshExpiresAt: new Date(
                  Date.now() + 86_400_000,
                ).toISOString(),
              },
            }),
          );
        },
        { account, spaceId, sessionKey },
      );
      await page.goto('/story/memories/new');
      await page
        .getByLabel(de.memory.bodyLabel, { exact: true })
        .fill('Keep this memory while I am still writing.');
      if (mode !== 'resume') {
        await page.clock.runFor(61_000);
        if (mode === 'outage') {
          await expect(
            page.getByLabel(de.memory.bodyLabel, { exact: true }),
          ).toHaveValue('Keep this memory while I am still writing.');
          recovered = true;
          await page.evaluate(() => window.dispatchEvent(new Event('online')));
        }
      } else {
        await page.clock.setSystemTime(new Date(Date.now() + 20 * 60_000));
        await page.evaluate(() => {
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('focus'));
          window.dispatchEvent(new Event('online'));
        });
      }
      await expect.poll(() => refreshes).toBe(1);
      await expect(
        page.getByLabel(de.memory.bodyLabel, { exact: true }),
      ).toHaveValue('Keep this memory while I am still writing.');
      expect(staleRequests).toEqual([]);
      if (process.env.VISUAL_EVIDENCE_DIR) {
        await page.screenshot({
          path: `${process.env.VISUAL_EVIDENCE_DIR}/${mode}-${width}.png`,
        });
      }
      await page
        .getByRole('button', { name: de.memory.save, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/story/memories/${memoryId}$`));
      await expect(
        page.getByText('Keep this memory while I am still writing.', {
          exact: true,
        }),
      ).toBeVisible();
      expect(saves).toBe(1);
      expect(refreshes).toBe(1);
      expect(staleRequests).toEqual([]);
    });
  }
}

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
    // Cold restoration has no verified membership cache. An unavailable
    // refresh must retain credentials and expose a recoverable server state.
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
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
