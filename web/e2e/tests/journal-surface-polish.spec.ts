import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import mapCopy from '../../src/i18n/locales/memoryMap';
import m5s5 from '../../src/i18n/locales/m5s5';
import profiles from '../../src/i18n/locales/profiles';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  ME,
  PARTNER,
  SPACE_ID,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  signIn,
  TINY_PNG,
} from '../support/storyTimelineFixture';

const comments = storyProducts.comments;
const base = `/api/v1/spaces/${SPACE_ID}`;
const photo = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);

async function installPhoto(page: Page) {
  await page.route('**/attachments/att-canal-1/content', (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: photo }),
  );
}

test('three peer modes retain Diary scope and the map follows Light, Dark and live System appearance', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMocks(page);
  await installPhoto(page);
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
  await page.route(`**${base}/memory-map*`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            memoryId: 'mem-canal',
            title: 'Our morning at the lake',
            happenedOn: '2026-05-12',
            placeId: 'lake',
            placeName: 'Lake',
            latitude: 49,
            longitude: 7,
            previewAttachmentId: 'att-canal-1',
            previewIsSensitive: false,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await signIn(page);
  await page.goto('/story?tab=timeline&type=MEMORY&year=2026');
  await expect(
    page
      .locator('.story-year-month-header')
      .first()
      .getByRole('button', { name: storyProducts.storyFilters.toggleButton }),
  ).toBeVisible();
  await expect(page.locator('.momente-author-meta')).toHaveCount(0);
  await captureScreenshot(page, info, 'diary-filter-month-390-dark.png', {
    fullPage: true,
  });
  await page.getByRole('tab', { name: mapCopy.entry, exact: true }).click();
  await expect(page).toHaveURL(/\/story\/map\?type=MEMORY&year=2026$/);
  const tiles = page.locator('.leaflet-tile-pane');
  const marker = page.locator('.memory-map-marker-photo img');
  await expect(marker).toBeVisible();
  await expect(tiles).not.toHaveCSS('filter', 'none');
  await expect
    .poll(() =>
      marker.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const source = await marker.getAttribute('src');
  const imageBounds = await marker.boundingBox();
  const frameBounds = await page
    .locator('.memory-map-marker-photo')
    .boundingBox();
  if (!imageBounds || !frameBounds || !source)
    throw new Error('Loaded marker preview must have a bounded frame.');
  expect(imageBounds.width).toBeLessThanOrEqual(frameBounds.width);
  expect(imageBounds.height).toBeLessThanOrEqual(frameBounds.height);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(tiles).toHaveCSS('filter', 'none');
  await expect(marker).toHaveAttribute('src', source);
  await page
    .getByRole('tab', { name: de.story.tabTimeline, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\?type=MEMORY&year=2026&tab=timeline$/);

  await page
    .getByRole('tab', { name: de.story.tabTimeline, exact: true })
    .focus();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/\/story\/map\?type=MEMORY&year=2026$/);
  await expect(
    page.getByRole('tab', { name: mapCopy.entry, exact: true }),
  ).toBeFocused();
  for (const [preference, system] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const) {
    await page.goto('/more/settings/appearance');
    await page
      .getByLabel(de.theme.label, { exact: true })
      .selectOption(preference);
    await page.emulateMedia({ colorScheme: system });
    await page.goto('/story/map');
    await expect(marker).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      preference,
    );
    if (preference === 'light') await expect(tiles).toHaveCSS('filter', 'none');
    else await expect(tiles).not.toHaveCSS('filter', 'none');
    await captureScreenshot(page, info, `map-explicit-${preference}-390.png`, {
      fullPage: true,
    });
  }
  const navigation = page.locator('.mobile-bottom-shell');
  await expect(navigation).toHaveCSS('backdrop-filter', 'blur(24px)');
  expect(
    await navigation.evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toMatch(/0\.72/);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await expect(navigation).toHaveCSS('backdrop-filter', 'none');
  await cdp.detach();
});

test('Own activity filters requests before pagination and retains its scope through detail return', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installMocks(page);
  const reads: string[] = [];
  await page.route(`**${base}/activity*`, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const own = params.get('scope') === 'own';
    reads.push(params.toString());
    const older = params.has('cursor');
    return route.fulfill({
      json: {
        items: [
          {
            id: own ? (older ? 'own-old' : 'own-new') : 'partner',
            sourceEventId: 'event',
            kind: 'MEMORY_CREATED',
            actorId: own ? ACCOUNT_ID : PARTNER.id,
            actor: own ? ME : PARTNER,
            targetType: 'MEMORY',
            targetId: 'mem-canal',
            target: {
              targetType: 'MEMORY',
              targetId: 'mem-canal',
              title: own
                ? older
                  ? 'An earlier memory'
                  : 'My saved memory'
                : 'A shared memory',
            },
            occurredAt: '2026-10-30T10:00:00Z',
            createdAt: '2026-10-30T10:00:00Z',
          },
        ],
        hasMore: own && !older,
        nextCursor: own && !older ? 'own-next' : null,
      },
    });
  });
  await signIn(page);
  await page.goto('/today/activity');
  await expect(
    page.getByText('A shared memory', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: m5s5.activity.own }).click();
  await expect(
    page.getByText('My saved memory', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('A shared memory', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: m5s5.activity.loadMore, exact: true })
    .click();
  await expect(
    page.getByText('An earlier memory', { exact: true }),
  ).toBeVisible();
  expect(
    reads.some(
      (value) =>
        value.includes('scope=own') && value.includes('cursor=own-next'),
    ),
  ).toBe(true);
  await captureScreenshot(page, info, 'own-activities-390.png', {
    fullPage: true,
  });
  await page.getByRole('link', { name: /My saved memory/ }).click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await page.locator('.shell-detail-back').click();
  await expect(page).toHaveURL(/\/today\/activity\?scope=own$/);
  await expect(
    page.getByText('An earlier memory', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: m5s5.activity.shared }).click();
  await expect(
    page.getByText('A shared memory', { exact: true }),
  ).toBeVisible();
});

