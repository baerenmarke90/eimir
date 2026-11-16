import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import photoEdit from '../../src/i18n/locales/photoEdit';
import { waitForSettledMotion } from '../support/settledMotion';
import {
  captureScreenshot,
  installMocks,
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

test.use({
  viewport: { width: 390, height: 844 },
  video: { mode: 'on', size: { width: 390, height: 844 } },
});

for (const view of [
  { width: 390, theme: 'light' },
  { width: 390, theme: 'dark' },
] as const) {
  test(`a selected photo is turned and cropped before saving and keeps its date and place (${view.width} ${view.theme})`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: view.theme });
    const state = await installUploads(page);
    await signIn(page);
    await page.goto('/story/memories/new');
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();
    const photo = await sidewaysLakePhoto(page);
    await page.locator('#memory-create-images').setInputFiles({
      name: 'am see.jpg',
      mimeType: 'image/jpeg',
      buffer: photo,
    });
    const edit = page.getByRole('button', {
      name: photoEdit.editLabel.replace('{{name}}', 'am see.jpg'),
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

    await sheet.getByRole('button', { name: photoEdit.turn }).click();
    await sheet
      .getByRole('radio', { name: photoEdit.aspects.classic })
      .check({ force: true });
    const zoom = sheet.getByRole('slider', { name: photoEdit.zoom });
    await zoom.fill('1.25');
    const stage = sheet.getByRole('application', {
      name: photoEdit.stageLabel,
    });
    await stage.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);
    await captureScreenshot(
      page,
      info,
      `photo-edit-03-turned-cropped-${view.width}-${view.theme}.png`,
    );

    await sheet.getByRole('button', { name: photoEdit.confirm }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => state.bodies.size).toBe(2);
    await waitForSettledMotion(page);
    await page.waitForTimeout(400);
    await captureScreenshot(
      page,
      info,
      `photo-edit-04-applied-${view.width}-${view.theme}.png`,
    );

    // Metadata travels with the edited photo; it stays upright.
    expect(state.creates.map((entry) => entry.preserveMetadata)).toEqual([
      true,
      true,
    ]);
    const edited = state.bodies.get('edited-photo-2');
    if (!edited) throw new Error('The edited photo was not uploaded.');
    expect(edited.includes(Buffer.from(CAPTURED_AT, 'ascii'))).toBe(true);
    expect(edited.includes(Buffer.from('Exif\0\0', 'ascii'))).toBe(true);
    const size = await decodedSize(page, edited);
    // Turned to landscape and framed 4:3.
    expect(size.width).toBeGreaterThan(size.height);
    expect(Math.abs(size.width / size.height - 4 / 3)).toBeLessThan(0.01);
  });
}
