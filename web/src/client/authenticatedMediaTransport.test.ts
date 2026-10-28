// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import { uploadAttachmentBytesWithProgress } from './referenceFlow';
import {
  clearStoredSession,
  refreshSessionTokens,
  storeSession,
} from './sessionPersistence';

const api = 'https://instance.example';
const tokens = {
  accessToken: 'access-a',
  refreshToken: 'refresh-a',
  accessExpiresAt: new Date(Date.now() + 900_000),
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
};
const descriptor: UploadDescriptor = {
  attachment: {
    id: 'photo',
    createdAt: new Date(),
    durationSeconds: null,
    hasThumbnail: false,
    isSensitive: false,
    height: null,
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: null,
    status: 'UPLOADING',
    version: 1,
    width: null,
  },
  method: 'STREAM',
  uploadUrl: '/api/v1/attachments/photo/content',
  requiredHeaders: { 'Content-Type': 'image/jpeg' },
};
const file = new File(['photo'], 'moment.jpg', { type: 'image/jpeg' });
const uploads: Upload[] = [];
let result: (request: Upload) => void;
class Upload extends EventTarget {
  status = 204;
  statusText = 'No Content';
  headers = new Headers();
  url = '';
  body: unknown;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers.set(key, value);
  }
  send(body: unknown) {
    this.body = body;
    uploads.push(this);
    queueMicrotask(() => {
      result(this);
      this.dispatchEvent(new Event('loadend'));
    });
  }
  abort() {
    this.onabort?.();
    this.dispatchEvent(new Event('loadend'));
  }
}

beforeEach(async () => {
  uploads.length = 0;
  result = (request) => request.onload?.();
  vi.stubGlobal('XMLHttpRequest', Upload);
  await clearStoredSession();
  await storeSession({ account: { id: 'alex', displayName: 'Alex' }, tokens });
});
afterEach(async () => {
  await clearStoredSession();
  vi.unstubAllGlobals();
});

it('waits for token rotation before sending authenticated photo bytes and preserves progress', async () => {
  let complete!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => response),
  );
  const refresh = refreshSessionTokens(api, 'refresh-a');
  const progress = vi.fn();
  const upload = uploadAttachmentBytesWithProgress(
    api,
    'access-a',
    descriptor,
    file,
    { onProgress: progress },
  );
  expect(uploads).toHaveLength(0);
  complete(
    new Response(
      JSON.stringify({
        ...tokens,
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
  await Promise.all([refresh, upload]);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].headers.get('Authorization')).toBe('Bearer access-b');
  expect(uploads[0].headers.get('Content-Type')).toBe('image/jpeg');
  expect(uploads[0].body).toBe(file);
  expect(progress).toHaveBeenLastCalledWith(100);
});

it('recovers an authentication-rejected photo upload once with the same bytes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...tokens,
            accessToken: 'access-b',
            refreshToken: 'refresh-b',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  result = (request) => {
    request.status = uploads.length === 1 ? 401 : 204;
    request.onload?.();
  };
  await uploadAttachmentBytesWithProgress(api, 'access-a', descriptor, file);
  expect(uploads).toHaveLength(2);
  expect(uploads[1].headers.get('Authorization')).toBe('Bearer access-b');
  expect(uploads[1].body).toBe(file);
});

it('does not retry a photo upload with an unknown network outcome', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  result = (request) => request.onerror?.();
  await expect(
    uploadAttachmentBytesWithProgress(api, 'access-a', descriptor, file),
  ).rejects.toThrow();
  expect(uploads).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps signed object-storage uploads free of session credentials', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await uploadAttachmentBytesWithProgress(
    api,
    'access-a',
    {
      ...descriptor,
      method: 'SIGNED_UPLOAD',
      uploadUrl: 'https://storage.example/photo',
    },
    file,
  );
  expect(uploads[0].url).toBe('https://storage.example/photo');
  expect(uploads[0].headers.has('Authorization')).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
