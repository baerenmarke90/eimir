import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import AxeBuilder from '../support/axe';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  PARTNER,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/**
 * The optional Wir garden module (Product Owner 2026-11-17: show the garden
 * on Wir for those who want it): off by default, turned on in
 * Settings › Wir, Premium (`games.couple`), a read-only scene with one status
 * line that leads into the game. No garden read happens while it is off or
 * without the capability.
 */

const copy = games.garden;
const SPACE_PATH = `/api/v1/spaces/${SPACE_ID}`;
const GARDEN_PATH = `${SPACE_PATH}/games/garden`;

type Server = {
  gardenReads: number;
  modulePreferences: { moduleKey: string; visible: boolean }[];
  preferenceWrites: { moduleKey: string; visible: boolean }[];
};

const plant = (id: string, slot: number, stage: number, senderId: string) => ({
  id,
  species: slot % 2 ? 'POPPY' : 'STARFLOWER',
  words: null,
  senderId,
  sentOn: '2026-11-08',
  stage,
  slot,
});

function gardenView(name: string | null, extra: Record<string, unknown> = {}) {
  return {
    localDate: '2026-07-16',
    name,
    form: 'MEADOW',
    sharedDays: 9,
    unlocks: ['PATH'],
    plants: [
      plant('a0000000-0000-4000-8000-000000000001', 0, 3, PARTNER.id),
      plant('a0000000-0000-4000-8000-000000000002', 1, 2, ACCOUNT_ID),
      plant('a0000000-0000-4000-8000-000000000003', 2, 3, ACCOUNT_ID),
      plant('a0000000-0000-4000-8000-000000000004', 3, 1, PARTNER.id),
    ],
    incoming: {
      ...plant('a0000000-0000-4000-8000-000000000005', 0, 0, PARTNER.id),
      species: 'BELLFLOWER',
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
    ...extra,
  };
}

async function gardenMocks(
  page: Page,
  {
    pro = true,
    name = null,
    garden = {},
  }: {
    pro?: boolean;
    name?: string | null;
    garden?: Record<string, unknown>;
  } = {},
): Promise<Server> {
  await installMocks(page);
  const server: Server = {
    gardenReads: 0,
    modulePreferences: [],
    preferenceWrites: [],
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'GET' && url.pathname === `${SPACE_PATH}/entitlements`) {
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: pro ? 'PREMIUM' : 'FREE',
          status: 'ACTIVE',
          effectiveUntil: null,
          isInGracePeriod: false,
          capabilities: pro ? ['core', 'games.couple'] : ['core'],
        },
      });
    }
    if (method === 'GET' && url.pathname === GARDEN_PATH) {
      server.gardenReads += 1;
      return route.fulfill({ json: gardenView(name, garden) });
    }
    if (method === 'POST' && url.pathname === `${GARDEN_PATH}/waterings`) {
      const { plantId } = request.postDataJSON() as { plantId: string };
      return route.fulfill({
        json: gardenView(name, { ...garden, wateredToday: plantId }),
      });
    }
    if (method === 'GET' && url.pathname === `${SPACE_PATH}/dashboard`) {
      return route.fulfill({
        json: {
          recentShared: [],
          relationshipDuration: {
            startedOn: '2023-08-23',
            daysTogether: 1178,
            displayMode: 'DAYS',
          },
          retrospective: null,
          space: { partner: PARTNER, spaceId: SPACE_ID },
          upcoming: [],
          viewerLocalDate: '2026-07-16',
        },
      });
    }
    if (method === 'GET' && url.pathname === `${SPACE_PATH}/recaps`) {
      return route.fulfill({
        json: { canCompose: false, editions: [], periods: [], hasMore: false },
      });
    }
    if (method === 'GET' && url.pathname.endsWith('/dashboard/preferences')) {
      return route.fulfill({ json: { items: server.modulePreferences } });
    }
    const moduleMatch = url.pathname.match(
      /\/dashboard\/preferences\/([a-z_]+)$/,
    );
    if (method === 'PATCH' && moduleMatch && moduleMatch[1] !== 'order') {
      const body = request.postDataJSON() as { visible: boolean };
      const item = { moduleKey: moduleMatch[1], visible: body.visible };
      server.preferenceWrites.push(item);
      server.modulePreferences = [
        ...server.modulePreferences.filter(
          (entry) => entry.moduleKey !== item.moduleKey,
        ),
        item,
      ];
      return route.fulfill({ json: item });
    }
    if (method === 'GET' && url.pathname.endsWith('/activity')) {
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    }
    return route.fallback();
  });
  return server;
}

async function openWir(page: Page) {
  await signIn(page);
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.goto('/today');
  await expect(page.locator('.today-hero')).toBeVisible();
}

