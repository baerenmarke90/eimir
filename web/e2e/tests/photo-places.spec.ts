import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import composer from '../../src/i18n/locales/composer';
import experiences from '../../src/i18n/locales/experiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import photoPlaceCopy from '../../src/i18n/locales/photoPlaces';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import localeFixture from '../fixtures/locales/de';
import { mockMapTiles } from '../support/mapTiles';
import { openComposerPlace } from '../support/memoryDiary';
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

const PHOTO = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../backend/demo_assets/images/cabin-lake.jpg',
  ),
);
const PLACE_ID = '66666666-6666-4666-8666-666666666666';

function readPlaceLink(
  page: Page,
  name = localeFixture.photoPlaces.resolvedName,
) {
  return page
    .locator('.moment-metadata')
    .getByRole('link', { name, exact: true });
}

async function openPlaceEditor(page: Page) {
  const picker = page.getByRole('dialog', {
    name: photoPlaceCopy.add,
    exact: true,
  });
  if (!(await picker.isVisible())) await openComposerPlace(page);
  await expect(picker).toBeVisible();
  return picker;
}

async function finishPlaceEditor(page: Page) {
  const picker = page.getByRole('dialog', {
    name: photoPlaceCopy.add,
    exact: true,
  });
  await picker
    .getByRole('button', { name: experiences.finish, exact: true })
    .click();
  await expect(picker).toHaveCount(0);
}

async function openPlaceActions(page: Page) {
  const picker = await openPlaceEditor(page);
  await picker
    .getByRole('button', {
      name: photoPlaceCopy.actions.replace(
        '{{name}}',
        localeFixture.photoPlaces.resolvedName,
      ),
      exact: true,
    })
    .click();
  const actions = page.getByRole('dialog', {
    name: localeFixture.photoPlaces.resolvedName,
    exact: true,
  });
  await expect(actions).toBeVisible();
  return actions;
}

