import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import discreetPlans from '../../src/i18n/locales/discreetPlans';
import copy from '../../src/i18n/locales/m5s3';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

// #1790 F3: a discreet Plan is a shared visual shield, never a permission.
const PLAN = '55555555-5555-4555-8555-555555555555';
const PLACE = '66666666-6666-4666-8666-666666666666';
const BASE = `/api/v1/spaces/${SPACE_ID}`;
const TITLE = 'Hotelnacht nur für uns';
const PREVIEW = 'Wochenende zu zweit';
const DESCRIPTION = 'Zimmer mit Blick auf den See, ab 19 Uhr Sauna.';
const PLACE_NAME = 'Hotel am Seeufer';
const cover = fileURLToPath(
  new URL('../fixtures/plan-cover-fit/landscape.png', import.meta.url),
);

async function fixture(page: Page, overrides: Record<string, unknown> = {}) {
  const unexpected = await installMocks(page);
  const patches: Record<string, unknown>[] = [];
  let plan = {
    id: PLAN,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    title: TITLE,
    description: DESCRIPTION,
    tags: ['Seeufer'],
    plannedOn: null,
    plannedStart: '2099-11-21T18:00:00Z',
    plannedEnd: '2099-11-22T10:00:00Z',
    experiencedOn: null,
    placeId: PLACE,
    sourceWishId: null,
    anticipationEnabled: false,
    discreet: true,
    discreetTitleMode: 'PREVIEW',
    previewTitle: PREVIEW,
    status: 'PLANNED',
    version: 1,
    createdAt: '2026-11-13T12:00:00Z',
    updatedAt: '2026-11-13T12:00:00Z',
    capabilities: CAPABILITIES,
    coverAttachment: {
      id: 'discreet-cover',
      status: 'READY',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      size: 12000,
      width: 1600,
      height: 900,
      hasThumbnail: false,
      isSensitive: false,
    },
    attachments: [
      {
        id: 'discreet-cover',
        position: 0,
        status: 'READY',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        size: 12000,
        width: 1600,
        height: 900,
        hasThumbnail: false,
        isSensitive: false,
        canEditSensitivity: true,
      },
    ],
    ...overrides,
  };
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === `${BASE}/plans`)
      return route.fulfill({
        json: {
          items: url.searchParams.get('overviewScope') === 'OPEN' ? [plan] : [],
          nextCursor: null,
        },
      });
    if (path === `${BASE}/plans/${PLAN}`) {
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON() as Record<string, unknown>;
        patches.push(body);
        plan = { ...plan, ...body, version: plan.version + 1 };
      }
      return route.fulfill({ json: plan });
    }
    if (path === `${BASE}/places`)
      return route.fulfill({
        json: {
          hasMore: false,
          nextCursor: null,
          items: [
            {
              address: null,
              capabilities: { canEdit: true, canDelete: true },
              createdAt: '2026-11-13T12:00:00Z',
              createdBy: ACCOUNT_ID,
              creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
              description: null,
              id: PLACE,
              latitude: null,
              longitude: null,
              name: PLACE_NAME,
              spaceId: SPACE_ID,
              updatedAt: '2026-11-13T12:00:00Z',
              version: 1,
            },
          ],
        },
      });
    if ([`${BASE}/wishes`, `${BASE}/chapters`].includes(path))
      return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === `${BASE}/attachments/discreet-cover/read-access`)
      return route.fulfill({
        json: {
          method: 'STREAM',
          url: `${BASE}/attachments/discreet-cover/content`,
          expiresAt: null,
        },
      });
    if (path === `${BASE}/attachments/discreet-cover/content`)
      return route.fulfill({
        contentType: 'image/png',
        body: readFileSync(cover),
      });
    return route.fallback();
  });
  return { unexpected, patches };
}

