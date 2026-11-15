import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import photoCrop from '../../src/i18n/locales/photoCrop';
import profileIdentity from '../../src/i18n/locales/profileIdentity';
import { waitForSettledMotion } from '../support/settledMotion';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  PROFILE_ID,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const base = `/api/v1/spaces/${SPACE_ID}`;
const ATTACHMENT_ID = 'cropped-profile-photo';
const NOW = '2026-11-14T10:00:00Z';

interface ProfileState {
  uploads: Record<string, unknown>[];
  bodies: Buffer[];
  patches: Record<string, unknown>[];
}

/** Stateful profile and attachment endpoints over the shared fixture. */
async function installProfileUpload(page: Page): Promise<ProfileState> {
  await installMocks(page, { strict: true });
  const state: ProfileState = { uploads: [], bodies: [], patches: [] };
  let profileAttachmentId: string | null = null;
  let version = 1;
  const profile = () => ({
    accountId: ACCOUNT_ID,
    createdAt: NOW,
    displayName: 'Lea Sommer',
    id: PROFILE_ID,
    preferences: [],
    profileAttachmentId,
    updatedAt: NOW,
    version,
  });
  const attachment = () => ({
    id: ATTACHMENT_ID,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: state.bodies.at(-1)?.length ?? 1,
    version: 1,
    hasThumbnail: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === `${base}/profiles/${ACCOUNT_ID}`) {
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        state.patches.push(body);
        profileAttachmentId = body.profileAttachmentId ?? null;
        version += 1;
      }
      return route.fulfill({ json: profile() });
    }
    if (path === `${base}/profiles/${ACCOUNT_ID}/avatar/content`) {
      const body = state.bodies.at(-1);
      return body
        ? route.fulfill({ contentType: 'image/jpeg', body })
        : route.fulfill({ status: 404 });
    }
    if (path === `${base}/attachments` && method === 'POST') {
      state.uploads.push(request.postDataJSON());
      return route.fulfill({
        status: 201,
        json: {
          attachment: { ...attachment(), status: 'PENDING' },
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${base}/attachments/${ATTACHMENT_ID}/content`,
        },
      });
    }
    if (path.startsWith(`${base}/attachments/${ATTACHMENT_ID}`)) {
      if (method === 'PUT') {
        state.bodies.push(request.postDataBuffer() ?? Buffer.alloc(0));
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: attachment() });
    }
    return route.fallback();
  });
  return state;
}

/**
 * A 400 x 200 landscape photo: left half warm, right half cool, with a drawn
 * figure whose head sits left of the centre, so a centred round crop cuts it.
 */
async function landscapePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.fillStyle = '#e9a98f';
    context.fillRect(0, 0, 200, 200);
    context.fillStyle = '#5f7fb8';
    context.fillRect(200, 0, 200, 200);
    context.fillStyle = '#6c4a7e';
    context.beginPath();
    context.ellipse(90, 215, 70, 80, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f1c7a8';
    context.beginPath();
    context.arc(90, 90, 42, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#4a2f3a';
    context.beginPath();
    context.arc(90, 76, 44, Math.PI, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Decode an uploaded JPEG in the page: size plus the colour at one point. */
async function inspectUpload(
  page: Page,
  body: Buffer,
  at: { x: number; y: number },
) {
  return page.evaluate(
    async ({ base64, point }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/jpeg' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.drawImage(bitmap, 0, 0);
      const [red, green, blue] = context.getImageData(
        Math.round(point.x * (bitmap.width - 1)),
        Math.round(point.y * (bitmap.height - 1)),
        1,
        1,
      ).data;
      return { width: bitmap.width, height: bitmap.height, red, green, blue };
    },
    { base64: body.toString('base64'), point: at },
  );
}

async function openProfileEditing(page: Page) {
  await signIn(page);
  await page.goto('/more/profile');
  await page.getByRole('button', { name: profileIdentity.editProfile }).click();
  const change = page
    .locator('.profile-identity-actions-row button')
    .filter({ hasText: profileIdentity.changeAvatar });
  await expect(change).toBeVisible();
  return change;
}

function cropSheet(page: Page) {
  return page.getByRole('dialog', { name: photoCrop.title, exact: true });
}

async function choosePhoto(page: Page, photo: Buffer) {
  await page.locator('#profile-avatar-file').setInputFiles({
    name: 'us at the lake.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  const sheet = cropSheet(page);
  await expect(sheet).toBeVisible();
  // Geometry is measured once the sheet has finished entering.
  await waitForSettledMotion(page);
  return sheet;
}

for (const view of [
  { width: 360, height: 740, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 430, height: 932, theme: 'light' },
  { width: 1280, height: 900, theme: 'dark' },
] as const) {
  test(`the chosen section of a profile photo is what gets saved at ${view.width} ${view.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.theme });
    const state = await installProfileUpload(page);
    await openProfileEditing(page);
    const photo = await landscapePhoto(page);
    const sheet = await choosePhoto(page, photo);

    const stage = sheet.getByRole('application', {
      name: photoCrop.stageLabel,
      exact: true,
    });
    await expect(stage).toBeFocused();
    await expect(stage).toHaveAccessibleDescription(photoCrop.keyboardHelp);
    const zoom = sheet.getByRole('slider', { name: photoCrop.zoom });
    await expect(zoom).toHaveValue('1');
    expect(state.uploads).toEqual([]);

    // The frame is square and the photo covers it from the start.
    const frame = await stage.boundingBox();
    if (!frame) throw new Error('Missing crop stage geometry');
    expect(Math.abs(frame.width - frame.height)).toBeLessThan(1);
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(view.width);

    // Pull the photo to the right: the warm left half fills the circle.
    const centre = {
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
    };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + frame.width, centre.y + 40, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toBeVisible();

    expect(
      (await new AxeBuilder({ page }).include('.photo-crop-task').analyze())
        .violations,
    ).toEqual([]);
    await captureScreenshot(
      page,
      info,
      `profile-photo-crop-${view.width}-${view.theme}.png`,
    );

    await sheet
      .getByRole('button', { name: photoCrop.confirm, exact: true })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect
      .poll(() => state.patches)
      .toEqual([{ profileAttachmentId: ATTACHMENT_ID }]);
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]).toMatchObject({
      expectedMimeType: 'image/jpeg',
      originalName: 'us at the lake.jpg',
      preserveMetadata: false,
    });
    const uploaded = await inspectUpload(page, state.bodies[0], {
      x: 0.9,
      y: 0.1,
    });
    expect(uploaded.width).toBe(200);
    expect(uploaded.height).toBe(200);
    // Top right of the saved square is the warm left half, not the cool one.
    expect(uploaded.red).toBeGreaterThan(uploaded.blue + 40);

    await expect(
      page.locator('.profile-identity-avatar-col img'),
    ).toBeVisible();
    await expect(
      page.getByText(profileIdentity.saved, { exact: true }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `profile-photo-saved-${view.width}-${view.theme}.png`,
    );
  });
}

