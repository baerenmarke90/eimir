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
      // One diary entry beyond the selection: only the Momentwolke shows it.
      await respond({
        items: [
          memory('world-diary', 'Breakfast on the balcony', '2026-09-20'),
        ],
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
  await expect(dialog.getByRole('radio')).toHaveCount(10);
  await expect(dialog.locator('.pro-mark')).toHaveCount(8);
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

test('Erinnerungen shows the Momentwolke with the loaded diary and opens a memory', async ({
  page,
}, info) => {
  await installMocks(page, true, 'cloud');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="cloud"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  // Three rediscovered memories plus the one diary entry, without duplicates.
  const cloud = world.getByRole('group', {
    name: worlds.cloud.label_other.replace('{{count}}', '4'),
  });
  await expect(cloud).toBeVisible();
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-cloud-390-light.png');
  await cloud.focus();
  await page.keyboard.press('Enter');
  const card = page.getByRole('dialog', { name: 'Morning by the lake' });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('button', { name: worlds.cloud.backToCloud }),
  ).toBeFocused();
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-cloud-card-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(cloud).toBeFocused();
});

test('Erinnerungen shows the Fotoautomat with its style switch beside the world switch', async ({
  page,
}, info) => {
  await installMocks(page, true, 'booth');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="booth"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  // The Klassisch/Modern switch sits in the row of the world switch entry.
  const row = page.locator('.memory-world-switch');
  const styles = row.getByRole('group', { name: worlds.booth.styleLabel });
  await expect(styles).toBeVisible();
  const classic = styles.getByRole('button', {
    name: worlds.booth.style.classic,
  });
  const modern = styles.getByRole('button', {
    name: worlds.booth.style.modern,
  });
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-booth-classic-390-light.png');
  await modern.click();
  await expect(modern).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-booth-modern-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  // The style is a device-local choice and survives a reload.
  await page.reload();
  await expect(
    page
      .locator('.memory-world-switch')
      .getByRole('button', { name: worlds.booth.style.modern }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Erinnerungen shows the Kühlschranktür; a note moves by keyboard and opens', async ({
  page,
}, info) => {
  await installMocks(page, true, 'fridge');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="fridge"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  await expect(
    world.getByRole('group', {
      name: worlds.fridge.label_other.replace('{{count}}', '3'),
    }),
  ).toBeVisible();
  // The notes are pinned up one by one; the door takes keys once it is idle.
  await expect(world.locator('[data-phase]').first()).toHaveAttribute(
    'data-phase',
    'idle',
    { timeout: 10_000 },
  );
  await capture(page, info, 'memory-worlds-fridge-390-light.png');
  const note = world.getByRole('button', { name: /Morning by the lake/ });
  await note.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByText(
      worlds.fridge.moved.right.replace('{{title}}', 'Morning by the lake'),
    ),
  ).toBeAttached();
  await page.keyboard.press('Enter');
  const card = page.getByRole('dialog');
  await expect(card).toBeVisible();
  await page.waitForTimeout(700);
  await capture(page, info, 'memory-worlds-fridge-card-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(note).toBeFocused();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(400);
  await capture(page, info, 'memory-worlds-fridge-390-dark.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-fridge-1280-dark.png');
});

test('Erinnerungen shows the Fotobuch and turns its pages by keyboard', async ({
  page,
}, info) => {
  await installMocks(page, true, 'album');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="album"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  const pageOf = (n: number) =>
    new RegExp(
      `^${worlds.album.label
        .replace('{{page}}', String(n))
        .replace('{{count}}', '[0-9]+')}$`,
    );
  const book = world.getByRole('group', { name: pageOf(1) });
  await expect(book).toBeVisible();
  await page.waitForTimeout(900);
  await capture(page, info, 'memory-worlds-album-cover-390-light.png');
  await book.focus();
  await page.keyboard.press('ArrowRight');
  await expect(world.getByRole('group', { name: pageOf(2) })).toBeVisible();
  await page.waitForTimeout(1200);
  await capture(page, info, 'memory-worlds-album-page-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Home');
  await expect(world.getByRole('group', { name: pageOf(1) })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(1200);
  await capture(page, info, 'memory-worlds-album-cover-390-dark.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-album-1280-dark.png');
});

test('Erinnerungen shows the Rubbellos and reveals a memory without scratching', async ({
  page,
}, info) => {
  await installMocks(page, true, 'scratch');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="scratch"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  const ticketPrefix = worlds.scratch.label.split('{{')[0];
  await expect(
    world.getByRole('group', { name: new RegExp(`^${ticketPrefix}`) }),
  ).toBeVisible();
  await page.waitForTimeout(900);
  await capture(page, info, 'memory-worlds-scratch-390-light.png');
  // The keyboard and screen-reader alternative to scratching.
  await world.getByRole('button', { name: worlds.scratch.reveal }).click();
  await expect(
    world.getByRole('link', {
      name: new RegExp(worlds.scratch.openLabel.split('{{')[0]),
    }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await capture(page, info, 'memory-worlds-scratch-revealed-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await capture(page, info, 'memory-worlds-scratch-revealed-390-dark.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-scratch-1280-dark.png');
});

test('Erinnerungen shows the Mochis; an action sends up a memory to open', async ({
  page,
}, info) => {
  await installMocks(page, true, 'mochi');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="mochi"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  await expect(
    world.getByRole('group', { name: worlds.mochi.label }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-mochi-390-light.png');
  const actions = world.getByRole('group', { name: worlds.mochi.actions });
  // The action row is the keyboard alternative to the touch gestures and
  // shows while one of its buttons has focus.
  const hug = actions.getByRole('button', { name: worlds.mochi.action.hug });
  await hug.focus();
  await expect(hug).toBeVisible();
  await page.keyboard.press('Enter');
  // A heart balloon with a memory rises and can be opened.
  await expect(
    world
      .getByRole('link', {
        name: /Morning by the lake|Winter evening|Our first apartment/,
      })
      .first(),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-mochi-after-hug-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.waitForTimeout(400);
  await capture(page, info, 'memory-worlds-mochi-390-dark.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-mochi-1280-dark.png');
});

test('Erinnerungen shows the Sternbild; arrow keys move along the stars', async ({
  page,
}, info) => {
  await installMocks(page, true, 'stars');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/story?tab=discover');
  const world = page.locator('.memory-world[data-world="stars"]');
  await expect(world).toBeVisible();
  await expect(page.locator('.memory-world-stage')).toHaveAttribute(
    'data-entered',
    'true',
  );
  const sky = world.getByRole('group', { name: worlds.stars.label });
  await expect(sky).toBeVisible();
  await page.waitForTimeout(900);
  await capture(page, info, 'memory-worlds-stars-390-light.png');
  // The lit star's memory waits on the card below and can be opened.
  await expect(
    world
      .getByRole('link', {
        name: new RegExp(worlds.stars.open.split('{{')[0]),
      })
      .first(),
  ).toBeVisible();
  const first = sky.getByRole('button').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(sky.locator('[aria-pressed="true"]')).toHaveCount(1);
  await page.waitForTimeout(900);
  await capture(page, info, 'memory-worlds-stars-moved-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.memory-world')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await capture(page, info, 'memory-worlds-stars-390-dark.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(600);
  await capture(page, info, 'memory-worlds-stars-1280-dark.png');
});
