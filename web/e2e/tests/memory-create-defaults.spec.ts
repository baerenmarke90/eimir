import { fulfillEmptyMomentPlaces } from '../support/photoSources';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import contextTags from '../../src/i18n/locales/contextTags';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import photoSources from '../../src/i18n/locales/photoSources';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import taskSheets from '../../src/i18n/locales/taskSheets';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { showMemoryDetails } from '../support/memoryDiary';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-01T10:00:00Z';
const AUTHORED_TITLE = 'Authored memory title';
const AUTHORED_BODY = 'A remembered detail';

interface MemoryCreateRequestBody {
  body?: string;
  happenedOn?: string | null;
  tags?: string[];
  title?: string;
}

interface PhotoSourceScenario {
  googleAvailable?: boolean;
  connected: boolean;
  canImport: boolean;
  links: { origin: string; apiKey: string; consent: boolean }[];
  starts: number;
  originals: number;
  cancelled: number;
  disconnected: number;
  waitForOriginal?: () => Promise<void>;
}

interface PhotoBatchScenario {
  idsByName: Record<string, string>;
  uploaded: string[];
  finalized: string[];
  ready: Set<string>;
  bound: string[];
  creates: number;
  discoverReads: number;
  photoBytes?: Buffer;
}

const PHOTO_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=',
  'base64',
);

function sourceScenario(
  connected = false,
  canImport = true,
): PhotoSourceScenario {
  return {
    connected,
    canImport,
    links: [],
    starts: 0,
    originals: 0,
    cancelled: 0,
    disconnected: 0,
  };
}

function emptyPhotoBatch(): PhotoBatchScenario {
  return {
    photoBytes: readFileSync(
      new URL(
        '../../../backend/demo_assets/images/cabin-lake.jpg',
        import.meta.url,
      ),
    ),
    idsByName: {},
    uploaded: [],
    finalized: [],
    ready: new Set(),
    bound: [],
    creates: 0,
    discoverReads: 0,
  };
}

for (const [width, colorScheme] of [
  [360, 'dark'],
  [390, 'light'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`personal Immich link selects, stages and saves through the diary (${width})`, async ({
    page,
  }, testInfo) => {
    const source = sourceScenario();
    const photos = emptyPhotoBatch();
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await signInAndOpenMemoryCreate(page, photos, source);
    await page
      .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
      .fill(AUTHORED_BODY);
    await page.getByRole('button', { name: photoSources.more }).click();
    const sheet = page.getByRole('dialog', { name: photoSources.title });
    await sheet
      .getByRole('button', { name: photoSources.link, exact: true })
      .click();
    const link = page.getByRole('dialog', { name: photoSources.linkTitle });
    await link
      .getByLabel(photoSources.address, { exact: true })
      .fill('https://my-photos.example');
    await link
      .getByLabel(photoSources.key, { exact: true })
      .fill('synthetic-private-key');
    await expect(
      link.getByRole('button', { name: photoSources.connect, exact: true }),
    ).toBeDisabled();
    await link.getByLabel(photoSources.linkConsent, { exact: true }).check();
    await page.screenshot({
      path: testInfo.outputPath(
        `photo-source-link-${width}-${colorScheme}.png`,
      ),
      fullPage: true,
    });
    await link
      .getByRole('button', { name: photoSources.connect, exact: true })
      .click();
    await expect(sheet).toBeVisible();
    expect(source.links).toEqual([
      {
        origin: 'https://my-photos.example',
        apiKey: 'synthetic-private-key',
        consent: true,
      },
    ]);
    await sheet.getByLabel(photoSources.accept, { exact: true }).check();
    await sheet.getByRole('button', { name: photoSources.continue }).click();
    await sheet.getByLabel('Foto 1', { exact: true }).check();
    await sheet.getByLabel('Foto 2', { exact: true }).check();
    await expect(sheet.locator('.photo-source-choice img')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page })
      .include('.photo-source-sheet')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(
        `photo-source-selection-${width}-${colorScheme}.png`,
      ),
      fullPage: true,
    });
    await sheet.getByRole('button', { name: photoSources.import }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.attachment-draft-item')).toHaveCount(2);
    await expect(
      page.getByText(de.memory.photoReady, { exact: true }),
    ).toHaveCount(2);
    expect(source.originals).toBe(2);
    expect(photos.uploaded).toHaveLength(2);
    expect(photos.finalized).toHaveLength(2);
    expect(photos.creates).toBe(0);
    await expect(
      page.getByRole('textbox', { name: de.memory.bodyLabel, exact: true }),
    ).toHaveValue(AUTHORED_BODY);
    await page.getByRole('button', { name: de.memory.save }).click();
    await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
    expect(photos.creates).toBe(1);
    expect(photos.bound).toHaveLength(2);
  });
}

