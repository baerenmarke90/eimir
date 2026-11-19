// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
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
import m5s5 from '../i18n/locales/m5s5';
import taskSheets from '../i18n/locales/taskSheets';
import { WirLists } from './WirLists';

const AT = new Date('2026-11-14T10:00:00Z');
const LATER = new Date('2026-11-14T11:00:00Z');
const anna = { id: 'anna', displayName: 'Anna' };
const ben = { id: 'ben', displayName: 'Ben' };
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
    template,
  );

function item(
  id: string,
  title: string,
  overrides: Partial<CollectionItemDetail> = {},
): CollectionItemDetail {
  return {
    id,
    collectionId: 'list',
    createdBy: 'anna',
    title,
    quantity: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    position: 0,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    creator: anna,
    completer: null,
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    ...overrides,
  };
}

function list(
  id: string,
  title: string,
  kind: 'SHOPPING' | 'GENERIC',
  items: CollectionItemDetail[],
): CollectionDetail {
  return {
    id,
    spaceId: 'space-1',
    createdBy: 'anna',
    kind,
    title,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    creator: anna,
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    items,
  };
}

const LISTS: Record<string, CollectionDetail> = {
  einkauf: list('einkauf', 'Einkauf', 'SHOPPING', [
    item('a', 'Milch', { position: 0 }),
    item('b', 'Brot', { position: 1 }),
    item('c', 'Käse', { position: 2 }),
    item('d', 'Butter', { position: 3 }),
    item('e', 'Äpfel', {
      position: 4,
      completed: true,
      completedBy: 'ben',
      completer: ben,
      completedAt: LATER,
    }),
  ]),
  reise: list('reise', 'Reise', 'GENERIC', [item('p', 'Pass')]),
};

class MemoryStorage implements ProductReadCacheStorage {
  readonly records = new Map<string, unknown>();
  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }
  async write(record: unknown): Promise<void> {
    this.records.set((record as { key: string }).key, record);
  }
  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }
  async clear(): Promise<void> {
    this.records.clear();
  }
}

function renderLists(ids: string[]) {
  const getCollection = vi.fn(
    async ({ collectionId }: { collectionId: string }) => LISTS[collectionId],
  );
  const apis = {
    collections: { getCollection },
  } as unknown as SharedPlanningApis;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/today']}>
        <Routes>
          <Route
            path="/today"
            element={
              <WirLists
                apis={apis}
                accountId="anna"
                spaceId="space-1"
                collectionIds={ids}
                enabled
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return getCollection;
}

beforeEach(() => {
  __resetProductReadCacheStateForTests();
  __setProductReadCacheStorageForTests(new MemoryStorage());
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(async () => {
  cleanup();
  await __waitForProductReadCacheMutationsForTests();
  __resetProductReadCacheStateForTests();
});

describe('WirLists (#1808)', () => {
  it('shows one list as a wide tile with its count, what is open and the last action', async () => {
    renderLists(['einkauf']);

    const tile = (
      await screen.findByRole('heading', { name: 'Einkauf' })
    ).closest('li') as HTMLElement;
    expect(tile.textContent).toContain('4');
    expect(tile.textContent).toContain(
      fill(m5s3.collection.summary.shoppingOpen_other, { count: 4 }),
    );
    // Only the first three open entries are peeked.
    expect(tile.textContent).toContain('Milch · Brot · Käse');
    expect(tile.textContent).not.toContain('Butter');
    expect(tile.textContent).toContain(
      fill(m5s5.today.wirLists.lastCart, { name: 'Ben', title: 'Äpfel' }),
    );
    expect(tile.className).toContain('wir-list-tile');
    expect(document.querySelector('.wir-lists-single')).not.toBeNull();
  });

  it('shows several lists as tiles in a row without the add link', async () => {
    renderLists(['einkauf', 'reise']);

    await screen.findByRole('heading', { name: 'Reise' });
    expect(document.querySelector('.wir-lists-row')).not.toBeNull();
    expect(
      screen.queryByRole('link', { name: m5s5.today.wirLists.add }),
    ).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('uses the open wording of a plain list and says when everything is done', async () => {
    renderLists(['reise']);
    const tile = (
      await screen.findByRole('heading', { name: 'Reise' })
    ).closest('li') as HTMLElement;
    expect(tile.textContent).toContain(
      fill(m5s3.collection.summary.genericOpen_one, { count: 1 }),
    );
  });

  it('opens the list as a sheet with the handle, without raising the keyboard', async () => {
    renderLists(['einkauf']);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('link', {
        name: fill(m5s5.today.wirLists.openAria, { title: 'Einkauf' }),
      }),
    );

    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByRole('heading', { name: 'Einkauf' }),
    ).toBeTruthy();
    // The list is in the sheet: count, entries and the entry field.
    expect(
      await within(sheet).findByLabelText(m5s3.collection.newItem),
    ).toBeTruthy();
    expect(document.activeElement).not.toBe(
      within(sheet).getByLabelText(m5s3.collection.newItem),
    );
    // The page's own heading and back control are not repeated in the sheet.
    expect(within(sheet).queryAllByRole('heading', { level: 1 })).toHaveLength(
      0,
    );
    expect(
      within(sheet).getByRole('button', { name: taskSheets.close }),
    ).toBeTruthy();
  });

  it('opens the same sheet with the entry field focused from the add link', async () => {
    renderLists(['einkauf']);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('link', { name: m5s5.today.wirLists.add }),
    );

    const sheet = await screen.findByRole('dialog');
    const field = await within(sheet).findByLabelText(m5s3.collection.newItem);
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it('closes with the handle and gives the focus back to the tile', async () => {
    renderLists(['einkauf']);
    const user = userEvent.setup();
    const tile = await screen.findByRole('link', {
      name: fill(m5s5.today.wirLists.openAria, { title: 'Einkauf' }),
    });
    await user.click(tile);
    const sheet = await screen.findByRole('dialog');

    await user.click(
      within(sheet).getByRole('button', { name: taskSheets.close }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(tile));
  });

  it('has no checkboxes: a tile is for opening, not for checking', async () => {
    renderLists(['einkauf']);
    await screen.findByRole('heading', { name: 'Einkauf' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('reads every list with one request each and nothing else', async () => {
    const getCollection = renderLists(['einkauf', 'reise']);
    await waitFor(() => expect(getCollection).toHaveBeenCalledTimes(2));
  });
});