test('one icon on the photo opens the existing comment task, while text keeps an inline icon', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installMocks(page);
  await installPhoto(page);
  const memory = getTimelineItems()[0]?.memory;
  if (!memory) throw new Error('The fixture must provide a photo memory.');
  await page.route(`**${base}/memories/mem-canal`, (route) =>
    route.fulfill({
      json: {
        ...memory,
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        body: 'A wonderful morning by the water.',
        updatedAt: '2026-05-12T08:30:00Z',
        version: 1,
        tags: [],
        capabilities: CAPABILITIES,
      },
    }),
  );
  let posts = 0;
  let saved: object[] = [];
  await page.route(`**${base}/memories/mem-canal/comments*`, async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      const comment = {
        id: 'new-comment',
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        author: ME,
        body: route.request().postDataJSON().body,
        version: 1,
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      saved = [comment];
      await route.fulfill({ status: 201, json: comment });
    } else
      await route.fulfill({
        json: { items: saved, hasMore: false, nextCursor: null },
      });
  });
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  const trigger = page
    .locator('.media-comment-action')
    .getByRole('button', { name: comments.send });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveText('');
  await expect(trigger).toHaveCSS('color', 'rgb(255, 255, 255)');
  await trigger.click();
  const input = page.getByRole('textbox', { name: comments.inputLabel });
  await expect(input).toBeFocused();
  await input.fill('I remember that morning.');
  await page.getByRole('button', { name: comments.send, exact: true }).click();
  await expect(
    page.getByText('I remember that morning.', { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await expect(trigger).toBeFocused();
  await captureScreenshot(page, info, 'photo-comments-390.png', {
    fullPage: true,
  });
  await page.goto('/story/heart-moments/hm-love');
  const inline = page
    .locator('.comments-panel')
    .getByRole('button', { name: comments.send });
  await expect(inline).toBeVisible();
  await expect(inline).toHaveText('');
  await inline.click();
  await expect(
    page.getByRole('textbox', { name: comments.inputLabel }),
  ).toBeFocused();
});

test('Pro information lives in App and Account and legacy profile links reach it', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installMocks(page);
  await signIn(page);
  await page.goto('/more/profile');
  await expect(
    page.getByRole('heading', { name: profiles.premium.title, exact: true }),
  ).toHaveCount(0);
  await page.goto('/more/profile#profile-premium');
  await expect(page).toHaveURL(/\/more\/settings\/account#eimir-pro$/);
  await expect(
    page.getByRole('heading', { name: profiles.premium.title, exact: true }),
  ).toBeVisible();
  for (const feature of Object.values(profiles.premium.features))
    await expect(page.getByText(feature.title, { exact: true })).toBeVisible();
  await captureScreenshot(page, info, 'pro-app-account-390.png', {
    fullPage: true,
  });
});
