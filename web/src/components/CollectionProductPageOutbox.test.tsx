// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { ClientProblemError } from '../client/problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  type ProductReadCacheStorage,
} from '../client/productReadCache';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import m5s3 from '../i18n/locales/m5s3';
import { CollectionProductPage } from './CollectionProductPage';

class MemoryLocalStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class MemoryStorage implements ProductReadCacheStorage {
  readonly records = new Map<string, unknown>();
  failWrites = false;
  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }
  async write(record: unknown): Promise<void> {
    if (this.failWrites) throw new Error('quota exceeded');
    this.records.set((record as { key: string }).key, record);
  }
  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }
  async clear(): Promise<void> {
    this.records.clear();
  }
}

const AT = new Date('2026-11-14T10:00:00Z');
const fill = (template: string, values: Record<string, string | number> = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
    template,
  );
const outboxText = m5s3.collection.outbox;
const waiting = (count: number) =>
  fill(
    count === 1
      ? outboxText.waitingOffline_one
      : outboxText.waitingOffline_other,
    { count },
  );

function item(
  overrides: Partial<CollectionItemDetail> = {},
): CollectionItemDetail {
  return {
    id: 'item-1',
    collectionId: 'list-1',
    createdBy: 'ben',
    title: 'Milch',
    quantity: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    position: 0,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    creator: { id: 'ben', displayName: 'Ben' },
    completer: null,
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    ...overrides,
  };
}

function list(
  kind: 'SHOPPING' | 'GENERIC' = 'SHOPPING',
  items: CollectionItemDetail[] = [item()],
): CollectionDetail {
  return {
    id: 'list-1',
    spaceId: 'space-1',
    createdBy: 'ben',
    kind,
    title: 'Einkauf',
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    creator: { id: 'ben', displayName: 'Ben' },
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    items,
  };
}