test('keyboard moves and zooms the section; cancelling uploads nothing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installProfileUpload(page);
  const change = await openProfileEditing(page);
  const sheet = await choosePhoto(page, await landscapePhoto(page));
  const stage = sheet.getByRole('application', { name: photoCrop.stageLabel });
  const photo = stage.locator('img');
  await expect(stage).toBeFocused();

  const before = await photo.boundingBox();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const moved = await photo.boundingBox();
  if (!before || !moved) throw new Error('Missing photo geometry');
  expect(moved.x).toBeLessThan(before.x - 20);

  // The photo can never leave a gap inside the frame.
  for (let step = 0; step < 30; step++) await page.keyboard.press('ArrowLeft');
  const frame = await stage.boundingBox();
  const edge = await photo.boundingBox();
  if (!frame || !edge) throw new Error('Missing crop geometry');
  expect(edge.x + edge.width).toBeGreaterThanOrEqual(
    frame.x + frame.width - 0.5,
  );

  const zoom = sheet.getByRole('slider', { name: photoCrop.zoom });
  await page.keyboard.press('+');
  await expect(zoom).not.toHaveValue('1');
  await zoom.focus();
  await page.keyboard.press('End');
  await expect(zoom).toHaveValue('4');
  await expect(zoom).toHaveAttribute('aria-valuetext', /400/);
  const zoomed = await photo.boundingBox();
  if (!zoomed) throw new Error('Missing zoomed geometry');
  expect(zoomed.height).toBeGreaterThan(frame.height * 3.9);

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(change).toBeFocused();
  expect(state.uploads).toEqual([]);
  expect(state.patches).toEqual([]);

  // The same photo can be chosen again after cancelling.
  await choosePhoto(page, await landscapePhoto(page));
  await cropSheet(page)
    .getByRole('button', { name: de.common.cancel, exact: true })
    .last()
    .click();
  await expect(cropSheet(page)).toHaveCount(0);
  expect(state.uploads).toEqual([]);
});

