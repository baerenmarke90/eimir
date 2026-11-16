import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillNoOccasionSources } from '../support/occasionSources';

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
    ...overrides,
  };
}

async function installMocks(page: Page) {
  const unexpected: string[] = [];
  const writes: string[] = [];
  let garden = gardenView();
  const planted = { ...garden.incoming, slot: 1, stage: 0 };
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
  return { unexpected, writes };
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
    await book.getByRole('button', { name: growth.rename }).click();
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
      'POST /bouquets',
      'PUT /name',
    ]);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
