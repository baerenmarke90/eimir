import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { rareDay } from '../../src/client/gardenStory';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillNoOccasionSources } from '../support/occasionSources';
import { CAPABILITIES } from '../support/storyTimelineFixture';

/*
 * The couple's story in the shared garden (#1907 H3 follow-up): Milestones
 * grow as special plants with a card and a link, visitors leave finds, the
 * garden book lists both, "Euer Gartenjahr" replays the garden with pause and
 * close (start and today next to each other with reduced motion), sound stays off until chosen and
 * a rare owl comes on an evening, in Compact Light/Dark with axe and reflow.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_PATH = `/api/v1/spaces/${SPACE_ID}`;
const GARDEN_PATH = `${SPACE_PATH}/games/garden`;
const CREATED_AT = '2023-06-17T08:00:00Z';
const copy = games.garden;
const story = copy.story;

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

const MILESTONES = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: 'Unser Anfang',
    on: '2023-06-17',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    title: 'Erste Reise',
    on: '2024-05-12',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    title: 'Zusammengezogen',
    on: '2025-09-01',
  },
];

function milestone({ id, title, on }: (typeof MILESTONES)[number]) {
  return {
    id,
    spaceId: SPACE_ID,
    authorId: ACCOUNT_ID,
    author: { id: ACCOUNT_ID, displayName: 'Lea' },
    title,
    body: null,
    happenedOn: on,
    createdAt: `${on}T10:00:00Z`,
    updatedAt: `${on}T10:00:00Z`,
    version: 1,
    capabilities: CAPABILITIES,
  };
}

function plant(index: number) {
  const species = ['POPPY', 'SUNFLOWER', 'BELLFLOWER', 'STRAWBERRY'][index % 4];
  const day = String(1 + index * 3).padStart(2, '0');
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    species,
    words: null,
    senderId: index % 2 ? ACCOUNT_ID : PARTNER_ID,
    sentOn:
      index < 10
        ? `2026-10-${day}`
        : `2026-11-${String(index - 9).padStart(2, '0')}`,
    stage: index % 5 === 4 ? 1 : 3,
    slot: index,
    inPond: false,
  };
}

function gardenView(overrides: Record<string, unknown> = {}) {
  return {
    localDate: '2026-11-16',
    plants: Array.from({ length: 12 }, (_, index) => plant(index)),
    incoming: null,
    sentToday: null,
    partnerSentToday: false,
    sharedToday: false,
    wateredToday: null,
    partnerWateredToday: null,
    offer: ['POPPY', 'BELLFLOWER', 'STARFLOWER'],
    sleeping: false,
    reunionOn: null,
    reunionToday: false,
    sharedDays: 30,
    form: 'GARDEN',
    unlocks: [
      'PATH',
      'POND',
      'SUNFLOWER',
      'TULIP',
      'WATER_LILY',
      'BENCH',
      'TREE',
      'MORE_ROOM',
      'STRAWBERRY',
    ],
    news: [],
    discovered: ['POPPY', 'BELLFLOWER', 'STARFLOWER', 'SUNFLOWER'],
    name: null,
    bouquet: null,
    gaveBouquetToday: false,
    visitorNames: [],
    ...overrides,
  };
}

async function installMocks(
  page: Page,
  garden: ReturnType<typeof gardenView> = gardenView(),
) {
  const unexpected: string[] = [];
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
    // Already on Wir, so the one-time Wir offer (wir-garden.spec.ts) stays away.
    [`${SPACE_PATH}/dashboard/preferences`]: {
      items: [{ moduleKey: 'shared_garden', visible: true }],
    },
    [`${SPACE_PATH}/milestones`]: {
      items: MILESTONES.map(milestone),
      hasMore: false,
      nextCursor: null,
    },
  };
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
            accessToken: 'garden-story-access-token',
            refreshToken: 'garden-story-refresh-token',
            accessExpiresAt: '2099-01-01T00:00:00Z',
            refreshExpiresAt: '2099-01-02T00:00:00Z',
          },
        },
      });
      return;
    }
    if (method === 'POST' && pathname === `${SPACE_PATH}/presence`) {
      await route.fulfill({ json: { state: null } });
      return;
    }
    if (method === 'GET' && pathname === GARDEN_PATH) {
      await route.fulfill({ json: garden });
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
  return { unexpected };
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

async function expectNoAxeViolations(page: Page) {
  const axe = await new AxeBuilder({ page })
    .include('.garden-game-page')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
}

async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  { fullPage = true }: { fullPage?: boolean } = {},
) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  // Let a focused skip link slide back out of view first.
  await page.waitForTimeout(400);
  const output = info.outputPath(name);
  await page.screenshot({ path: output, fullPage });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

for (const scenario of [
  { width: 390, theme: 'light', reduce: false },
  { width: 390, theme: 'dark', reduce: true },
] as const) {
  test(`garden grows the couple's story, finds and garden year at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const network = await installMocks(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: scenario.reduce ? 'reduce' : 'no-preference',
    });
    await openGarden(page);

    // Milestones stand as named plants in the memory corner.
    const memoryPlants = page.getByTestId('garden-memory-plant');
    await expect(memoryPlants).toHaveCount(MILESTONES.length);
    const trip = MILESTONES[1];
    const tripDate = dateFormat.format(new Date(`${trip.on}T00:00:00Z`));
    const tripPlant = page.getByRole('button', {
      name: fill(story.memoryLabel, { title: trip.title, date: tripDate }),
    });
    await tripPlant.focus();
    await page.keyboard.press('Enter');
    const card = page.getByTestId('garden-memory-card');
    await expect(card.getByRole('heading', { name: trip.title })).toBeVisible();
    await expect(card.getByText(tripDate)).toBeVisible();
    await expect(tripPlant).toHaveAttribute('aria-pressed', 'true');
    const open = card.getByRole('link', { name: story.open });
    await expect(open).toHaveAttribute('href', `/story/milestones/${trip.id}`);
    await expectReflow(page);
    await page.getByTestId('garden-frame').scrollIntoViewIfNeeded();
    await capture(
      page,
      info,
      `garden-story-milestone-card-${scenario.width}-${scenario.theme}.png`,
    );

    // A visitor leaves a find after a tap; it glints once and is announced.
    const visitor = page
      .locator('[data-testid^="garden-animal-"][role="button"]')
      .first();
    await expect(visitor).toBeAttached({ timeout: 6000 });
    await visitor.focus();
    await page.keyboard.press('Enter');
    const note = page.getByTestId('garden-keepsake-note');
    await expect(note).toContainText(/dagelassen/);
    await expect(page.getByTestId('garden-keepsake-sparkle')).toBeAttached();
    const left = (await page
      .getByTestId('garden-keepsake-sparkle')
      .getAttribute('data-keepsake')) as keyof typeof story.keepsakes;

    // The garden book: the story, the finds and this device's sounds.
    await page.getByRole('button', { name: copy.growth.book }).click();
    const book = page.getByTestId('garden-book');
    const storySection = book.getByTestId('garden-memory-book');
    await expect(
      storySection.getByRole('heading', { name: story.bookTitle }),
    ).toBeVisible();
    for (const entry of MILESTONES) {
      await expect(
        storySection.getByRole('link', {
          name: fill(story.openLabel, { title: entry.title }),
        }),
      ).toHaveAttribute('href', `/story/milestones/${entry.id}`);
    }
    const finds = book.getByTestId('garden-keepsakes');
    await expect(
      finds.getByRole('heading', { name: story.keepsakesTitle }),
    ).toBeVisible();
    await expect(finds.getByRole('listitem')).toHaveCount(6);
    await expect(finds.getByText(story.keepsakes[left])).toBeVisible();
    await expect(finds).not.toContainText(/\d/);
    const sound = book.getByRole('switch', { name: story.feedback.sound });
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    // Vibration exists only in the native app.
    await expect(
      book.getByRole('switch', { name: story.feedback.vibration }),
    ).toHaveCount(0);
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    await expectReflow(page);
    await book.getByTestId('garden-memory-book').scrollIntoViewIfNeeded();
    await capture(
      page,
      info,
      `garden-story-book-${scenario.width}-${scenario.theme}.png`,
    );

    // "Euer Gartenjahr": a dialog with pause and close, focus kept inside.
    const play = book.getByRole('button', { name: story.playback.play });
    await play.click();
    const dialog = page.getByRole('dialog', { name: story.playback.title });
    await expect(dialog).toBeVisible();
    if (scenario.reduce) {
      // Reduced motion: the start and today next to each other, nothing plays.
      await expect(dialog.getByTestId('garden-playback-pair')).toBeVisible();
      await expect(dialog.locator('figure')).toHaveCount(2);
      await expect(
        dialog.getByRole('button', { name: story.playback.close }),
      ).toBeFocused();
      await expect(dialog.getByTestId('garden-playback-toggle')).toHaveCount(0);
    } else {
      const toggle = dialog.getByTestId('garden-playback-toggle');
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveText(story.playback.pause);
      await page.waitForTimeout(4000);
      await toggle.click();
      await expect(toggle).toHaveText(story.playback.resume);
      const paused = await dialog
        .getByTestId('garden-playback-caption')
        .textContent();
      await page.waitForTimeout(600);
      await expect(dialog.getByTestId('garden-playback-caption')).toHaveText(
        paused ?? '',
      );
    }
    await expectReflow(page);
    await expectNoAxeViolations(page);
    await capture(
      page,
      info,
      `garden-story-playback-${scenario.width}-${scenario.theme}.png`,
      { fullPage: false },
    );
    if (scenario.reduce) {
      await page.keyboard.press('Escape');
    } else {
      const toggle = dialog.getByTestId('garden-playback-toggle');
      await toggle.click();
      // It ends on today and offers to play again.
      await expect(toggle).toHaveText(story.playback.again, {
        timeout: 20_000,
      });
      await expect(dialog.getByTestId('garden-playback-caption')).toContainText(
        story.playback.today,
      );
      await dialog.getByRole('button', { name: story.playback.close }).click();
    }
    await expect(dialog).toHaveCount(0);
    await expect(play).toBeFocused();
    await expectNoAxeViolations(page);
    expect(network.unexpected).toEqual([]);
    expect(errors).toEqual([]);

    // The card's link leads to the Milestone itself.
    await page.getByTestId('garden-frame').scrollIntoViewIfNeeded();
    if ((await card.count()) === 0) await tripPlant.click();
    await card.getByRole('link', { name: story.open }).click();
    await expect(page).toHaveURL(new RegExp(`/story/milestones/${trip.id}$`));
  });
}

test('garden stays unchanged without Milestones', async ({ page }) => {
  await installMocks(page);
  await page.route(`**${SPACE_PATH}/milestones**`, (route) =>
    route.fulfill({ status: 500, json: { code: 'E2E_UNAVAILABLE' } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGarden(page);
  await expect(page.getByTestId('garden-scene')).toBeVisible();
  await expect(page.getByTestId('garden-memory-plant')).toHaveCount(0);
  await page.getByRole('button', { name: copy.growth.book }).click();
  await expect(page.getByTestId('garden-memory-book')).toHaveCount(0);
  await expect(page.getByTestId('garden-book')).toBeVisible();
});

test('a rare owl visits the couple’s tree in the evening', async ({
  page,
}, info) => {
  // The owl comes on about every other evening; pick the next such day.
  const day = Array.from({ length: 20 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 16 + index));
    return date.toISOString().slice(0, 10);
  }).find((candidate) =>
    rareDay('owl', SPACE_ID, new Date(`${candidate}T00:00:00Z`)),
  ) as string;
  await page.clock.setFixedTime(new Date(`${day}T20:30:00`));
  const network = await installMocks(page, gardenView({ localDate: day }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await openGarden(page);
  const owl = page.getByRole('button', { name: story.rare.owl.label });
  await expect(owl).toBeAttached();
  await owl.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.garden-status').first()).toHaveText(
    story.rare.owl.reaction,
  );
  // Rare visitors cannot be named and stay out of the visitor list.
  await page.getByRole('button', { name: copy.growth.book }).click();
  await expect(page.getByTestId('garden-visitors')).not.toContainText(/Eule/);
  // The tree stands further right; pan the garden to the owl.
  const frame = page.getByTestId('garden-frame');
  await frame.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await frame.scrollIntoViewIfNeeded();
  await capture(page, info, 'garden-story-rare-owl-390-dark.png', {
    fullPage: false,
  });
  expect(network.unexpected).toEqual([]);
});