describe('CollectionProductPage shopping list without a connection (#1808)', () => {
  let storage: MemoryStorage;
  let getCollection: ReturnType<typeof vi.fn>;
  let createCollectionItem: ReturnType<typeof vi.fn>;
  let updateCollectionItem: ReturnType<typeof vi.fn>;

  function renderPage(
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  ) {
    const apis = {
      collections: {
        getCollection,
        createCollectionItem,
        updateCollectionItem,
      },
    } as unknown as SharedPlanningApis;
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/plan/collections/list-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  accountId="anna"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    __resetProductReadCacheStateForTests();
    storage = new MemoryStorage();
    __setProductReadCacheStorageForTests(storage);
    vi.stubGlobal('localStorage', new MemoryLocalStorage());
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    getCollection = vi.fn(async () => list());
    createCollectionItem = vi.fn(
      async (request: {
        idempotencyKey: string;
        collectionItemCreate: { title: string };
      }) =>
        item({
          id: `server-${request.idempotencyKey}`,
          title: request.collectionItemCreate.title,
          position: 1,
        }),
    );
    updateCollectionItem = vi.fn(async (request: { itemId: string }) =>
      item({ id: request.itemId, version: 2, completed: true }),
    );
    onlineManager.setOnline(true);
  });

  afterEach(async () => {
    cleanup();
    await __waitForProductReadCacheMutationsForTests();
    __resetProductReadCacheStateForTests();
    vi.unstubAllGlobals();
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  async function addItem(title: string) {
    const user = userEvent.setup();
    const input = await screen.findByLabelText(m5s3.collection.newItem);
    await user.type(input, title);
    await user.click(
      screen.getByRole('button', { name: m5s3.collection.addItem }),
    );
    return { user, input };
  }

  it('keeps an entry added without a connection, shows it as waiting and keeps typing possible', async () => {
    renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));

    const { input } = await addItem('Hafermilch');

    expect(await screen.findByText('Hafermilch')).toBeTruthy();
    expect(createCollectionItem).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: '' }).textContent).toContain(
      waiting(1),
    );
    expect(screen.getByText(outboxText.itemWaiting)).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('sends it when the connection is back and the waiting state goes away', async () => {
    renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));
    await addItem('Hafermilch');
    await screen.findByText(outboxText.itemWaiting);

    act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(createCollectionItem).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText(outboxText.itemWaiting)).toBeNull(),
    );
    expect(screen.queryByText(/Offline ·/)).toBeNull();
    expect(createCollectionItem.mock.calls[0][0]).toMatchObject({
      collectionId: 'list-1',
      collectionItemCreate: { title: 'Hafermilch' },
    });
    expect(createCollectionItem.mock.calls[0][0].idempotencyKey).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('shows a check made without a connection at once and sends it later', async () => {
    renderPage();
    const toggle = await screen.findByRole('button', {
      name: fill(m5s3.collection.markDone, { title: 'Milch' }),
    });
    act(() => onlineManager.setOnline(false));
    const user = userEvent.setup();

    await user.click(toggle);

    const done = await screen.findByRole('button', {
      name: fill(m5s3.collection.markOpen, { title: 'Milch' }),
    });
    expect(done.getAttribute('aria-pressed')).toBe('true');
    expect(updateCollectionItem).not.toHaveBeenCalled();
    expect(screen.getByText(waiting(1))).toBeTruthy();

    act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(1));
    expect(updateCollectionItem.mock.calls[0][0]).toMatchObject({
      itemId: 'item-1',
      ifMatch: '1',
      collectionItemUpdate: { completed: true },
    });
  });

  it('opens from its saved copy after the app was closed and there is no connection', async () => {
    const first = renderPage();
    await screen.findByText('Milch');
    await __waitForProductReadCacheMutationsForTests();
    first.unmount();
    getCollection.mockRejectedValue(new ClientProblemError('offline'));
    act(() => onlineManager.setOnline(false));

    renderPage();

    expect(await screen.findByText('Milch')).toBeTruthy();
  });

  it('keeps the entries that waited when the app is opened again', async () => {
    const first = renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));
    await addItem('Brot');
    await screen.findByText(outboxText.itemWaiting);
    await __waitForProductReadCacheMutationsForTests();
    first.unmount();
    getCollection.mockRejectedValue(new ClientProblemError('offline'));

    renderPage();

    expect(await screen.findByText('Brot')).toBeTruthy();
    expect(await screen.findByText(waiting(1))).toBeTruthy();
  });

  it('does not offer to edit or reorder what has not been sent yet', async () => {
    renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));
    await addItem('Hafermilch');

    const row = (await screen.findByText('Hafermilch')).closest(
      'li',
    ) as HTMLElement;
    // An entry the server does not know yet has no actions menu at all.
    expect(
      within(row).queryByRole('button', {
        name: fill(m5s3.collection.itemActions, { title: 'Hafermilch' }),
      }),
    ).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: m5s3.collection.sort,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('says so when the device cannot keep the changes for later', async () => {
    renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));
    storage.failWrites = true;

    await addItem('Brot');

    expect((await screen.findByRole('alert')).textContent).toContain(
      outboxText.storageFailed,
    );
    expect(screen.getByText('Brot')).toBeTruthy();
  });

  it('tells the person when a waiting entry could not be saved and lets them close the note', async () => {
    createCollectionItem.mockRejectedValue(
      new ClientProblemError('validation', 422),
    );
    renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));
    await addItem('Brot');
    await screen.findByText(outboxText.itemWaiting);

    act(() => onlineManager.setOnline(true));

    const note = await screen.findByText(
      fill(outboxText.noticeRejected, { title: 'Brot' }),
    );
    expect(note).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: outboxText.dismiss }));
    expect(
      screen.queryByText(fill(outboxText.noticeRejected, { title: 'Brot' })),
    ).toBeNull();
  });

  it('leaves a normal list as it was: no waiting state and no queue', async () => {
    getCollection.mockResolvedValue(list('GENERIC'));
    renderPage();
    await screen.findByText('Milch');
    act(() => onlineManager.setOnline(false));

    await addItem('Sandalen');

    expect(screen.queryByText(/Offline ·/)).toBeNull();
    expect(screen.queryByText(outboxText.itemWaiting)).toBeNull();
    expect(createCollectionItem).not.toHaveBeenCalled();
  });
});
