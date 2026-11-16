import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillNoOccasionSources } from '../support/occasionSources';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const ROUND_ID = '33333333-3333-4333-8333-333333333333';
const PHOTO_ID = '55555555-5555-4555-8555-555555555555';
const SPACE_PATH = `/api/v1/spaces/${SPACE_ID}`;
const GAME_PATH = `${SPACE_PATH}/games/heart-hunt`;
const CREATED_AT = '2026-11-16T08:00:00Z';
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=',
  'base64',
);
const copy = games.heartHunt;

function localized(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template,
  );
}

interface Round {
  id: string;
  role: 'HIDER' | 'SEEKER';
  state: 'HIDDEN' | 'FOUND';
  partnerId: string;
  attachmentId: string;
  taps: { x: number; y: number }[];
  tapCount: number;
  bestLevel: number;
  heart: { x: number; y: number } | null;
  createdAt: string;
  foundAt: string | null;
  deleteAfter: string;
  kept: boolean;
}

function seekerRound(): Round {
  return {
    id: ROUND_ID,
    role: 'SEEKER',
    state: 'HIDDEN',
    partnerId: PARTNER_ID,
    attachmentId: PHOTO_ID,
    taps: [],
    tapCount: 0,
    bestLevel: 0,
    heart: null,
    createdAt: CREATED_AT,
    foundAt: null,
    deleteAfter: '2026-12-16T08:00:00Z',
    kept: false,
  };
}