async function turnGardenOn(page: Page) {
  await page.goto('/more/settings/today');
  const toggle = page.getByRole('checkbox', { name: copy.title });
  // Off by default, but listed in its place like the other optional Pro rows.
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toBeChecked();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectAxeClean(page: Page, include: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include(include)
    .analyze();
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
}

function gardenCard(page: Page, title = copy.title) {
  return page.getByRole('link', {
    name: copy.wir.openAria.replace('{{title}}', title),
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Settings › Wir turns the garden on and Wir leads into the game: ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const server = await gardenMocks(page);
    await openWir(page);
    // Off by default: no module and no garden read.
    await page.waitForTimeout(400);
    await expect(page.locator('.today-section-garden')).toHaveCount(0);
    expect(server.gardenReads).toBe(0);

    await turnGardenOn(page);
    expect(server.preferenceWrites).toEqual([
      { moduleKey: 'shared_garden', visible: true },
    ]);
    await captureScreenshot(page, info, `wir-garden-settings-390-${theme}.png`);

    await page.goto('/today');
    const card = gardenCard(page);
    await expect(card).toBeVisible();
    await expect(
      card.getByRole('heading', { level: 2, name: copy.title }),
    ).toBeVisible();
    await expect(card).toContainText(
      copy.arrivedTitle.replace('{{name}}', PARTNER.displayName),
    );
    await expect(card.getByTestId('garden-scene-preview')).toBeVisible();
    // Read-only: nothing inside the link is focusable on its own.
    await expect(card.locator('[role="button"], [tabindex]')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe(theme);
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page, '.today-section-garden');
    await card.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `wir-garden-390-${theme}.png`);

    // No live polling on Wir: the read count stays put.
    const reads = server.gardenReads;
    await page.waitForTimeout(3_200);
    expect(server.gardenReads).toBe(reads);

    await card.click();
    await expect(page).toHaveURL(/\/games\/garden$/);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeVisible();
    await expect(page.getByTestId('garden-scene')).toBeVisible();
  });
}

test('without Pro: the row is locked, Wir shows nothing and reads no garden', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await gardenMocks(page, { pro: false });
  // An earlier Pro choice stays saved after a downgrade.
  server.modulePreferences = [{ moduleKey: 'shared_garden', visible: true }];
  await openWir(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.today-section-garden')).toHaveCount(0);

  await page.goto('/more/settings/today');
  const toggle = page.getByRole('checkbox', { name: copy.title });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeDisabled();
  await expect(
    page
      .locator('.dashboard-module-option')
      .filter({ has: toggle })
      .locator('.pro-mark'),
  ).toBeVisible();
  expect(server.gardenReads).toBe(0);
  expect(server.preferenceWrites).toEqual([]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`evidence: Wir garden module 1280 ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const server = await gardenMocks(page, { name: 'Unser Eck' });
    server.modulePreferences = [{ moduleKey: 'shared_garden', visible: true }];
    await openWir(page);
    const card = gardenCard(page, 'Unser Eck');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('garden-scene-preview')).not.toHaveClass(
      /is-lively/,
    );
    await expectNoHorizontalOverflow(page);
    await card.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `wir-garden-1280-${theme}.png`);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the garden offers Wir once after a moment and turns it on: ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const server = await gardenMocks(page, { garden: { incoming: null } });
    await signIn(page);
    await expect(page.getByLabel(de.login.email)).toHaveCount(0);
    await page.goto('/games/garden');
    await expect(page.getByTestId('garden-scene')).toBeVisible();
    const hint = page.locator('.garden-wir-hint aside');
    await expect(hint).toHaveCount(0);

    // A first moment: the daily watering gesture.
    await page
      .getByRole('button', {
        name: copy.plantLabel
          .replace('{{species}}', copy.species.STARFLOWER.name)
          .replace('{{name}}', PARTNER.displayName),
      })
      .first()
      .click();
    await page.getByRole('button', { name: copy.water }).click();
    await page
      .getByRole('button', {
        name: copy.waterPlantLabel.replace(
          '{{species}}',
          copy.species.STARFLOWER.name,
        ),
      })
      .first()
      .click();
    await expect(
      page.getByText(
        copy.wateredStatus.replace('{{name}}', PARTNER.displayName),
      ),
    ).toBeVisible();

    await expect(hint.getByText(copy.wirHint.text)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page, '.garden-wir-hint');
    await expect(page.locator('.garden-wir-hint [role="status"]')).toHaveText(
      copy.wirHint.text,
    );
    await hint.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `wir-garden-hint-390-${theme}.png`);

    await hint.getByRole('button', { name: copy.wirHint.accept }).click();
    await expect(hint.getByText(copy.wirHint.done)).toBeVisible();
    expect(server.preferenceWrites).toEqual([
      { moduleKey: 'shared_garden', visible: true },
    ]);
    await captureScreenshot(
      page,
      info,
      `wir-garden-hint-done-390-${theme}.png`,
    );

    await hint.getByRole('link', { name: copy.wirHint.toWir }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(gardenCard(page)).toBeVisible();

    // Once per account and device: no second offer on the next visit.
    await page.goto('/games/garden');
    await expect(page.getByTestId('garden-scene')).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(hint).toHaveCount(0);
  });
}
