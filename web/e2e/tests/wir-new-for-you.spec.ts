import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type Route, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import wirNotices from '../../src/i18n/locales/wirNotices';
import reelCopy from '../../src/i18n/locales/wirReelStyleSettings';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { waitForSettledMotion } from '../support/settledMotion';

/**
 * #2345 B (Product Owner 2026-11-27): the `wirNotices` reel on Wir - today's plan
 * first, then what is new, newest first, as a swipeable reel with real
 * previews; the waiting games as tiles; new cards arrive once per device
 * (variant C); opening a tile reads it everywhere. Evidence at ~360/390/430
 * in Light and Dark, and with reduced motion.
 */

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';
const SPACE = `/api/v1/spaces/${SPACE_ID}`;
const NOW = new Date('2026-11-27T10:00:00+01:00');

function notice(id: string, kind: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    sourceEventId: `${id}-event`,
    kind,
    actorId: PARTNER_ID,
    actor: { id: PARTNER_ID, displayName: 'Ben' },
    targetType: null,
    targetId: null,
    target: null,
    createdAt: '2026-11-27T08:00:00Z',
    readAt: null,
    preview: null,
    ...extra,
  };
}

const LIST = notice('00000000-0000-4000-8000-0000000000a1', 'COLLECTION_SENT', {
  targetType: 'COLLECTION',
  targetId: '00000000-0000-4000-8000-0000000000b1',
  target: {
    targetType: 'COLLECTION',
    targetId: '00000000-0000-4000-8000-0000000000b1',
    title: 'Weekend shopping',
  },
  preview: { items: ['Strawberries', 'Baguette', 'Cheese'], moreItems: 4 },
});
const DATE = notice(
  '00000000-0000-4000-8000-0000000000a2',
  'WISH_DATE_PROPOSED',
  {
    targetType: 'WISH',
    targetId: '00000000-0000-4000-8000-0000000000b2',
    target: {
      targetType: 'WISH',
      targetId: '00000000-0000-4000-8000-0000000000b2',
      title: 'Picnic by the lake',
    },
    appointmentStart: '2026-11-29T13:00:00Z',
    createdAt: '2026-11-27T08:30:00Z',
  },
);
const NOTE = notice(
  '00000000-0000-4000-8000-0000000000a4',
  'SHARED_NOTE_CREATED',
  {
    targetType: 'SHARED_NOTE',
    targetId: '00000000-0000-4000-8000-0000000000b4',
    target: {
      targetType: 'SHARED_NOTE',
      targetId: '00000000-0000-4000-8000-0000000000b4',
      title: 'Door code',
    },
    preview: { text: 'Ring twice.', items: [], moreItems: 0 },
    createdAt: '2026-11-27T08:20:00Z',
  },
);
const HEART = notice(
  '00000000-0000-4000-8000-0000000000a3',
  'HEART_HUNT_FOUND',
  {
    createdAt: '2026-11-27T08:45:00Z',
  },
);

interface Server {
  notices: Record<string, unknown>[];
  reads: string[];
  games: Record<string, unknown>[];
  /** #2345: the personal reel style and whether the Space has Pro. */
  reelStyle: string;
  reelVersion: number;
  pro: boolean;
}

interface ReelOptions {
  reelStyle?: 'circles' | 'tiles' | 'chips';
  pro?: boolean;
}

