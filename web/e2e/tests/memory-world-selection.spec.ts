import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '../support/axe';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/memoryWorldSettings';
import worlds from '../../src/i18n/locales/memoryWorlds';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillDefaultProductContext } from '../support/productContext';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';

async function signIn(page: Page, path = '/more/settings/appearance') {
  await page.goto(path);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  if (path.startsWith('/more/'))
    await expect(page.getByRole('button', { name: copy.change })).toBeVisible();
}

const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

function memory(id: string, title: string, happenedOn: string) {
  return {
    kind: 'MEMORY',
    effectiveDate: `${happenedOn}T18:00:00Z`,
    memory: {
      id,
      title,
      body: 'A quiet evening worth rediscovering.',
      happenedOn,
      createdAt: `${happenedOn}T18:00:00Z`,
      author: { id: ACCOUNT_ID, displayName: 'Lea' },
      capabilities: CAPABILITIES,
      visibility: 'SHARED',
      attachments: [],
    },
  };
}

/** The rediscovery selection the worlds present (no photos: no media requests). */
const DISCOVER = {
  selectionDate: '2026-09-26',
  lead: memory('world-lead', 'Morning by the lake', '2025-09-26'),
  leadContext: null,
  items: [
    memory('world-second', 'Winter evening', '2025-02-14'),
    memory('world-third', 'Our first apartment', '2024-11-18'),
  ],
};

async function capture(page: Page, info: TestInfo, name: string) {
  const output = info.outputPath(name);
  await page.screenshot({ path: output });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

async function installMocks(
  page: Page,
  pro: boolean,
  initialWorld = 'story',
): Promise<string[]> {
  let worldId = initialWorld;
  let version = initialWorld === 'story' ? 0 : 1;
  const writes: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    // The world choice is stateful here, ahead of the shared default.
    if (pathname.endsWith('/appearance/memory-world')) {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON() as { worldId: string };
        writes.push(body.worldId);
        expect(request.headers()['if-match']).toBe(`"world:${version}"`);
        if (body.worldId === 'crate' && !pro)
          throw new Error('Unexpected paid write from Free UI');
        worldId = body.worldId;
        version += 1;
      }
      await route.fulfill({
        json: { worldId, version },
        headers: { ETag: `"world:${version}"` },
      });
      return;
    }
    if (await fulfillDefaultProductContext(route)) return;
    if (
      /\/appearance\/(app-icon|wir-design)$/.test(pathname) &&
      (await fulfillDefaultAppIcon(route))
    )
      return;
    const respond = async (body: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (pathname.endsWith('/partner-nickname')) {
      await respond({ nickname: null, partnerId: PARTNER_ID, version: 0 });
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await respond({
        account: { id: ACCOUNT_ID, displayName: 'Lea' },
        tokens: {
          accessToken: 'tour-access-token',
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          refreshToken: 'tour-refresh-token',
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
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      });
      return;
    }
    if (pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)) {
      const partner = pathname.endsWith(PARTNER_ID);
      await respond({
        id: partner ? PARTNER_ID : ACCOUNT_ID,
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        displayName: partner ? 'Alex' : 'Lea',
        birthday: null,
        profileAttachmentId: null,
        preferences: [],
        version: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });
      return;
    }
    if (pathname.endsWith('/notifications/unread-count')) {
      await respond({ unreadCount: 0 });
      return;
    }
    if (pathname.endsWith('/entitlements')) {
      await respond({
        spaceId: SPACE_ID,
        capabilities: pro ? ['theme.bespoke_packs'] : [],
        isInGracePeriod: false,
        tier: pro ? 'PREMIUM' : 'FREE',
        status: 'ACTIVE',
      });
      return;
    }
    if (pathname.endsWith('/daily-quote')) {
      await respond({ checkedOn: '2026-09-26', enabled: false, quote: null });
      return;
    }
    if (pathname.endsWith('/discover')) {
      await respond(DISCOVER);
      return;
    }
    if (pathname.endsWith('/recaps')) {
      await respond({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
      return;
    }
    if (pathname.endsWith('/timeline')) {
      await respond({
        items: [],
        availableYears: [],
        hasMore: false,
        nextCursor: null,
      });
      return;
    }
    if (pathname.endsWith('/dashboard')) {
      await respond({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex' },
        },
        relationshipDuration: null,
        retrospective: null,
        upcoming: [],
        recentShared: [],
        sharedStorySummary: { memories: 0, heartMoments: 0, milestones: 0 },
      });
      return;
    }
    throw new Error(
      `Unexpected memory-world journey request: ${request.method()} ${pathname}`,
    );
  });
  return writes;
}

const crate = copy.worlds.crate.name;
const stack = copy.worlds.stack.name;
const story = copy.worlds.story.name;

