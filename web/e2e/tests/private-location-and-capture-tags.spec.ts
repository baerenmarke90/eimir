import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import composer from '../../src/i18n/locales/composer';
import contextTags from '../../src/i18n/locales/contextTags';
import en from '../../src/i18n/locales/en.json' with { type: 'json' };
import m5s3 from '../../src/i18n/locales/m5s3';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  expectInlineAddLayout,
  expectLabeledAddAction,
  expectLabeledComposerTool,
  expectNaturalTextReflow,
  expectReadableActionLabel,
} from '../support/addAction';
import {
  closeContextTags,
  closeHeartAudience,
  openComposerPlace,
  showContextTags,
  showHeartAudience,
  showHeartEmotions,
} from '../support/memoryDiary';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const LOCATION = {
  name: 'A quiet lake',
  address: 'By the water',
  latitude: 49.1,
  longitude: 7.2,
};

async function setup(page: Page, premium = false) {
  let saved: Record<string, unknown> | null = null;
  let sharedPlaceWrites = 0;
  const mutations: Record<string, unknown>[] = [];
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  await installMocks(page);
  await page.route('**/api/v1/spaces/*/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    if (pathname.endsWith('/entitlements'))
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: premium ? 'PREMIUM' : 'FREE',
          status: 'ACTIVE',
          isInGracePeriod: false,
          effectiveUntil: null,
          capabilities: premium
            ? ['core', 'relationship.passport', 'games.premium']
            : ['core'],
        },
      });
    if (pathname.endsWith('/places/lookup'))
      return route.fulfill({ json: { items: [LOCATION] } });
    if (pathname.endsWith('/places') && method === 'POST') {
      sharedPlaceWrites++;
      return route.fulfill({
        status: 500,
        json: { detail: 'Unexpected shared write' },
      });
    }
    if (pathname.endsWith('/places') && method === 'GET')
      return route.fulfill({
        json: {
          items: [
            { ...LOCATION, id: 'saved-place', spaceId: SPACE_ID, version: 1 },
          ],
          nextCursor: null,
        },
      });
    if (pathname.endsWith('/heart-moments') && method === 'POST') {
      const body = request.postDataJSON();
      mutations.push(body);
      saved = {
        ...body,
        id: 'private-heart',
        spaceId: SPACE_ID,
        author: ME,
        authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES,
        attachment: null,
        attachments: [],
        version: 1,
        createdAt: '2026-11-06T12:00:00Z',
        updatedAt: '2026-11-06T12:00:00Z',
      };
      return route.fulfill({ status: 201, json: saved });
    }
    if (pathname.endsWith('/heart-moments/private-heart') && saved) {
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        mutations.push(body);
        saved = { ...saved, ...body, version: Number(saved.version) + 1 };
      }
      return route.fulfill({ json: saved });
    }
    return route.fallback();
  });
  // Map selection must also work without contacting a real tile provider.
  await page.route('https://*.tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  await signIn(page);
  return { mutations, sharedWrites: () => sharedPlaceWrites };
}