async function installMocks(
  page: Page,
  options: ReelOptions = {},
): Promise<Server> {
  const server: Server = {
    notices: [DATE, LIST],
    reads: [],
    reelStyle: options.reelStyle ?? 'circles',
    reelVersion: options.reelStyle ? 1 : 0,
    pro: options.pro ?? true,
    games: [
      {
        game: 'PICTURE_PING_PONG',
        reason: 'DRAW',
        since: '2026-11-27T07:00:00Z',
      },
      {
        game: 'GARDEN_SEED',
        reason: 'PLANT',
        since: '2026-11-27T06:00:00Z',
      },
    ],
  };
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    // The reel style is stateful here, ahead of the shared default.
    if (pathname === `${SPACE}/appearance/wir-reels`) {
      if (method === 'PATCH') {
        const body = request.postDataJSON() as { styleId: string };
        expect(request.headers()['if-match']).toBe(
          `"reel:${server.reelVersion}"`,
        );
        if (body.styleId !== 'circles' && !server.pro)
          throw new Error('Unexpected paid write from a Free account');
        server.reelStyle = body.styleId;
        server.reelVersion += 1;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"reel:${server.reelVersion}"` },
        body: JSON.stringify({
          styleId: server.reelStyle,
          version: server.reelVersion,
        }),
      });
    }
    if (await fulfillDefaultAppIcon(route)) return;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (method === 'GET' && pathname === '/api/v1/instance/status')
      return json({
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
    // Sign-in, and the session restore after a reload.
    if (
      method === 'POST' &&
      (pathname === '/api/v1/auth/sign-in' ||
        pathname === '/api/v1/auth/refresh')
    )
      return json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
          accessToken: 'wir-new-for-you-access',
          refreshExpiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
          refreshToken: 'wir-new-for-you-refresh',
        },
      });
    if (method === 'GET' && pathname === '/api/v1/auth/me')
      return json({ id: ACCOUNT_ID, displayName: 'Anna' });
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (method === 'GET' && pathname === '/api/v1/auth/memberships')
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    if (method === 'GET' && pathname === SPACE)
      return json({
        id: SPACE_ID,
        createdAt: '2025-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben' },
        ],
      });
    if (method === 'GET' && pathname === `${SPACE}/appearance/wir-design`)
      return json({ designId: 'connected', version: 1 });
    if (method === 'GET' && pathname === `${SPACE}/dashboard/preferences`)
      return json({ items: [] });
    if (method === 'GET' && pathname === `${SPACE}/partner-nickname`)
      return json({ partnerId: PARTNER_ID, nickname: null, version: 0 });
    if (method === 'GET' && pathname === `${SPACE}/presence`)
      return json({ state: 'UNKNOWN' });
    if (method === 'GET' && pathname === `${SPACE}/recaps`)
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
    if (method === 'GET' && pathname === `${SPACE}/configuration`)
      return json({
        canManageSpaceConfiguration: true,
        dailyContextTimezone: 'Europe/Berlin',
        dailyQuestionsEnabled: false,
        energyCheckInEnabled: true,
        energyVisibilityMode: 'IMMEDIATE',
        loveNotesEnabled: false,
        sharedAchievementsEnabled: false,
        spaceId: SPACE_ID,
        supportGesturesEnabled: true,
        version: 7,
        vibeCheckEnabled: true,
        vibeVisibilityMode: 'IMMEDIATE',
      });
    if (method === 'GET' && pathname === `${SPACE}/daily-check-in/today`)
      return json({
        checkedOn: '2026-11-27',
        dailyContextTimezone: 'Europe/Berlin',
        own: { energyLevel: null, vibe: null, vibeNote: null, version: 0 },
        energy: {
          visibilityMode: 'IMMEDIATE',
          partner: { state: 'NO_CHECK_IN' },
        },
        vibe: {
          visibilityMode: 'IMMEDIATE',
          partner: { state: 'NO_CHECK_IN' },
          partnerNote: null,
        },
      });
    if (method === 'GET' && pathname === `${SPACE}/entitlements`)
      return json(
        server.pro
          ? {
              spaceId: SPACE_ID,
              tier: 'PREMIUM',
              capabilities: ['games.couple', 'theme.bespoke_packs'],
            }
          : { spaceId: SPACE_ID, tier: 'FREE', capabilities: [] },
      );
    if (method === 'GET' && pathname === `${SPACE}/games/waiting`)
      return json({ items: server.games });
    if (method === 'GET' && pathname === `${SPACE}/notifications/unread-count`)
      return json({ unreadCount: server.notices.length });
    if (method === 'GET' && pathname === `${SPACE}/notifications/wir`)
      return json({ items: server.notices });
    const read = pathname.match(/\/notifications\/([^/]+)\/read$/);
    if (method === 'POST' && read) {
      server.reads.push(read[1]);
      server.notices = server.notices.filter((item) => item.id !== read[1]);
      return json({
        ...notice(read[1], 'COLLECTION_SENT'),
        readAt: NOW.toISOString(),
      });
    }
    if (method === 'GET' && pathname === `${SPACE}/dashboard`)
      return json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        viewerLocalDate: '2026-11-27',
        relationshipDuration: { daysTogether: 700, startedOn: '2025-01-01' },
        retrospective: null,
        upcoming: [
          {
            id: '00000000-0000-4000-8000-0000000000c1',
            type: 'PLAN',
            titleOrText: 'Dinner with Lena',
            occurredOn: null,
            scheduledAt: '2026-11-27T18:30:00Z',
            createdAt: null,
          },
        ],
        recentShared: [],
      });
    return json({}, 200);
  });
  return server;
}

async function openWir(
  page: Page,
  width: number,
  theme: 'light' | 'dark',
  reduced = false,
  options: ReelOptions = {},
) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({
    colorScheme: theme,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const server = await installMocks(page, options);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
  return server;
}

function reel(page: Page) {
  return page.getByRole('region', { name: wirNotices.title });
}

async function saveEvidence(page: Page, name: string) {
  const exportDir = process.env.VISUAL_EVIDENCE_DIR;
  const output = test.info().outputPath(`${name}.png`);
  // The reel and the games below it, from the reel's heading down.
  await reel(page).evaluate((element) =>
    element.scrollIntoView({ block: 'start' }),
  );
  await waitForSettledMotion(page);
  await page.screenshot({ path: output, fullPage: false });
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(output, path.join(exportDir, `2345-${name}.png`));
  }
}

for (const { width, theme } of [
  { width: 360, theme: 'light' as const },
  { width: 390, theme: 'light' as const },
  { width: 390, theme: 'dark' as const },
  { width: 430, theme: 'dark' as const },
]) {
  test(`today first, newest notice next, games as tiles at ${width} ${theme}`, async ({
    page,
  }) => {
    await openWir(page, width, theme);
    const section = reel(page);
    await expect(section).toBeVisible();
    await expect(section.getByText('Picnic by the lake')).toBeVisible();
    const tiles = section.locator('li');
    await expect(tiles.nth(0)).toContainText('Dinner with Lena');
    await expect(tiles.nth(1)).toContainText('Picnic by the lake');
    await expect(tiles.nth(2)).toContainText('Strawberries');
    // No "see all" circle: the reel itself scrolls through everything new.
    await expect(tiles.last()).toContainText('Strawberries');
    // A first view on this device lets the cards arrive after the opening.
    await expect(tiles.nth(1)).toHaveClass(/wir-card-arrive-after-opening/);
    const gamesReel = page.getByRole('region', { name: games.waiting.title });
    await expect(gamesReel.locator('li')).toHaveCount(2);
    await waitForSettledMotion(page);
    // Nothing overflows the page sideways; the reels scroll inside themselves.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page })
      .include('.today-section-new-for-you')
      .include('.today-section-waiting-games')
      .analyze();
    expect(axe.violations).toEqual([]);
    await saveEvidence(page, `new-for-you-${width}-${theme}`);
  });
}

test('a card arrives once, opening it reads it, and a return replays nothing', async ({
  page,
}) => {
  const server = await openWir(page, 390, 'light');
  const section = reel(page);
  await expect(section.getByText('Picnic by the lake')).toBeVisible();
  await waitForSettledMotion(page);

  // Something new while Wir is open arrives at once, at the front of the notices.
  server.notices = [HEART, ...server.notices];
  // The shell re-reads the unread count when the page becomes visible again
  // (TanStack Query listens to visibilitychange on window); a new count reads the reel.
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
  const heart = section.locator('li', { hasText: wirNotices.titles.heart });
  await expect(heart).toBeVisible({ timeout: 10_000 });
  await expect(heart).toHaveClass(/wir-card-arrive/);
  await expect(heart).not.toHaveClass(/wir-card-arrive-after-opening/);
  await saveEvidence(page, 'new-for-you-live-arrival');

  // Opening the list reads it and it leaves Wir.
  await section.getByRole('link', { name: /Weekend shopping/ }).click();
  await expect.poll(() => server.reads).toContain(LIST.id);
  // Back inside the app, without a reload: Wir reads again on return.
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(reel(page).getByText('Picnic by the lake')).toBeVisible();
  await expect(reel(page).getByText('Weekend shopping')).toHaveCount(0);
  // Seen cards never arrive again on this device, also after a new start.
  await page.goto('/today');
  await expect(reel(page).getByText('Picnic by the lake')).toBeVisible();
  await expect(
    reel(page).locator('li', { hasText: 'Picnic by the lake' }),
  ).not.toHaveClass(/wir-card-arrive/);
});

test('with reduced motion a new card is simply there', async ({ page }) => {
  await openWir(page, 390, 'light', true);
  const tile = reel(page).locator('li', { hasText: 'Picnic by the lake' });
  await expect(tile).toBeVisible();
  const running = await tile.evaluate(
    (element) =>
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running').length,
  );
  expect(running).toBe(0);
  await saveEvidence(page, 'new-for-you-390-reduced');
});

test('a turn played in a game leaves Du bist dran on the way back (#2345)', async ({
  page,
}) => {
  const server = await openWir(page, 390, 'light');
  const gamesReel = page.getByRole('region', { name: games.waiting.title });
  const pingPong = gamesReel.locator('a[href="/games/picture-ping-pong"]');
  await expect(pingPong).toBeVisible();
  await pingPong.click();
  await expect(page).not.toHaveURL(/\/today$/);
  // The game page has replaced Wir before the turn is played.
  await expect(gamesReel).toBeHidden();
  // The turn is played on the game page; the server no longer waits on it.
  server.games = server.games.filter(
    (item) => item.game !== 'PICTURE_PING_PONG',
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(pingPong).toHaveCount(0);
  await expect(gamesReel.getByRole('link')).toHaveCount(1);
});

// #2345: the personal reel style (Settings › Darstellung).

async function inApp(page: Page, to: string) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, to);
}

async function runningReelAnimations(page: Page) {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect instanceof KeyframeEffect &&
            animation.effect.target instanceof Element &&
            animation.effect.target.closest('.wir-tile-reel') !== null,
        ).length,
  );
}

async function openReelSheet(page: Page) {
  await inApp(page, '/more/settings/appearance');
  const settings = page.locator('.wir-reel-style-settings');
  await settings.getByRole('button', { name: reelCopy.change }).click();
  return page.getByRole('dialog', { name: reelCopy.choices });
}

test('switching the style shows it on Wir without a reload or replay', async ({
  page,
}) => {
  const server = await openWir(page, 390, 'light');
  await expect(reel(page).getByText('Picnic by the lake')).toBeVisible();
  await waitForSettledMotion(page);
  const dialog = await openReelSheet(page);
  await dialog.getByText(reelCopy.styles.tiles.name, { exact: true }).click();
  await dialog
    .getByRole('button', {
      name: reelCopy.choose.replace('{{name}}', reelCopy.styles.tiles.name),
    })
    .click();
  await expect.poll(() => server.reelStyle).toBe('tiles');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/more\/settings\/appearance$/);
  // Back to the kept Wir tab, as the bottom navigation does.
  await inApp(page, '/today');
  await expect(page).toHaveURL(/\/today$/);
  await expect(reel(page).locator('ul')).toHaveClass(/wir-reel-tiles/);
  await expect(
    page.getByRole('region', { name: games.waiting.title }).locator('ul'),
  ).toHaveClass(/wir-reel-tiles/);
  // Seen cards keep their place: nothing in the reels plays again.
  expect(await runningReelAnimations(page)).toBe(0);
});

for (const reelStyle of ['tiles', 'chips'] as const) {
  for (const { width, theme } of [
    { width: 360, theme: 'light' as const },
    { width: 390, theme: 'light' as const },
    { width: 390, theme: 'dark' as const },
    { width: 430, theme: 'dark' as const },
    // Expanded: the reels keep their own width beside the wider page.
    { width: 1100, theme: 'light' as const },
  ]) {
    test(`the ${reelStyle} style at ${width} ${theme}`, async ({ page }) => {
      await openWir(page, width, theme, false, { reelStyle });
      const section = reel(page);
      await expect(section.locator('ul')).toHaveClass(
        new RegExp(`wir-reel-${reelStyle}`),
      );
      await expect(section.getByRole('link')).toHaveCount(3);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const axe = await new AxeBuilder({ page })
        .include('.today-section-new-for-you')
        .include('.today-section-waiting-games')
        .analyze();
      expect(axe.violations).toEqual([]);
      await saveEvidence(page, `reel-${reelStyle}-${width}-${theme}`);
    });
  }

  test(`the ${reelStyle} style keeps the page in place with large text`, async ({
    page,
  }) => {
    await openWir(page, 360, 'light', false, { reelStyle });
    await expect(reel(page).getByRole('link')).toHaveCount(3);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await waitForSettledMotion(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await saveEvidence(page, `reel-${reelStyle}-360-large-text`);
  });

  test(`the ${reelStyle} style is simply there with reduced motion`, async ({
    page,
  }) => {
    await openWir(page, 390, 'light', true, { reelStyle });
    await expect(reel(page).getByRole('link')).toHaveCount(3);
    expect(await runningReelAnimations(page)).toBe(0);
  });
}

test('a Free account sees the Pro styles and is led to Pro', async ({
  page,
}) => {
  await openWir(page, 390, 'light', false, { pro: false });
  await expect(reel(page).getByText('Picnic by the lake')).toBeVisible();
  const dialog = await openReelSheet(page);
  for (const name of [reelCopy.styles.tiles.name, reelCopy.styles.chips.name])
    await expect(dialog.locator('label', { hasText: name })).toContainText(
      reelCopy.pro,
    );
  await expect(
    dialog.locator('label', { hasText: reelCopy.styles.circles.name }),
  ).toContainText(reelCopy.free);
  await dialog.getByText(reelCopy.styles.chips.name, { exact: true }).click();
  await dialog.getByRole('button', { name: reelCopy.discover }).click();
  await expect(page).toHaveURL(/\/pro/);
});

test('a shared note tile has the same shape as its neighbours in the tiles style', async ({
  page,
}) => {
  await installMocksForNote(page);
  const shape = (title: string) =>
    reel(page)
      .locator('a', { hasText: title })
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          radius: style.borderTopLeftRadius,
          padding: style.paddingTop,
          display: style.display,
        };
      });
  await expect(reel(page).getByText('Door code')).toBeVisible();
  expect(await shape('Door code')).toEqual(await shape('Weekend shopping'));
});

async function installMocksForNote(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await installMocks(page, { reelStyle: 'tiles' });
  server.notices = [NOTE, ...server.notices];
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
  return server;
}