test('Google browser authorization returns selected copies to the unsaved diary', async ({
  page,
}) => {
  const source = sourceScenario();
  source.googleAvailable = true;
  const photos = emptyPhotoBatch();
  const externalUrls: string[] = [];
  await page.exposeFunction('recordPhotoAuthorization', (url: string) =>
    externalUrls.push(url),
  );
  await page.addInitScript(() => {
    window.open = () =>
      ({
        closed: false,
        opener: null,
        close() {},
        location: {
          replace(url: string) {
            void (
              window as unknown as {
                recordPhotoAuthorization(url: string): Promise<void>;
              }
            ).recordPhotoAuthorization(url);
          },
        },
      }) as unknown as Window;
  });
  await signInAndOpenMemoryCreate(page, photos, source);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await page.getByRole('button', { name: photoSources.more }).click();
  const sheet = page.getByRole('dialog', { name: photoSources.title });
  await sheet.getByLabel(photoSources.google, { exact: true }).check();
  await sheet.getByLabel(photoSources.accept, { exact: true }).check();
  await sheet.getByRole('button', { name: photoSources.continue }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  expect(externalUrls).toEqual(['https://accounts.google.com/authorize']);
  await expect(
    page.getByText(de.memory.photoReady, { exact: true }),
  ).toHaveCount(2);
  expect(source.originals).toBe(2);
  expect(photos.creates).toBe(0);
  await expect(
    page.getByRole('textbox', { name: de.memory.bodyLabel, exact: true }),
  ).toHaveValue(AUTHORED_BODY);
  await page.getByRole('button', { name: de.memory.save }).click();
  await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
  expect(photos.bound).toHaveLength(2);
});

test('closing a pending source transfer keeps authored words and rejects late photo bytes', async ({
  page,
}) => {
  const source = sourceScenario(true);
  let finish!: () => void;
  source.waitForOriginal = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  const photos = emptyPhotoBatch();
  await signInAndOpenMemoryCreate(page, photos, source);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await page.getByRole('button', { name: photoSources.more }).click();
  const sheet = page.getByRole('dialog', { name: photoSources.title });
  await sheet.getByLabel(photoSources.accept, { exact: true }).check();
  await sheet.getByRole('button', { name: photoSources.continue }).click();
  await sheet.getByLabel('Foto 1', { exact: true }).check();
  await sheet.getByRole('button', { name: photoSources.import }).click();
  await expect.poll(() => source.originals).toBe(1);
  await sheet
    .locator('.photo-source-footer')
    .getByRole('button', { name: taskSheets.close, exact: true })
    .click();
  finish();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('textbox', { name: de.memory.bodyLabel, exact: true }),
  ).toHaveValue(AUTHORED_BODY);
  await expect(page.locator('.attachment-draft-item')).toHaveCount(0);
  expect(photos.uploaded).toHaveLength(0);
  expect(photos.creates).toBe(0);
});

test('Pro expiry retains the personal link and permits disconnect without importing', async ({
  page,
}) => {
  const source = sourceScenario(true, false);
  await signInAndOpenMemoryCreate(page, emptyPhotoBatch(), source);
  await page.getByRole('button', { name: photoSources.more }).click();
  const sheet = page.getByRole('dialog', { name: photoSources.title });
  await expect(sheet.getByText(photoSources.proRequired)).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: photoSources.continue }),
  ).toHaveCount(0);
  await sheet.getByRole('button', { name: photoSources.disconnect }).click();
  await expect(
    sheet.getByText(photoSources.disconnected, { exact: true }),
  ).toBeVisible();
  expect(source.disconnected).toBe(1);
  expect(source.starts).toBe(0);
});

