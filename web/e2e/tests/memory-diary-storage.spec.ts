import { expect, test, type Page } from '@playwright/test';

const scope = ['https://one.example', 'account-a', 'space-a'];
const scopeKey = JSON.stringify(scope);

async function seedLegacyDatabase(page: Page) {
  await page.goto('/');
  return page.evaluateHandle(async (currentScope) => {
    const epoch = 'legacy-login';
    localStorage.setItem('eimir-memory-drafts-epoch-v1', epoch);
    const request = indexedDB.open('eimir-memory-drafts-v1', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('drafts', { keyPath: 'key' });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('drafts', 'readwrite');
    const store = tx.objectStore('drafts');
    for (const [key, generation, expiresAt] of [
      [JSON.stringify(currentScope), epoch, Date.now() + 604_800_000],
      [
        JSON.stringify(['https://one.example', 'account-b', 'space-a']),
        epoch,
        Date.now() + 604_800_000,
      ],
      [
        JSON.stringify(['https://one.example', 'account-a', 'space-b']),
        epoch,
        Date.now() + 604_800_000,
      ],
      [
        JSON.stringify(['https://two.example', 'account-a', 'space-a']),
        epoch,
        Date.now() + 604_800_000,
      ],
      ['expired', epoch, 0],
      ['revoked', 'previous-login', Date.now() + 604_800_000],
    ]) {
      store.put({
        key,
        epoch: generation,
        owner: 'legacy-writer',
        expiresAt,
        value: {
          title: 'Retained title',
          body: 'Owner-local words',
          tags: ['Holiday'],
          tagDraft: 'Unfinished label',
          happenedOn: '2026-10-26',
          files: [1, 2].map((number) => ({
            file: new File([`private pixels ${number}`], `${number}.jpg`, {
              type: 'image/jpeg',
            }),
            attachmentId: `ready-${number}`,
          })),
          attempt: null,
          partial: null,
        },
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    return db;
  }, scope);
}

async function tracePayloadReads(page: Page) {
  return page.evaluateHandle(() => {
    const reads: { method: string; key: string }[] = [];
    const restorations: (() => void)[] = [];
    for (const [label, prototype] of [
      ['store', IDBObjectStore.prototype],
      ['index', IDBIndex.prototype],
    ] as const) {
      for (const name of ['get', 'getAll', 'getAllRecords', 'openCursor']) {
        const original = Reflect.get(prototype, name);
        if (typeof original !== 'function') continue;
        Reflect.set(
          prototype,
          name,
          function (this: object, ...args: unknown[]) {
            reads.push({ method: `${label}.${name}`, key: String(args[0]) });
            return Reflect.apply(original, this, args);
          },
        );
        restorations.push(() => Reflect.set(prototype, name, original));
      }
    }
    return {
      reads,
      restore: () => {
        for (const restore of restorations) restore();
      },
    };
  });
}

test('legacy diary upgrade preserves photos and reads only the requested draft payload', async ({
  page,
}) => {
  const legacy = await seedLegacyDatabase(page);
  await legacy.evaluate((db) => db.close());
  const trace = await tracePayloadReads(page);
  const result = await page.evaluate(async (currentScope) => {
    const modulePath = '/src/client/memoryDiaryDraft.ts';
    const { MemoryDiaryDraftStore } = await import(modulePath);
    const draft = await new MemoryDiaryDraftStore(...currentScope).load();
    const request = indexedDB.open('eimir-memory-drafts-v1');
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const version = db.version;
    const tx = db.transaction('drafts', 'readonly');
    const keys = tx.objectStore('drafts').getAllKeys();
    const remaining = await new Promise<IDBValidKey[]>((resolve) => {
      tx.oncomplete = () => resolve(keys.result);
    });
    db.close();
    return {
      version,
      remaining,
      title: draft.title,
      body: draft.body,
      tags: draft.tags,
      tagDraft: draft.tagDraft,
      files: await Promise.all(
        draft.files.map(
          async ({
            file,
            attachmentId,
          }: {
            file: File;
            attachmentId: string;
          }) => ({
            name: file.name,
            type: file.type,
            text: await file.text(),
            attachmentId,
          }),
        ),
      ),
    };
  }, scope);
  const reads = await trace.evaluate((trace) => {
    trace.restore();
    return trace.reads;
  });
  expect(reads).toEqual([{ method: 'store.get', key: scopeKey }]);
  expect(result.version).toBe(2);
  expect(result.remaining).toEqual(
    [
      scopeKey,
      JSON.stringify(['https://one.example', 'account-a', 'space-b']),
      JSON.stringify(['https://one.example', 'account-b', 'space-a']),
      JSON.stringify(['https://two.example', 'account-a', 'space-a']),
    ].sort(),
  );
  expect(result).toMatchObject({
    title: 'Retained title',
    body: 'Owner-local words',
    tags: ['Holiday'],
    tagDraft: 'Unfinished label',
    files: [1, 2].map((number) => ({
      name: `${number}.jpg`,
      type: 'image/jpeg',
      text: `private pixels ${number}`,
      attachmentId: `ready-${number}`,
    })),
  });
});

test('logout cleans metadata without loading photos and preserves a later login', async ({
  page,
}) => {
  const legacy = await seedLegacyDatabase(page);
  await legacy.evaluate((db) => db.close());
  const trace = await tracePayloadReads(page);
  const result = await page.evaluate(async (currentScope) => {
    const modulePath = '/src/client/memoryDiaryDraft.ts';
    const { MemoryDiaryDraftStore, clearMemoryDiaryDrafts } = await import(
      modulePath
    );
    const oldWriter = new MemoryDiaryDraftStore(...currentScope);
    const value = await oldWriter.load();
    const open = indexedDB.open;
    let releasePurge!: () => void;
    let opened!: () => void;
    const purgeOpened = new Promise<void>((resolve) => {
      opened = resolve;
    });
    // Hold the real connection's success event so a later login can save first.
    indexedDB.open = function (...args) {
      const request = open.apply(this, args);
      request.addEventListener(
        'success',
        (event) => {
          event.stopImmediatePropagation();
          releasePurge = () => request.dispatchEvent(new Event('success'));
          opened();
        },
        { once: true },
      );
      return request;
    };
    clearMemoryDiaryDrafts();
    indexedDB.open = open;
    await purgeOpened;
    const newWriter = new MemoryDiaryDraftStore(...currentScope);
    await newWriter.load();
    await newWriter.save({ ...value, body: 'New login work' });
    releasePurge();
    const recovered = await newWriter.load();
    const oldWriterDenied = await oldWriter.save(value).then(
      () => false,
      () => true,
    );
    return {
      body: recovered.body,
      photo: await recovered.files[0].file.text(),
      oldWriterDenied,
    };
  }, scope);
  const reads = await trace.evaluate((trace) => {
    trace.restore();
    return trace.reads;
  });
  expect(
    reads.every((read) => read.method === 'store.get' && read.key === scopeKey),
  ).toBe(true);
  expect(result).toEqual({
    body: 'New login work',
    photo: 'private pixels 1',
    oldWriterDenied: true,
  });
});

test('a blocked draft upgrade closes its rejected late connection', async ({
  page,
}) => {
  const legacy = await seedLegacyDatabase(page);
  const result = await page.evaluate(
    async ({ blocker, currentScope }) => {
      const modulePath = '/src/client/memoryDiaryDraft.ts';
      const { MemoryDiaryDraftStore } = await import(modulePath);
      const open = indexedDB.open;
      let lateClosed = false;
      let opened!: () => void;
      const lateOpened = new Promise<void>((resolve) => {
        opened = resolve;
      });
      indexedDB.open = function (...args) {
        const request = open.apply(this, args);
        request.addEventListener(
          'success',
          () => {
            const db = request.result;
            const close = db.close.bind(db);
            db.close = () => {
              lateClosed = true;
              close();
            };
            opened();
          },
          { once: true },
        );
        return request;
      };
      const loading = new MemoryDiaryDraftStore(...currentScope).load();
      indexedDB.open = open;
      const outcome = await loading.then(
        () => 'loaded',
        (error: Error) => error.message,
      );
      blocker.close();
      await lateOpened;
      // A real subsequent upgrade runs after the success event finishes. It
      // must not be blocked by the connection whose caller already rejected.
      const next = indexedDB.open('eimir-memory-drafts-v1', 3);
      await new Promise<void>((resolve, reject) => {
        next.onsuccess = () => {
          next.result.close();
          resolve();
        };
        next.onblocked = () =>
          reject(new Error('Abandoned connection blocks upgrade'));
        next.onerror = () => reject(next.error);
      });
      return { outcome, lateClosed };
    },
    { blocker: legacy, currentScope: scope },
  );
  expect(result).toEqual({
    outcome: 'Draft storage blocked',
    lateClosed: true,
  });
});

test('a login generation change during cleanup aborts before reading content', async ({
  page,
}) => {
  const legacy = await seedLegacyDatabase(page);
  await legacy.evaluate((db) => db.close());
  const trace = await tracePayloadReads(page);
  const result = await page.evaluate(async (currentScope) => {
    const modulePath = '/src/client/memoryDiaryDraft.ts';
    const { MemoryDiaryDraftStore } = await import(modulePath);
    const original = IDBIndex.prototype.openKeyCursor;
    let intercepted = false;
    IDBIndex.prototype.openKeyCursor = function (...args) {
      const request = original.apply(this, args);
      if (!intercepted) {
        intercepted = true;
        request.addEventListener(
          'success',
          () => {
            localStorage.setItem(
              'eimir-memory-drafts-epoch-v1',
              'replacement-login',
            );
          },
          { once: true },
        );
      }
      return request;
    };
    const denied = await new MemoryDiaryDraftStore(...currentScope).load().then(
      () => false,
      () => true,
    );
    IDBIndex.prototype.openKeyCursor = original;
    const request = indexedDB.open('eimir-memory-drafts-v1');
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction('drafts', 'readonly');
    const keys = tx.objectStore('drafts').getAllKeys();
    const count = await new Promise<number>((resolve) => {
      tx.oncomplete = () => resolve(keys.result.length);
    });
    db.close();
    return { denied, count };
  }, scope);
  const reads = await trace.evaluate((trace) => {
    trace.restore();
    return trace.reads;
  });
  expect(result).toEqual({ denied: true, count: 6 });
  expect(reads).toEqual([]);
});
