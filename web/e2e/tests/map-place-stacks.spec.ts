import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import mapCopy from '../../src/i18n/locales/memoryMap';
import { mockMapTiles } from '../support/mapTiles';
import { storyDetailBack } from '../support/memoryDiary';
import {
  captureScreenshot,
  installMocks,
  SPACE_ID,
  signIn,
  TINY_PNG,
} from '../support/storyTimelineFixture';

const PLACE = '49.45:7.16';
const base = {
  placeId: 'lake',
  placeName: 'Bostalsee',
  latitude: 49.45,
  longitude: 7.16,
  happenedOn: '2026-10-30',
  previewHasThumbnail: true,
  previewIsSensitive: false,
};
const visits = [
  {
    ...base,
    memoryId: 'visit-evening',
    title: 'Evening by the lake',
    previewAttachmentId: 'att-map-evening',
  },
  {
    ...base,
    memoryId: 'visit-walk',
    title: 'Our walk',
    happenedOn: '2026-08-10',
    previewAttachmentId: 'att-map-walk',
  },
  {
    ...base,
    memoryId: 'mem-canal',
    title: 'Breakfast by the canal',
    happenedOn: '2026-05-12',
    previewAttachmentId: 'att-canal-1',
  },
  {
    ...base,
    memoryId: 'visit-thought',
    title: 'A thought for us',
    happenedOn: '2026-04-08',
  },
  {
    ...base,
    memoryId: 'visit-sensitive',
    title: 'Our private moment',
    previewAttachmentId: 'att-map-sensitive',
    previewIsSensitive: true,
  },
];

async function installMap(page: Page) {
  await installMocks(page);
  const reads = new Map<string, number>();
  for (const [id, name] of [
    ['att-map-evening', 'lake-sunrise.jpg'],
    ['att-map-walk', 'forest-path.jpg'],
    ['att-canal-1', 'picnic-basket.jpg'],
    ['att-map-sensitive', 'cabin-lake.jpg'],
  ]) {
    await page.route(`**/attachments/${id}/content*`, (route) => {
      reads.set(id, (reads.get(id) ?? 0) + 1);
      return route.fulfill({
        contentType: 'image/jpeg',
        body: readFileSync(
          new URL(
            `../../../backend/demo_assets/images/${name}`,
            import.meta.url,
          ),
        ),
      });
    });
  }
  await mockMapTiles(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
    route.fulfill({
      json: {
        items: [
          ...visits,
          // A second Place relation must never inflate the distinct-memory total.
          { ...visits[0], placeId: 'same-coordinate' },
          {
            ...base,
            memoryId: 'visit-city',
            title: 'In the city',
            placeId: 'city',
            placeName: 'Trier',
            latitude: 49.756,
            longitude: 6.641,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await signIn(page);
  await page.getByRole('tab', { name: mapCopy.entry, exact: true }).click();
  return reads;
}

async function settledCamera(page: Page) {
  await expect(page.locator('.place-map-canvas')).toHaveAttribute(
    'data-map-moving',
    'false',
  );
}

async function expectCenteredMemory(track: Locator, title: string) {
  await expect(track.locator('[aria-current="true"]')).toContainText(title);
  await expect
    .poll(() =>
      track.evaluate((element) => {
        const selected = element.querySelector('[aria-current="true"]');
        if (!selected) return Number.POSITIVE_INFINITY;
        const bounds = element.getBoundingClientRect();
        const current = selected.getBoundingClientRect();
        return Math.abs(
          (current.left + current.right - bounds.left - bounds.right) / 2,
        );
      }),
    )
    .toBeLessThanOrEqual(1);
  await expect(track.locator('[aria-current="true"]')).toContainText(title);
}

async function swipeNext(page: Page, track: Locator) {
  const first = await track.locator('li').first().boundingBox();
  const bounds = await track.boundingBox();
  if (!first || !bounds)
    throw new Error('Memory strip must have visible touch geometry');
  // A touch release starts native momentum/snap; a changed nearest item does
  // not mean the gesture has finished. Await its real completion before the
  // next independent button action.
  await track.evaluate((element) => {
    element.removeAttribute('data-swipe-complete');
    element.addEventListener(
      'scrollend',
      () => {
        element.setAttribute('data-swipe-complete', 'true');
      },
      { once: true },
    );
  });
  const client = await page.context().newCDPSession(page);
  const start = Math.min(
    first.x + first.width - 12,
    bounds.x + bounds.width - 12,
  );
  const y = Math.min(first.y + 40, 760);
  try {
    await client.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start, y, id: 1 }],
    });
    for (const delta of [35, 95, 160, 230]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start - delta, y, id: 1 }],
      });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(track).toHaveAttribute('data-swipe-complete', 'true');
  } finally {
    await client.detach();
  }
}

