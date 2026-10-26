import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/photoLocations';
import { fulfillDefaultAppIcon } from '../support/appIcon';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const SPACE = '22222222-2222-4222-8222-222222222222';
const MEMORY = '44444444-4444-4444-8444-444444444444';
const PHOTO = '55555555-5555-4555-8555-555555555555';
const PLACE = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-10-26T12:00:00Z';
const root = `/api/v1/spaces/${SPACE}`;
const evidence = fileURLToPath(
  new URL(
    '../../../docs/product/design/references/photo-locations/evidence/',
    import.meta.url,
  ),
);
const image = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/cabin-lake.jpg',
    import.meta.url,
  ),
);

async function fixture(page: Page) {
  const initialPlace = {
    id: PLACE,
    spaceId: SPACE,
    createdBy: ACCOUNT,
    name: 'Photo location',
    description: null,
    address: null,
    latitude: 52.5,
    longitude: 13.4,
    photoLocation: true,
    mapUrl: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    creator: { accountId: ACCOUNT, displayName: 'Anna' },
    capabilities: { canEdit: true, canDelete: true, canComment: false },
  };
  const state = {
    enabled: true,
    version: 1,
    failWrite: false,
    places: [initialPlace],
    allPlaces: [initialPlace],
    writes: [] as unknown[],
    external: [] as string[],
  };
  page.on('request', (request) => {
    if (
      /^https:\/\/(?:www\.google\.com|maps\.app\.goo\.gl)/.test(request.url())
    )
      state.external.push(request.url());
  });
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path === '/api/v1/instance/status')
      return json({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
    if (path === '/api/v1/auth/sign-in')
      return json({
        account: { id: ACCOUNT, displayName: 'Anna' },
        tokens: {
          accessToken: 'photo-test-token',
          refreshToken: 'photo-test-refresh',
          accessExpiresAt: '2027-01-01T00:00:00Z',
          refreshExpiresAt: '2027-01-02T00:00:00Z',
        },
      });
    if (path === '/api/v1/auth/me')
      return json({ id: ACCOUNT, displayName: 'Anna' });
    if (path === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (path === '/api/v1/auth/memberships')
      return json([{ role: 'MEMBER', spaceId: SPACE, status: 'ACTIVE' }]);
    if (path === '/api/v1/account/photo-location-preferences') {
      if (method === 'PUT') {
        state.writes.push({
          body: request.postDataJSON(),
          version: request.headers()['if-match'],
        });
        if (state.failWrite)
          return json(
            { status: 503, code: 'SERVICE_UNAVAILABLE', title: 'Unavailable' },
            503,
          );
        state.enabled = request.postDataJSON().enabled;
        state.version++;
      }
      return json({ enabled: state.enabled, version: state.version });
    }
    if (path === root) return json({ id: SPACE, createdAt: NOW, partners: [] });
    if (path === `${root}/profile`)
      return json({
        spaceId: SPACE,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
    if (path === `${root}/dashboard`)
      return json({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE },
        upcoming: [],
      });
    if (path === `${root}/profiles/${ACCOUNT}`)
      return json({
        accountId: ACCOUNT,
        displayName: 'Anna',
        id: ACCOUNT,
        preferences: [],
        profileAttachmentId: null,
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
      });
    if (path.endsWith('/notifications/unread-count'))
      return json({ unreadCount: 0 });
    if (path === `${root}/memories/${MEMORY}`)
      return json({
        id: MEMORY,
        spaceId: SPACE,
        authorId: ACCOUNT,
        author: { accountId: ACCOUNT, displayName: 'Anna' },
        title: 'Unser Abend am See',
        body: 'Noch lange am Ufer gesessen und einfach geredet.',
        tags: [],
        happenedOn: '2026-10-25',
        version: 2,
        createdAt: NOW,
        updatedAt: NOW,
        capabilities: { canEdit: true, canDelete: true, canComment: true },
        attachments: [
          {
            id: PHOTO,
            status: 'READY',
            mediaType: 'IMAGE',
            mimeType: 'image/jpeg',
            size: image.length,
            width: 1280,
            height: 960,
            hasThumbnail: false,
            position: 0,
          },
        ],
      });
    if (path === `${root}/memories/${MEMORY}/places`)
      return json({ items: state.places });
    if (path === `${root}/places`) {
      if (method === 'POST') {
        const next = {
          ...initialPlace,
          ...request.postDataJSON(),
          photoLocation: false,
          id: '77777777-7777-4777-8777-777777777777',
        };
        state.allPlaces.push(next);
        return json(next, 201);
      }
      return json({ items: state.allPlaces, nextCursor: null, hasMore: false });
    }
    const relation = path.match(/\/places\/([^/]+)\/memories\/([^/]+)$/);
    if (relation) {
      if (method === 'PUT') {
        const found = state.allPlaces.find((place) => place.id === relation[1]);
        if (found && !state.places.some((place) => place.id === found.id))
          state.places.push(found);
      } else if (method === 'DELETE')
        state.places = state.places.filter((place) => place.id !== relation[1]);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith(`/attachments/${PHOTO}/read-access`))
      return json({
        method: 'STREAM',
        url: `${root}/attachments/${PHOTO}/content`,
      });
    if (path.endsWith(`/attachments/${PHOTO}/content`))
      return route.fulfill({ contentType: 'image/jpeg', body: image });
    if (path.endsWith('/presence')) return json({ state: null });
    if (path.endsWith('/discover'))
      return json({
        selectionDate: '2026-10-26',
        lead: null,
        leadContext: null,
        items: [],
      });
    return json({
      items: [],
      availableYears: [],
      nextCursor: null,
      hasMore: false,
    });
  });
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  return state;
}

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`default-on setting persists across navigation (${width} ${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const state = await fixture(page);
    await page.goto('/more/settings/memories');
    const control = page.getByRole('switch', { name: copy.enabledLabel });
    await expect(control).toBeChecked();
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: `${evidence}/settings-${width}-${theme}.png`,
      fullPage: true,
    });
    await control.click();
    await expect(control).not.toBeChecked();
    expect(state.writes).toEqual([
      { body: { enabled: false }, version: '"1"' },
    ]);
    await page.getByRole('link', { name: /Zurück zu Einstellungen/ }).click();
    await page.getByRole('link', { name: /Erinnerungen/ }).click();
    await expect(control).not.toBeChecked();
    await control.click();
    await expect(control).toBeChecked();
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
  });
}

test('a photo place can be opened, corrected with a short link, and removed without provider requests', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await fixture(page);
  await page.goto(`/story/memories/${MEMORY}`);
  await expect(page.getByRole('link', { name: copy.maps })).toHaveAttribute(
    'href',
    /query=52\.5%2C13\.4/,
  );
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/memory-390-light.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: copy.change, exact: true }).click();
  await page.getByLabel(copy.name, { exact: true }).fill('Unser Lieblingscafé');
  await page
    .getByLabel(copy.address, { exact: true })
    .fill('https://maps.app.goo.gl/Example123');
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText('Unser Lieblingscafé', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: copy.maps })).toHaveAttribute(
    'href',
    'https://maps.app.goo.gl/Example123',
  );
  await page.getByRole('button', { name: copy.remove, exact: true }).click();
  await expect(page.getByRole('link', { name: copy.maps })).toHaveCount(0);
  expect(state.external).toEqual([]);
  expect(state.places).toEqual([]);
});

test('failed preference writes retain the confirmed state and support deliberate retry', async ({
  page,
}) => {
  const state = await fixture(page);
  state.failWrite = true;
  await page.goto('/more/settings/memories');
  const control = page.getByRole('switch', { name: copy.enabledLabel });
  await expect(control).toBeChecked();
  await control.click();
  await expect(control).toBeEnabled();
  await expect(control).toBeChecked();
  await expect(page.getByText(copy.saved, { exact: true })).toHaveCount(0);
  state.failWrite = false;
  await control.click();
  await expect(control).not.toBeChecked();
});

test('settings reflow at 320 CSS pixels with large text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await fixture(page);
  await page.goto('/more/settings/memories');
  await expect(page.getByRole('switch')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('switch')).toBeVisible();
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')]
      .filter(
        (item) =>
          item.getBoundingClientRect().right >
            document.documentElement.clientWidth + 1 &&
          item.getBoundingClientRect().width > 0,
      )
      .map((item) => ({
        tag: item.tagName,
        className: item.className,
        right: item.getBoundingClientRect().right,
      }))
      .slice(0, 12),
  }));
  expect(size.scroll, JSON.stringify(size.overflow)).toBeLessThanOrEqual(
    size.width,
  );
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/settings-320-large-text.png`,
    fullPage: true,
  });
});
