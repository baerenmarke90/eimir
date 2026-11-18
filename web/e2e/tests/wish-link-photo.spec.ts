import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/m5s3';
import photoReactions from '../../src/i18n/locales/photoReactions';
import { editViaMenu } from '../support/itemMenu';
import { addComposerMedia } from '../support/mediaIntake';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/*
 * A Wish carries an optional link and one optional photo, each editable
 * separately; a Plan made from the Wish reaches both through its source Wish.
 */

const base = `/api/v1/spaces/${SPACE_ID}`;
const picture = readFileSync(
  fileURLToPath(
    new URL(
      '../../../backend/demo_assets/images/lake-sunrise.jpg',
      import.meta.url,
    ),
  ),
);
const STAMP = '2026-11-18T09:00:00Z';
const LINK = 'https://www.hut.example/rooms';
const hostLabel = (host: string) =>
  copy.wish.link.editNamed.replace('{{host}}', host);

type Row = Record<string, unknown>;

function wishRow(id: string, title: string, extra: Row = {}): Row {
  return {
    id,
    title,
    spaceId: SPACE_ID,
    status: 'OPEN',
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: CAPABILITIES,
    createdAt: STAMP,
    updatedAt: STAMP,
    version: 1,
    tags: [],
    plan: null,
    hasMemory: false,
    followedFromWishId: null,
    seriesId: id,
    seriesPosition: 1,
    ...extra,
  };
}

function planRow(id: string, sourceWishId: string | null): Row {
  return {
    id,
    title: `Plan ${id}`,
    spaceId: SPACE_ID,
    status: 'IDEA',
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: CAPABILITIES,
    createdAt: STAMP,
    updatedAt: STAMP,
    version: 1,
    tags: [],
    attachments: [],
    description: null,
    plannedOn: null,
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    placeId: null,
    sourceWishId,
    anticipationEnabled: false,
  };
}

