import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
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

test('canonical Place correction returns to the originating saved moment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPhotoPlaces(page);
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  await page.getByRole('link', { name: 'Foto-Ort', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Foto-Ort', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Unser See');
  await page
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Unser See', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Zurück/ }).click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await expect(
    page.getByRole('link', { name: 'Unser See', exact: true }),
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
    page.getByRole('switch', { name: 'Orte automatisch ergänzen' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.addStyleTag({ content: 'body { font-size: 200% !important; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByRole('link', { name: 'Foto-Ort', exact: true }),
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
  await captureScreenshot(page, testInfo, '1459-large-text-320-dark.png', {
    fullPage: true,
  });
  expect(state.unexpected).toEqual([]);
});

async function installPhotoPlaces(page: Page) {
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
    name: 'Foto-Ort',
    description: null,
    address: null,
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
          title: 'Unser Nachmittag am See',
          body: 'Wir haben uns Zeit genommen und sind bis zum Abend geblieben.',
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
  return { unexpected, writes };
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
        if (new URL(req.url()).hostname.endsWith('google.com'))
          external.push(req.url());
      });
      await signIn(page);
      await page.goto('/more/settings');
      await page.locator('a[href="/more/settings/memories"]').click();
      const control = page.getByRole('switch', {
        name: 'Orte automatisch ergänzen',
      });
      await expect(control).toHaveAttribute('aria-checked', 'true');
      await captureScreenshot(
        page,
        testInfo,
        `1459-settings-${width}-${colorScheme}.png`,
        { fullPage: true },
      );
      await control.click();
      await expect(control).toHaveAttribute('aria-checked', 'false');
      await expect(
        page.getByText('Gespeichert', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Zurück zu Einstellungen' }),
      ).toBeVisible();
      await page.goto('/story/memories/mem-canal');
      await expect(
        page.getByRole('heading', { name: 'Unser Nachmittag am See' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Foto-Ort', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('img', { name: 'Foto zu diesem Eintrag' }).first(),
      ).toBeVisible();
      await captureScreenshot(
        page,
        testInfo,
        `1459-moment-${width}-${colorScheme}.png`,
        { fullPage: true },
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.getByRole('button', { name: 'Aktionen für Foto-Ort' }).click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('link', { name: /Google Maps/ }),
      ).toHaveAttribute(
        'href',
        'https://www.google.com/maps/search/?api=1&query=52.516667%2C13.4',
      );
      if (width === 390)
        await captureScreenshot(
          page,
          testInfo,
          `1459-actions-${colorScheme}.png`,
          { fullPage: true },
        );
      await dialog.getByRole('button', { name: 'Zuordnung entfernen' }).click();
      await expect(
        dialog.getByText(/Der Ort bleibt gespeichert/),
      ).toBeVisible();
      expect(state.writes).toEqual(['preference']);
      await dialog.getByRole('button', { name: 'Zuordnung entfernen' }).click();
      await expect(
        page.getByRole('link', { name: 'Foto-Ort', exact: true }),
      ).toHaveCount(0);
      expect(state.writes).toEqual(['preference', 'unlink']);
      expect(external).toEqual([]);
      expect(state.unexpected).toEqual([]);
    });
  }
}