test('offline source import at narrow large text preserves the diary draft', async ({
  page,
  context,
}) => {
  const source = sourceScenario(true);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInAndOpenMemoryCreate(page, emptyPhotoBatch(), source);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await page.getByRole('button', { name: photoSources.more }).click();
  const sheet = page.getByRole('dialog', { name: photoSources.title });
  await sheet.getByLabel(photoSources.accept, { exact: true }).check();
  await sheet.getByRole('button', { name: photoSources.continue }).click();
  await sheet.getByLabel('Foto 1', { exact: true }).check();
  await expectNoHorizontalOverflow(page);
  await context.setOffline(true);
  await sheet.getByRole('button', { name: photoSources.import }).click();
  await expect(
    sheet.getByText(photoSources.offline, { exact: true }),
  ).toBeVisible();
  expect(source.originals).toBe(0);
  await context.setOffline(false);
  await sheet
    .locator('.photo-source-footer')
    .getByRole('button', { name: taskSheets.close, exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: de.memory.bodyLabel, exact: true }),
  ).toHaveValue(AUTHORED_BODY);
});

function localizedFallbackTitle(dateValue: string): string {
  const [year, month, day] = dateValue.split('-');
  return memoryProduct.createFallbackTitle.replace(
    '{{date}}',
    `${day}.${month}.${year}`,
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
}

async function browserLocalToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
}

