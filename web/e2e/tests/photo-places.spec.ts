import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';
import photoPlaceCopy from '../../src/i18n/locales/photoPlaces';
import profileIdentity from '../../src/i18n/locales/profileIdentity';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import localeFixture from '../fixtures/locales/de';
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

test('the visible address opens the pinned map directly and retains the saved moment', async ({
  page,
  context,
}) => {
  await context.route('https://www.google.com/maps/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Fixture map</title>',
    }),
  );
  const state = await installPhotoPlaces(page);
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  const address = page.getByRole('link', {
    name: photoPlaceCopy.mapAddress.replace(
      '{{address}}',
      localeFixture.photoPlaces.resolvedAddress,
    ),
  });
  await expect(address).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const popupPromise = page.waitForEvent('popup');
  await address.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(
    'https://www.google.com/maps/search/?api=1&query=52.516667%2C13.4',
  );
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
  await popup.close();
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
    page.getByRole('link', {
      name: photoPlaceCopy.mapAddress.replace(
        '{{address}}',
        photoPlaceCopy.locationFallback,
      ),
    }),
  ).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=52.516667%2C13.4',
  );
  state.resolvePlace();
  await expect(
    page.getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: photoPlaceCopy.mapAddress.replace(
        '{{address}}',
        localeFixture.photoPlaces.resolvedAddress,
      ),
    }),
  ).toBeVisible();
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
  await page.goto('/story/memories/mem-canal');
  await page
    .getByRole('button', {
      name: photoPlaceCopy.actions.replace(
        '{{name}}',
        localeFixture.photoPlaces.resolvedName,
      ),
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: photoPlaceCopy.edit })
    .click();
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
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await expect(
    page.getByText(localeFixture.photoPlaces.correctedName, { exact: true }),
  ).toBeVisible();
  expect(state.writes).toEqual(['edit']);
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
  await expect(
    page.getByRole('switch', { name: photoPlaceCopy.setting }),
  ).toHaveAttribute('aria-checked', 'true');
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
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      pathname = new URL(req.url()).pathname,
      method = req.method();
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
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-canal`
    ) {
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
          version: 1,
          capabilities: CAPABILITIES,
          attachments: [
            {
              id: 'att-photo-place',
              position: 0,
              status: 'READY',
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
      await page.locator('a[href="/more/settings/memories"]').click();
      const control = page.getByRole('switch', {
        name: photoPlaceCopy.setting,
      });
      await expect(control).toHaveAttribute('aria-checked', 'true');
      await captureScreenshot(
        page,
        testInfo,
        `1478-settings-${width}-${colorScheme}.png`,
        { fullPage: true },
      );
      await control.click();
      await expect(control).toHaveAttribute('aria-checked', 'false');
      await expect(
        page.getByText(photoPlaceCopy.saved, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: profileIdentity.settingsBackToIndex }),
      ).toBeVisible();
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
      await page
        .getByRole('button', {
          name: photoPlaceCopy.actions.replace(
            '{{name}}',
            localeFixture.photoPlaces.resolvedName,
          ),
        })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('link', { name: photoPlaceCopy.maps }),
      ).toHaveAttribute(
        'href',
        'https://www.google.com/maps/search/?api=1&query=52.516667%2C13.4',
      );
      if (width === 390)
        await captureScreenshot(
          page,
          testInfo,
          `1478-actions-${colorScheme}.png`,
          { fullPage: true },
        );
      await dialog.getByRole('button', { name: photoPlaceCopy.remove }).click();
      await expect(
        dialog.getByText(photoPlaceCopy.removeHint, { exact: true }),
      ).toBeVisible();
      expect(state.writes).toEqual(['preference']);
      await dialog.getByRole('button', { name: photoPlaceCopy.remove }).click();
      await expect(
        page.getByText(localeFixture.photoPlaces.resolvedName, { exact: true }),
      ).toHaveCount(0);
      expect(state.writes).toEqual(['preference', 'unlink']);
      expect(external).toEqual([]);
      expect(state.unexpected).toEqual([]);
    });
  }
}
