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