for (const [width, theme, motion] of [
  [360, 'light', 'reduce'],
  [390, 'dark', 'no-preference'],
  [430, 'light', 'no-preference'],
  [1280, 'dark', 'no-preference'],
] as const) {
  test(`map photo stacks at ${width} ${theme}: motion, finite browsing and fullscreen source return`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: motion });
    const reads = await installMap(page);
    await expect(page.locator('.memory-map-marker')).toHaveCount(2);
    const marker = page
      .locator('.memory-map-marker')
      .filter({ has: page.locator('[data-active-memory="visit-evening"]') });
    await expect(marker.locator('.memory-map-stack-photo')).toHaveCount(3);
    await expect(marker.locator('.memory-map-marker-count')).toHaveText('5');
    const originalMarker = await marker.elementHandle();
    await page.evaluate(() => {
      const map = document.querySelector('.place-map-canvas');
      const changes: string[] = [];
      (window as unknown as { mapMovement: string[] }).mapMovement = changes;
      if (map)
        new MutationObserver((records) => {
          for (const record of records) changes.push(record.oldValue ?? '');
          changes.push(map.getAttribute('data-map-moving') ?? '');
        }).observe(map, {
          attributes: true,
          attributeFilter: ['data-map-moving'],
          attributeOldValue: true,
        });
    });
    await page
      .getByRole('list', { name: mapCopy.places })
      .getByRole('button', { name: 'Bostalsee · 5 Erinnerungen' })
      .click();
    await settledCamera(page);
    await expect(page.locator('.memory-map-marker')).toHaveCount(1);
    expect(
      await page
        .locator('.memory-map-marker')
        .evaluate((node, previous) => node === previous, originalMarker),
    ).toBe(true);
    const movementStarted = () =>
      page.evaluate(() =>
        (window as unknown as { mapMovement: string[] }).mapMovement.includes(
          'true',
        ),
      );
    if (motion === 'no-preference')
      await expect.poll(movementStarted).toBe(true);
    else expect(await movementStarted()).toBe(false);
    await settledCamera(page);
    await expect(page.locator('.memory-map-photo-stack')).toHaveAttribute(
      'data-expanded',
      'true',
    );
    await expect
      .poll(() =>
        page
          .locator('.memory-map-photo-stack')
          .evaluate(
            (node) =>
              [...node.querySelectorAll('.memory-map-stack-photo')]
                .flatMap((photo) => photo.getAnimations())
                .filter((animation) => animation.playState === 'running')
                .length,
          ),
      )
      .toBe(0);
    await expect(page.locator('.memory-map-strip > li')).toHaveCount(5);
    await expect(
      page.locator('.memory-map-strip [aria-current="true"]'),
    ).toContainText('Evening by the lake');
    await captureScreenshot(
      page,
      info,
      `planning-map-stacks-${width}-${theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: mapCopy.fullscreen, exact: true })
      .click();
    const fullscreen = page.getByRole('dialog', { name: mapCopy.title });
    await expect(fullscreen).toBeVisible();
    await expect
      .poll(async () => Math.round((await fullscreen.boundingBox())?.y ?? -1))
      .toBe(0);
    await settledCamera(page);
    const track = fullscreen.locator('.memory-map-strip');
    const fullscreenMapBounds = await fullscreen
      .locator('.place-map-viewport')
      .boundingBox();
    const fullscreenFilterBounds = await fullscreen
      .getByRole('button', { name: mapCopy.filter, exact: true })
      .boundingBox();
    if (!fullscreenMapBounds || !fullscreenFilterBounds)
      throw new Error('Fullscreen filter must have visible map geometry');
    expect(fullscreenFilterBounds.y).toBeGreaterThanOrEqual(
      fullscreenMapBounds.y,
    );
    expect(
      fullscreenFilterBounds.x + fullscreenFilterBounds.width,
    ).toBeLessThanOrEqual(fullscreenMapBounds.x + fullscreenMapBounds.width);
    await expect(
      fullscreen
        .getByRole('button', { name: mapCopy.filter, exact: true })
        .locator('.eimir-icon-filter'),
    ).toBeVisible();
    if (width === 390) {
      for (const name of ['Trier', 'Bostalsee']) {
        await fullscreen
          .getByRole('button', { name: mapCopy.filter, exact: true })
          .click();
        const choices = page.getByRole('dialog', { name: mapCopy.filter });
        await choices.getByRole('radio', { name, exact: true }).click();
        await expect(choices).toBeHidden();
        await expect(fullscreen).toBeVisible();
        await expect(
          fullscreen.getByRole('heading', { name, exact: true }),
        ).toBeVisible();
        await settledCamera(page);
      }
    }
    if (width === 360 || width === 390) {
      await swipeNext(page, track);
      await expect(track.locator('[aria-current="true"]')).toContainText(
        'Our walk',
      );
      await expect(fullscreen).toBeVisible();
      await expect(page).toHaveURL(
        new RegExp(`/story/map\\?place=${encodeURIComponent(PLACE)}`),
      );
      await fullscreen
        .getByRole('button', { name: mapCopy.previousMemory })
        .click();
      await expect(track.locator('[aria-current="true"]')).toContainText(
        'Evening by the lake',
      );
    }
    await fullscreen.getByRole('button', { name: mapCopy.nextMemory }).click();
    await expect(track.locator('[aria-current="true"]')).toContainText(
      'Our walk',
    );
    await fullscreen.getByRole('button', { name: mapCopy.nextMemory }).click();
    await expect(track.locator('[aria-current="true"]')).toContainText(
      'Breakfast by the canal',
    );
    await expectCenteredMemory(track, 'Breakfast by the canal');
    await expect(fullscreen.locator('.memory-map-photo-stack')).toHaveAttribute(
      'data-active-memory',
      'mem-canal',
    );
    const position = async () => {
      const map = await fullscreen.locator('.place-map-viewport').boundingBox();
      const pin = await fullscreen.locator('.memory-map-marker').boundingBox();
      if (!map || !pin)
        throw new Error('Map camera geometry must be measurable');
      return { x: pin.x - map.x, y: pin.y - map.y };
    };
    const beforeZoom = await position();
    const clicked = Date.now();
    // Touch screens zoom by pinch; the buttons stay reachable by keyboard.
    await fullscreen.locator('.place-map-zoom-in').focus();
    await page.keyboard.press('Enter');
    // Zooming is animated and a marker at the zoom origin does not move, so
    // allow the zoom duration to pass, then require a resting camera.
    let previous = beforeZoom;
    await expect
      .poll(async () => {
        const next = await position();
        const rested =
          Math.abs(next.x - previous.x) < 0.5 &&
          Math.abs(next.y - previous.y) < 0.5;
        const moved =
          Math.hypot(next.x - beforeZoom.x, next.y - beforeZoom.y) > 2;
        previous = next;
        return rested && (moved || Date.now() - clicked > 1_000);
      })
      .toBe(true);
    const before = await position();
    const beforeReads = new Map(reads);
    await captureScreenshot(
      page,
      info,
      `planning-map-stacks-fullscreen-${width}-${theme}.png`,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.memory-map-fullscreen')
          .analyze()
      ).violations,
    ).toEqual([]);
    await track.getByRole('link', { name: /Breakfast by the canal/ }).click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    await storyDetailBack(page).click();
    await expect(fullscreen).toBeVisible();
    await expect(track.locator('[aria-current="true"]')).toContainText(
      'Breakfast by the canal',
    );
    await expect(fullscreen.locator('.memory-map-photo-stack')).toHaveAttribute(
      'data-active-memory',
      'mem-canal',
    );
    await expect
      .poll(async () => Math.abs((await position()).x - before.x))
      .toBeLessThanOrEqual(1);
    await expect
      .poll(async () => Math.abs((await position()).y - before.y))
      .toBeLessThanOrEqual(1);
    for (const [id, count] of beforeReads) expect(reads.get(id)).toBe(count);
    await page.keyboard.press('Escape');
    await expect(fullscreen).toBeHidden();
    await expect(
      page.getByRole('button', { name: mapCopy.fullscreen, exact: true }),
    ).toBeFocused();
    await page
      .getByRole('button', { name: mapCopy.filter, exact: true })
      .click();
    const filter = page.getByRole('dialog', { name: mapCopy.filter });
    await filter.getByRole('radio', { name: 'Trier', exact: true }).click();
    await expect(filter).toBeHidden();
    await settledCamera(page);
    await expect(
      page.getByRole('heading', { name: 'Trier', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: mapCopy.allPlaces, exact: true })
      .click();
    await settledCamera(page);
    await expect(page.locator('.memory-map-marker')).toHaveCount(2);
    await expect(
      page
        .getByRole('list', { name: mapCopy.places })
        .getByRole('button', { name: 'Bostalsee · 5 Erinnerungen' }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include('.memory-map-page').analyze())
        .violations,
    ).toEqual([]);
  });
}

test('map stack browsing keeps text and sensitive sources usable at 320px with large text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMap(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const mapBounds = await page.locator('.place-map-viewport').boundingBox();
  if (!mapBounds) throw new Error('Map must have measurable controls');
  for (const name of [mapCopy.filter, mapCopy.fullscreen]) {
    const control = await page
      .getByRole('button', { name, exact: true })
      .boundingBox();
    if (!control) throw new Error('Map control must remain visible');
    expect(control.x).toBeGreaterThanOrEqual(mapBounds.x);
    expect(control.x + control.width).toBeLessThanOrEqual(
      mapBounds.x + mapBounds.width,
    );
  }
  await page
    .getByRole('list', { name: mapCopy.places })
    .getByRole('button', { name: 'Bostalsee · 5 Erinnerungen' })
    .click();
  for (let index = 1; index < 5; index++) {
    await page.getByRole('button', { name: mapCopy.nextMemory }).click();
    await expect(
      page.locator('.memory-map-strip [aria-current="true"]'),
    ).toContainText(visits[index].title);
  }
  await expect(
    page.getByRole('button', { name: mapCopy.nextMemory }),
  ).toBeDisabled();
  await expectCenteredMemory(
    page.locator('.memory-map-strip'),
    visits[4].title,
  );
  await expect(
    page.locator(
      '.memory-map-strip [aria-current="true"] .sensitive-media-cover',
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      '.memory-map-stack-photo[data-slot="0"] .sensitive-media-cover',
    ),
  ).toBeVisible();
  await expect(
    page.locator('.memory-map-strip .sensitive-media-preview-control'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await captureScreenshot(
    page,
    info,
    'planning-map-stacks-320-dark-large-sensitive.png',
    { fullPage: false },
  );
  await expectCenteredMemory(
    page.locator('.memory-map-strip'),
    visits[4].title,
  );
  expect(
    (await new AxeBuilder({ page }).include('.memory-map-page').analyze())
      .violations,
  ).toEqual([]);
});