test('a touch drag moves the photo instead of dismissing the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installProfileUpload(page);
  await openProfileEditing(page);
  const sheet = await choosePhoto(page, await landscapePhoto(page));
  const stage = sheet.getByRole('application', { name: photoCrop.stageLabel });
  const photo = stage.locator('img');
  const frame = await stage.boundingBox();
  const before = await photo.boundingBox();
  if (!frame || !before) throw new Error('Missing crop geometry');
  const start = { x: frame.x + frame.width / 2, y: frame.y + 40 };

  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [start],
  });
  for (let step = 1; step <= 10; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x - step * 6, y: start.y + step * 20 }],
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();

  await expect(sheet).toBeVisible();
  const after = await photo.boundingBox();
  const settled = await stage.boundingBox();
  if (!after || !settled) throw new Error('Missing settled geometry');
  expect(Math.abs(settled.y - frame.y)).toBeLessThan(1);
  expect(after.x).toBeLessThan(before.x - 20);
  expect(state.uploads).toEqual([]);
});

test('a photo this browser cannot decode is uploaded unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installProfileUpload(page);
  await openProfileEditing(page);
  const original = Buffer.from('not decodable by this browser');
  await page.locator('#profile-avatar-file').setInputFiles({
    name: 'portrait.heic',
    mimeType: 'image/heic',
    buffer: original,
  });
  await expect
    .poll(() => state.patches)
    .toEqual([{ profileAttachmentId: ATTACHMENT_ID }]);
  await expect(cropSheet(page)).toHaveCount(0);
  expect(state.uploads[0]).toMatchObject({
    expectedMimeType: 'image/heic',
    originalName: 'portrait.heic',
  });
  expect(state.bodies[0].equals(original)).toBe(true);
});

test('the crop step fits a small phone without overflow', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installProfileUpload(page);
  await openProfileEditing(page);
  const sheet = await choosePhoto(page, await landscapePhoto(page));
  const stage = sheet.getByRole('application', { name: photoCrop.stageLabel });
  const confirm = sheet.getByRole('button', {
    name: photoCrop.confirm,
    exact: true,
  });
  await expect(stage).toBeInViewport({ ratio: 1 });
  await expect(confirm).toBeInViewport({ ratio: 1 });
  const target = await confirm.boundingBox();
  expect(target?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await sheet.evaluate((dialog) =>
      // The photo itself is larger than the frame that clips it.
      Array.from(dialog.querySelectorAll('*:not(.photo-crop-photo)')).every(
        (element) =>
          element.getBoundingClientRect().right <= window.innerWidth + 1,
      ),
    ),
  ).toBe(true);
  await captureScreenshot(page, info, 'profile-photo-crop-320-light.png');
});
