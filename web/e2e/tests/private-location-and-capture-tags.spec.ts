import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import contextTags from '../../src/i18n/locales/contextTags';
import m5s3 from '../../src/i18n/locales/m5s3';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  installMocks,
  ME,
  signIn,
  SPACE_ID,
} from '../support/storyTimelineFixture';

const LOCATION = {
  name: 'A quiet lake',
  address: 'By the water',
  latitude: 49.1,
  longitude: 7.2,
};
const EVIDENCE = path.resolve(
  import.meta.dirname,
  '../../../docs/product/design/references/tabs-pro-private-tags/evidence',
);

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
  const row = page.locator('.context-tag-entry');
  const input = row.locator('input');
  const add = row.getByRole('button', { name: contextTags.add });
  await expect(input).toHaveAttribute('placeholder', contextTags.placeholder);
  await expect(page.locator('.context-tag-suggestions')).not.toHaveAttribute(
    'open',
    '',
  );
  const [field, action] = await Promise.all([
    input.boundingBox(),
    add.boundingBox(),
  ]);
  if (!field || !action) throw new Error('Tag controls are not visible');
  expect(Math.abs(field.y - action.y)).toBeLessThan(2);
  expect(field.width).toBeGreaterThan(30);
  expect(action.height).toBeGreaterThanOrEqual(44);
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
  }) => {
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
    await page
      .getByRole('radio', {
        name: storyProducts.heartMomentProduct.visibilityPrivate,
        exact: true,
      })
      .check();
    await page
      .getByRole('button', { name: photoPlaces.add, exact: true })
      .click();
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
    await page.locator('#heart-moment-create-heading').click();
    await fs.mkdir(EVIDENCE, { recursive: true });
    await page.screenshot({
      path: path.join(
        EVIDENCE,
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
    await page
      .getByRole('button', { name: LOCATION.name, exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByText(LOCATION.address),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/story/heart-moments/private-heart/edit');
    await page
      .getByRole('button', { name: photoPlaces.removeSelection, exact: true })
      .click();
    await page
      .getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/private-heart$/);
    await page.reload();
    await expect(
      page.getByRole('button', { name: LOCATION.name, exact: true }),
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
  await page
    .getByRole('radio', {
      name: storyProducts.heartMomentProduct.visibilityPrivate,
      exact: true,
    })
    .check();
  await page
    .getByRole('button', { name: photoPlaces.add, exact: true })
    .click();
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
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, premium);
    await page.goto('/more');
    await expect(page.locator('.more-destination-badge')).toHaveCount(
      premium ? 0 : 3,
    );
    await expect(page.locator('a[href="/more/insights"]')).toBeVisible();
    await fs.mkdir(EVIDENCE, { recursive: true });
    await page.locator('h1').click();
    await page.screenshot({
      path: path.join(
        EVIDENCE,
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
  test(`capture tag entry stays on one row at 320px and 200% text: ${destination}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await setup(page);
    await page.goto(destination);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    // Memory optional enrichment is disclosed by its existing control.
    const details = page
      .locator('details')
      .filter({ has: page.locator('.context-tag-entry') });
    for (const item of await details.all())
      await item.evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
    await tagGeometry(page);
  });
}