test('the saved Place opens the pinned map directly, restores the moment and retains its address in the editor', async ({
  page,
}) => {
  const state = await installPhotoPlaces(page);
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  const place = readPlaceLink(page);
  await expect(place).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: photoPlaceCopy.add }),
  ).toHaveCount(0);
  await expect(page.locator('.moment-place-overflow')).toHaveCount(0);
  await expect(place).toHaveAttribute(
    'href',
    '/story/map?place=52.516667%3A13.4',
  );
  await place.click();
  await expect(page).toHaveURL(/\/story\/map\?place=52.516667%3A13.4$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.memory-map-marker')).toHaveCount(1);
  await expect(
    page.getByRole('heading', {
      name: localeFixture.photoPlaces.resolvedName,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await expect(place).toBeVisible();
  await expect(place).toBeFocused();
  await expect(
    page.getByRole('heading', {
      name: localeFixture.photoPlaces.title,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: memoryProduct.edit, exact: true })
    .click();
  const picker = await openPlaceEditor(page);
  await expect(
    picker
      .locator('.ordered-moment-places > ol')
      .getByText(localeFixture.photoPlaces.resolvedAddress, { exact: true }),
  ).toBeVisible();
  await finishPlaceEditor(page);
  await page
    .locator('.composer-header')
    .getByRole('link', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('a pending photo location becomes a readable address without another upload', async ({
  page,
}) => {
  const state = await installPhotoPlaces(page, true);
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByText(photoPlaceCopy.locationFallback, { exact: true }),
  ).toBeVisible();
  await expect(
    readPlaceLink(page, photoPlaceCopy.locationFallback),
  ).toHaveAttribute('href', '/story/map?place=52.516667%3A13.4');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  state.resolvePlace();
  const place = readPlaceLink(page);
  await expect(place).toBeVisible();
  await expect(place).toHaveAttribute(
    'href',
    '/story/map?place=52.516667%3A13.4',
  );
  await place.click();
  await expect(page).toHaveURL(/\/story\/map\?place=52.516667%3A13.4$/);
  await expect(
    page.getByRole('heading', {
      name: localeFixture.photoPlaces.resolvedName,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await expect(place).toBeFocused();
  await page
    .getByRole('link', { name: memoryProduct.edit, exact: true })
    .click();
  const picker = await openPlaceEditor(page);
  await expect(
    picker
      .locator('.ordered-moment-places > ol')
      .getByText(localeFixture.photoPlaces.resolvedAddress, { exact: true }),
  ).toBeVisible();
  await finishPlaceEditor(page);
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('canonical Place correction returns to the originating saved moment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPhotoPlaces(page);
  await signIn(page);
  await page.goto('/story/memories/mem-canal/edit');
  const actions = await openPlaceActions(page);
  await actions.getByRole('link', { name: photoPlaceCopy.edit }).click();
  await expect(
    page.getByRole('heading', {
      name: localeFixture.photoPlaces.resolvedName,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: m5s3.common.edit, exact: true })
    .click();
  await page
    .getByLabel(m5s3.place.name, { exact: true })
    .fill(localeFixture.photoPlaces.correctedName);
  await page
    .getByRole('button', { name: m5s3.common.saveChanges, exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: localeFixture.photoPlaces.correctedName,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: false })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal\/edit$/);
  await expect(
    page.getByText(localeFixture.photoPlaces.correctedName, { exact: true }),
  ).toBeVisible();
  expect(state.writes).toEqual(['edit']);
  expect(state.unexpected).toEqual([]);
});

test('leaving the Memory editor for a Place requires a deliberate decision about unsaved content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPhotoPlaces(page);
  await signIn(page);
  await page.goto('/story/memories/mem-canal/edit');
  const body = page.locator('#memory-edit-body');
  await body.fill('An unsaved personal memory');
  const openPlace = async () => {
    const actions = await openPlaceActions(page);
    await actions.getByRole('link', { name: photoPlaceCopy.edit }).click();
    await expect(
      page.getByRole('dialog', { name: taskBoundary.discardTitle }),
    ).toBeVisible();
  };
  await openPlace();
  await page.getByRole('button', { name: taskBoundary.keepEditing }).click();
  await expect(
    page.getByRole('dialog', { name: taskBoundary.discardTitle }),
  ).toHaveCount(0);
  await expect(body).toHaveValue('An unsaved personal memory');
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal\/edit$/);
  await openPlace();
  await page
    .getByRole('button', { name: taskBoundary.discard, exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: localeFixture.photoPlaces.resolvedName,
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test('photo places retain 320px reflow with 200% body text', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await installPhotoPlaces(page);
  await signIn(page);
  await page.goto('/more/settings/memories');
  await expect(page).toHaveURL(/\/more\/settings$/);
  await expect(page.locator('a[href="/more/settings/memories"]')).toHaveCount(
    0,
  );
  await page.addStyleTag({ content: 'body { font-size: 200% !important; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
  ).toBeVisible();
  await page.addStyleTag({ content: 'body { font-size: 200% !important; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page
      .locator('.moment-places')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await captureScreenshot(page, testInfo, '1478-large-text-320-dark.png', {
    fullPage: true,
  });
  expect(state.unexpected).toEqual([]);
});

async function installPhotoPlaces(page: Page, pending = false) {
  const unexpected = await installMocks(page, {
    strict: true,
    withDetailComments: true,
  });
  await mockMapTiles(page);
  let preference = { enabled: true, version: 0 };
  let linked = true;
  let place = {
    id: PLACE_ID,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    name: pending
      ? localeFixture.photoPlaces.initialName
      : localeFixture.photoPlaces.resolvedName,
    description: null,
    address: pending ? null : localeFixture.photoPlaces.resolvedAddress,
    geocodingSource: pending ? null : 'openstreetmap',
    latitude: 52.516667,
    longitude: 13.4,
    version: 1,
    createdAt: '2026-10-27T10:00:00Z',
    updatedAt: '2026-10-27T10:00:00Z',
    capabilities: { canEdit: true, canDelete: true, canComment: false },
  };
  const writes: string[] = [];
  let memoryVersion = 1;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      pathname = new URL(req.url()).pathname,
      method = req.method();
    if (pathname === `/api/v1/spaces/${SPACE_ID}/memory-map`) {
      return route.fulfill({
        json: {
          items: [
            {
              memoryId: 'mem-canal',
              title: localeFixture.photoPlaces.title,
              happenedOn: '2026-10-26',
              placeId: PLACE_ID,
              placeName: place.name,
              latitude: place.latitude,
              longitude: place.longitude,
            },
          ],
          nextCursor: null,
        },
      });
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-canal/plans`) {
      return route.fulfill({ json: { items: ['plan-canal'] } });
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/plans/plan-canal`) {
      return route.fulfill({
        json: {
          id: 'plan-canal',
          spaceId: SPACE_ID,
          title: localeFixture.photoPlaces.title,
          description: '',
          status: 'DONE',
          createdBy: ACCOUNT_ID,
          creator: ME,
          version: 1,
          createdAt: '2026-10-27T10:00:00Z',
          updatedAt: '2026-10-27T10:00:00Z',
          capabilities: CAPABILITIES,
        },
      });
    }
    if (pathname === '/api/v1/account/photo-location-preference') {
      if (method === 'PUT') {
        writes.push('preference');
        expect(req.headers()['if-match']).toBe(`"${preference.version}"`);
        preference = {
          enabled: req.postDataJSON().enabled,
          version: preference.version + 1,
        };
      } else expect(method).toBe('GET');
      await route.fulfill({ json: preference });
      return;
    }
    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/moments/memories/mem-canal/places`
    ) {
      await route.fulfill({
        json: {
          items: linked ? [place] : [],
          nextCursor: null,
          hasMore: false,
        },
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await route.fulfill({
        json: { items: [place], nextCursor: null, hasMore: false },
      });
      return;
    }
    if (
      (method === 'GET' || method === 'PATCH') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-canal`
    ) {
      if (method === 'PATCH') {
        const change = req.postDataJSON();
        expect(change.placeIds).toEqual([]);
        expect(change.expectedPlaceIds).toEqual([PLACE_ID]);
        writes.push('save');
        linked = false;
        memoryVersion++;
      }
      await route.fulfill({
        json: {
          id: 'mem-canal',
          spaceId: SPACE_ID,
          authorId: ACCOUNT_ID,
          author: ME,
          title: localeFixture.photoPlaces.title,
          body: localeFixture.photoPlaces.body,
          tags: [],
          happenedOn: '2026-10-26',
          createdAt: '2026-10-27T10:00:00Z',
          updatedAt: '2026-10-27T10:00:00Z',
          version: memoryVersion,
          placeIds: linked ? [PLACE_ID] : [],
          capabilities: CAPABILITIES,
          attachments: [
            {
              id: 'att-photo-place',
              position: 0,
              status: 'READY',
              isSensitive: false,
              mediaType: 'IMAGE',
              mimeType: 'image/jpeg',
              hasThumbnail: true,
              width: 1200,
              height: 750,
              size: PHOTO.length,
            },
          ],
        },
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname.endsWith('/attachments/att-photo-place/content')
    ) {
      await route.fulfill({ contentType: 'image/jpeg', body: PHOTO });
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}`) {
      if (method === 'PATCH') {
        writes.push('edit');
        place = { ...place, ...req.postDataJSON(), version: place.version + 1 };
      } else expect(method).toBe('GET');
      await route.fulfill({ json: place });
      return;
    }
    if (
      method === 'GET' &&
      new RegExp(
        `/places/${PLACE_ID}/(memories|heart-moments|milestones)$`,
      ).test(pathname)
    ) {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (
      method === 'DELETE' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/places/${PLACE_ID}/memories/mem-canal`
    ) {
      writes.push('unlink');
      linked = false;
      await route.fulfill({ status: 204 });
      return;
    }
    if (await fulfillDefaultProductContext(route)) return;
    await route.fallback();
  });
  return {
    unexpected,
    writes,
    resolvePlace() {
      place = {
        ...place,
        name: localeFixture.photoPlaces.resolvedName,
        address: localeFixture.photoPlaces.resolvedAddress,
        geocodingSource: 'openstreetmap',
        version: place.version + 1,
      };
    },
  };
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [360, 390, 430, 1280]) {
    test(`photo places: settings, saved result and removal at ${width}px (${colorScheme})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const state = await installPhotoPlaces(page);
      const external: string[] = [];
      page.on('request', (req) => {
        const hostname = new URL(req.url()).hostname;
        if (hostname === 'google.com' || hostname.endsWith('.google.com'))
          external.push(req.url());
      });
      await signIn(page);
      await page.goto('/more/settings');
      await expect(
        page.locator('a[href="/more/settings/memories"]'),
      ).toHaveCount(0);
      await page.goto('/more/settings/memories');
      await expect(page).toHaveURL(/\/more\/settings$/);
      await page.goto('/story/memories/mem-canal');
      await expect(
        page.getByRole('heading', { name: localeFixture.photoPlaces.title }),
      ).toBeVisible();
      await expect(
        page.getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('img', { name: storyProducts.gallery.imageAlt }).first(),
      ).toBeVisible();
      await page
        .locator('.moment-places')
        .evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await page
        .getByRole('heading', { name: photoPlaceCopy.title, exact: true })
        .focus();
      const destination = page
        .locator('.memory-planning-links')
        .getByRole('link', {
          name: new RegExp(localeFixture.photoPlaces.title),
        });
      await expect(destination).toContainText(composer.viewLinkedPlan);
      await expect(destination).toContainText(localeFixture.photoPlaces.title);
      await expect(destination).toHaveAttribute(
        'href',
        '/plan/plans/plan-canal',
      );
      await captureScreenshot(
        page,
        testInfo,
        `1478-moment-${width}-${colorScheme}.png`,
        { fullPage: true },
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await expect(
        page.getByRole('button', { name: photoPlaceCopy.add }),
      ).toHaveCount(0);
      await expect(page.locator('.moment-place-overflow')).toHaveCount(0);
      await page
        .getByRole('link', { name: memoryProduct.edit, exact: true })
        .click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal\/edit$/);
      const dialog = await openPlaceActions(page);
      await expect(
        dialog.getByRole('link', { name: photoPlaceCopy.maps }),
      ).toHaveAttribute('href', '/story/map?place=52.516667%3A13.4');
      if (width === 390)
        await captureScreenshot(
          page,
          testInfo,
          `1478-actions-${colorScheme}.png`,
          { fullPage: true },
        );
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const picker = page.getByRole('dialog', {
        name: photoPlaceCopy.add,
        exact: true,
      });
      await expect(picker).toBeVisible();
      const remove = page.getByRole('button', {
        name: experiences.removePlace.replace(
          '{{name}}',
          localeFixture.photoPlaces.resolvedName,
        ),
        exact: true,
      });
      await expect(remove.locator('svg')).toHaveCount(1);
      const row = page
        .locator('.ordered-moment-places > ol > li')
        .filter({ hasText: localeFixture.photoPlaces.resolvedName });
      const rowBounds = await row.boundingBox(),
        removeBounds = await remove.boundingBox();
      if (!rowBounds || !removeBounds)
        throw new Error('Place and its trash action need measurable bounds');
      expect(removeBounds.width).toBeGreaterThanOrEqual(48);
      expect(removeBounds.height).toBeGreaterThanOrEqual(48);
      expect(Math.abs(removeBounds.y - rowBounds.y)).toBeLessThanOrEqual(2);
      if (width === 390)
        await captureScreenshot(
          page,
          testInfo,
          `place-trash-${colorScheme}.png`,
          { fullPage: true },
        );
      expect(state.writes).toEqual([]);
      await remove.click();
      await expect(
        picker
          .locator('.ordered-moment-places > ol')
          .getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
      ).toHaveCount(0);
      await expect(
        picker.locator('.moment-place-choices').getByRole('button', {
          name: new RegExp(localeFixture.photoPlaces.resolvedName),
        }),
      ).toBeVisible();
      expect(state.writes).toEqual([]);
      await finishPlaceEditor(page);
      await expect(page.locator('.composer-place-context')).toHaveCount(0);
      await page
        .getByRole('button', { name: memoryProduct.save, exact: true })
        .click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
      await expect(
        page.getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
      ).toHaveCount(0);
      expect(state.writes).toEqual(['save']);
      await page
        .getByRole('link', { name: memoryProduct.edit, exact: true })
        .click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal\/edit$/);
      await expect(
        page.getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
      ).toHaveCount(0);
      await expect(
        page
          .locator('.composer-tool-row')
          .getByRole('button', { name: composer.place, exact: true }),
      ).toBeVisible();
      const reopened = await openPlaceEditor(page);
      await expect(
        reopened.locator('.ordered-moment-places > ol > li'),
      ).toHaveCount(0);
      await expect(
        reopened.locator('.moment-place-choices').getByRole('button', {
          name: new RegExp(localeFixture.photoPlaces.resolvedName),
        }),
      ).toBeVisible();
      await finishPlaceEditor(page);
      expect(state.writes).toEqual(['save']);
      expect(external).toEqual([]);
      expect(state.unexpected).toEqual([]);
    });
  }
}