async function tagGeometry(page: Page) {
  if (!(await page.getByLabel(contextTags.newLabel).isVisible())) {
    const tool = page
      .locator('.composer-tool-row button')
      .filter({ has: page.locator('.eimir-icon-tag') });
    if (await tool.count()) await expectLabeledComposerTool(tool, 'tag');
    else {
      const disclosure = page.getByRole('button', {
        name: contextTags.add,
        exact: true,
      });
      await expectLabeledAddAction(disclosure, 'tag');
      await expectReadableActionLabel(disclosure);
    }
  }
  await showContextTags(page);
  const row = page.locator('.context-tag-entry');
  const input = row.locator('input');
  const add = row.getByRole('button', { name: contextTags.add });
  const inComposerSheet =
    (await page.locator('dialog.composer-tag-sheet').count()) > 0;
  if (inComposerSheet) {
    await expect(add).toBeVisible();
    await expect(add).toHaveAttribute('type', 'button');
    await expectNaturalTextReflow(add.locator('.add-action-label'), 2);
    const bounds = await add.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  } else await expectLabeledAddAction(add, 'tag');
  await expect(input).toHaveAttribute(
    'placeholder',
    inComposerSheet ? composer.addOwnTag : contextTags.placeholder,
  );
  if (inComposerSheet)
    await expect(page.locator('.context-tag-suggestions')).toHaveAttribute(
      'open',
      '',
    );
  else
    await expect(page.locator('.context-tag-suggestions')).not.toHaveAttribute(
      'open',
      '',
    );
  await expectInlineAddLayout(input, add);
  const [entryBox, inputBox] = await Promise.all([
    row.boundingBox(),
    input.boundingBox(),
  ]);
  if (!entryBox || !inputBox)
    throw new Error('Disclosed tag entry did not render.');
  if (inComposerSheet) {
    expect(inputBox.width).toBeGreaterThanOrEqual(44);
    expect(inputBox.x).toBeGreaterThanOrEqual(entryBox.x);
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(
      entryBox.x + entryBox.width,
    );
  } else expect(inputBox.width).toBeGreaterThanOrEqual(entryBox.width - 1);
  const icon = inComposerSheet
    ? row.locator(':scope > .eimir-icon')
    : add.locator('.eimir-icon-tag');
  await expect(icon).toBeVisible();
  const symbol = await icon.boundingBox();
  expect(symbol?.width).toBeGreaterThanOrEqual(20);
  expect(symbol?.height).toBeGreaterThanOrEqual(20);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const variant of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 430, theme: 'light' },
  { width: 1280, theme: 'dark' },
]) {
  test(`private location creates no shared Place, survives save/edit/reload: ${variant.width} ${variant.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: 844 });
    await page.emulateMedia({
      colorScheme: variant.theme as 'light' | 'dark',
      reducedMotion: 'reduce',
    });
    const result = await setup(page, true);
    await page.goto('/story/heart-moments/new');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      variant.theme,
    );
    await page
      .getByRole('textbox', {
        name: storyProducts.heartMomentProduct.textLabel,
        exact: true,
      })
      .fill('A private thought');
    await showHeartAudience(page);
    await page
      .getByRole('radio', {
        name: storyProducts.heartMomentProduct.visibilityPrivate,
        exact: true,
      })
      .click();
    await closeHeartAudience(page);
    await openComposerPlace(page);
    await page
      .getByRole('dialog', { name: photoPlaces.add, exact: true })
      .getByRole('button', { name: LOCATION.name })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await tagGeometry(page);
    await page.getByLabel(contextTags.newLabel).fill('Our quiet place');
    await page
      .getByRole('button', { name: contextTags.add, exact: true })
      .click();
    await closeContextTags(page);
    await page.locator('#heart-moment-create-heading').click();
    await page.screenshot({
      path: info.outputPath(
        `private-create-${variant.width}-${variant.theme}.png`,
      ),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .include('main')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/private-heart$/);
    expect(result.mutations[0]).toMatchObject({
      visibility: 'PRIVATE',
      location: LOCATION,
      tags: ['Our quiet place'],
    });
    expect(result.mutations[0]).not.toHaveProperty('placeId');
    const placeLink = page.locator('.moment-location .moment-place-summary');
    await expect(placeLink).toContainText(LOCATION.name);
    await expect(placeLink).toHaveAttribute(
      'href',
      '/story/map?place=49.1%3A7.2',
    );
    await placeLink.click();
    await expect(page).toHaveURL(/\/story\/map\?place=49\.1%3A7\.2$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/story\/heart-moments\/private-heart$/);
    await page.goto('/story/heart-moments/private-heart/edit');
    await openComposerPlace(page);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: photoPlaces.removeSelection, exact: true })
      .click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/private-heart$/);
    await page.reload();
    await expect(
      page.locator('.moment-location .moment-place-summary'),
    ).toHaveCount(0);
    expect(result.mutations.at(-1)).toMatchObject({ location: null });
    expect(result.sharedWrites()).toBe(0);
  });
}

test('private map choice stays draft-only until parent save and survives picker cancellation', async ({
  page,
}) => {
  const result = await setup(page);
  await page.goto('/story/heart-moments/new');
  await showHeartAudience(page);
  await page
    .getByRole('radio', {
      name: storyProducts.heartMomentProduct.visibilityPrivate,
      exact: true,
    })
    .click();
  await closeHeartAudience(page);
  await openComposerPlace(page);
  await page.getByRole('button', { name: m5s3.map.open, exact: true }).click();
  const map = page.getByRole('dialog', { name: m5s3.map.title, exact: true });
  await map.getByLabel(m5s3.map.searchLabel).fill('Quiet lake');
  await map.getByRole('button', { name: m5s3.map.search, exact: true }).click();
  await map
    .getByRole('button', {
      name: `${LOCATION.name}, ${LOCATION.address}`,
      exact: true,
    })
    .click();
  await map
    .getByRole('button', { name: m5s3.map.confirm, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: LOCATION.name, exact: true }),
  ).toBeVisible();
  expect(result.mutations).toHaveLength(0);
  expect(result.sharedWrites()).toBe(0);
  await page.getByRole('button', { name: LOCATION.name, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: LOCATION.name, exact: true }),
  ).toBeVisible();
});

for (const premium of [false, true]) {
  test(`More feature badges follow the effective Space tier: ${premium ? 'Pro' : 'Free'}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, premium);
    await page.goto('/more');
    await expect(page.locator('.more-destination-badge')).toHaveCount(
      premium ? 0 : 3,
    );
    await expect(page.locator('a[href="/more/insights"]')).toBeVisible();
    await page.locator('h1').click();
    await page.screenshot({
      path: info.outputPath(
        premium ? 'more-pro-390-light.png' : 'more-free-390-light.png',
      ),
      fullPage: true,
    });
  });
}

