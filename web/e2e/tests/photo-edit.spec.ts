import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryCopy from '../../src/i18n/locales/memoryProduct';
import photoEdit from '../../src/i18n/locales/photoEdit';
import { waitForSettledMotion } from '../support/settledMotion';
import {
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const base = `/api/v1/spaces/${SPACE_ID}`;
const CAPTURED_AT = '2026:08:14 18:42:07';

interface UploadState {
  bodies: Map<string, Buffer>;
  creates: { originalName: string; preserveMetadata?: boolean }[];
}

/** Attachment endpoints that keep the uploaded bytes per attachment. */
async function installUploads(page: Page): Promise<UploadState> {
  await installMocks(page);
  const state: UploadState = { bodies: new Map(), creates: [] };
  const attachment = (id: string) => ({
    id,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: state.bodies.get(id)?.length ?? 1,
    width: 1,
    height: 1,
    version: 1,
    hasThumbnail: false,
    isSensitive: false,
    createdAt: '2026-11-16T10:00:00Z',
    durationSeconds: null,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === `${base}/attachments` && method === 'POST') {
      const id = `edited-photo-${state.creates.length + 1}`;
      state.creates.push(request.postDataJSON());
      return route.fulfill({
        status: 201,
        json: {
          attachment: { ...attachment(id), status: 'PENDING' },
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${base}/attachments/${id}/content`,
        },
      });
    }
    const match = path.match(
      /\/attachments\/(edited-photo-\d+)(?:\/(content|finalize))?$/,
    );
    if (match) {
      const [, id, action] = match;
      if (action === 'content' && method === 'PUT') {
        state.bodies.set(id, request.postDataBuffer() ?? Buffer.alloc(0));
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: attachment(id) });
    }
    return route.fallback();
  });
  return state;
}

/** A little-endian EXIF block: upright, capture time, size and a GPS place. */
function exifSegment(width: number, height: number): Buffer {
  const entries = (
    list: [number, number, number, number | Buffer][],
    at: number,
  ) => {
    // Returns [ifd bytes, extra data] with offsets relative to TIFF start.
    const head = Buffer.alloc(2 + list.length * 12 + 4);
    head.writeUInt16LE(list.length, 0);
    const extras: Buffer[] = [];
    let extraOffset = at + head.length;
    list.forEach(([tag, type, count, value], index) => {
      const entry = 2 + index * 12;
      head.writeUInt16LE(tag, entry);
      head.writeUInt16LE(type, entry + 2);
      head.writeUInt32LE(count, entry + 4);
      if (Buffer.isBuffer(value)) {
        if (value.length <= 4) value.copy(head, entry + 8);
        else {
          head.writeUInt32LE(extraOffset, entry + 8);
          extras.push(value);
          extraOffset += value.length;
        }
      } else if (type === 3) head.writeUInt16LE(value, entry + 8);
      else head.writeUInt32LE(value, entry + 8);
    });
    return Buffer.concat([head, ...extras]);
  };
  const rational = (...values: [number, number][]) => {
    const buffer = Buffer.alloc(values.length * 8);
    values.forEach(([numerator, denominator], index) => {
      buffer.writeUInt32LE(numerator, index * 8);
      buffer.writeUInt32LE(denominator, index * 8 + 4);
    });
    return buffer;
  };
  const ifd0At = 8;
  const ifd0Size = 2 + 3 * 12 + 4;
  const exifAt = ifd0At + ifd0Size;
  const exifIfd = entries(
    [
      [0x9003, 2, 20, Buffer.from(`${CAPTURED_AT}\0`, 'ascii')],
      [0xa002, 4, 1, width],
      [0xa003, 4, 1, height],
    ],
    exifAt,
  );
  const gpsAt = exifAt + exifIfd.length;
  const gpsIfd = entries(
    [
      [0x0001, 2, 2, Buffer.from('N\0', 'ascii')],
      [0x0002, 5, 3, rational([47, 1], [42, 1], [3000, 100])],
      [0x0003, 2, 2, Buffer.from('E\0', 'ascii')],
      [0x0004, 5, 3, rational([9, 1], [10, 1], [1200, 100])],
    ],
    gpsAt,
  );
  const ifd0 = entries(
    [
      [0x0112, 3, 1, 1],
      [0x8769, 4, 1, exifAt],
      [0x8825, 4, 1, gpsAt],
    ],
    ifd0At,
  );
  const tiff = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
    ifd0,
    exifIfd,
    gpsIfd,
  ]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

/**
 * A sideways evening photo at the lake (as a phone sometimes saves it): sky
 * and water run vertically, so the couple only stands upright after turning.
 */
async function sidewaysLakePhoto(page: Page): Promise<Buffer> {
  const width = 1200;
  const height = 1600;
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      // Draw the upright 1600 x 1200 scene, turned a quarter clockwise.
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
      const w = height;
      const h = width;
      const sky = context.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, '#f4b183');
      sky.addColorStop(1, '#f7d9b5');
      context.fillStyle = sky;
      context.fillRect(0, 0, w, h * 0.62);
      context.fillStyle = '#f9e3a1';
      context.beginPath();
      context.arc(w * 0.72, h * 0.5, 90, 0, Math.PI * 2);
      context.fill();
      const lake = context.createLinearGradient(0, h * 0.62, 0, h);
      lake.addColorStop(0, '#6f93b8');
      lake.addColorStop(1, '#3d5f84');
      context.fillStyle = lake;
      context.fillRect(0, h * 0.62, w, h * 0.38);
      context.fillStyle = '#5b6f4f';
      context.beginPath();
      context.moveTo(0, h * 0.62);
      context.quadraticCurveTo(w * 0.25, h * 0.48, w * 0.5, h * 0.62);
      context.fill();
      const person = (x: number, coat: string, hair: string) => {
        context.fillStyle = coat;
        context.beginPath();
        context.ellipse(x, h * 0.84, 70, 150, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f1c7a8';
        context.beginPath();
        context.arc(x, h * 0.6, 52, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = hair;
        context.beginPath();
        context.arc(x, h * 0.585, 55, Math.PI, Math.PI * 2);
        context.fill();
      };
      person(w * 0.36, '#7a4e6e', '#4a2f3a');
      person(w * 0.47, '#35557a', '#2b2622');
      return canvas.toDataURL('image/jpeg', 0.9);
    },
    { width, height },
  );
  const jpeg = Buffer.from(dataUrl.split(',')[1], 'base64');
  // Insert the EXIF block right after SOI, as cameras do.
  return Buffer.concat([
    jpeg.subarray(0, 2),
    exifSegment(width, height),
    jpeg.subarray(2),
  ]);
}

async function decodedSize(page: Page, body: Buffer) {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/jpeg' }),
    );
    return { width: bitmap.width, height: bitmap.height };
  }, body.toString('base64'));
}

for (const view of [
  { width: 360, height: 740, theme: 'light', motion: 'no-preference' },
  { width: 390, height: 844, theme: 'light', motion: 'no-preference' },
  { width: 390, height: 844, theme: 'dark', motion: 'no-preference' },
  { width: 430, height: 932, theme: 'dark', motion: 'reduce' },
  { width: 1280, height: 900, theme: 'light', motion: 'reduce' },
] as const) {
  test(`a selected photo is turned, cropped, drawn on and labelled before saving and keeps its date and place (${view.width} ${view.theme})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: view.motion,
    });
    const state = await installUploads(page);
    await signIn(page);
    await page.goto('/story/memories/new');
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();
    const photo = await sidewaysLakePhoto(page);
    await page.locator('#memory-create-images').setInputFiles({
      name: 'lake evening.jpg',
      mimeType: 'image/jpeg',
      buffer: photo,
    });
    const edit = page.getByRole('button', {
      name: photoEdit.editLabel.replace('{{name}}', 'lake evening.jpg'),
    });
    await expect(edit).toBeVisible();
    await expect.poll(() => state.bodies.size).toBe(1);
    await waitForSettledMotion(page);
    await captureScreenshot(
      page,
      info,
      `photo-edit-01-selected-${view.width}-${view.theme}.png`,
    );

    await edit.click();
    const sheet = page.getByRole('dialog', {
      name: photoEdit.title,
      exact: true,
    });
    await expect(sheet).toBeVisible();
    await waitForSettledMotion(page);
    await captureScreenshot(
      page,
      info,
      `photo-edit-02-sheet-${view.width}-${view.theme}.png`,
    );

    // Turn the sideways photo upright, then crop freely at two corners.
    await sheet.getByRole('button', { name: photoEdit.turn }).click();
    await page.waitForTimeout(450);
    const dragHandle = async (label: string, dx: number, dy: number) => {
      const box = await sheet.getByLabel(label, { exact: true }).boundingBox();
      if (!box) throw new Error(`Missing crop handle ${label}.`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let step = 1; step <= 12; step += 1)
        await page.mouse.move(x + (dx * step) / 12, y + (dy * step) / 12);
      await page.mouse.up();
    };
    await dragHandle(photoEdit.handles.se, -70, -30);
    await page.waitForTimeout(450);
    await dragHandle(photoEdit.handles.nw, 30, 24);
    // Releasing a handle re-centres the frame on the chosen section.
    await page.waitForTimeout(450);

    // Zoom the photo under the frame, then move it while the frame stays.
    const frame = await sheet
      .getByRole('button', { name: photoEdit.cropArea })
      .boundingBox();
    if (!frame) throw new Error('Missing crop frame.');
    const frameX = frame.x + frame.width / 2;
    const frameY = frame.y + frame.height / 2;
    await page.mouse.move(frameX, frameY);
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(200);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1)
      await page.mouse.move(frameX + step * 3, frameY + step);
    await captureScreenshot(
      page,
      info,
      `photo-edit-03a-moving-${view.width}-${view.theme}.png`,
    );
    await page.mouse.up();
    await page.waitForTimeout(450);
    await captureScreenshot(
      page,
      info,
      `photo-edit-03-cropped-${view.width}-${view.theme}.png`,
    );

    // Draw a small heart above the couple.
    await sheet
      .getByRole('radio', { name: photoEdit.toolNames.draw })
      .check({ force: true });
    await sheet
      .getByRole('radio', { name: photoEdit.colors.rose })
      .check({ force: true });
    const preview = sheet.getByRole('img', { name: photoEdit.preview });
    const canvas = await preview.boundingBox();
    if (!canvas) throw new Error('Missing edit preview.');
    const heartX = canvas.x + canvas.width * 0.42;
    const heartY = canvas.y + canvas.height * 0.3;
    await page.mouse.move(heartX, heartY + 22);
    await page.mouse.down();
    for (let step = 0; step <= 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2;
      const x = 16 * Math.sin(angle) ** 3;
      const y =
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle);
      await page.mouse.move(heartX + x * 1.6, heartY - y * 1.6);
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
    await captureScreenshot(
      page,
      info,
      `photo-edit-04-drawn-${view.width}-${view.theme}.png`,
    );

    // Write a line of text on the photo.
    await sheet
      .getByRole('radio', { name: photoEdit.toolNames.text })
      .check({ force: true });
    await sheet
      .getByRole('radio', { name: photoEdit.colors.white })
      .check({ force: true });
    await sheet
      .getByRole('radio', { name: photoEdit.fonts.hand })
      .check({ force: true });
    const textView = await preview.boundingBox();
    if (!textView) throw new Error('Missing edit preview.');
    await page.mouse.click(
      textView.x + textView.width * 0.5,
      textView.y + textView.height * 0.82,
    );
    const text = sheet.getByRole('textbox', { name: photoEdit.textLabel });
    await expect(text).toBeFocused();
    await text.pressSequentially('Our evening at the lake', { delay: 30 });
    await captureScreenshot(
      page,
      info,
      `photo-edit-05-text-${view.width}-${view.theme}.png`,
    );
    await text.press('Enter');
    await expect(text).toHaveCount(0);

    // The written text stays selected; its corner grip makes it larger.
    const grip = await sheet
      .getByRole('button', { name: photoEdit.resizeText })
      .boundingBox();
    if (!grip) throw new Error('Missing text resize grip.');
    const gripX = grip.x + grip.width / 2;
    const gripY = grip.y + grip.height / 2;
    await page.mouse.move(gripX, gripY);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1)
      await page.mouse.move(gripX + step * 3, gripY + step * 0.8);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await captureScreenshot(
      page,
      info,
      `photo-edit-05b-resized-${view.width}-${view.theme}.png`,
    );

    await sheet.getByRole('button', { name: photoEdit.confirm }).click();
    // Rendering the full-size edit is real work on a busy runner.
    await expect(sheet).toBeHidden({ timeout: 20_000 });
    await expect.poll(() => state.bodies.size).toBe(2);
    await waitForSettledMotion(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await captureScreenshot(
      page,
      info,
      `photo-edit-06-applied-${view.width}-${view.theme}.png`,
    );

    // Metadata travels with the edited photo; it stays upright and cropped.
    expect(state.creates.map((entry) => entry.preserveMetadata)).toEqual([
      true,
      true,
    ]);
    const edited = state.bodies.get('edited-photo-2');
    if (!edited) throw new Error('The edited photo was not uploaded.');
    expect(edited.includes(Buffer.from(CAPTURED_AT, 'ascii'))).toBe(true);
    expect(edited.includes(Buffer.from('Exif\0\0', 'ascii'))).toBe(true);
    const size = await decodedSize(page, edited);
    expect(size.width).toBeGreaterThan(size.height);
    expect(size.width).toBeLessThan(1600);
  });
}

test('a saved diary photo is edited only from the entry editor and replaces the original on save', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installUploads(page);
  const original = await sidewaysLakePhoto(page);
  const savedPhoto = {
    id: 'saved-lake',
    position: 0,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: original.length,
    width: 1200,
    height: 1600,
    hasThumbnail: false,
    isSensitive: false,
    canEditSensitivity: true,
  };
  let memory = {
    id: 'mem-lake',
    spaceId: SPACE_ID,
    authorId: ME.id,
    author: ME,
    title: 'Evening at the lake',
    body: '',
    tags: [],
    happenedOn: '2026-08-14',
    createdAt: '2026-08-14T18:00:00Z',
    updatedAt: '2026-08-14T18:00:00Z',
    version: 1,
    capabilities: CAPABILITIES,
    selectedCoverAttachmentId: 'saved-lake',
    attachments: [savedPhoto],
  };
  const galleryWrites: {
    attachments: Record<string, unknown>[];
    selectedCoverAttachmentId?: string | null;
  }[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `${base}/memories/mem-lake`) {
      if (request.method() === 'PATCH')
        memory = { ...memory, version: memory.version + 1 };
      return route.fulfill({ json: memory });
    }
    if (
      path === `${base}/memories/mem-lake/attachments` &&
      request.method() === 'PUT'
    ) {
      const body = request.postDataJSON();
      galleryWrites.push(body);
      memory = {
        ...memory,
        version: memory.version + 1,
        selectedCoverAttachmentId: body.selectedCoverAttachmentId,
        attachments: body.attachments.map(
          (entry: { attachmentId: string; position: number }) => ({
            ...savedPhoto,
            id: entry.attachmentId,
            position: entry.position,
          }),
        ),
      };
      return route.fulfill({ json: memory });
    }
    if (path.endsWith('/attachments/saved-lake/read-access'))
      return route.fulfill({
        json: {
          method: 'STREAM',
          url: `${base}/attachments/saved-lake/content`,
          mediaType: 'IMAGE',
        },
      });
    if (path.endsWith('/attachments/saved-lake/content'))
      return route.fulfill({ contentType: 'image/jpeg', body: original });
    return route.fallback();
  });
  await signIn(page);
  const editPhoto = page.getByRole('button', {
    name: new RegExp(`^${photoEdit.editLabel.replace(' {{name}}', '')}`),
  });

  // Reading the entry offers no photo editing; only the entry editor does.
  await page.goto('/story/memories/mem-lake');
  await expect(
    page.getByRole('heading', { name: memory.title }).first(),
  ).toBeVisible();
  await expect(editPhoto).toHaveCount(0);

  await page.goto('/story/memories/mem-lake/edit');
  await expect(editPhoto).toBeVisible();
  await editPhoto.click();
  const sheet = page.getByRole('dialog', {
    name: photoEdit.title,
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(photoEdit.replacesSaved)).toBeVisible();
  await waitForSettledMotion(page);
  await captureScreenshot(page, info, 'photo-edit-saved-390-light.png');
  await sheet.getByRole('button', { name: photoEdit.turn }).click();
  await sheet.getByRole('button', { name: photoEdit.confirm }).click();
  // Rendering the full-size edit is real work on a busy runner.
  await expect(sheet).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => state.bodies.size).toBe(1);
  expect(galleryWrites).toEqual([]);

  await page
    .getByRole('button', { name: memoryCopy.save, exact: true })
    .click();
  await expect.poll(() => galleryWrites.length).toBe(1);
  expect(galleryWrites[0]).toEqual({
    selectedCoverAttachmentId: 'edited-photo-1',
    attachments: [
      {
        attachmentId: 'edited-photo-1',
        position: 0,
        isSensitive: false,
        replacesAttachmentId: 'saved-lake',
      },
    ],
  });
  expect(state.creates[0].preserveMetadata).toBe(true);
  const edited = state.bodies.get('edited-photo-1');
  if (!edited) throw new Error('The edited photo was not uploaded.');
  expect(edited.includes(Buffer.from(CAPTURED_AT, 'ascii'))).toBe(true);
  const size = await decodedSize(page, edited);
  expect(size.width).toBeGreaterThan(size.height);
});