test('Free sees every world, keeps Pro worlds unsaved and saves Stapel', async ({
  page,
}, info) => {
  const writes = await installMocks(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.locator('.memory-world-summary strong')).toHaveText(story);
  await capture(page, info, 'memory-worlds-free-390-light.png');
  const opener = page.getByRole('button', { name: copy.change });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await expect(dialog.getByRole('radio')).toHaveCount(3);
  await expect(dialog.locator('.pro-mark')).toHaveCount(1);
  await dialog.getByRole('radio', { name: new RegExp(crate) }).check();
  await expect(
    dialog.getByRole('button', { name: copy.discover }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await capture(page, info, 'memory-worlds-free-pro-preview-390-light.png');
  await dialog.getByRole('radio', { name: new RegExp(stack) }).check();
  await dialog
    .getByRole('button', { name: copy.choose.replace('{{name}}', stack) })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual(['stack']);
  await expect(page.locator('.memory-world-summary strong')).toHaveText(stack);
  await expect(opener).toBeFocused();
});

test('Pro saves the Plattenkiste, keeps it after reload and returns to Story', async ({
  page,
}, info) => {
  const writes = await installMocks(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page);
  await page.getByRole('button', { name: copy.change }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await dialog.getByRole('radio', { name: new RegExp(crate) }).check();
  await dialog
    .getByRole('button', { name: copy.choose.replace('{{name}}', crate) })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual(['crate']);
  await capture(page, info, 'memory-worlds-pro-saved-390-dark.png');
  await page.reload();
  await expect(page.locator('.memory-world-summary strong')).toHaveText(crate);
  await page.getByRole('button', { name: copy.change }).click();
  await dialog.getByRole('radio', { name: new RegExp(story) }).check();
  await dialog
    .getByRole('button', { name: copy.choose.replace('{{name}}', story) })
    .click();
  expect(writes).toEqual(['crate', 'story']);
});

test('a kept Pro world after a downgrade is named and stays selected', async ({
  page,
}) => {
  const writes = await installMocks(page, false, 'crate');
  await signIn(page);
  await expect(page.locator('.memory-world-summary strong')).toHaveText(crate);
  // Opening the sheet reads Pro; the summary then names the kept world.
  await page.getByRole('button', { name: copy.change }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await expect(
    dialog.getByRole('radio', { name: new RegExp(crate) }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(copy.kept.replace('{{name}}', crate), { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

test('world sheet reflows at 320, 430 and Expanded with reduced motion and large text', async ({
  page,
}, info) => {
  await installMocks(page, true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await page.getByRole('button', { name: copy.change }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  for (const size of [
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await dialog.getByRole('radio', { name: new RegExp(crate) }).check();
    await expect(
      dialog.getByRole('button', {
        name: copy.choose.replace('{{name}}', crate),
      }),
    ).toBeVisible();
    const geometry = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    await capture(page, info, `memory-worlds-pro-${size.width}-light.png`);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(
    dialog.getByRole('button', {
      name: copy.choose.replace('{{name}}', crate),
    }),
  ).toBeVisible();
  await capture(page, info, 'memory-worlds-pro-360-large-text.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world-sheet')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('Erinnerungen shows the saved world and its switch leads to the setting', async ({
  page,
}, info) => {
  await installMocks(page, true, 'crate');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="crate"]');
  await expect(world).toBeVisible();
  // The loading card cross-fades into the world once it is painted.
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  const crateGroup = world.getByRole('group', {
    name: worlds.crate.label_other.replace('{{count}}', '3'),
  });
  await expect(crateGroup).toBeVisible();
  await crateGroup.focus();
  await page.keyboard.press('Enter');
  await expect(world.locator('.memory-crate-deck')).toHaveAttribute(
    'data-phase',
    'playing',
    // The record is pulled, flown and lowered in one ~2.5 s timeline.
    { timeout: 10_000 },
  );
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-crate-playing-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page
    .getByRole('link', {
      name: copy.switchWorldCurrent.replace('{{name}}', crate),
    })
    .click();
  await expect(page).toHaveURL(
    /\/more\/settings\/appearance#erinnerungswelten$/,
  );
  await expect(page.locator('.memory-world-summary strong')).toHaveText(crate);
});

test('Erinnerungen shows the Stapel with its position', async ({
  page,
}, info) => {
  await installMocks(page, false, 'stack');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="stack"]');
  await expect(world).toBeVisible();
  // The loading card cross-fades into the world once it is painted.
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  await expect(
    world.getByText(
      worlds.stack.position
        .replace('{{position}}', '1')
        .replace('{{count}}', '3'),
    ),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-stack-390-dark.png');
});