async function installApiMocks(
  page: Page,
  photos?: PhotoBatchScenario,
  source?: PhotoSourceScenario,
): Promise<void> {
  let savedMemory: Record<string, unknown> | null = null;
  const attachments: string[] = [];
  const attachment = (id: string) => ({
    id,
    createdAt: TEST_NOW,
    durationSeconds: null,
    hasThumbnail: false,
    isSensitive: false,
    height: photos?.photoBytes ? 800 : 1,
    width: photos?.photoBytes ? 1200 : 1,
    mediaType: 'IMAGE',
    mimeType: photos?.photoBytes ? 'image/jpeg' : 'image/png',
    size: (photos?.photoBytes ?? PHOTO_BYTES).length,
    status: photos?.ready.has(id) ? 'READY' : 'VALIDATING',
    version: 1,
  });
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyMomentPlaces(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (
      pathname === `/api/v1/spaces/${SPACE_ID}/photo-sources` &&
      method === 'GET'
    ) {
      await fulfillJson({
        enabled: Boolean(source),
        googleAvailable: source?.googleAvailable ?? false,
        immichConnected: source?.connected ?? false,
        immichConnectionToken: source?.connected
          ? 'linked-connection:1'
          : 'account:immich:absent',
        canImport: source?.canImport ?? false,
        immichOrigin: source?.connected ? 'https://my-photos.example' : null,
      });
      return;
    }
    if (source && pathname.endsWith('/photo-sources/immich')) {
      if (method === 'PUT') {
        source.links.push(request.postDataJSON());
        source.connected = true;
      }
      if (method === 'DELETE') {
        source.disconnected++;
        source.connected = false;
      }
      await route.fulfill({ status: 204 });
      return;
    }
    if (source && pathname === `/api/v1/spaces/${SPACE_ID}/photo-selections`) {
      source.starts++;
      expect(request.postDataJSON().consent).toBe(true);
      await fulfillJson(
        {
          id: 'selected-session',
          source: source.googleAvailable ? 'google' : 'immich',
          status: source.googleAvailable ? 'AUTHORIZING' : 'READY',
          authorizationUrl: source.googleAvailable
            ? 'https://accounts.google.com/authorize'
            : undefined,
          items: [{ id: 'selected-one' }, { id: 'selected-two' }],
          hasMore: false,
        },
        201,
      );
      return;
    }
    if (
      source &&
      pathname.endsWith('/photo-selections/selected-session/poll')
    ) {
      await fulfillJson({
        id: 'selected-session',
        source: 'google',
        status: 'READY',
        items: [{ id: 'selected-one' }, { id: 'selected-two' }],
        hasMore: false,
      });
      return;
    }
    if (
      source &&
      pathname.includes('/photo-selections/selected-session/items/')
    ) {
      if (new URL(request.url()).searchParams.get('thumbnail') !== 'true') {
        source.originals++;
        await source.waitForOriginal?.();
      }
      await route
        .fulfill({
          contentType: photos?.photoBytes ? 'image/jpeg' : 'image/png',
          body: photos?.photoBytes ?? PHOTO_BYTES,
        })
        .catch(() => {});
      return;
    }
    if (
      source &&
      pathname.endsWith('/photo-selections/selected-session') &&
      method === 'DELETE'
    ) {
      source.cancelled++;
      await route.fulfill({ status: 204 });
      return;
    }

    if (
      photos &&
      pathname === `/api/v1/spaces/${SPACE_ID}/attachments` &&
      method === 'POST'
    ) {
      const id = `55555555-5555-4555-8555-${String(attachments.length + 1).padStart(12, '0')}`;
      attachments.push(id);
      photos.idsByName[request.postDataJSON().originalName] = id;
      await fulfillJson(
        {
          attachment: attachment(id),
          method: 'STREAM',
          requiredHeaders: { 'Content-Type': 'image/png' },
          uploadUrl: `/api/v1/spaces/${SPACE_ID}/attachments/${id}/content`,
        },
        201,
      );
      return;
    }
    const photoPath = pathname.match(
      /\/attachments\/([^/]+)(?:\/(content|finalize|read-access))?$/,
    );
    if (photos && photoPath && attachments.includes(photoPath[1])) {
      const [, id, action] = photoPath;
      if (action === 'content' && method === 'PUT') {
        photos.uploaded.push(id);
        await route.fulfill({ status: 204 });
      } else if (action === 'content' && method === 'GET') {
        await route.fulfill({
          contentType: photos.photoBytes ? 'image/jpeg' : 'image/png',
          body: photos.photoBytes ?? PHOTO_BYTES,
        });
      } else if (action === 'finalize' && method === 'POST') {
        photos.finalized.push(id);
        if (source) photos.ready.add(id);
        await fulfillJson(attachment(id));
      } else if (action === 'read-access' && method === 'POST') {
        await fulfillJson({
          method: 'STREAM',
          url: `/api/v1/spaces/${SPACE_ID}/attachments/${id}/content`,
        });
      } else if (!action && method === 'GET') {
        await fulfillJson(attachment(id));
      } else {
        throw new Error(`Unexpected photo request: ${method} ${pathname}`);
      }
      return;
    }
    if (
      photos &&
      method === 'PUT' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY_ID}/attachments` &&
      savedMemory
    ) {
      const bindings = request.postDataJSON().attachments as {
        attachmentId: string;
        position: number;
      }[];
      photos.bound = bindings.map((entry) => entry.attachmentId);
      savedMemory = {
        ...savedMemory,
        version: 2,
        attachments: bindings.map((entry) => ({
          ...attachment(entry.attachmentId),
          position: entry.position,
        })),
      };
      await fulfillJson(savedMemory);
      return;
    }
    if (
      photos &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/discover`
    ) {
      photos.discoverReads++;
      await fulfillJson({
        selectionDate: TEST_NOW.slice(0, 10),
        lead: savedMemory
          ? { kind: 'MEMORY', effectiveDate: TEST_NOW, memory: savedMemory }
          : null,
        leadContext: null,
        items: [],
      });
      return;
    }
    if (photos && method === 'GET' && pathname.endsWith('/comments')) {
      await fulfillJson({ items: [], nextCursor: null, hasMore: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
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
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories`
    ) {
      const body = request.postDataJSON() as MemoryCreateRequestBody;
      if (photos) photos.creates++;
      savedMemory = {
        attachments: [],
        author: { accountId: ACCOUNT_ID, displayName: 'Anna' },
        authorId: ACCOUNT_ID,
        body: body.body ?? '',
        capabilities: { canEdit: true, canDelete: true },
        createdAt: TEST_NOW,
        happenedOn: body.happenedOn ?? null,
        id: MEMORY_ID,
        spaceId: SPACE_ID,
        tags: body.tags ?? [],
        title: body.title ?? '',
        updatedAt: TEST_NOW,
        version: 1,
      };
      await fulfillJson(savedMemory, 201);
      return;
    }

    if (
      method === 'PATCH' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY_ID}` &&
      savedMemory
    ) {
      savedMemory = {
        ...savedMemory,
        ...request.postDataJSON(),
        version: Number(savedMemory.version) + 1,
      };
      await fulfillJson(savedMemory);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY_ID}` &&
      savedMemory
    ) {
      await fulfillJson(savedMemory);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      await fulfillJson({
        availableYears: [],
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signInAndOpenMemoryCreate(
  page: Page,
  photos?: PhotoBatchScenario,
  source?: PhotoSourceScenario,
): Promise<void> {
  await installApiMocks(page, photos, source);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);

  if (photos) {
    await page.goto('/story');
    await expect.poll(() => photos.discoverReads).toBe(1);
  }

  await page.goto('/story/memories/new');
  await expect(
    page.getByRole('heading', { name: de.memory.heading }),
  ).toBeVisible();
}

for (const [width, colorScheme] of [
  [360, 'dark'],
  [390, 'light'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`a selected photo batch survives queued validation and appears in Discover (${width})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.clock.install();
    const photos: PhotoBatchScenario = {
      idsByName: {},
      uploaded: [],
      finalized: [],
      ready: new Set(),
      bound: [],
      creates: 0,
      discoverReads: 0,
    };
    await signInAndOpenMemoryCreate(page, photos);
    await showMemoryDetails(page);
    await page.getByLabel(de.memory.titleLabelOptional).fill(AUTHORED_TITLE);
    await page
      .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
      .fill(AUTHORED_BODY);
    await page.locator('#memory-create-images').setInputFiles(
      ['one.png', 'two.png', 'three.png'].map((name) => ({
        name,
        mimeType: 'image/png',
        buffer: PHOTO_BYTES,
      })),
    );
    await expect.poll(() => photos.finalized.length).toBe(3);
    expect(new Set(photos.uploaded).size).toBe(3);
    photos.ready.add(photos.finalized[0]);
    await page.clock.fastForward(1_000);
    await expect(page.locator('.attachment-status-ready')).toHaveCount(1);
    // The remaining photos are still queued on the server, not failed uploads.
    await page.clock.fastForward(35_000);
    await expect(page.locator('.attachment-status-validating')).toHaveCount(2);
    await expect(page.locator('.attachment-status-failed')).toHaveCount(0);
    for (const id of photos.finalized) photos.ready.add(id);
    await page.clock.fastForward(5_000);
    await expect(page.locator('.attachment-status-ready')).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`batch-ready-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: de.memory.save }).click();
    await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
    expect(photos.creates).toBe(1);
    expect(photos.bound).toEqual(
      ['one.png', 'two.png', 'three.png'].map((name) => photos.idsByName[name]),
    );
    await expect(
      page.getByRole('heading', { name: AUTHORED_TITLE, exact: true }),
    ).toBeVisible();
    const savedPhotos = page.locator('button.media-gallery-carousel-slide');
    await expect(savedPhotos).toHaveCount(3);
    await expect
      .poll(() =>
        savedPhotos
          .locator('img.media-gallery-carousel-content')
          .evaluateAll(
            (images: HTMLImageElement[]) =>
              images.length === 3 &&
              images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`batch-saved-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page
      .getByRole('link', { name: de.navigation.story, exact: true })
      .click();
    await expect.poll(() => photos.discoverReads).toBeGreaterThan(1);
    await expect(page.getByText(AUTHORED_TITLE, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`batch-discover-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  });
}

async function openDateEditor(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(de.memory.dateLabel) })
    .click();
}

async function submitAndReadCreateRequest(
  page: Page,
): Promise<MemoryCreateRequestBody> {
  const requestPromise = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    return (
      request.method() === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories`
    );
  });

  await page.getByRole('button', { name: de.memory.save }).click();
  const request = await requestPromise;
  return request.postDataJSON() as MemoryCreateRequestBody;
}

test('Memory Create opens with browser-local today and an optional title', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await openDateEditor(page);

  await expect(page.getByLabel(de.memory.dateLabel)).toHaveValue(
    await browserLocalToday(page),
  );
  await expect(
    page.getByLabel(de.memory.titleLabelOptional),
  ).not.toHaveAttribute('required', '');
});