for (const destination of [
  '/story/memories/new',
  '/story/heart-moments/new',
  '/plan/plans/new',
  '/plan/wishes/new',
]) {
  test(`capture tag entry remains readable without overlap at 320px and 200% text: ${destination}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await setup(page);
    await page.goto(destination);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await tagGeometry(page);
    await closeContextTags(page);
    if (destination === '/story/heart-moments/new') {
      await showHeartAudience(page);
      await page.screenshot({
        path: info.outputPath('shell-1695-heart-choice-large-audience.png'),
        fullPage: true,
      });
      for (const label of await page
        .locator('.heart-moment-create-visibility-option strong')
        .all())
        await expectNaturalTextReflow(label, 2);
      await closeHeartAudience(page);
      await showHeartEmotions(page);
      for (const label of await page
        .locator('.heart-emotion-choice-label')
        .all())
        await expectNaturalTextReflow(label, 2);
    }
    if (destination === '/plan/plans/new') {
      const placeTool = page
        .locator('.composer-tool-row button')
        .filter({ has: page.locator('.eimir-icon-orte') });
      await expectLabeledComposerTool(placeTool, 'orte');
    }
    await page.screenshot({
      path: info.outputPath(
        `shell-1693-tags-large-${destination.replaceAll('/', '-')}.png`,
      ),
      fullPage: true,
    });
  });
}

for (const variant of [
  { width: 320, theme: 'light', locale: 'de' },
  { width: 320, theme: 'dark', locale: 'en' },
  { width: 1280, theme: 'light', locale: 'en' },
  { width: 1280, theme: 'dark', locale: 'de' },
] as const) {
  test(`Heart Moment choices remain readable through save/read/edit at 200%: ${variant.width} ${variant.theme} ${variant.locale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: 900 });
    await page.emulateMedia({
      colorScheme: variant.theme,
      reducedMotion: 'reduce',
    });
    const result = await setup(page);
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: {
          ...ME,
          languagePreference: variant.locale,
          locale: variant.locale,
          languageVersion: 1,
        },
      }),
    );
    await page.route('**/api/v1/account/language-preference', (route) =>
      route.fulfill({
        json: {
          preference: variant.locale,
          effectiveLocale: variant.locale,
          version: 1,
        },
        headers: { ETag: '"1"' },
      }),
    );
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = '200%';
      });
    });
    await page.goto('/story/heart-moments/new');
    await expect(page.locator('html')).toHaveAttribute('lang', variant.locale);
    const copy =
      variant.locale === 'en'
        ? en.heartMomentProduct
        : storyProducts.heartMomentProduct;
    const emotions =
      variant.locale === 'en' ? en.heartEmotion : storyProducts.heartEmotion;
    await page
      .getByRole('textbox', { name: copy.textLabel, exact: true })
      .fill('A quiet thought worth keeping');
    await showHeartAudience(page);
    for (const label of await page
      .locator('.heart-moment-create-visibility-option strong')
      .all())
      await expectNaturalTextReflow(label, 2);
    await page.screenshot({
      path: info.outputPath('shell-1695-heart-choice-audience.png'),
      fullPage: true,
    });
    await page
      .getByRole('radio', { name: copy.visibilityPrivate, exact: true })
      .click();
    await closeHeartAudience(page);
    await showHeartEmotions(page);
    for (const label of await page.locator('.heart-emotion-choice-label').all())
      await expectNaturalTextReflow(label, 2);
    // The native radio is visually clipped; touch activates its full label.
    // Keep the native checked/focus/keyboard assertions after that real action.
    await page
      .locator('.heart-emotion-choice')
      .filter({
        has: page.getByRole('radio', {
          name: emotions.APPRECIATED,
          exact: true,
        }),
      })
      .click();
    await expect(
      page.getByRole('radio', { name: emotions.APPRECIATED, exact: true }),
    ).toBeChecked();
    await page
      .getByRole('radio', { name: emotions.APPRECIATED, exact: true })
      .press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: emotions.SUPPORTED, exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: info.outputPath('shell-1695-heart-choice-emotion.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: copy.save, exact: true }).click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/private-heart$/);
    expect(result.mutations[0]).toMatchObject({
      visibility: 'PRIVATE',
      emotion: 'SUPPORTED',
    });
    await expect(page.locator('.heart-emotion-badge--detail')).toContainText(
      emotions.SUPPORTED,
    );
    await page.reload();
    await expect(page.locator('.heart-emotion-badge--detail')).toContainText(
      emotions.SUPPORTED,
    );
    await page.goto('/story/heart-moments/private-heart/edit');
    await showHeartEmotions(page);
    await expect(
      page.getByRole('radio', { name: emotions.SUPPORTED, exact: true }),
    ).toBeChecked();
    for (const label of await page.locator('.heart-emotion-choice-label').all())
      await expectNaturalTextReflow(label, 2);
    await page
      .getByRole('radio', { name: emotions.SUPPORTED, exact: true })
      .press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: emotions.GRATEFUL, exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: info.outputPath('shell-1695-heart-choice-edit.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: copy.save, exact: true }).click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/private-heart$/);
    expect(result.mutations.at(-1)).toMatchObject({ emotion: 'GRATEFUL' });
    await expect(page.locator('.heart-emotion-badge--detail')).toContainText(
      emotions.GRATEFUL,
    );
    expect(result.sharedWrites()).toBe(0);
  });
}