async function installMocks(page: Page, initial: Round[]) {
  const unexpected: string[] = [];
  const writes: { path: string; body: unknown }[] = [];
  const state = { rounds: initial, taps: 0, uploaded: false };
  const attachment = (status: string) => ({
    id: PHOTO_ID,
    createdAt: CREATED_AT,
    durationSeconds: null,
    hasThumbnail: false,
    isSensitive: false,
    height: 1,
    width: 1,
    mediaType: 'IMAGE',
    mimeType: 'image/png',
    size: PHOTO.length,
    status,
    version: 1,
  });
  const responses: Record<string, unknown> = {
    '/api/v1/instance/status': {
      maintenanceMode: false,
      registrationAvailable: true,
      registrationUnavailableReason: null,
      auth: {
        localPassword: true,
        passkey: true,
        magicLink: true,
        oidc: false,
      },
    },
    '/api/v1/auth/me': { id: ACCOUNT_ID, displayName: 'Lea' },
    '/api/v1/auth/capabilities': { serverAdmin: false },
    '/api/v1/auth/memberships': [
      { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
    ],
    [SPACE_PATH]: {
      id: SPACE_ID,
      createdAt: CREATED_AT,
      partners: [
        { id: ACCOUNT_ID, displayName: 'Lea' },
        { id: PARTNER_ID, displayName: 'Alex' },
      ],
    },
    [`${SPACE_PATH}/entitlements`]: {
      spaceId: SPACE_ID,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      effectiveUntil: null,
      isInGracePeriod: false,
      capabilities: ['games.couple'],
    },
    [`${SPACE_PATH}/partner-nickname`]: {
      nickname: null,
      partnerId: PARTNER_ID,
      version: 0,
    },
    [`${SPACE_PATH}/notifications/unread-count`]: { unreadCount: 0 },
  };
  for (const [id, displayName] of [
    [ACCOUNT_ID, 'Lea'],
    [PARTNER_ID, 'Alex'],
  ]) {
    responses[`${SPACE_PATH}/profiles/${id}`] = {
      id,
      accountId: id,
      displayName,
      birthday: null,
      profileAttachmentId: null,
      preferences: [],
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await route.fulfill({
        json: {
          account: { id: ACCOUNT_ID, displayName: 'Lea' },
          tokens: {
            accessToken: 'heart-hunt-test-access-token',
            refreshToken: 'heart-hunt-test-refresh-token',
            accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          },
        },
      });
      return;
    }
    if (method === 'POST' && pathname === `${SPACE_PATH}/presence`) {
      await route.fulfill({ json: { state: null } });
      return;
    }
    if (method === 'GET' && pathname === GAME_PATH) {
      await route.fulfill({ json: { rounds: state.rounds } });
      return;
    }
    if (method === 'POST' && pathname === `${GAME_PATH}/rounds`) {
      const body = request.postDataJSON();
      writes.push({ path: pathname, body });
      const created: Round = {
        ...seekerRound(),
        role: 'HIDER',
        heart: body.heart,
      };
      state.rounds = [created];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `${GAME_PATH}/rounds/${ROUND_ID}/taps`
    ) {
      const body = request.postDataJSON();
      writes.push({ path: pathname, body });
      state.taps += 1;
      const [level, meter] = [
        [0, 5],
        [2, 65],
      ][state.taps - 1] ?? [3, 100];
      const found = state.taps >= 3;
      const round: Round = {
        ...state.rounds[0],
        state: found ? 'FOUND' : 'HIDDEN',
        taps: [...state.rounds[0].taps, body],
        tapCount: state.taps,
        bestLevel: level,
        heart: found ? { x: 120, y: 90 } : null,
        foundAt: found ? CREATED_AT : null,
      };
      state.rounds = [round];
      await route.fulfill({ json: { level, meter, found, round } });
      return;
    }
    if (method === 'POST' && pathname === `${SPACE_PATH}/attachments`) {
      await route.fulfill({
        status: 201,
        json: {
          attachment: attachment('PENDING'),
          method: 'STREAM',
          requiredHeaders: { 'Content-Type': 'image/png' },
          uploadUrl: `${SPACE_PATH}/attachments/${PHOTO_ID}/content`,
        },
      });
      return;
    }
    const photoPath = pathname.match(
      /\/attachments\/([^/]+)(?:\/(content|finalize|read-access))?$/,
    );
    if (photoPath && photoPath[1] === PHOTO_ID) {
      const action = photoPath[2];
      if (action === 'content' && method === 'PUT') {
        state.uploaded = true;
        await route.fulfill({ status: 204 });
      } else if (action === 'content' && method === 'GET') {
        await route.fulfill({ contentType: 'image/png', body: PHOTO });
      } else if (action === 'finalize' && method === 'POST') {
        await route.fulfill({ json: attachment('READY') });
      } else if (action === 'read-access' && method === 'POST') {
        await route.fulfill({
          json: {
            method: 'STREAM',
            url: `${SPACE_PATH}/attachments/${PHOTO_ID}/content`,
          },
        });
      } else if (!action && method === 'GET') {
        await route.fulfill({ json: attachment('READY') });
      } else {
        unexpected.push(`${method} ${pathname}`);
        await route.fulfill({ status: 500, json: { code: 'E2E_UNEXPECTED' } });
      }
      return;
    }
    if (method === 'GET' && pathname in responses) {
      await route.fulfill({ json: responses[pathname] });
      return;
    }
    if (await fulfillNoOccasionSources(route)) return;
    unexpected.push(`${method} ${pathname}`);
    await route.fulfill({
      status: 500,
      json: { code: 'E2E_UNEXPECTED_REQUEST' },
    });
  });
  return { unexpected, writes, state };
}

async function openHeartHunt(page: Page) {
  await page.goto('/games');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  const entry = page.getByRole('link', {
    name: new RegExp(games.entries.heartHunt.title),
  });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(games.entries.heartHunt.role);
  await entry.click();
}

async function capture(page: Page, info: TestInfo, name: string) {
  const output = info.outputPath(name);
  await page.screenshot({ path: output, fullPage: true });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

async function expectReflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
}

