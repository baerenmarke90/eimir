import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillGameNoticesRead } from '../support/gameNotices';
import { fulfillNoOccasionSources } from '../support/occasionSources';
import { expectTitleOnlyContentGap } from '../support/pageHeader';
import { CAPABILITIES } from '../support/storyTimelineFixture';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_PATH = `/api/v1/spaces/${SPACE_ID}`;
const GARDEN_PATH = `${SPACE_PATH}/games/garden`;
const CREATED_AT = '2026-10-17T08:00:00Z';
const SEED_ID = '55555555-5555-4555-8555-555555555555';
const BLOOM_ID = '66666666-6666-4666-8666-666666666666';
const copy = games.garden;

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

const bloom = {
  id: BLOOM_ID,
  species: 'STARFLOWER',
  words: 'FOR_YOU',
  senderId: PARTNER_ID,
  sentOn: '2026-11-08',
  stage: 3,
  slot: 0,
};

function gardenView(overrides: Record<string, unknown> = {}) {
  return {
    localDate: '2026-11-16',
    plants: [bloom],
    incoming: {
      id: SEED_ID,
      species: 'BELLFLOWER',
      words: 'LOOKING_FORWARD',
      senderId: PARTNER_ID,
      sentOn: '2026-11-16',
      stage: 0,
      slot: null,
    },
    sentToday: null,
    partnerSentToday: true,
    sharedToday: false,
    wateredToday: null,
    partnerWateredToday: null,
    offer: ['POPPY', 'BELLFLOWER', 'STARFLOWER'],
    sleeping: false,
    reunionOn: null,
    reunionToday: false,
    ...overrides,
  };
}

const MEMORY_ID = '88888888-8888-4888-8888-888888888888';
const UPLOAD_ID = '99999999-9999-4999-8999-999999999999';

