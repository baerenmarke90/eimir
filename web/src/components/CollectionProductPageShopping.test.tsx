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
import { ClientProblemError } from '../client/problemDetails';
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
// The cart bar starts with the tray name, whatever the count.
const cartBarName = new RegExp(`^${m5s3.collection.trayShopping} · `);

function finishedResponse(finishedCount: number, celebrate: boolean) {
  return {
    value: async () => ({
      finishedCount,
      collection: list('SHOPPING', [
        item({ id: 'milk', title: 'Milch', position: 0 }),
        item({ id: 'bread', title: 'Brot', position: 1, quantity: '2' }),
      ]),
    }),
    raw: new Response(null, {
      headers: celebrate
        ? { 'X-Eimir-Shared-Achievement': 'collection-completed' }
        : {},
    }),
  };
}

const suggestionText = m5s3.collection.suggestions;
const finishText = m5s3.collection.finish;
const endText = m5s3.collection.endState;
const AT_BOUGHT = new Date('2026-11-13T10:00:00Z');
const suggestion = (
  id: string,
  title: string,
  quantity: string | null = null,
) => ({
  id,
  title,
  quantity,
  lastBoughtAt: AT_BOUGHT,
  timesBought: 1,
});

describe('CollectionProductPage shopping list composition (#1808)', () => {
  let storage: MemoryStorage;
  let serverItems: CollectionItemDetail[];
  let getCollection: ReturnType<typeof vi.fn>;
  let createCollectionItem: ReturnType<typeof vi.fn>;
  let updateCollectionItem: ReturnType<typeof vi.fn>;
  let listSuggestions: ReturnType<typeof vi.fn>;
  let deleteSuggestion: ReturnType<typeof vi.fn>;
  let finishTrip: ReturnType<typeof vi.fn>;

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
        listCollectionSuggestions: listSuggestions,
        deleteCollectionSuggestion: deleteSuggestion,
        finishCollectionShoppingRaw: finishTrip,
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
    // The server remembers a change, so a refetch does not undo it.
    updateCollectionItem = vi.fn(
      async (request: {
        itemId: string;
        collectionItemUpdate: {
          completed?: boolean;
          quantity?: string | null;
          title?: string;
        };
      }) => {
        const current = serverItems.find(
          (entry) => entry.id === request.itemId,
        ) as CollectionItemDetail;
        const change = request.collectionItemUpdate;
        const updated: CollectionItemDetail = {
          ...current,
          version: current.version + 1,
          ...(change.title !== undefined ? { title: change.title } : {}),
          ...(change.quantity !== undefined
            ? { quantity: change.quantity }
            : {}),
          ...(change.completed !== undefined
            ? {
                completed: change.completed,
                completedBy: change.completed ? 'anna' : null,
                completer: change.completed ? anna : null,
              }
            : {}),
        };
        serverItems = serverItems.map((entry) =>
          entry.id === request.itemId ? updated : entry,
        );
        return updated;
      },
    );
    listSuggestions = vi.fn(async () => ({ items: [] }));
    deleteSuggestion = vi.fn(async () => undefined);
    finishTrip = vi.fn(async () => finishedResponse(1, false));
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

  it('opens an entry by its name and changes the quantity from the sheet', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: fill(m5s3.collection.openItem, { title: 'Milch' }),
      }),
    );
    const dialog = screen.getByRole('dialog');
    const quantity = within(dialog).getByLabelText(
      m5s3.collection.quantityLabel,
    );

    await user.type(quantity, '2 l');
    await user.click(
      within(dialog).getByRole('button', { name: m5s3.common.saveChanges }),
    );

    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(1));
    expect(updateCollectionItem.mock.calls[0][0]).toMatchObject({
      itemId: 'milk',
      collectionItemUpdate: { quantity: '2 l' },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('2 l')).toBeTruthy();
  });

  it('renames an entry from the same sheet and can delete it', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: fill(m5s3.collection.openItem, { title: 'Brot' }),
      }),
    );
    const dialog = screen.getByRole('dialog');
    const title = within(dialog).getByLabelText(m5s3.collection.itemTitle);
    await user.clear(title);
    await user.type(title, 'Vollkornbrot');
    await user.click(
      within(dialog).getByRole('button', { name: m5s3.common.saveChanges }),
    );

    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(1));
    expect(updateCollectionItem.mock.calls[0][0]).toMatchObject({
      collectionItemUpdate: { title: 'Vollkornbrot' },
    });
    expect(
      await screen.findByRole('button', {
        name: fill(m5s3.collection.openItem, { title: 'Vollkornbrot' }),
      }),
    ).toBeTruthy();
  });

  it('shows no quantity field in the sheet of a list that is not a shopping list', async () => {
    getCollection.mockResolvedValue(
      annasList('GENERIC', [item({ id: 'a', title: 'Pass' })]),
    );
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: fill(m5s3.collection.openItem, { title: 'Pass' }),
      }),
    );

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByLabelText(m5s3.collection.itemTitle),
    ).toBeTruthy();
    expect(
      within(dialog).queryByLabelText(m5s3.collection.quantityLabel),
    ).toBeNull();
  });

  it('keeps the cart in a bar that opens a sheet and lets an entry be put back', async () => {
    renderPage();
    const user = userEvent.setup();
    const bar = await screen.findByRole('button', {
      name: new RegExp(fill(m5s3.collection.cart.bar_one, { count: 1 })),
    });

    await user.click(bar);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Äpfel')).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', {
        name: fill(m5s3.collection.markOpen, { title: 'Äpfel' }),
      }),
    );
    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(1));
    expect(updateCollectionItem.mock.calls[0][0]).toMatchObject({
      itemId: 'apples',
      collectionItemUpdate: { completed: false },
    });
  });

  it('has no cart bar while nothing is in the cart and none on a list that is not a shopping list', async () => {
    serverItems = serverItems.filter((entry) => !entry.completed);
    const first = renderPage();
    await screen.findByText('Milch');
    expect(screen.queryByRole('button', { name: cartBarName })).toBeNull();
    first.unmount();

    getCollection.mockResolvedValue(
      annasList('GENERIC', [
        item({ id: 'b', title: 'Visum', completed: true, completer: anna }),
      ]),
    );
    renderPage();
    await screen.findByText('Visum');
    expect(screen.queryByRole('button', { name: cartBarName })).toBeNull();
  });

  it('marks the entry that was just checked so it can glide into its new place', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: fill(m5s3.collection.markDone, { title: 'Milch' }),
      }),
    );

    const moved = await screen.findByRole('button', {
      name: fill(m5s3.collection.markOpen, { title: 'Milch' }),
    });
    expect(moved.closest('li')?.getAttribute('data-arriving')).toBe('true');
    // The other entries do not move with it.
    expect(
      screen.getByText('Brot').closest('li')?.hasAttribute('data-arriving'),
    ).toBe(false);
  });

  describe('suggestions and finishing the trip', () => {
    it('offers what was bought before, leaves out what is on the list and says who sees it', async () => {
      listSuggestions.mockResolvedValue({
        items: [
          suggestion('s1', 'Milch'),
          suggestion('s2', 'Hafermilch', '2 l'),
          suggestion('s3', 'Butter'),
        ],
      });
      renderPage();

      const chips = await screen.findByRole('region', {
        name: suggestionText.heading,
      });

      expect(within(chips).getByText('Hafermilch · 2 l')).toBeTruthy();
      expect(within(chips).getByText('Butter')).toBeTruthy();
      // Milk is on the list already.
      expect(within(chips).queryByText('Milch')).toBeNull();
      expect(within(chips).getByText(suggestionText.note)).toBeTruthy();
    });

    it('adds a suggestion with its quantity in one tap', async () => {
      listSuggestions.mockResolvedValue({
        items: [suggestion('s2', 'Hafermilch', '2 l')],
      });
      renderPage();
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', {
          name: fill(suggestionText.add, { title: 'Hafermilch · 2 l' }),
        }),
      );

      await waitFor(() =>
        expect(createCollectionItem).toHaveBeenCalledTimes(1),
      );
      expect(
        createCollectionItem.mock.calls[0][0].collectionItemCreate,
      ).toMatchObject({
        title: 'Hafermilch',
        quantity: '2 l',
      });
    });

    it('removes a suggestion on its own and keeps the others', async () => {
      // The server forgets a removed suggestion, so a refetch does not bring it back.
      let remaining = [
        suggestion('s2', 'Hafermilch'),
        suggestion('s3', 'Butter'),
      ];
      listSuggestions.mockImplementation(async () => ({ items: remaining }));
      deleteSuggestion.mockImplementation(
        async (request: { suggestionId: string }) => {
          remaining = remaining.filter(
            (entry) => entry.id !== request.suggestionId,
          );
        },
      );
      renderPage();
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', {
          name: fill(suggestionText.remove, { title: 'Hafermilch' }),
        }),
      );

      await waitFor(() => expect(deleteSuggestion).toHaveBeenCalledTimes(1));
      expect(deleteSuggestion.mock.calls[0][0]).toMatchObject({
        suggestionId: 's2',
        collectionId: 'list-1',
      });
      await waitFor(() => expect(screen.queryByText('Hafermilch')).toBeNull());
      expect(screen.getByText('Butter')).toBeTruthy();
    });

    it('shows no suggestions on a list that is not a shopping list', async () => {
      getCollection.mockResolvedValue(
        annasList('GENERIC', [item({ id: 'a', title: 'Pass' })]),
      );
      renderPage();
      await screen.findByText('Pass');

      expect(listSuggestions).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('region', { name: suggestionText.heading }),
      ).toBeNull();
    });

    async function openCart() {
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: cartBarName }),
      );
      return { user, cart: screen.getByRole('dialog') };
    }

    // After the trip the server's list has nothing in the cart any more.
    const serverAfterTrip = () =>
      getCollection.mockResolvedValue(
        annasList('SHOPPING', [
          item({ id: 'milk', title: 'Milch', position: 0 }),
          item({ id: 'bread', title: 'Brot', position: 1, quantity: '2' }),
        ]),
      );

    it('finishes the trip with the entries of the cart and tells the couple what it left', async () => {
      renderPage();
      const { user, cart } = await openCart();
      serverAfterTrip();

      await user.click(
        within(cart).getByRole('button', { name: finishText.action }),
      );

      await waitFor(() => expect(finishTrip).toHaveBeenCalledTimes(1));
      expect(finishTrip.mock.calls[0][0]).toMatchObject({
        spaceId: 'space-1',
        collectionId: 'list-1',
        collectionFinish: { itemIds: ['apples'] },
      });
      expect(
        await screen.findByText(fill(endText.done_one, { count: 1 })),
      ).toBeTruthy();
      // Nothing is left to buy in the cart, so the bar is gone.
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: cartBarName })).toBeNull(),
      );
    });

    it('shows the shared moment with who put how much into the cart when the server confirms it', async () => {
      finishTrip.mockResolvedValue(finishedResponse(1, true));
      renderPage();
      const { user, cart } = await openCart();
      serverAfterTrip();

      await user.click(
        within(cart).getByRole('button', { name: finishText.action }),
      );

      expect(await screen.findByText(endText.title)).toBeTruthy();
      expect(
        screen.getByText(
          fill(endText.bodyShares, {
            shares: fill(endText.share, { name: 'Ben', count: 1 }),
          }),
        ),
      ).toBeTruthy();
      await user.click(screen.getByRole('button', { name: endText.dismiss }));
      await waitFor(() => expect(screen.queryByText(endText.title)).toBeNull());
    });

    it('cannot finish without a connection and says why', async () => {
      renderPage();
      await screen.findByText('Milch');
      act(() => onlineManager.setOnline(false));
      const { cart } = await openCart();

      const button = within(cart).getByRole('button', {
        name: finishText.action,
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      expect(within(cart).getByText(finishText.offline)).toBeTruthy();
      expect(finishTrip).not.toHaveBeenCalled();
    });

    it('cannot finish while changes are waiting to be sent', async () => {
      renderPage();
      const user = userEvent.setup();
      await screen.findByText('Milch');
      act(() => onlineManager.setOnline(false));
      await user.type(
        await screen.findByLabelText(m5s3.collection.newItem),
        'Salz',
      );
      await user.click(
        screen.getByRole('button', { name: m5s3.collection.addItem }),
      );
      await screen.findByText(m5s3.collection.outbox.itemWaiting);
      act(() => onlineManager.setOnline(true));
      // Back online the change is still being sent: finishing must wait.
      createCollectionItem.mockImplementation(() => new Promise(() => {}));

      const { cart } = await openCart();

      expect(
        (
          within(cart).getByRole('button', {
            name: finishText.action,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(within(cart).getByText(finishText.waiting)).toBeTruthy();
    });

    it('says so when the trip could not be finished', async () => {
      finishTrip.mockRejectedValue(new ClientProblemError('server', 500));
      renderPage();
      const { user, cart } = await openCart();

      await user.click(
        within(cart).getByRole('button', { name: finishText.action }),
      );

      // The cart sheet and the inline cart section each carry the control.
      const alerts = await screen.findAllByRole('alert');
      expect(
        alerts.some((alert) => alert.textContent === finishText.failed),
      ).toBe(true);
    });
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
