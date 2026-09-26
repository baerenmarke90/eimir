import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import profiles from '../../src/i18n/locales/profiles';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';

async function capture(
  page: Page,
  info: TestInfo,
  fileName: string,
): Promise<void> {
  const output = info.outputPath(fileName);
  await page.screenshot({ path: output });
  const exportDir = process.env.VISUAL_EVIDENCE_DIR;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(output, path.join(exportDir, fileName));
  }
}

async function installMocks(
  page: Page,
): Promise<{ writes: Array<string | null> }> {
  let nickname: string | null = null;
  let version = 0;
  const writes: Array<string | null> = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (request.method() === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await respond({
        account: { id: ACCOUNT_ID, displayName: 'Lea' },
        tokens: {
          accessToken: 'nickname-access-token',
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          refreshToken: 'nickname-refresh-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        },
      });
      return;
    }
    if (pathname === '/api/v1/instance/status') {
      await respond({
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
    if (pathname === '/api/v1/auth/me') {
      await respond({ id: ACCOUNT_ID, displayName: 'Lea' });
      return;
    }
    if (pathname === '/api/v1/auth/capabilities') {
      await respond({ serverAdmin: false });
      return;
    }
    if (pathname === '/api/v1/auth/memberships') {
      await respond([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await respond({
        id: SPACE_ID,
        createdAt: '2025-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex Winter' },
        ],
      });
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/partner-nickname`) {
      if (request.method() === 'PUT') {
        if (request.headers()['if-match'] !== `"${version}"`) {
          await respond({ code: 'VERSION_CONFLICT', title: 'Conflict' }, 409);
          return;
        }
        nickname = (request.postDataJSON() as { nickname: string | null })
          .nickname;
        version += 1;
        writes.push(nickname);
      }
      await respond({ partnerId: PARTNER_ID, nickname, version });
      return;
    }
    if (pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)) {
      const partner = pathname.endsWith(PARTNER_ID);
      await respond({
        id: partner ? PARTNER_ID : ACCOUNT_ID,
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        displayName: partner ? 'Alex Winter' : 'Lea',
        birthday: null,
        profileAttachmentId: null,
        preferences: [],
        version: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await respond({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2025-01-01',
        showRelationshipDuration: true,
        durationDisplayMode: 'YEARS_MONTHS',
      });
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`) {
      await respond([]);
      return;
    }
    if (pathname.endsWith('/notifications/unread-count')) {
      await respond({ unreadCount: 0 });
      return;
    }
    if (pathname.endsWith('/entitlements')) {
      await respond({
        capabilities: ['daily.quote'],
        isInGracePeriod: false,
        tier: 'PREMIUM',
        status: 'ACTIVE',
      });
      return;
    }
    if (pathname.endsWith('/daily-quote')) {
      await respond({ checkedOn: '2026-09-26', enabled: false, quote: null });
      return;
    }
    if (pathname.endsWith('/dashboard')) {
      await respond({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex Winter' },
        },
        relationshipDuration: { daysTogether: 633, startedOn: '2025-01-01' },
        retrospective: null,
        upcoming: [],
        recentShared: [],
        sharedStorySummary: { memories: 0, heartMoments: 0, milestones: 0 },
      });
      return;
    }
    await respond({ items: [], nextCursor: null, hasMore: false });
  });
  return { writes };
}

test('partner nickname remains private to the viewer and follows profile edits into Wir', async ({
  page,
}, info) => {
  const fixture = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/more/profile');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/more\/profile$/);

  const editor = page.locator('.partner-nickname');
  await expect(
    editor.getByRole('heading', {
      name: profiles.nickname.title.replace('{{name}}', 'Alex'),
    }),
  ).toBeVisible();
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, 'nickname-profile-390-light-before.png');
  await editor.getByRole('button', { name: profiles.nickname.add }).click();
  await editor
    .getByRole('textbox', {
      name: profiles.nickname.inputLabel.replace('{{name}}', 'Alex'),
    })
    .fill('Sternchen');
  await capture(page, info, 'nickname-profile-390-light-edit.png');
  await editor.getByRole('button', { name: profiles.nickname.save }).click();
  await expect(editor.getByText('Sternchen')).toBeVisible();
  expect(fixture.writes).toEqual(['Sternchen']);
  await capture(page, info, 'nickname-profile-390-light-saved.png');

  await page.setViewportSize({ width: 430, height: 932 });
  await capture(page, info, 'nickname-profile-430-light-saved.png');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.localStorage.setItem('eimir.theme', 'dark');
  });
  await page.reload();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await editor.scrollIntoViewIfNeeded();
  await expect(
    editor.getByRole('button', { name: profiles.nickname.edit }),
  ).toBeVisible();
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await capture(
    page,
    info,
    'nickname-profile-360-dark-large-text-reduced-motion.png',
  );

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
    window.localStorage.setItem('eimir.theme', 'light');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await page.goto('/today');
  await expect(page.getByText('Lea & Sternchen')).toBeVisible();
  await capture(page, info, 'nickname-wir-390-light.png');

  await page.goto('/more/profile');
  await editor.getByRole('button', { name: profiles.nickname.edit }).click();
  await editor.getByRole('button', { name: profiles.nickname.remove }).click();
  await expect(
    editor.getByText(profiles.nickname.fallback.replace('{{name}}', 'Alex')),
  ).toBeVisible();
  expect(fixture.writes).toEqual(['Sternchen', null]);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.localStorage.setItem('eimir.theme', 'dark'));
  await page.reload();
  await editor.scrollIntoViewIfNeeded();
  await capture(page, info, 'nickname-profile-1280-dark-removed.png');
});
