// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  captureMediaCacheLease,
  clearAuthorizedMediaCache,
  keepMediaInSession,
  loadCachedMediaBlob,
  mediaCacheScopeForOwner,
  readStoredMediaBlob,
  registerMediaClient,
} from './authorizedMediaCache';
import type { ReferenceApis } from './referenceFlow';
import { loadAuthorizedStoryImage } from './storyMediaLoader';

// M2-D18 #3: Web never persists OWNER_ONLY payloads. Private media stays in
// session memory; shared media keeps the durable store (PO, 2026-11-16).

function storedKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eimir-authorized-media-v1', 3);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('media', { keyPath: 'key' });
      request.result.createObjectStore('metadata', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const keys = db.transaction('media').objectStore('media').getAllKeys();
      keys.onsuccess = () => {
        db.close();
        resolve(keys.result.map(String));
      };
      keys.onerror = () => reject(keys.error);
    };
  });
}

/** Writes are serial: once a later row lands, every earlier write ran. */
async function storedAfter(marker: string): Promise<string[]> {
  await vi.waitFor(async () => {
    expect((await storedKeys()).some((key) => key.includes(marker))).toBe(true);
  });
  return storedKeys();
}

const image = (name: string) => new NodeBlob([name], { type: 'image/jpeg' });

function authorizedClient() {
  const client = {};
  registerMediaClient(
    client,
    mediaCacheScopeForOwner({}, 'https://api.example', () => true, 'viewer'),
  );
  return client;
}

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  clearAuthorizedMediaCache();
});
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.unstubAllGlobals();
});

const privateParent = ['attachment', 'HEART_MOMENT', 'private-moment'];
const sharedParent = ['attachment', 'MEMORY', 'shared-memory'];

it('keeps a private image in session memory and still persists a shared one', async () => {
  const client = authorizedClient();
  const lease = (parent: string[]) =>
    captureMediaCacheLease(client, 'space', parent);
  const privatePhoto = image('private') as unknown as Blob;
  const load = vi.fn(async () => privatePhoto);
  const privateIdentity = [...privateParent, 'private-photo', 'thumbnail'];

  expect(
    await loadCachedMediaBlob(
      lease(privateParent),
      privateIdentity,
      load,
      undefined,
      undefined,
      { persist: false },
    ),
  ).toBe(privatePhoto);
  // Session memory still serves the private bytes without a second read.
  expect(
    await loadCachedMediaBlob(lease(privateParent), privateIdentity, load),
  ).toBe(privatePhoto);
  expect(load).toHaveBeenCalledTimes(1);

  await loadCachedMediaBlob(
    lease(sharedParent),
    [...sharedParent, 'shared-photo', 'thumbnail'],
    async () => image('shared') as unknown as Blob,
  );
  const keys = await storedAfter('shared-photo');
  expect(keys.filter((key) => key.includes('shared-photo'))).toHaveLength(1);
  expect(keys.some((key) => key.includes('private'))).toBe(false);
});

it('removes bytes stored while the parent was shared once it is private', async () => {
  const client = authorizedClient();
  const lease = () => captureMediaCacheLease(client, 'space', privateParent);
  const identity = [...privateParent, 'photo', 'original'];
  await loadCachedMediaBlob(
    lease(),
    identity,
    async () => image('was-shared') as unknown as Blob,
  );
  expect(await storedAfter('private-moment')).toHaveLength(1);

  keepMediaInSession(lease(), privateParent);
  // A later shared write proves the queued eviction has run.
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space', sharedParent),
    [...sharedParent, 'marker', 'original'],
    async () => image('marker') as unknown as Blob,
  );
  const keys = await storedAfter('marker');
  expect(keys.some((key) => key.includes('private-moment'))).toBe(false);
});

it('lets session-only win over a later consumer that does not know the visibility', async () => {
  const client = authorizedClient();
  const lease = () => captureMediaCacheLease(client, 'space', privateParent);
  keepMediaInSession(lease(), privateParent);
  const identity = [...privateParent, 'photo', 'thumbnail'];
  const photo = image('private') as unknown as Blob;
  // No persist option: for example a Recap that reuses the same parent.
  expect(await loadCachedMediaBlob(lease(), identity, async () => photo)).toBe(
    photo,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space', sharedParent),
    [...sharedParent, 'marker', 'thumbnail'],
    async () => image('marker') as unknown as Blob,
  );
  const keys = await storedAfter('marker');
  expect(keys.some((key) => key.includes('private-moment'))).toBe(false);
  // The memory copy stays readable; the durable store is never consulted.
  expect(await readStoredMediaBlob(lease(), identity)).toBe(photo);
  clearAuthorizedMediaCache();
  expect(
    await readStoredMediaBlob(
      captureMediaCacheLease(client, 'space', privateParent),
      identity,
    ),
  ).toBeUndefined();
});

function storyApis() {
  const attachments = {
    createAttachmentReadAccess: vi.fn(async () => ({
      method: 'STREAM',
      url: '/content',
      mediaType: 'IMAGE',
    })),
    getAttachmentContentRaw: vi.fn(async () => ({
      raw: new Response(image('bytes') as unknown as Blob, { status: 200 }),
    })),
  };
  registerMediaClient(
    attachments,
    mediaCacheScopeForOwner({}, 'https://api.example', () => true, 'viewer'),
  );
  return { attachments } as unknown as ReferenceApis;
}

it('persists a shared story image but no private or unbound one', async () => {
  const apis = storyApis();
  const createObjectUrl = () => 'blob:photo';
  await loadAuthorizedStoryImage(
    apis,
    'space',
    'HEART_MOMENT',
    'private-moment',
    'private-photo',
    { variant: 'thumbnail', persist: false, createObjectUrl },
  );
  await loadAuthorizedStoryImage(apis, 'space', 'NONE', 'draft', 'draft', {
    variant: 'thumbnail',
    createObjectUrl,
  });
  await loadAuthorizedStoryImage(
    apis,
    'space',
    'MEMORY',
    'shared-memory',
    'shared-photo',
    { variant: 'thumbnail', createObjectUrl },
  );
  const keys = await storedAfter('shared-photo');
  expect(keys).toHaveLength(1);
  expect(JSON.parse(keys[0]!).slice(-5)).toEqual([
    'attachment',
    'MEMORY',
    'shared-memory',
    'shared-photo',
    'thumbnail',
  ]);
});