test('custom Memory tags survive create, reload, edit and removal (#1290)', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await signInAndOpenMemoryCreate(page);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await showMemoryDetails(page);
  const input = page.getByLabel(contextTags.newLabel);
  await input.fill('  Ostsee   2026  ');
  await input.press('Enter');
  await expect(
    page.getByRole('button', {
      name: contextTags.remove.replace('{{tag}}', 'Ostsee 2026'),
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/memories\/new$/);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (const [name, width, dark, large] of [
    ['compact-light', 390, false, false],
    ['compact-dark', 390, true, false],
    ['expanded-light', 1280, false, false],
    ['reflow-320', 320, false, false],
    ['large-text', 390, false, true],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await page.evaluate((large) => {
      document.documentElement.style.fontSize = large ? '200%' : '';
    }, large);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`context-tags-${name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await input.fill('First summer');
  expect((await submitAndReadCreateRequest(page)).tags).toEqual([
    'Ostsee 2026',
    'First summer',
  ]);
  await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
  await page.reload();
  await expect(
    page
      .locator('.memory-tag-summary')
      .getByText('Ostsee 2026', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: memoryProduct.edit, exact: true })
    .click();
  await page
    .getByRole('button', {
      name: contextTags.remove.replace('{{tag}}', 'Ostsee 2026'),
    })
    .click();
  await page.getByLabel(contextTags.newLabel).fill('Our tradition');
  const update = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' &&
      request.url().endsWith(`/memories/${MEMORY_ID}`),
  );
  await page
    .getByRole('button', { name: memoryProduct.save, exact: true })
    .click();
  expect((await update).postDataJSON().tags).toEqual([
    'First summer',
    'Our tradition',
  ]);
  await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
  await page.reload();
  await expect(
    page
      .locator('.memory-tag-summary')
      .getByText('Our tradition', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.memory-tag-summary')
      .getByText('Ostsee 2026', { exact: true }),
  ).toHaveCount(0);
});

test('text-only with the default date saves a non-empty localized fallback title', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await showMemoryDetails(page);
  await page.getByText(contextTags.suggestions, { exact: true }).click();
  await page.getByText(de.memory.tagLabels.home, { exact: true }).click();
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  const expectedDate = await browserLocalToday(page);

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.body).toBe(AUTHORED_BODY);
  expect(requestBody.tags).toEqual(['home']);
  expect(requestBody.happenedOn).toBe(expectedDate);
  expect(requestBody.title).toBe(localizedFallbackTitle(expectedDate));
  expect(requestBody.title?.trim()).not.toBe('');
  await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${expectedDate}T00:00:00Z`)),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(de.memory.tagLabels.home, { exact: true }),
  ).toBeVisible();
});