async function installMocks(
  page: Page,
  initial: ReturnType<typeof gardenView> = gardenView(),
  { birthdays = {} }: { birthdays?: Record<string, string> } = {},
) {
  const unexpected: string[] = [];
  const writes: string[] = [];
  const moment: {
    bytes: Buffer | null;
    create: Record<string, unknown> | null;
  } = { bytes: null, create: null };
  let garden = initial;
  const planted = { ...gardenView().incoming, slot: 1, stage: 0 };
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
    // The garden reads the couple's Milestones for its memory corner.
    [`${SPACE_PATH}/milestones`]: {
      items: [],
      hasMore: false,
      nextCursor: null,
    },
    // Already on Wir, so the one-time Wir offer (wir-garden.spec.ts) stays away.
    [`${SPACE_PATH}/dashboard/preferences`]: {
      items: [{ moduleKey: 'shared_garden', visible: true }],
    },
  };
  for (const [id, displayName] of [
    [ACCOUNT_ID, 'Lea'],
    [PARTNER_ID, 'Alex'],
  ]) {
    responses[`${SPACE_PATH}/profiles/${id}`] = {
      id,
      accountId: id,
      displayName,
      birthday: birthdays[id] ?? null,
      profileAttachmentId: null,
      preferences: [],
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillGameNoticesRead(route)) return;
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await route.fulfill({
        json: {
          account: { id: ACCOUNT_ID, displayName: 'Lea' },
          tokens: {
            accessToken: 'garden-test-access-token',
            refreshToken: 'garden-test-refresh-token',
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
    const upload = {
      id: UPLOAD_ID,
      status: 'READY',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      size: moment.bytes?.length ?? 1,
      width: 1080,
      height: 667,
      version: 1,
      hasThumbnail: false,
      isSensitive: false,
      createdAt: '2026-11-16T10:00:00Z',
      durationSeconds: null,
    };
    if (method === 'POST' && pathname === `${SPACE_PATH}/attachments`) {
      writes.push('POST /attachments');
      await route.fulfill({
        status: 201,
        json: {
          attachment: { ...upload, status: 'PENDING' },
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${SPACE_PATH}/attachments/${UPLOAD_ID}/content`,
        },
      });
      return;
    }
    if (pathname.startsWith(`${SPACE_PATH}/attachments/${UPLOAD_ID}`)) {
      if (method === 'PUT') {
        moment.bytes = request.postDataBuffer() ?? Buffer.alloc(0);
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fulfill({ json: upload });
      return;
    }
    const memory = {
      id: MEMORY_ID,
      spaceId: SPACE_ID,
      authorId: ACCOUNT_ID,
      author: { id: ACCOUNT_ID, displayName: 'Lea' },
      title: copy.reunion.memoryTitle,
      body: copy.reunion.memoryBody,
      tags: [],
      happenedOn: '2026-11-16',
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z',
      version: 1,
      capabilities: CAPABILITIES,
      selectedCoverAttachmentId: UPLOAD_ID,
      attachments: [],
    };
    if (method === 'POST' && pathname === `${SPACE_PATH}/memories`) {
      writes.push('POST /memories');
      moment.create = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: memory });
      return;
    }
    if (pathname === `${SPACE_PATH}/memories/${MEMORY_ID}/attachments`) {
      writes.push(`${method} /memories/attachments`);
      await route.fulfill({
        json: {
          ...memory,
          version: 2,
          attachments: [{ ...upload, position: 0, canEditSensitivity: true }],
        },
      });
      return;
    }
    if (method === 'GET' && pathname === `${GARDEN_PATH}/history`) {
      await route.fulfill({
        json: { items: [], nextCursor: null, hasMore: false },
      });
      return;
    }
    if (pathname.startsWith(GARDEN_PATH)) {
      if (method !== 'GET')
        writes.push(`${method} ${pathname.slice(GARDEN_PATH.length)}`);
      if (
        method === 'POST' &&
        pathname === `${GARDEN_PATH}/seeds/${SEED_ID}/plant`
      ) {
        garden = gardenView({ incoming: null, plants: [bloom, planted] });
      } else if (method === 'POST' && pathname === `${GARDEN_PATH}/seeds`) {
        const body = request.postDataJSON() as {
          species: string;
          words: string | null;
        };
        expect(body).toEqual({ species: 'POPPY', words: 'MISS_YOU' });
        garden = gardenView({
          incoming: null,
          plants: [bloom, { ...planted, stage: 1 }],
          sentToday: {
            id: '77777777-7777-4777-8777-777777777777',
            species: 'POPPY',
            words: 'MISS_YOU',
            senderId: ACCOUNT_ID,
            sentOn: '2026-11-16',
            stage: 0,
            slot: null,
          },
          sharedToday: true,
        });
      } else if (method === 'POST' && pathname === `${GARDEN_PATH}/waterings`) {
        garden = { ...garden, wateredToday: BLOOM_ID };
      } else if (method !== 'GET') {
        unexpected.push(`${method} ${pathname}`);
      }
      await route.fulfill({ json: garden });
      return;
    }
    if (method !== 'GET') writes.push(`${method} ${pathname}`);
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
  return {
    unexpected,
    writes,
    moment,
    /** The next read (for example the live sync) answers with this view. */
    update: (next: ReturnType<typeof gardenView>) => {
      garden = next;
    },
  };
}

async function openGarden(page: Page) {
  await page.goto('/games');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  const entry = page.getByRole('link', {
    name: new RegExp(games.entries.garden.title),
  });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/\/games\/garden$/);
}

async function expectReflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const output = info.outputPath(name);
  await page.screenshot({ path: output, fullPage: true });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

for (const scenario of [
  { width: 390, theme: 'light', reduce: false },
  { width: 360, theme: 'dark', reduce: true },
] as const) {
  test(`garden plants, sends with kind words and waters at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    const network = await installMocks(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: scenario.reduce ? 'reduce' : 'no-preference',
    });
    await openGarden(page);

    // A seed arrived with a folded card.
    await expect(
      page.getByRole('heading', {
        name: fill(copy.arrivedTitle, { name: 'Alex' }),
      }),
    ).toBeVisible();
    await expectReflow(page);
    await capture(
      page,
      info,
      `garden-arrived-${scenario.width}-${scenario.theme}.png`,
    );
    const folded = page.getByRole('button', {
      name: new RegExp(copy.foldedCard),
    });
    await expect(folded).toHaveAttribute('aria-expanded', 'false');
    await folded.click();
    await expect(
      page.getByText(fill(copy.quoted, { words: copy.words.LOOKING_FORWARD })),
    ).toBeVisible();
    await page.getByRole('button', { name: copy.plant }).click();
    await expect(page.getByText(copy.plantedStatus)).toBeVisible();

    // Today's seed with collapsed kind words (distance is not shared here).
    await page.getByRole('button', { name: copy.species.POPPY.name }).click();
    const words = page.getByRole('button', { name: copy.wordsQuestion });
    await expect(words).toHaveAttribute('aria-expanded', 'false');
    await words.click();
    await page.getByRole('button', { name: copy.words.MISS_YOU }).click();
    await expect(
      page.getByText(fill(copy.yourWords, { words: copy.words.MISS_YOU })),
    ).toBeVisible();
    await page.getByRole('button', { name: copy.send }).click();
    await expect(
      page.getByRole('heading', { name: copy.sharedTitle }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // A plant's story, then the daily watering gesture.
    await page
      .getByRole('button', {
        name: fill(copy.plantLabel, {
          species: copy.species.STARFLOWER.name,
          name: 'Alex',
        }),
      })
      .click();
    await expect(page.getByText(copy.stages[3])).toBeVisible();
    await page.getByRole('button', { name: copy.water }).click();
    await page
      .getByRole('button', {
        name: fill(copy.waterPlantLabel, {
          species: copy.species.STARFLOWER.name,
        }),
      })
      .click();
    await expect(
      page.getByText(fill(copy.wateredStatus, { name: 'Alex' })),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: copy.water })).toHaveCount(0);
    await expectReflow(page);
    await capture(
      page,
      info,
      `garden-shared-${scenario.width}-${scenario.theme}.png`,
    );

    const axe = await new AxeBuilder({ page })
      .include('.garden-game-page')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(network.writes).toEqual([
      `POST /seeds/${SEED_ID}/plant`,
      'POST /seeds',
      'POST /waterings',
    ]);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('garden reflows at 320 px with 200% text', async ({ page }) => {
  const network = await installMocks(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGarden(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(
    page.getByRole('heading', {
      name: fill(copy.arrivedTitle, { name: 'Alex' }),
    }),
  ).toBeVisible();
  await expectReflow(page);
  expect(network.unexpected).toEqual([]);
});

/* Scenes domain (Motion Contract 4.8, #2079) --------------------------------- */

/** The CSS animations inside the garden scene, by play state. */
async function sceneMotion(page: Page) {
  return page.evaluate(() => {
    const stack = document.querySelector('.garden-scene-stack');
    const inside = document.getAnimations().filter((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && stack?.contains(target) === true;
    });
    return {
      state: stack?.getAttribute('data-motion-scene') ?? null,
      running: inside.filter((animation) => animation.playState === 'running')
        .length,
      total: inside.length,
    };
  });
}

/** Records a measurement as a test annotation for the PR evidence. */
async function noteSceneMotion(page: Page, info: TestInfo, phase: string) {
  const motion = await sceneMotion(page);
  info.annotations.push({
    type: 'scene-motion',
    description: `${phase}: ${motion.state}, ${motion.running} running of ${motion.total}`,
  });
  return motion;
}

/** Emulates the page being hidden or shown again (app in the background). */
async function setPageHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (value ? 'hidden' : 'visible'),
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => value,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

for (const scenario of [
  { width: 360, theme: 'light', reduce: false },
  { width: 390, theme: 'dark', reduce: false },
  { width: 430, theme: 'light', reduce: false },
  { width: 390, theme: 'light', reduce: true },
  { width: 1280, theme: 'dark', reduce: false },
] as const) {
  const label = `${scenario.width}px ${scenario.theme}${scenario.reduce ? ' reduced motion' : ''}`;
  test(`garden scene loops only while seen and continues where it paused at ${label}`, async ({
    page,
  }, info) => {
    const network = await installMocks(page);
    const errors = await prepare(page, scenario);
    await openGarden(page);
    const stack = page.locator('.garden-scene-stack').first();
    await expectTitleOnlyContentGap(page.locator('.garden-band'));
    const name = `2079-garden-scene-${scenario.width}-${scenario.theme}${scenario.reduce ? '-reduce' : ''}`;

    if (scenario.reduce) {
      // Absent with reduced motion: nothing in the scene runs.
      await expect(stack).toHaveAttribute('data-motion-scene', 'paused');
      expect(
        (await noteSceneMotion(page, info, 'reduced motion')).running,
      ).toBe(0);
      await capture(page, info, `${name}.png`);
      expect(network.unexpected).toEqual([]);
      expect(errors).toEqual([]);
      return;
    }

    await expect(stack).toHaveAttribute('data-motion-scene', 'playing');
    await expect
      .poll(async () => (await sceneMotion(page)).running)
      .toBeGreaterThan(0);
    await noteSceneMotion(page, info, 'seen');
    await capture(page, info, `${name}-playing.png`);

    // The page goes to the background: every loop holds in place.
    await setPageHidden(page, true);
    await expect(stack).toHaveAttribute('data-motion-scene', 'paused');
    const hidden = await noteSceneMotion(page, info, 'page hidden');
    expect(hidden.running).toBe(0);
    expect(hidden.total).toBeGreaterThan(0);
    // Keep the held loops themselves, so the return compares the same
    // animations (ambient effects may come and go meanwhile).
    const heldCount = await page.evaluate(() => {
      const held = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getTiming().iterations ===
            Number.POSITIVE_INFINITY,
        )
        .map((animation) => ({
          animation,
          time: Number(animation.currentTime ?? 0),
        }));
      (window as unknown as { heldLoops: typeof held }).heldLoops = held;
      return held.length;
    });
    expect(heldCount).toBeGreaterThan(0);

    // It returns: the same animations continue from where they held, so
    // nothing restarted (M4).
    await setPageHidden(page, false);
    await expect(stack).toHaveAttribute('data-motion-scene', 'playing');
    const restarted = await page.evaluate(() => {
      const held = (
        window as unknown as {
          heldLoops: Array<{ animation: Animation; time: number }>;
        }
      ).heldLoops;
      const live = new Set(document.getAnimations());
      return held.filter(
        ({ animation, time }) =>
          live.has(animation) && Number(animation.currentTime ?? 0) < time,
      ).length;
    });
    expect(restarted).toBe(0);

    // Scrolled off screen, the scene renders no animation frames. Compact
    // only: a short Expanded viewport is landscape, where the garden opens its
    // landscape view instead of scrolling.
    const compact = scenario.width < 768;
    if (compact)
      await page.setViewportSize({ width: scenario.width, height: 420 });
    await page.evaluate(() => {
      const scene = document.querySelector('.garden-scene-stack');
      const bottom = scene
        ? scene.getBoundingClientRect().bottom + window.scrollY
        : 0;
      window.scrollTo({ top: bottom + 40, behavior: 'instant' });
    });
    const offscreen = await page.evaluate(() => {
      const scene = document.querySelector('.garden-scene-stack');
      return scene ? scene.getBoundingClientRect().bottom <= 0 : false;
    });
    if (compact && offscreen) {
      await expect(stack).toHaveAttribute('data-motion-scene', 'paused');
      expect((await noteSceneMotion(page, info, 'off screen')).running).toBe(0);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      );
      await expect(stack).toHaveAttribute('data-motion-scene', 'playing');
    }
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await noteSceneMotion(page, info, 'returned');
    await capture(page, info, `${name}-returned.png`);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

async function expectNoAxeViolations(page: Page) {
  const axe = await new AxeBuilder({ page })
    .include('.garden-game-page')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
}

async function prepare(
  page: Page,
  scenario: { width: number; theme: 'light' | 'dark'; reduce: boolean },
) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: scenario.width, height: 844 });
  await page.emulateMedia({
    colorScheme: scenario.theme,
    reducedMotion: scenario.reduce ? 'reduce' : 'no-preference',
  });
  return errors;
}

/* Growth and life (#1907 H3, PR 3) ------------------------------------------- */

const growth = copy.growth;
const PLANE_SEED_ID = '88888888-8888-4888-8888-888888888888';
const BOUQUET_ID = '99999999-9999-4999-8999-999999999999';
const UNLOCKS = [
  'PATH',
  'POND',
  'SUNFLOWER',
  'TULIP',
  'WATER_LILY',
  'BENCH',
  'TREE',
  'MORE_ROOM',
  'STRAWBERRY',
];

function grownPlant(index: number, overrides: Record<string, unknown> = {}) {
  const species = ['POPPY', 'SUNFLOWER', 'BELLFLOWER', 'STRAWBERRY'][index % 4];
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    species,
    words: null,
    senderId: index % 2 ? ACCOUNT_ID : PARTNER_ID,
    sentOn: '2026-10-20',
    stage: index % 5 === 4 ? 1 : 3,
    slot: index,
    inPond: false,
    ...overrides,
  };
}

function grownGarden(overrides: Record<string, unknown> = {}) {
  return gardenView({
    plants: [
      ...Array.from({ length: 14 }, (_, index) => grownPlant(index)),
      grownPlant(20, { species: 'WATER_LILY', slot: 0, inPond: true }),
      grownPlant(21, { species: 'MOONFLOWER', slot: 14 }),
    ],
    incoming: {
      id: PLANE_SEED_ID,
      species: 'SURPRISE',
      words: 'MISS_YOU',
      senderId: PARTNER_ID,
      sentOn: '2026-11-16',
      stage: 0,
      slot: null,
      inPond: false,
    },
    offer: ['POPPY', 'SUNFLOWER', 'SURPRISE'],
    sharedDays: 30,
    form: 'GARDEN',
    unlocks: UNLOCKS,
    news: ['TREE', 'MORE_ROOM', 'STRAWBERRY'],
    discovered: [
      'POPPY',
      'BELLFLOWER',
      'STARFLOWER',
      'SUNFLOWER',
      'MOONFLOWER',
    ],
    name: null,
    bouquet: {
      id: BOUQUET_ID,
      giverId: PARTNER_ID,
      givenOn: '2026-11-16',
      flowers: [
        { species: 'SUNFLOWER', senderId: ACCOUNT_ID },
        { species: 'POPPY', senderId: PARTNER_ID },
      ],
    },
    gaveBouquetToday: false,
    ...overrides,
  });
}

type GrownGarden = ReturnType<typeof grownGarden>;

async function installGrowthMocks(page: Page) {
  const network = await installMocks(page);
  let garden: GrownGarden = grownGarden();
  await page.route(`**${GARDEN_PATH}**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const suffix = pathname.slice(GARDEN_PATH.length);
    if (method === 'GET' && suffix === '/history') {
      await route.fulfill({
        json: { items: [], nextCursor: null, hasMore: false },
      });
      return;
    }
    if (method !== 'GET') network.writes.push(`${method} ${suffix}`);
    if (method === 'POST' && suffix === '/news/seen') {
      garden = { ...garden, news: [] };
    } else if (
      method === 'POST' &&
      suffix === `/bouquets/${BOUQUET_ID}/close`
    ) {
      garden = { ...garden, bouquet: null };
    } else if (
      method === 'POST' &&
      suffix === `/seeds/${PLANE_SEED_ID}/plant`
    ) {
      garden = {
        ...garden,
        plants: [
          ...(garden.plants as Array<Record<string, unknown>>),
          { ...(garden.incoming as Record<string, unknown>), slot: 15 },
        ],
        incoming: null,
      } as GrownGarden;
    } else if (method === 'POST' && suffix === '/bouquets') {
      const picked = (request.postDataJSON() as { plantIds: string[] })
        .plantIds;
      garden = {
        ...garden,
        gaveBouquetToday: true,
        plants: (garden.plants as Array<{ id: string }>).map((entry) =>
          picked.includes(entry.id) ? { ...entry, stage: 0 } : entry,
        ),
      } as GrownGarden;
    } else if (method === 'PUT' && suffix === '/name') {
      garden = {
        ...garden,
        name: (request.postDataJSON() as { name: string | null }).name,
      };
    } else if (method === 'PUT' && /^\/visitors\/[A-Z]+\/name$/.test(suffix)) {
      // One shared name per visitor (#1907 H3 follow-up).
      const animal = suffix.split('/')[2];
      const name = (request.postDataJSON() as { name: string | null }).name;
      const rest = (
        (garden.visitorNames as Array<{ animal: string }> | undefined) ?? []
      ).filter((entry) => entry.animal !== animal);
      garden = {
        ...garden,
        visitorNames: name ? [...rest, { animal, name }] : rest,
      };
    } else if (method !== 'GET') {
      network.unexpected.push(`${method} ${pathname}`);
    }
    await route.fulfill({ json: garden });
  });
  return network;
}

async function captureGrowth(page: Page, info: TestInfo, name: string) {
  // Captures show the garden, not a keyboard focus ring left by the journey.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await capture(page, info, name);
}

function anyOf(texts: string[]) {
  return new RegExp(
    texts.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  );
}

for (const scenario of [
  { width: 390, theme: 'light', reduce: false },
  { width: 360, theme: 'dark', reduce: true },
] as const) {
  test(`garden sleeps after a pause of both, wakes and waits for a reunion at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    const network = await installMocks(
      page,
      gardenView({ sleeping: true, incoming: null, reunionOn: '2026-11-20' }),
    );
    const errors = await prepare(page, scenario);
    await openGarden(page);
    const frame = page.getByTestId('garden-frame');
    await expect(frame).toHaveAttribute('data-season', 'autumn');
    if (!scenario.reduce) {
      // Mist, closed blossoms and dark lanterns first; never anyone's fault.
      await expect(
        page.getByRole('heading', { name: copy.sleep.title }),
      ).toBeVisible();
      await expect(frame).toHaveAttribute('data-sleep', 'asleep');
      await expect(page.getByTestId('garden-lantern-partner')).toHaveAttribute(
        'data-lit',
        'false',
      );
      await capture(
        page,
        info,
        `garden-sleeping-${scenario.width}-${scenario.theme}.png`,
      );
    }
    await expect(
      page.getByRole('heading', { name: copy.sleep.wokeTitle }),
    ).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(copy.sleep.wokeBody)).toBeVisible();
    await expect(frame).toHaveAttribute('data-sleep', 'awake', {
      timeout: 6_000,
    });
    await expect(page.getByTestId('garden-mist')).toHaveCount(0);
    await expect(page.getByTestId('garden-lantern-partner')).toHaveAttribute(
      'data-lit',
      'true',
    );
    await expect(page.getByTestId('garden-lantern-own')).toHaveAttribute(
      'data-lit',
      'false',
    );
    // The reunion from Plans: a gate and a calm card with the date only.
    await expect(page.getByTestId('garden-reunion-gate')).toBeVisible();
    await expect(page.getByTestId('garden-reunion-soon')).toContainText(
      copy.reunion.soonBody,
    );
    await expect(page.getByRole('button', { name: copy.send })).toBeVisible();
    await expectReflow(page);
    await capture(
      page,
      info,
      `garden-woke-reunion-soon-${scenario.width}-${scenario.theme}.png`,
    );
    await page.getByRole('button', { name: copy.sleep.wokeClose }).click();
    await expect(
      page.getByRole('heading', { name: copy.sleep.wokeTitle }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);
    // Waking and the reunion are presentation only: nothing was written.
    expect(network.writes).toEqual([]);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`garden blooms on the reunion day and keeps it as a Moment at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    const network = await installMocks(
      page,
      gardenView({
        incoming: null,
        reunionOn: '2026-11-16',
        reunionToday: true,
        plants: [bloom, { ...gardenView().incoming, slot: 1, stage: 0 }],
      }),
    );
    const errors = await prepare(page, scenario);
    await openGarden(page);
    await expect(
      page.getByRole('heading', { name: copy.reunion.todayTitle }),
    ).toBeVisible();
    await expect(page.getByTestId('garden-bunting')).toBeVisible();
    await expect(page.getByRole('button', { name: copy.send })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.water })).toHaveCount(0);
    // Let the one-shot bloom settle before the still is taken.
    await page.waitForTimeout(1_500);
    await expectReflow(page);
    await capture(
      page,
      info,
      `garden-reunion-day-${scenario.width}-${scenario.theme}.png`,
    );
    await page.getByRole('button', { name: copy.reunion.save }).click();
    await expect(
      page.getByRole('link', { name: copy.reunion.openMoment }),
    ).toHaveAttribute('href', `/story/memories/${MEMORY_ID}`);
    await expect(page.getByText(copy.reunion.saved)).toBeVisible();
    // A real PNG still of the garden went through the existing media path.
    const bytes = network.moment.bytes;
    expect(bytes?.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(bytes?.length ?? 0).toBeGreaterThan(5_000);
    expect(network.moment.create).toMatchObject({
      title: copy.reunion.memoryTitle,
      body: copy.reunion.memoryBody,
      happenedOn: '2026-11-16',
    });
    await expectNoAxeViolations(page);
    expect(network.writes).toEqual([
      'POST /attachments',
      'POST /memories',
      'PUT /memories/attachments',
    ]);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`garden grows with news, bouquets, the book and visitors at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const network = await installGrowthMocks(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: scenario.reduce ? 'reduce' : 'no-preference',
    });
    await openGarden(page);

    // Something new is announced once, without any number.
    const news = page.getByTestId('garden-news');
    await expect(news).toBeVisible();
    await expect(news.getByText(growth.finds.TREE)).toBeVisible();
    await expect(news).not.toContainText(/\d/);
    await expect(page.getByTestId('garden-frame')).toHaveClass(/is-wide/);
    await expectReflow(page);
    await captureGrowth(
      page,
      info,
      `garden-growth-news-${scenario.width}-${scenario.theme}.png`,
    );
    await news.getByRole('button', { name: growth.newsDone }).click();
    await expect(news).toHaveCount(0);

    // A bouquet from the partner; thanks closes it without saving anything.
    const bouquet = page.getByTestId('garden-bouquet-card');
    await expect(
      bouquet.getByText(fill(growth.bouquetTitle, { name: 'Alex' })),
    ).toBeVisible();
    await expect(
      bouquet.getByRole('button', { name: growth.bouquetKeep }),
    ).toBeVisible();
    await captureGrowth(
      page,
      info,
      `garden-growth-bouquet-${scenario.width}-${scenario.theme}.png`,
    );
    await bouquet.getByRole('button', { name: growth.bouquetThanks }).click();
    await expect(bouquet).toHaveCount(0);

    // Kind words by plane banner, or the folded card with reduced motion.
    if (scenario.reduce) {
      await page
        .getByRole('button', { name: new RegExp(copy.foldedCard) })
        .click();
    } else {
      await page
        .getByRole('button', { name: new RegExp(growth.planeNote) })
        .click();
      await expect(page.getByTestId('garden-plane')).toHaveCount(1);
    }
    await expect(
      page.getByText(fill(copy.quoted, { words: copy.words.MISS_YOU })),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: copy.plant }).click();
    // Let the planting finish first: its confirmation would otherwise replace
    // the visitor's reaction (and the name question next to it).
    await expect(page.locator('.garden-status')).toHaveText(copy.plantedStatus);

    // A visitor reacts to a tap and the reaction is announced.
    const visitor = page
      .locator('[data-testid^="garden-animal-"][role="button"]')
      .first();
    await expect(visitor).toBeAttached({ timeout: 6000 });
    await visitor.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.garden-status')).toHaveText(
      anyOf(Object.values(growth.reactions)),
    );

    // An unnamed visitor asks for a name; the book opens at its editor.
    const kind = (await visitor.getAttribute('data-testid'))?.replace(
      'garden-animal-',
      '',
    ) as keyof typeof growth.askName;
    await page.getByRole('button', { name: growth.askName[kind] }).click();
    const editor = page.getByTestId(`garden-visitor-editor-${kind}`);
    await expect(
      editor.getByLabel(growth.visitors.question[kind]),
    ).toBeFocused();
    const chosen = growth.visitors.suggestions[kind].a;
    await editor.getByRole('button', { name: chosen }).click();
    await expect(editor.getByText(`${chosen.length} / 40`)).toBeVisible();
    await expectReflow(page);
    await captureGrowth(
      page,
      info,
      `garden-visitor-editor-${scenario.width}-${scenario.theme}.png`,
    );
    await editor.getByRole('button', { name: growth.save }).click();
    await expect(page.locator('.garden-status')).toHaveText(
      fill(growth.visitors.namedStatus, {
        visitor: growth.visitors.own[kind],
        name: chosen,
      }),
    );
    const row = page.getByTestId(`garden-visitor-${kind}`);
    await expect(row.getByText(chosen, { exact: true })).toBeVisible();
    await expect(
      row.getByText(
        fill(growth.visitors.namedSub, {
          animal: growth.animals[kind],
          where: growth.visitors.where[kind],
        }),
      ),
    ).toBeVisible();
    await expect(page.getByTestId('garden-visitors')).not.toContainText(
      growth.animals.deer,
    );
    await captureGrowth(
      page,
      info,
      `garden-visitors-${scenario.width}-${scenario.theme}.png`,
    );

    // The named visitor reacts with its name, which floats above it.
    const named = page.getByTestId(`garden-animal-${kind}`);
    await expect(named).toHaveAttribute(
      'aria-label',
      fill(growth.animalLabelNamed, {
        name: chosen,
        animal: growth.animals[kind],
      }),
    );
    await expect(async () => {
      await named.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.garden-status')).toHaveText(
        fill(growth.reactionsNamed[kind], { name: chosen }),
        { timeout: 1000 },
      );
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId('garden-name-tag')).toHaveText(chosen);
    await expect(
      page.getByRole('button', { name: growth.askName[kind] }),
    ).toHaveCount(0);

    // Bind a bouquet from two blooms for the partner.
    await page.getByRole('button', { name: growth.bind }).click();
    await page
      .getByRole('button', {
        name: fill(growth.bindPlantLabel, {
          species: copy.species.POPPY.name,
        }),
      })
      .first()
      .click();
    await page
      .getByRole('button', {
        name: fill(growth.bindPlantLabel, {
          species: copy.species.SUNFLOWER.name,
        }),
      })
      .first()
      .click();
    await expect(
      page.getByText(fill(growth.bindCount_other, { count: 2 })),
    ).toBeVisible();
    await captureGrowth(
      page,
      info,
      `garden-growth-bind-${scenario.width}-${scenario.theme}.png`,
    );
    await page
      .getByRole('button', { name: fill(growth.bindSend, { name: 'Alex' }) })
      .click();
    await expect(
      page.getByText(fill(growth.bouquetSentStatus, { name: 'Alex' })),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: growth.bind })).toHaveCount(
      0,
    );

    // The garden book with placeholders and the garden's name.
    await page.getByRole('button', { name: growth.book }).click();
    const book = page.getByTestId('garden-book');
    await expect(book.getByText(growth.secret).first()).toBeVisible();
    await expect(book).not.toContainText(/\d/);
    await book
      .getByRole('button', { name: growth.rename, exact: true })
      .click();
    await book.getByLabel(growth.nameLabel).fill('Unser Eck');
    await book.getByRole('button', { name: growth.save }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Unser Eck' }),
    ).toBeVisible();
    await expectReflow(page);
    await captureGrowth(
      page,
      info,
      `garden-growth-book-${scenario.width}-${scenario.theme}.png`,
    );

    const axe = await new AxeBuilder({ page })
      .include('.garden-game-page')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(network.writes).toEqual([
      'POST /news/seen',
      `POST /bouquets/${BOUQUET_ID}/close`,
      `POST /seeds/${PLANE_SEED_ID}/plant`,
      `PUT /visitors/${kind.toUpperCase()}/name`,
      'POST /bouquets',
      'PUT /name',
    ]);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const [localDate, season, layer] of [
  ['2026-04-10', 'spring', 'garden-blossoms'],
  ['2026-07-10', 'summer', null],
  ['2027-01-12', 'winter', 'garden-snow'],
] as const) {
  test(`garden shows ${season} from the calendar month`, async ({
    page,
  }, info) => {
    const network = await installMocks(
      page,
      gardenView({ localDate, incoming: null }),
    );
    await prepare(page, { width: 390, theme: 'light', reduce: true });
    await openGarden(page);
    await expect(page.getByTestId('garden-frame')).toHaveAttribute(
      'data-season',
      season,
    );
    if (layer) await expect(page.getByTestId(layer)).toBeVisible();
    await capture(page, info, `garden-season-${season}-390-light.png`);
    expect(network.unexpected).toEqual([]);
  });
}

/* Ambience (#1907 H3 extensions) --------------------------------------------- */

const ambience = copy.ambience;
const ALL_UNLOCKS = [...UNLOCKS, 'BIRDHOUSE', 'ROSE_ARCH', 'SWING', 'STREAM'];
const TODAY_SEED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function ambientGarden(overrides: Record<string, unknown> = {}) {
  return grownGarden({
    incoming: null,
    news: [],
    bouquet: null,
    unlocks: ALL_UNLOCKS,
    sharedDays: 60,
    form: 'PARADISE',
    ...overrides,
  });
}

/** The device clock in the page; the time zone is UTC in this block. */
async function at(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time));
}

async function press(page: Page, name: string | RegExp) {
  const target = page.getByRole('button', { name }).first();
  await target.focus();
  await page.keyboard.press('Enter');
}

/**
 * A still of the viewport, for a panned garden: a full-page capture resizes
 * the viewport, which resets the frame's horizontal scroll.
 */
async function captureView(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page
    .getByTestId('garden-frame')
    .evaluate((frame) =>
      frame.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
  const output = info.outputPath(name);
  await page.screenshot({ path: output });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

async function pan(page: Page, share: number) {
  // The tree stands in the wider part of the garden; pan it into view.
  await page.getByTestId('garden-frame').evaluate(
    (frame, left) =>
      frame.scrollTo({
        left: frame.scrollWidth * left,
        behavior: 'instant',
      }),
    share,
  );
}

test.describe('garden ambience', () => {
  test.use({ timezoneId: 'UTC' });

  for (const theme of ['light', 'dark'] as const) {
    test(`garden follows the device clock from morning to night at 390px ${theme}`, async ({
      page,
    }, info) => {
      const network = await installMocks(page, ambientGarden());
      const errors = await prepare(page, { width: 390, theme, reduce: false });
      await at(page, '2026-11-16T07:30:00Z');
      await openGarden(page);
      const frame = page.getByTestId('garden-frame');
      await expect(frame).toHaveAttribute('data-daytime', 'morning');
      await expect(page.getByTestId('garden-scene')).toHaveAttribute(
        'aria-label',
        new RegExp(ambience.daytime.morning),
      );
      await expect(page.getByTestId('garden-night-tint')).toHaveCSS(
        'opacity',
        '0',
      );
      await expect(page.locator('.garden-sun')).toHaveCSS('opacity', '1');
      await expectReflow(page);
      await captureGrowth(
        page,
        info,
        `garden-ambient-morning-390-${theme}.png`,
      );

      // The clock moves on while the garden is open: night, in either theme.
      await at(page, '2026-11-16T22:30:00Z');
      await page.evaluate(() =>
        document.dispatchEvent(new Event('visibilitychange')),
      );
      await expect(frame).toHaveAttribute('data-daytime', 'night');
      await expect(page.getByTestId('garden-night-tint')).toHaveCSS(
        'opacity',
        '1',
      );
      await expect(page.locator('.garden-moon')).toHaveCSS('opacity', '1');
      await expect(page.locator('.garden-sun')).toHaveCSS('opacity', '0');
      await expect(page.locator('.garden-firefly').first()).toBeAttached();
      await expect(page.getByTestId('garden-scene')).toHaveAttribute(
        'aria-label',
        new RegExp(ambience.daytime.night),
      );
      await pan(page, 0.36);
      await captureView(page, info, `garden-ambient-night-390-${theme}.png`);
      // At night the birds sleep in the tree.
      await press(page, ambience.labels.tree);
      await expect(page.locator('.garden-status')).toHaveText(
        ambience.tap.treeNight,
      );
      await expect(page.getByTestId('garden-tap-bird')).toHaveCount(0);
      await expectReflow(page);
      await expectNoAxeViolations(page);
      expect(network.writes).toEqual([]);
      expect(network.unexpected).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  for (const [season, localDate] of [
    ['autumn', '2026-11-16'],
    ['winter', '2027-01-12'],
  ] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`garden ambience and taps in ${season} at 390px ${theme}`, async ({
        page,
      }, info) => {
        const network = await installMocks(page, ambientGarden({ localDate }));
        const errors = await prepare(page, {
          width: 390,
          theme,
          reduce: false,
        });
        await at(page, '2026-11-16T12:00:00Z');
        await openGarden(page);
        await expect(page.getByTestId('garden-frame')).toHaveAttribute(
          'data-season',
          season,
        );
        const particles = page.getByTestId('garden-particles');
        await expect(particles).toHaveAttribute('data-season', season);
        const count = Number(await particles.getAttribute('data-count'));
        expect(count).toBeGreaterThanOrEqual(10);
        expect(count).toBeLessThanOrEqual(24);

        // The tree rustles, leaves (or snow) fall and a bird flies out.
        await press(page, ambience.labels.tree);
        await expect(page.locator('.garden-status')).toHaveText(
          season === 'autumn'
            ? ambience.tap.treeAutumn
            : ambience.tap.treeWinter,
        );
        await expect(page.getByTestId('garden-tap-leaves')).toBeAttached();
        await expect(page.getByTestId('garden-tap-bird')).toBeAttached();
        await pan(page, 0.36);
        await page.waitForTimeout(500);
        await captureView(
          page,
          info,
          `garden-ambient-${season}-390-${theme}.png`,
        );

        // Rings and a fish in the pond; a short shower from a cloud.
        await press(page, ambience.labels.pond);
        await expect(page.locator('.garden-status')).toHaveText(
          ambience.tap.pond,
        );
        await expect(page.getByTestId('garden-tap-ripple')).toBeAttached();
        await expect(page.getByTestId('garden-tap-fish')).toBeAttached();
        await press(page, ambience.labels.cloud);
        await expect(page.locator('.garden-status')).toHaveText(
          season === 'winter' ? ambience.tap.cloudSnow : ambience.tap.cloud,
        );
        await expect(page.getByTestId('garden-tap-shower')).toBeAttached();

        // A flower bobs and still opens its story.
        const flower = page
          .getByRole('button', {
            name: fill(copy.plantLabel, {
              species: copy.species.POPPY.name,
              name: 'Alex',
            }),
          })
          .first();
        await flower.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.garden-status')).toHaveText(
          season === 'winter' ? ambience.tap.flowerWinter : ambience.tap.flower,
        );
        await expect(flower).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText(copy.stages[3])).toBeVisible();
        await expect(page.getByTestId('garden-tap-petals')).toBeAttached();
        await expect(page.getByTestId('garden-tap-butterfly')).toHaveCount(
          season === 'winter' ? 0 : 1,
        );
        await expectReflow(page);
        await expectNoAxeViolations(page);
        expect(network.writes).toEqual([]);
        expect(network.unexpected).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }

  for (const scenario of [
    { width: 390, theme: 'light', reduce: false },
    { width: 390, theme: 'dark', reduce: false },
    { width: 360, theme: 'dark', reduce: true },
  ] as const) {
    test(`garden shows today's together moments and a birthday at ${scenario.width}px ${scenario.theme}${scenario.reduce ? ' reduced' : ''}`, async ({
      page,
    }, info) => {
      const plants = grownGarden().plants as Array<Record<string, unknown>>;
      const network = await installMocks(
        page,
        ambientGarden({
          plants: [
            ...plants,
            {
              id: TODAY_SEED_ID,
              species: 'POPPY',
              words: 'FOR_YOU',
              senderId: PARTNER_ID,
              sentOn: '2026-11-16',
              stage: 0,
              slot: 16,
              inPond: false,
            },
          ],
          sentToday: {
            id: '77777777-7777-4777-8777-777777777777',
            species: 'SUNFLOWER',
            words: null,
            senderId: ACCOUNT_ID,
            sentOn: '2026-11-16',
            stage: 0,
            slot: null,
          },
          partnerSentToday: true,
          sharedToday: true,
          wateredToday: plants[0].id,
          partnerWateredToday: plants[1].id,
        }),
        { birthdays: { [PARTNER_ID]: '1992-11-16' } },
      );
      const errors = await prepare(page, scenario);
      await at(page, '2026-11-16T11:00:00Z');
      await openGarden(page);

      // Derived from today only: both watered, both sent, kind words.
      await expect(page.getByTestId('garden-double-rainbow')).toBeVisible();
      await expect(page.getByTestId('garden-together')).toBeAttached();
      const label = await page
        .getByTestId('garden-scene')
        .getAttribute('aria-label');
      expect(label).toContain(ambience.doubleRainbow);
      expect(label).toContain(ambience.together.swing);
      expect(label).toContain(fill(ambience.birdhouseLabel, { name: 'Alex' }));
      // The partner's birthday decorates the tree, only on the day.
      await expect(page.getByTestId('garden-celebration')).toHaveText(
        fill(ambience.celebration.birthdayPartner, { name: 'Alex' }),
      );
      await expect(page.getByTestId('garden-celebration')).not.toContainText(
        /\d/,
      );
      await expect(
        page.getByTestId('garden-celebration-lights'),
      ).toHaveAttribute('data-lit', 'false');
      if (scenario.reduce)
        await expect(page.getByTestId('garden-particles')).toHaveCount(0);

      // The partner's words are tucked into the birdhouse.
      await press(page, fill(ambience.labels.birdhouse, { name: 'Alex' }));
      await expect(page.getByTestId('garden-birdhouse-words')).toHaveText(
        copy.words.FOR_YOU,
      );
      await expect(page.locator('.garden-status')).toHaveText(
        fill(ambience.birdhouseStatus, {
          name: 'Alex',
          words: copy.words.FOR_YOU,
        }),
      );
      await expectReflow(page);
      const suffix = `${scenario.width}-${scenario.theme}${scenario.reduce ? '-reduced' : ''}`;
      await captureGrowth(page, info, `garden-ambient-birdhouse-${suffix}.png`);
      // The two of you on the swing under the double rainbow.
      await pan(page, 0.36);
      await captureView(page, info, `garden-ambient-together-${suffix}.png`);
      await expectNoAxeViolations(page);
      expect(network.writes).toEqual([]);
      expect(network.unexpected).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`garden waters with a tilting can, a rainbow and the partner's can arriving live at 390px ${theme}`, async ({
      page,
    }, info) => {
      const network = await installMocks(page, gardenView({ incoming: null }));
      const errors = await prepare(page, { width: 390, theme, reduce: false });
      await at(page, '2026-11-16T10:30:00Z');
      await openGarden(page);
      await page.getByRole('button', { name: copy.water }).click();
      await page
        .getByRole('button', {
          name: fill(copy.waterPlantLabel, {
            species: copy.species.STARFLOWER.name,
          }),
        })
        .click();
      const can = page.getByTestId('garden-watering-can');
      await expect(can).toHaveAttribute('data-who', 'own');
      await page.waitForTimeout(1_100);
      // Mid-tilt the spout points down onto the plant (a clockwise tilt).
      const tilt = await can
        .locator('.garden-can-tilt')
        .evaluate(
          (element) => new DOMMatrix(getComputedStyle(element).transform).b,
        );
      expect(tilt).toBeGreaterThan(0.5);
      await captureGrowth(
        page,
        info,
        `garden-ambient-watering-390-${theme}.png`,
      );
      await expect(
        page.getByText(fill(copy.wateredStatus, { name: 'Alex' })),
      ).toBeVisible();
      // By day a rainbow fades in afterwards.
      await expect(page.getByTestId('garden-rainbow')).toBeAttached({
        timeout: 4_000,
      });
      await expect(can).toHaveCount(0, { timeout: 4_000 });

      // The partner waters too while the garden is open: their can, once,
      // and the double rainbow fades in.
      network.update(
        gardenView({
          incoming: null,
          wateredToday: BLOOM_ID,
          partnerWateredToday: BLOOM_ID,
        }),
      );
      await expect(page.getByTestId('garden-watering-can')).toHaveAttribute(
        'data-who',
        'partner',
        { timeout: 8_000 },
      );
      await expect(page.getByTestId('garden-double-rainbow')).toBeVisible();
      await expectNoAxeViolations(page);
      expect(network.writes).toEqual(['POST /waterings']);
      expect(network.unexpected).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test('garden book calls a named visitor who greets', async ({
    page,
  }, info) => {
    const network = await installMocks(
      page,
      ambientGarden({ visitorNames: [{ animal: 'SNAIL', name: 'Frieda' }] }),
    );
    const errors = await prepare(page, {
      width: 390,
      theme: 'light',
      reduce: false,
    });
    await at(page, '2026-11-16T12:00:00Z');
    await openGarden(page);
    const toggle = page.getByRole('button', { name: growth.book });
    await toggle.click();
    const call = page.getByRole('button', {
      name: fill(ambience.call.label, { name: 'Frieda' }),
    });
    await expect(call).toHaveText(ambience.call.action);
    await call.click();
    await expect(page.getByTestId('garden-book')).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect(page.locator('.garden-status')).toHaveText(
      fill(ambience.call.greeted, { name: 'Frieda' }),
    );
    await expect(page.getByTestId('garden-name-tag')).toHaveText('Frieda', {
      timeout: 4_000,
    });
    await expect(page.getByTestId('garden-greet-hearts')).toBeAttached();
    await expect(page.getByTestId('garden-animal-snail')).toHaveAttribute(
      'data-pose',
      'hello',
    );
    await captureGrowth(page, info, 'garden-ambient-call-390-light.png');
    await expectNoAxeViolations(page);
    expect(network.writes).toEqual([]);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
});