for (const scenario of [
  { width: 390, theme: 'light', reduce: false },
  { width: 360, theme: 'dark', reduce: true },
] as const) {
  test(`seeker clears fog, reads the warmth, finds the heart and swaps roles at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: scenario.reduce ? 'reduce' : 'no-preference',
    });
    const network = await installMocks(page, [seekerRound()]);
    await openHeartHunt(page);

    await expect(
      page.getByRole('heading', {
        name: localized(copy.seek.title, { name: 'Alex' }),
      }),
    ).toBeVisible();
    // Before it is found the heart is nowhere in the page.
    await expect(page.locator('.heart-hunt-heart')).toHaveCount(0);
    await expect(page.locator('.heart-hunt-fog')).toBeVisible();
    await expect(page.getByText(copy.seek.tapHint)).toBeVisible();
    await capture(
      page,
      info,
      `heart-hunt-seek-${scenario.width}-${scenario.theme}.png`,
    );

    const frame = page.getByRole('button', { name: copy.seek.photoLabel });
    await frame.click({ position: { x: 10, y: 10 } });
    await expect(page.getByText(copy.warmth.cold)).toBeVisible();
    await expect(page.locator('.heart-hunt-heart')).toHaveCount(0);
    await frame.click({ position: { x: 60, y: 80 } });
    await expect(
      page.getByText(copy.warmth.warm, { exact: true }),
    ).toBeVisible();
    await capture(
      page,
      info,
      `heart-hunt-warm-${scenario.width}-${scenario.theme}.png`,
    );

    await frame.click({ position: { x: 40, y: 40 } });
    await expect(
      page.getByRole('heading', { name: copy.found.title }),
    ).toBeVisible();
    await expect(page.locator('.heart-hunt-heart.is-found')).toBeVisible();
    await expect(
      page.getByText(
        localized(copy.found.bodySeeker, {
          name: 'Alex',
          place: copy.places.topLeft,
        }),
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.found.keep }),
    ).toBeVisible();
    await capture(
      page,
      info,
      `heart-hunt-found-${scenario.width}-${scenario.theme}.png`,
    );
    await expectReflow(page);

    expect(network.writes.map((write) => write.path)).toEqual([
      `${GAME_PATH}/rounds/${ROUND_ID}/taps`,
      `${GAME_PATH}/rounds/${ROUND_ID}/taps`,
      `${GAME_PATH}/rounds/${ROUND_ID}/taps`,
    ]);
    for (const write of network.writes) {
      const tap = write.body as { x: number; y: number };
      expect(tap.x).toBeGreaterThanOrEqual(0);
      expect(tap.x).toBeLessThanOrEqual(1000);
    }

    await page.getByRole('button', { name: copy.found.swap }).click();
    await expect(
      page.getByRole('heading', {
        name: localized(copy.hide.title, { name: 'Alex' }),
      }),
    ).toBeVisible();
    expect(network.unexpected).toEqual([]);
  });
}

test('hider picks a photo, moves the heart, sends it and then waits', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const network = await installMocks(page, []);
  await openHeartHunt(page);

  await expect(
    page.getByRole('heading', {
      name: localized(copy.hide.title, { name: 'Alex' }),
    }),
  ).toBeVisible();
  await page
    .locator('#heart-hunt-photo')
    .setInputFiles({ name: 'tag.png', mimeType: 'image/png', buffer: PHOTO });
  await expect(page.getByText(copy.hide.placeHint)).toBeVisible();
  const send = page.getByRole('button', {
    name: localized(copy.hide.send, { name: 'Alex' }),
  });
  await expect(send).toBeDisabled();

  const frame = page.getByRole('button', { name: copy.hide.photoLabel });
  await frame.click({ position: { x: 50, y: 60 } });
  await expect(page.locator('.heart-hunt-heart')).toHaveCount(1);
  // The heart can still be moved before it is sent.
  await frame.click({ position: { x: 120, y: 160 } });
  await expect(page.locator('.heart-hunt-heart')).toHaveCount(1);
  await expect(page.getByText(copy.hide.placed)).toBeVisible();
  await capture(page, info, 'heart-hunt-hide-390-light.png');
  await send.click();

  await expect(
    page.getByRole('heading', {
      name: localized(copy.waiting.title, { name: 'Alex' }),
    }),
  ).toBeVisible();
  const created = network.writes.find(
    (write) => write.path === `${GAME_PATH}/rounds`,
  );
  const body = created?.body as {
    attachmentId: string;
    heart: { x: number; y: number };
  };
  expect(body.attachmentId).toBe(PHOTO_ID);
  expect(body.heart.x).toBeGreaterThan(0);
  expect(body.heart.y).toBeGreaterThan(body.heart.x);
  expect(network.state.uploaded).toBe(true);
  expect(network.unexpected).toEqual([]);
});