test('a selected date wins and is also used by a text-only fallback title', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await openDateEditor(page);
  await page.getByLabel(de.memory.dateLabel).fill('2025-12-24');

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.body).toBe(AUTHORED_BODY);
  expect(requestBody.happenedOn).toBe('2025-12-24');
  expect(requestBody.title).toBe(localizedFallbackTitle('2025-12-24'));
});

test('text-only with a cleared date and whitespace title falls back using local today', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await showMemoryDetails(page);
  await page.getByLabel(de.memory.titleLabelOptional).fill('   ');
  await openDateEditor(page);
  await page.getByLabel(de.memory.dateLabel).fill('');
  const expectedDate = await browserLocalToday(page);

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.body).toBe(AUTHORED_BODY);
  expect(requestBody.happenedOn).toBe(expectedDate);
  expect(requestBody.title).toBe(localizedFallbackTitle(expectedDate));
  expect(requestBody.title?.trim()).not.toBe('');
});

test('an authored title is kept while the selected happenedOn date is submitted', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await showMemoryDetails(page);
  await page.getByLabel(de.memory.titleLabelOptional).fill(AUTHORED_TITLE);
  await openDateEditor(page);
  await page.getByLabel(de.memory.dateLabel).fill('2025-12-24');

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.title).toBe(AUTHORED_TITLE);
  expect(requestBody.happenedOn).toBe('2025-12-24');
});

test('Memory Create defaults render without overflow and capture product visual evidence', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndOpenMemoryCreate(page);
  await openDateEditor(page);
  await expect(page.getByLabel(de.memory.dateLabel)).toHaveValue(
    await browserLocalToday(page),
  );
  // Return to the closed date-summary state before capturing visual
  // evidence, so the screenshots reflect what the page actually renders
  // by default rather than the transient date-editing state.
  await showMemoryDetails(page);
  await page.getByLabel(de.memory.titleLabelOptional).click();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-memory-create-defaults-compact.png'),
    fullPage: true,
  });

  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-memory-create-defaults-compact-dark.png'),
    fullPage: true,
  });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-memory-create-defaults-expanded.png'),
    fullPage: true,
  });
});