async function installWishApi(
  page: Page,
  options: {
    wishes?: Row[];
    plans?: Row[];
    failFirstUpload?: boolean;
  } = {},
) {
  const wishes = new Map<string, Row>(
    (options.wishes ?? []).map((wish) => [String(wish.id), wish]),
  );
  const plans = new Map<string, Row>(
    (options.plans ?? []).map((plan) => [String(plan.id), plan]),
  );
  const creates: Row[] = [];
  const updates: Row[] = [];
  let attachmentCount = 0;
  let puts = 0;
  const attachment = (id: string, status = 'READY') => ({
    id,
    status,
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: picture.length,
    width: 1200,
    height: 800,
    hasThumbnail: false,
    isSensitive: false,
    durationSeconds: null,
    version: 1,
    createdAt: STAMP,
    position: 0,
  });

  await page.addInitScript(
    ({ accountId, spaceId }) =>
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      ),
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  await installMocks(page, { strict: true });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (path === `${base}/attachments` && method === 'POST') {
      const id = `photo-${++attachmentCount}`;
      return json(
        {
          attachment: attachment(id, 'PENDING'),
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${base}/attachments/${id}/content`,
        },
        201,
      );
    }
    if (/\/attachments\/photo-\d+\/content$/.test(path) && method === 'PUT') {
      puts++;
      return route.fulfill({
        status: options.failFirstUpload && puts === 1 ? 503 : 204,
      });
    }
    const upload = path.match(/\/attachments\/(photo-\d+)(\/finalize)?$/);
    if (upload && method === 'DELETE') return route.fulfill({ status: 204 });
    if (upload && (method === 'GET' || upload[2]))
      return json(attachment(upload[1]));

    if (path === `${base}/wishes`) {
      if (method === 'POST') {
        const body = request.postDataJSON();
        creates.push(body);
        const wish = wishRow(`wish-new-${creates.length}`, body.title, {
          description: body.description ?? null,
          linkUrl: body.linkUrl ?? null,
          photoAttachmentId: body.photoAttachmentId ?? null,
        });
        wishes.set(String(wish.id), wish);
        return json(wish, 201);
      }
      return json({
        items: [...wishes.values()],
        nextCursor: null,
        hasMore: false,
      });
    }
    const wishPath = path.match(/^.*\/wishes\/([^/]+)(\/reminder)?$/);
    if (wishPath && wishPath[2] && method === 'GET')
      return json({ dueAt: null });
    const wish = wishPath ? wishes.get(wishPath[1]) : undefined;
    if (wishPath && !wishPath[2] && wish) {
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        updates.push(body);
        const next = { ...wish, version: Number(wish.version) + 1 };
        for (const key of [
          'title',
          'description',
          'tags',
          'linkUrl',
          'photoAttachmentId',
        ])
          if (key in body) next[key] = body[key];
        wishes.set(String(wish.id), next);
        return json(next);
      }
      if (method === 'GET') return json(wish);
    }
    const planPath = path.match(/^.*\/plans\/([^/]+)$/);
    const plan = planPath ? plans.get(planPath[1]) : undefined;
    if (plan && method === 'GET') return json(plan);
    if (path === `${base}/plans` && method === 'GET')
      return json({
        items: [...plans.values()],
        nextCursor: null,
        hasMore: false,
      });
    if (await fulfillDefaultProductContext(route)) return;
    return route.fallback();
  });
  return {
    creates,
    updates,
    wish: (id: string) => wishes.get(id),
    uploadCount: () => attachmentCount,
  };
}

const saveCreate = (page: Page) =>
  page.getByRole('button', { name: copy.common.save, exact: true });
const saveEdit = (page: Page) =>
  page.getByRole('button', { name: copy.common.saveChanges, exact: true });

async function setLink(page: Page, address: string) {
  await page
    .getByRole('button', { name: copy.wish.link.tool, exact: true })
    .click();
  await page.getByLabel(copy.wish.link.label).fill(address);
  await page
    .getByRole('button', { name: copy.wish.link.done, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test('creates a Wish with a link and a photo and shows both on its detail', async ({
  page,
}) => {
  const api = await installWishApi(page);
  await signIn(page);
  await page.goto('/plan/wishes/new');
  await page.getByLabel(copy.wish.intentionLabel).fill('Mountain hut weekend');

  // Invalid input is explained and never applied.
  await page
    .getByRole('button', { name: copy.wish.link.tool, exact: true })
    .click();
  await page.getByLabel(copy.wish.link.label).fill('javascript:alert(1)');
  await page
    .getByRole('button', { name: copy.wish.link.done, exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    copy.wish.link.invalid.scheme,
  );
  await page.getByLabel(copy.wish.link.label).fill('hut.example/rooms');
  await page
    .getByRole('button', { name: copy.wish.link.done, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: hostLabel('hut.example') }),
  ).toBeVisible();

  await addComposerMedia(page, {
    name: 'hut.jpg',
    mimeType: 'image/jpeg',
    buffer: picture,
  });
  await expect(page.locator('.photo-draft-tile')).toHaveAttribute(
    'aria-label',
    new RegExp(de.memory.photoReady),
  );
  // Nothing is written before Save.
  expect(api.creates).toHaveLength(0);
  await saveCreate(page).click();
  await expect(page).toHaveURL(/\/plan\/wishes\/wish-new-1$/);
  expect(api.creates).toEqual([
    {
      title: 'Mountain hut weekend',
      tags: [],
      linkUrl: 'https://hut.example/rooms',
      photoAttachmentId: 'photo-1',
    },
  ]);

  const row = page.locator('a.wish-link-row');
  await expect(row).toHaveAttribute('href', 'https://hut.example/rooms');
  await expect(row).toHaveAttribute('rel', /noopener/);
  await expect(row).toContainText('hut.example');
  await expect(row).toContainText(copy.wish.link.open);
  await expect(page.locator('.wish-photo-gallery img:not([aria-hidden])').first()).toBeVisible();

  // The cover opens in the shared viewer.
  await page
    .getByRole('button', { name: photoReactions.fullscreen, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('edits or removes only the link and leaves the photo untouched', async ({
  page,
}) => {
  const api = await installWishApi(page, {
    wishes: [
      wishRow('wish-1', 'Mountain hut weekend', {
        linkUrl: LINK,
        photoAttachmentId: 'photo-9',
      }),
    ],
  });
  await signIn(page);
  await page.goto('/plan/wishes/wish-1');
  await expect(page.locator('a.wish-link-row')).toHaveAttribute('href', LINK);

  await editViaMenu(page, de.common.edit);
  await setLink(page, 'new.example/offer');
  await saveEdit(page).click();
  await expect(page.locator('a.wish-link-row')).toHaveAttribute(
    'href',
    'https://new.example/offer',
  );
  expect(api.updates).toHaveLength(1);
  expect(api.updates[0]).toMatchObject({ linkUrl: 'https://new.example/offer' });
  expect(api.updates[0]).not.toHaveProperty('photoAttachmentId');

  await editViaMenu(page, de.common.edit);
  await page
    .getByRole('button', { name: copy.wish.link.tool, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.wish.link.remove, exact: true })
    .click();
  await saveEdit(page).click();
  await expect(page.locator('a.wish-link-row')).toHaveCount(0);
  await expect(page.locator('.wish-photo-gallery')).toBeVisible();
  expect(api.updates).toHaveLength(2);
  expect(api.updates[1].linkUrl).toBeNull();
  expect(api.updates[1]).not.toHaveProperty('photoAttachmentId');
});

test('removes only the photo and leaves the link untouched', async ({
  page,
}) => {
  const api = await installWishApi(page, {
    wishes: [
      wishRow('wish-1', 'Mountain hut weekend', {
        linkUrl: LINK,
        photoAttachmentId: 'photo-9',
      }),
    ],
  });
  await signIn(page);
  await page.goto('/plan/wishes/wish-1');
  await editViaMenu(page, de.common.edit);
  await page
    .getByRole('button', { name: de.memory.photoRemove, exact: true })
    .click();
  await saveEdit(page).click();
  await expect(page.locator('.wish-photo-gallery')).toHaveCount(0);
  await expect(page.locator('a.wish-link-row')).toHaveAttribute('href', LINK);
  expect(api.updates).toHaveLength(1);
  expect(api.updates[0].photoAttachmentId).toBeNull();
  expect(api.updates[0]).not.toHaveProperty('linkUrl');
});

test('blocks Save after a failed upload and binds the fresh attachment after a retry', async ({
  page,
}) => {
  const api = await installWishApi(page, { failFirstUpload: true });
  await signIn(page);
  await page.goto('/plan/wishes/new');
  await page.getByLabel(copy.wish.intentionLabel).fill('Mountain hut weekend');
  await addComposerMedia(page, {
    name: 'hut.jpg',
    mimeType: 'image/jpeg',
    buffer: picture,
  });
  await expect(page.getByText(copy.wish.photo.failedHint)).toBeVisible();
  await expect(saveCreate(page)).toBeDisabled();
  expect(api.creates).toHaveLength(0);

  await page
    .locator('.photo-draft-stage-retry')
    .click();
  await expect(page.locator('.photo-draft-tile')).toHaveAttribute(
    'aria-label',
    new RegExp(de.memory.photoReady),
  );
  await expect(saveCreate(page)).toBeEnabled();
  await saveCreate(page).click();
  await expect(page).toHaveURL(/\/plan\/wishes\/wish-new-1$/);
  expect(api.creates).toHaveLength(1);
  expect(api.creates[0].photoAttachmentId).toBe(
    `photo-${api.uploadCount()}`,
  );
  expect(api.uploadCount()).toBeGreaterThan(1);
});

test('a Plan from a Wish shows the original link and photo read-only', async ({
  page,
}) => {
  await installWishApi(page, {
    wishes: [
      wishRow('wish-1', 'Mountain hut weekend', {
        status: 'PLANNED',
        linkUrl: LINK,
        photoAttachmentId: 'photo-9',
      }),
      wishRow('wish-2', 'Picnic'),
    ],
    plans: [planRow('plan-1', 'wish-1'), planRow('plan-2', 'wish-2')],
  });
  await signIn(page);
  await page.goto('/plan/plans/plan-1');
  const origin = page.locator('.wish-origin-media');
  await expect(origin).toContainText(copy.wish.origin.label);
  await expect(origin.locator('a.wish-link-row')).toHaveAttribute(
    'href',
    LINK,
  );
  await expect(origin.locator('img:not([aria-hidden])').first()).toBeVisible();

  await page.goto('/plan/plans/plan-2');
  await expect(page.getByText('Plan plan-2').first()).toBeVisible();
  await expect(page.locator('.wish-origin-media')).toHaveCount(0);
});
