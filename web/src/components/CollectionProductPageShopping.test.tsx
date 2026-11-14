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

const summaryText = m5s3.collection.summary;

describe('CollectionProductPage shopping list composition (#1808)', () => {
  let storage: MemoryStorage;
  let serverItems: CollectionItemDetail[];
  let getCollection: ReturnType<typeof vi.fn>;
  let createCollectionItem: ReturnType<typeof vi.fn>;
  let updateCollectionItem: ReturnType<typeof vi.fn>;

  const ben = { id: 'ben', displayName: 'Ben' };
  const anna = { id: 'anna', displayName: 'Anna' };
  // Anna created the list, so she is partner A (rose) and Ben partner B (blue).
  const annasList = (
    kind: 'SHOPPING' | 'GENERIC',
    items: CollectionItemDetail[],
  ): CollectionDetail => ({
    ...list(kind, items),
    createdBy: 'anna',
    creator: anna,
  });

  function renderPage(accountId = 'anna') {
    const apis = {
      collections: {
        getCollection,
        createCollectionItem,
        updateCollectionItem,
      },
    } as unknown as SharedPlanningApis;
    return render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={['/plan/collections/list-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  accountId={accountId}
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
    // Anna created the list. Ben added milk, Anna added bread, and Ben put
    // the apples into the cart.
    serverItems = [
      item({ id: 'milk', title: 'Milch', creator: ben, createdBy: 'ben' }),
      item({
        id: 'bread',
        title: 'Brot',
        quantity: '2',
        position: 1,
        creator: anna,
        createdBy: 'anna',
      }),
      item({
        id: 'apples',
        title: 'Äpfel',
        quantity: '1 kg',
        position: 2,
        completed: true,
        completedBy: 'ben',
        completer: ben,
      }),
    ];
    getCollection = vi.fn(async () => annasList('SHOPPING', serverItems));
    createCollectionItem = vi.fn(
      async (request: {
        idempotencyKey?: string;
        collectionItemCreate: { title: string; quantity?: string };
      }) =>
        item({
          id: 'new-1',
          title: request.collectionItemCreate.title,
          quantity: request.collectionItemCreate.quantity ?? null,
          position: 3,
        }),
    );
    // The server remembers a check, so a refetch does not undo it.
    updateCollectionItem = vi.fn(async (request: { itemId: string }) => {
      const current = serverItems.find((entry) => entry.id === request.itemId);
      const updated = {
        ...(current as CollectionItemDetail),
        version: 2,
        completed: true,
        completedBy: 'anna',
        completer: anna,
      };
      serverItems = serverItems.map((entry) =>
        entry.id === request.itemId ? updated : entry,
      );
      return updated;
    });
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

  it('shows how many entries are missing and who put what into the cart', async () => {
    renderPage();
    const region = await screen.findByRole('region', {
      name: summaryText.region,
    });

    expect(region.textContent).toContain('2');
    expect(region.textContent).toContain(
      fill(summaryText.shoppingOpen_other, { count: 2 }),
    );
    expect(region.textContent).toContain(
      fill(summaryText.shoppingShare, { name: 'Ben', count: 1 }),
    );
  });

  it('says that everything is in the cart when nothing is missing any more', async () => {
    getCollection.mockResolvedValue(
      annasList('SHOPPING', [
        item({ completed: true, completedBy: 'ben', completer: ben }),
      ]),
    );
    renderPage();

    const region = await screen.findByRole('region', {
      name: summaryText.region,
    });
    expect(region.textContent).toContain(summaryText.shoppingComplete);
  });

  it('uses the open and done wording on a list that is not a shopping list', async () => {
    getCollection.mockResolvedValue(
      annasList('GENERIC', [
        item({ id: 'a', title: 'Pass' }),
        item({ id: 'b', title: 'Visum', completed: true, completer: anna }),
      ]),
    );
    renderPage();

    const region = await screen.findByRole('region', {
      name: summaryText.region,
    });
    expect(region.textContent).toContain(
      fill(summaryText.genericOpen_one, { count: 1 }),
    );
    expect(
      screen.getByRole('heading', {
        name: new RegExp(m5s3.collection.trayGeneric),
      }),
    ).toBeTruthy();
    expect(screen.queryByText(m5s3.collection.quantityPlaceholder)).toBeNull();
  });

  it('names the person behind every entry in text, not by colour alone', async () => {
    renderPage();
    await screen.findByText('Milch');

    expect(
      screen.getByText(fill(m5s3.collection.addedBy, { name: 'Ben' })),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(m5s3.collection.addedBy, { name: 'Anna' })),
    ).toBeTruthy();
    expect(
      screen.getByText(
        fill(m5s3.collection.completedByShopping, { name: 'Ben' }),
      ),
    ).toBeTruthy();
  });

  it('keeps finished entries in their own tray and shows a quantity only when set', async () => {
    renderPage();
    const tray = (
      await screen.findByRole('heading', {
        name: new RegExp(m5s3.collection.trayShopping),
      })
    ).closest('section') as HTMLElement;

    expect(within(tray).getByText('Äpfel')).toBeTruthy();
    expect(within(tray).queryByText('Milch')).toBeNull();
    // A bare number reads as a count, a number with a unit stays as typed.
    expect(screen.getByText('2×')).toBeTruthy();
    expect(within(tray).getByText('1 kg')).toBeTruthy();
    expect(screen.queryByText('1×')).toBeNull();
  });

  it('adds an entry with a quantity and keeps the input ready for the next one', async () => {
    renderPage();
    const user = userEvent.setup();
    const title = await screen.findByLabelText(m5s3.collection.newItem);
    await user.type(title, 'Hafermilch');
    await user.type(
      screen.getByLabelText(m5s3.collection.quantityLabel),
      '2 l',
    );
    await user.click(
      screen.getByRole('button', { name: m5s3.collection.addItem }),
    );

    await waitFor(() => expect(createCollectionItem).toHaveBeenCalledTimes(1));
    expect(createCollectionItem.mock.calls[0][0]).toMatchObject({
      collectionItemCreate: { title: 'Hafermilch', quantity: '2 l' },
    });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect((title as HTMLInputElement).value).toBe('');
  });

  it('sends no quantity when none was typed', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText(m5s3.collection.newItem),
      'Salz',
    );
    await user.click(
      screen.getByRole('button', { name: m5s3.collection.addItem }),
    );

    await waitFor(() => expect(createCollectionItem).toHaveBeenCalledTimes(1));
    const created = createCollectionItem.mock.calls[0][0].collectionItemCreate;
    expect(created.title).toBe('Salz');
    expect(created.quantity ?? null).toBeNull();
  });

  it('moves a checked entry into the tray and keeps the focus on it', async () => {
    renderPage();
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', {
      name: fill(m5s3.collection.markDone, { title: 'Milch' }),
    });

    await user.click(toggle);

    const moved = await screen.findByRole('button', {
      name: fill(m5s3.collection.markOpen, { title: 'Milch' }),
    });
    await waitFor(() => expect(document.activeElement).toBe(moved));
    const tray = screen
      .getByRole('heading', { name: new RegExp(m5s3.collection.trayShopping) })
      .closest('section') as HTMLElement;
    expect(within(tray).getByText('Milch')).toBeTruthy();
  });

  it('shows the same colours to both partners', async () => {
    const first = renderPage('anna');
    await screen.findByText('Milch');
    const colours = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('.partner-marker')).map(
        (marker) => marker.className,
      );
    const annaView = colours(first.container);
    first.unmount();
    const second = renderPage('ben');
    await screen.findByText('Milch');

    expect(colours(second.container)).toEqual(annaView);
    expect(annaView.some((name) => name.includes('partner-marker-a'))).toBe(
      true,
    );
    expect(annaView.some((name) => name.includes('partner-marker-b'))).toBe(
      true,
    );
  });

  describe('while the list is open', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const settle = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    it("picks up the partner's change without a reload", async () => {
      renderPage();
      await settle(100);
      expect(screen.getByText('Milch')).toBeTruthy();
      const before = getCollection.mock.calls.length;
      serverItems = [
        ...serverItems,
        item({
          id: 'salt',
          title: 'Salz',
          position: 3,
          creator: ben,
          createdBy: 'ben',
        }),
      ];

      await settle(13_000);

      expect(getCollection.mock.calls.length).toBeGreaterThan(before);
      expect(screen.getByText('Salz')).toBeTruthy();
    });

    it('does not ask for anything while there is no connection', async () => {
      renderPage();
      await settle(100);
      act(() => onlineManager.setOnline(false));
      const before = getCollection.mock.calls.length;

      await settle(40_000);

      expect(getCollection.mock.calls.length).toBe(before);
    });
  });
});