for (const [width, colorScheme] of [
  [360, 'dark'],
  [390, 'light'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`diary restores text, date, pending label and selected files after reload (${width})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const photos: PhotoBatchScenario = {
      idsByName: {},
      uploaded: [],
      finalized: [],
      ready: new Set(),
      bound: [],
      creates: 0,
      discoverReads: 0,
      photoBytes: readFileSync(
        new URL(
          '../../../backend/demo_assets/images/cabin-lake.jpg',
          import.meta.url,
        ),
      ),
    };
    await signInAndOpenMemoryCreate(page, photos);
    await expect(
      page.getByLabel(de.memory.bodyLabel, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(de.memory.titleLabelOptional)).toBeHidden();
    const text =
      'A quiet afternoon together.\n\nWe want to remember the little details.';
    await page.getByLabel(de.memory.bodyLabel, { exact: true }).fill(text);
    await openDateEditor(page);
    await page.getByLabel(de.memory.dateLabel).fill('2025-12-24');
    await showMemoryDetails(page);
    await page.getByLabel(de.memory.titleLabelOptional).fill(AUTHORED_TITLE);
    await page.locator('#memory-create-images').setInputFiles(
      ['one.png', 'two.png'].map((name) => ({
        name,
        mimeType: 'image/png',
        buffer: photos.photoBytes!,
      })),
    );
    await expect.poll(() => photos.finalized.length).toBe(2);
    for (const id of photos.finalized) photos.ready.add(id);
    await expect(page.locator('.attachment-status-ready')).toHaveCount(2);
    await page
      .getByRole('button', {
        name: de.memory.photoMoveLater.replace('{{name}}', 'one.png'),
      })
      .click();
    await page.getByLabel(contextTags.newLabel).fill('An unfinished label');
    await expect(page.locator('.memory-draft-status')).toHaveText(
      de.memory.diary.draft.saved,
    );
    await page.locator('.memory-task-heading').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`diary-compose-${width}-${colorScheme}.png`),
      fullPage: true,
    });
    page.on('dialog', (dialog) => dialog.accept());
    await page.reload();
    await expect(
      page.getByRole('heading', { name: de.memory.diary.resumeTitle }),
    ).toBeVisible();
    expect(photos.creates).toBe(0);
    await page
      .getByRole('button', { name: de.memory.diary.resume, exact: true })
      .click();
    await expect(
      page.getByLabel(de.memory.bodyLabel, { exact: true }),
    ).toHaveValue(text);
    await expect(page.getByLabel(de.memory.titleLabelOptional)).toHaveValue(
      AUTHORED_TITLE,
    );
    await expect(page.getByLabel(contextTags.newLabel)).toHaveValue(
      'An unfinished label',
    );
    await expect(page.locator('.attachment-status-ready')).toHaveCount(2);
    // READY file identity is restored; recovery must not upload a second copy.
    expect(photos.uploaded).toHaveLength(2);
    await page.getByLabel(de.memory.bodyLabel, { exact: true }).click();
    const request = await submitAndReadCreateRequest(page);
    expect(request.body).toBe(text);
    expect(request.happenedOn).toBe('2025-12-24');
    expect(request.tags).toEqual(['An unfinished label']);
    await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
    await expect(page.locator('.memory-diary-prose > p')).toHaveText(
      text.split('\n\n'),
    );
    expect(photos.creates).toBe(1);
    expect(photos.bound).toEqual(
      ['two.png', 'one.png'].map((name) => photos.idsByName[name]),
    );
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`diary-read-${width}-${colorScheme}.png`),
      fullPage: true,
    });
    await page.goto('/story/memories/new');
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: de.memory.diary.resumeTitle }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel(de.memory.bodyLabel, { exact: true }),
    ).toHaveValue('');
  });
}

test('diary replays the original request identity after reloading an uncertain create', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  const requests: { body: unknown; key: string | undefined }[] = [];
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memories`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    requests.push({
      body: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    });
    await route.abort('failed');
  });
  await page
    .getByLabel(de.memory.bodyLabel, { exact: true })
    .fill(AUTHORED_BODY);
  await page.getByRole('button', { name: de.memory.save }).click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.uncertainTitle }),
  ).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole('button', { name: de.memory.diary.resume, exact: true })
    .click();
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: taskBoundary.verify, exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
});

test('diary draft storage isolates account, instance and Space; invalidates old writers and expires files', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/client/memoryDiaryDraft.ts';
    const { MemoryDiaryDraftStore, MEMORY_DRAFT_MAX_AGE_MS } = await import(
      modulePath
    );
    const writer = new MemoryDiaryDraftStore(
      'https://one.example',
      'account-a',
      'space-a',
    );
    await writer.load();
    const value = {
      title: '',
      body: 'Owner-local words',
      tags: [],
      happenedOn: '2026-10-26',
      files: [
        {
          file: new File(['private pixels'], 'photo.jpg', {
            type: 'image/jpeg',
          }),
        },
      ],
      attempt: null,
      partial: null,
    };
    await writer.save(value);
    const isolated = [];
    for (const scope of [
      ['https://two.example', 'account-a', 'space-a'],
      ['https://one.example', 'account-b', 'space-a'],
      ['https://one.example', 'account-a', 'space-b'],
    ]) {
      isolated.push(await new MemoryDiaryDraftStore(...scope).load());
    }
    const replacement = new MemoryDiaryDraftStore(
      'https://one.example',
      'account-a',
      'space-a',
    );
    const recovered = await replacement.load();
    await replacement.save(value);
    let oldWriterDenied = false;
    try {
      await writer.save(value);
    } catch {
      oldWriterDenied = true;
    }
    const fileText = await recovered.files[0].file.text();
    const originalNow = Date.now;
    Date.now = () => originalNow() + MEMORY_DRAFT_MAX_AGE_MS + 1;
    const expired = await new MemoryDiaryDraftStore(
      'https://one.example',
      'account-a',
      'space-a',
    ).load();
    Date.now = originalNow;
    await replacement.load();
    await replacement.save(value);
    const sessionPath = '/src/client/sessionPersistence.ts';
    const { clearStoredSession } = await import(sessionPath);
    await clearStoredSession();
    let revokedDenied = false;
    try {
      await replacement.save(value);
    } catch {
      revokedDenied = true;
    }
    const purged = await new MemoryDiaryDraftStore(
      'https://one.example',
      'account-a',
      'space-a',
    ).load();
    return {
      isolated,
      fileText,
      oldWriterDenied,
      expired,
      revokedDenied,
      purged,
    };
  });
  expect(result).toEqual({
    isolated: [null, null, null],
    fileText: 'private pixels',
    oldWriterDenied: true,
    expired: null,
    revokedDenied: true,
    purged: null,
  });
});