async function prepare(
  page: Page,
  scenario: { width: number; height: number; theme: 'light' | 'dark' },
) {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  await page.emulateMedia({
    colorScheme: scenario.theme,
    reducedMotion: 'reduce',
  });
  await page.addInitScript(
    (theme) => localStorage.setItem('eimir.theme', theme),
    scenario.theme,
  );
  await signIn(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectAccessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
}

for (const scenario of [
  { width: 360, height: 800, theme: 'light', largeText: false },
  { width: 390, height: 844, theme: 'dark', largeText: false },
  { width: 430, height: 932, theme: 'light', largeText: false },
  { width: 1280, height: 900, theme: 'dark', largeText: false },
  { width: 360, height: 800, theme: 'light', largeText: true },
] as const) {
  const name = `${scenario.width}-${scenario.theme}${scenario.largeText ? '-large' : ''}`;
  test(`discreet Plan stays concealed outside the revealed detail: ${name}`, async ({
    page,
  }, info) => {
    const state = await fixture(page);
    await prepare(page, scenario);
    await page.goto('/plan');
    if (scenario.largeText)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });

    const card = page.locator('.planen-next-link');
    await expect(card).toContainText(PREVIEW);
    await expect(card).not.toContainText(TITLE);
    await expect(card).not.toContainText('Sauna');
    await expect(card.locator('.discreet-lines')).toBeVisible();
    await expect(
      card.getByRole('img', { name: discreetPlans.lockLabel }),
    ).toHaveCount(1);
    await expect(card.locator('.sensitive-media-cover')).toBeVisible();
    await expect(page.getByText(discreetPlans.editor.label)).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `discreet-plans-overview-${name}.png`);
    await expectNoHorizontalOverflow(page);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN}$`));
    await expect(
      page.getByRole('heading', { name: PREVIEW, level: 2 }),
    ).toBeVisible();
    for (const hidden of [TITLE, 'Sauna', PLACE_NAME, 'Seeufer'])
      await expect(page.locator('main')).not.toContainText(hidden);
    await expect(
      page.getByRole('button', { name: copy.plan.complete, exact: true }),
    ).toBeVisible();
    const reveal = page.getByRole('button', {
      name: discreetPlans.detail.reveal,
      exact: true,
    });
    await expect(reveal).toBeVisible();
    await expectAccessible(page);
    await captureScreenshot(page, info, `discreet-plans-concealed-${name}.png`, {
      fullPage: true,
    });

    await reveal.click();
    await expect(
      page.getByRole('heading', { name: TITLE, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
    await expect(page.getByText(PLACE_NAME)).toBeVisible();
    const conceal = page.getByRole('button', {
      name: discreetPlans.detail.conceal,
      exact: true,
    });
    await expect(conceal).toBeFocused();
    await expectAccessible(page);
    await captureScreenshot(page, info, `discreet-plans-revealed-${name}.png`, {
      fullPage: true,
    });

    // Going to the background conceals the view again.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);
    await expect(reveal).toBeVisible();

    // Leaving the view and returning keeps it concealed.
    await page.goBack();
    await expect(page).toHaveURL(/\/plan$/);
    await page.locator('.planen-next-link').click();
    await expect(
      page.getByRole('heading', { name: PREVIEW, level: 2 }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(state.patches).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test('either partner turns Diskret on in the editor and chooses the list title', async ({
  page,
}, info) => {
  const state = await fixture(page, {
    discreet: false,
    previewTitle: null,
    coverAttachment: null,
    attachments: [],
  });
  await prepare(page, { width: 390, height: 844, theme: 'light' });
  await page.goto(`/plan/plans/${PLAN}`);
  await expect(page.getByText(DESCRIPTION)).toBeVisible();
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();

  const switches = page.getByRole('switch');
  await expect(switches).toHaveCount(2);
  const discreet = page.getByRole('switch', {
    name: discreetPlans.editor.label,
  });
  await expect(discreet).toHaveAttribute('aria-checked', 'false');
  await discreet.click();
  const preview = page.getByRole('textbox', {
    name: discreetPlans.editor.previewTitle,
  });
  await expect(preview).toHaveValue(discreetPlans.suggestions.weekend);
  await expect(
    page.getByRole('radio', { name: discreetPlans.editor.preview }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: discreetPlans.suggestions.EVENING }),
  ).toBeVisible();
  await page.getByText(discreetPlans.editor.label).scrollIntoViewIfNeeded();
  await expectAccessible(page);
  await captureScreenshot(page, info, 'discreet-plans-editor-390-light.png', {
    fullPage: true,
  });

  await page
    .getByRole('button', { name: discreetPlans.suggestions.EVENING })
    .click();
  await expect(preview).toHaveValue(discreetPlans.suggestions.EVENING);
  await page
    .getByRole('radio', { name: discreetPlans.editor.original })
    .check();
  await expect(page.getByText(discreetPlans.editor.originalHelp)).toBeVisible();
  await captureScreenshot(
    page,
    info,
    'discreet-plans-editor-original-390-light.png',
    { fullPage: true },
  );
  await page
    .getByRole('button', { name: copy.common.saveChanges, exact: true })
    .click();
  await expect.poll(() => state.patches.length).toBe(1);
  expect(state.patches[0]).toMatchObject({
    discreet: true,
    discreetTitleMode: 'ORIGINAL',
    previewTitle: discreetPlans.suggestions.EVENING,
  });
  // Original-title mode: the real title stays, the prose is concealed.
  await expect(page.getByRole('heading', { name: TITLE, level: 2 })).toBeVisible();
  await expect(page.getByText(DESCRIPTION)).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});
