import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createOwnedObjectUrlOffThread,
  resetOffThreadObjectUrlsForTests,
} from './offThreadObjectUrl';
import {
  acquireMediaObjectUrlAsync,
  evictMediaObjectUrls,
} from './sharedMediaObjectUrls';

type Message = { id: number; blob: Blob };
let workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Message[] = [];
  constructor() {
    workers.push(this);
  }
  postMessage(message: Message) {
    this.sent.push(message);
  }
  answer(index: number, url: string | null) {
    this.onmessage?.({ data: { id: this.sent[index].id, url } });
  }
}

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  workers = [];
  created.length = 0;
  revoked.length = 0;
  resetOffThreadObjectUrlsForTests();
  evictMediaObjectUrls();
  revoked.length = 0;
  // Only the static Object URL methods are faked; `new URL(...)` stays real.
  URL.createObjectURL = () => {
    const url = `blob:page-${created.length + 1}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetOffThreadObjectUrlsForTests();
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
});

const blob = new Blob(['x'], { type: 'image/jpeg' });

it('creates the URL on the page when no worker is available', async () => {
  vi.stubGlobal('Worker', undefined);
  const owned = await createOwnedObjectUrlOffThread(blob);
  expect(owned.url).toBe('blob:page-1');
  owned.dispose();
  expect(revoked).toEqual(['blob:page-1']);
});

it('takes the worker URL and still revokes it on the page', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const pending = createOwnedObjectUrlOffThread(blob);
  expect(workers).toHaveLength(1);
  expect(workers[0].sent[0].blob).toBe(blob);
  workers[0].answer(0, 'blob:worker-1');
  const owned = await pending;
  expect(owned.url).toBe('blob:worker-1');
  expect(created).toEqual([]);
  owned.dispose();
  owned.dispose();
  expect(revoked).toEqual(['blob:worker-1']);
});

it('falls back to the page when the worker fails or cannot create a URL', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const refused = createOwnedObjectUrlOffThread(blob);
  workers[0].answer(0, null);
  expect((await refused).url).toBe('blob:page-1');
  const broken = createOwnedObjectUrlOffThread(blob);
  workers[0].onerror?.();
  expect((await broken).url).toBe('blob:page-2');
  // After an error the page keeps creating URLs itself.
  expect((await createOwnedObjectUrlOffThread(blob)).url).toBe('blob:page-3');
});

it('does not wait forever and revokes a late worker URL nobody owns', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  const pending = createOwnedObjectUrlOffThread(blob);
  await vi.advanceTimersByTimeAsync(3_000);
  expect((await pending).url).toBe('blob:page-1');
  workers[0].answer(0, 'blob:worker-late');
  expect(revoked).toEqual(['blob:worker-late']);
});

it('refuses a URL whose key was evicted while it was being created', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const pending = acquireMediaObjectUrlAsync('["s","space","a"]', blob);
  evictMediaObjectUrls('["s","space"');
  workers[0].answer(0, 'blob:worker-1');
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(revoked).toEqual(['blob:worker-1']);
});

it('revokes the URL when the caller is no longer authorized after the wait', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const lapsed = new Error('lapsed');
  const pending = acquireMediaObjectUrlAsync('key-1', blob, 'preview', () => {
    throw lapsed;
  });
  workers[0].answer(0, 'blob:worker-1');
  await expect(pending).rejects.toBe(lapsed);
  expect(revoked).toEqual(['blob:worker-1']);
});

it('shares one URL per key when two loaders finish', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const first = acquireMediaObjectUrlAsync('key-2', blob);
  const second = acquireMediaObjectUrlAsync('key-2', blob);
  workers[0].answer(0, 'blob:worker-1');
  workers[0].answer(1, 'blob:worker-2');
  const [a, b] = await Promise.all([first, second]);
  expect(a.url).toBe('blob:worker-1');
  expect(b.url).toBe('blob:worker-1');
  expect(revoked).toEqual(['blob:worker-2']);
  // A later load of the same key reuses it without the worker.
  expect((await acquireMediaObjectUrlAsync('key-2', blob)).url).toBe(
    'blob:worker-1',
  );
  expect(workers[0].sent).toHaveLength(2);
});
