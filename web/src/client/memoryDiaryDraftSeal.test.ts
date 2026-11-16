// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';

// The Android app keeps unsaved Memory work sealed under the per-login device
// key that already seals its stored images; browsers keep their rows as before.
const native = vi.hoisted(() => ({
  android: true,
  key: new Uint8Array(32).fill(7),
}));
vi.mock('./config', async (original) => ({
  ...(await original<typeof import('./config')>()),
  isAndroidApp: () => native.android,
}));
vi.mock('./nativeSessionStorage', async (original) => ({
  ...(await original<typeof import('./nativeSessionStorage')>()),
  readNativeMediaKey: async () => Uint8Array.from(native.key),
  clearNativeMediaKey: async () => undefined,
}));

const { forgetDeviceMediaKey } = await import('./deviceMediaSeal');
const { clearMemoryDiaryDrafts, MemoryDiaryDraftStore } = await import(
  './memoryDiaryDraft'
);
type MemoryDiaryDraft = import('./memoryDiaryDraft').MemoryDiaryDraft;

type RawRow = { key: string; value?: unknown; sealed?: unknown };

function rawRows(): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eimir-memory-drafts-v1', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const rows = db.transaction('drafts').objectStore('drafts').getAll();
      rows.onsuccess = () => {
        db.close();
        resolve(rows.result as RawRow[]);
      };
      rows.onerror = () => reject(rows.error);
    };
  });
}

/** Everything a raw look at the stored rows could reveal as text. */
function visibleText(rows: RawRow[]): string {
  return JSON.stringify(rows, (_name, value: unknown) =>
    value instanceof ArrayBuffer || ArrayBuffer.isView(value)
      ? new TextDecoder('latin1').decode(value as ArrayBuffer)
      : value,
  );
}

const draft = (body: string): MemoryDiaryDraft => ({
  title: 'A title only we know',
  body,
  tags: ['first'],
  happenedOn: '2026-11-16',
  files: [],
  attempt: null,
  partial: null,
});

const store = () => new MemoryDiaryDraftStore('/api', 'account', 'space');

beforeEach(async () => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('crypto', webcrypto);
  native.android = true;
  native.key = new Uint8Array(32).fill(7);
  forgetDeviceMediaKey();
  clearMemoryDiaryDrafts();
  // Let the queued purge settle before a test writes.
  await new Promise((resolve) => setTimeout(resolve, 20));
});
afterEach(() => {
  forgetDeviceMediaKey();
  vi.unstubAllGlobals();
});

it('keeps no readable work on a sealing device and restores text, dates and photos', async () => {
  const photo = new File(['photo bytes'], 'beach.jpg', {
    type: 'image/jpeg',
    lastModified: 1_700_000_000_000,
  });
  const writer = store();
  expect(await writer.load()).toBeNull();
  await writer.save({
    ...draft('A body only we know'),
    linkRecoveryMemory: {
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    } as unknown as MemoryDetail,
    files: [{ file: photo, attachmentId: 'attachment-1', isSensitive: true }],
  });

  const rows = await rawRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).not.toHaveProperty('value');
  expect(rows[0]).toHaveProperty('sealed');
  const visible = visibleText(rows);
  for (const secret of ['only we know', 'beach.jpg', 'photo bytes'])
    expect(visible).not.toContain(secret);

  const restored = await store().load();
  if (!restored) throw new Error('The sealed draft did not load');
  expect(restored.title).toBe('A title only we know');
  expect(restored.body).toBe('A body only we know');
  expect(restored.tags).toEqual(['first']);
  const { createdAt } = restored.linkRecoveryMemory as unknown as {
    createdAt: Date;
  };
  expect(createdAt).toBeInstanceOf(Date);
  expect(createdAt.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  const [entry] = restored.files;
  expect(entry.attachmentId).toBe('attachment-1');
  expect(entry.isSensitive).toBe(true);
  expect(entry.file.name).toBe('beach.jpg');
  expect(entry.file.type).toBe('image/jpeg');
  expect(entry.file.lastModified).toBe(1_700_000_000_000);
  expect(await entry.file.text()).toBe('photo bytes');
});

it('keeps work written before sealing and seals it in place', async () => {
  native.android = false;
  const writer = store();
  await writer.load();
  await writer.save(draft('Written before the update'));
  expect((await rawRows())[0]).toHaveProperty('value');
  native.android = true;

  expect((await store().load())?.body).toBe('Written before the update');

  const rows = await rawRows();
  expect(rows[0]).not.toHaveProperty('value');
  expect(rows[0]).toHaveProperty('sealed');
  expect(visibleText(rows)).not.toContain('Written before the update');
  expect((await store().load())?.body).toBe('Written before the update');
});

it('discards work sealed under an earlier login', async () => {
  const writer = store();
  await writer.load();
  await writer.save(draft('From the earlier login'));
  forgetDeviceMediaKey();
  native.key = new Uint8Array(32).fill(9);

  expect(await store().load()).toBeNull();
  expect(await rawRows()).toHaveLength(0);
});

it('leaves browser rows unsealed', async () => {
  native.android = false;
  const writer = store();
  await writer.load();
  await writer.save(draft('In a browser'));

  const rows = await rawRows();
  expect(rows[0]).toHaveProperty('value');
  expect(rows[0]).not.toHaveProperty('sealed');
  expect((await store().load())?.body).toBe('In a browser');
});