test('diary recovery retries only attachment binding for an already created entry', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const photos: PhotoBatchScenario = {
    idsByName: {},
    uploaded: [],
    finalized: [],
    ready: new Set(),
    bound: [],
    creates: 0,
    discoverReads: 0,
  };
  await signInAndOpenMemoryCreate(page, photos);
  await page
    .getByLabel(de.memory.bodyLabel, { exact: true })
    .fill(AUTHORED_BODY);
  await page.locator('#memory-create-images').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: PHOTO_BYTES,
  });
  await expect.poll(() => photos.finalized.length).toBe(1);
  photos.ready.add(photos.finalized[0]);
  await expect(page.locator('.attachment-status-ready')).toHaveCount(1);
  let bindings = 0;
  await page.route(`**/memories/${MEMORY_ID}/attachments`, async (route) => {
    bindings++;
    if (bindings === 1) await route.abort('failed');
    else await route.fallback();
  });
  await page.getByRole('button', { name: de.memory.save }).click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.partialTitle }),
  ).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole('button', { name: de.memory.diary.resume, exact: true })
    .click();
  await page
    .getByRole('button', { name: taskBoundary.retryPhotos, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
  expect(photos.creates).toBe(1);
  expect(bindings).toBe(2);
  expect(photos.bound).toEqual([photos.idsByName['photo.png']]);
});

test('erasing a diary draft does not resurrect old words on reload', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  const body = page.getByLabel(de.memory.bodyLabel, { exact: true });
  await body.fill(AUTHORED_BODY);
  await expect(page.locator('.memory-draft-status')).toHaveText(
    de.memory.diary.draft.saved,
  );
  await body.fill('');
  await expect(page.locator('.memory-draft-status')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: de.memory.diary.resumeTitle }),
  ).toHaveCount(0);
  await expect(body).toHaveValue('');
});

test('diary restores a file whose unbound server upload has expired', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const photos: PhotoBatchScenario = {
    idsByName: {},
    uploaded: [],
    finalized: [],
    ready: new Set(),
    bound: [],
    creates: 0,
    discoverReads: 0,
  };
  await signInAndOpenMemoryCreate(page, photos);
  await page
    .getByLabel(de.memory.bodyLabel, { exact: true })
    .fill(AUTHORED_BODY);
  await page.locator('#memory-create-images').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: PHOTO_BYTES,
  });
  await expect.poll(() => photos.finalized.length).toBe(1);
  const expiredId = photos.finalized[0];
  photos.ready.add(expiredId);
  await expect(page.locator('.attachment-status-ready')).toHaveCount(1);
  await expect(page.locator('.memory-draft-status')).toHaveText(
    de.memory.diary.draft.saved,
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole('button', { name: de.memory.diary.resume, exact: true })
    .click();
  await page.route(`**/attachments/${expiredId}`, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'NOT_FOUND',
        status: 404,
        title: 'Not found',
      }),
    });
  });
  await page.getByRole('button', { name: de.memory.save }).click();
  await expect.poll(() => photos.finalized.length).toBe(2);
  photos.ready.add(photos.finalized[1]);
  await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY_ID}$`));
  expect(photos.creates).toBe(1);
  expect(photos.bound).toEqual([photos.finalized[1]]);
});
