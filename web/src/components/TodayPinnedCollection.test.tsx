// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { i18n } from '../i18n';
import taskSheets from '../i18n/locales/taskSheets';
import { TodayPinnedCollection } from './TodayPinnedCollection';

const ACHIEVEMENT_HEADER = 'X-Eimir-Shared-Achievement';

function item(
  id: string,
  title: string,
  completed = false,
  position = 0,
  version = 1,
): CollectionItemDetail {
  return {
    id,
    collectionId: 'collection-1',
    title,
    completed,
    position,
    version,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: new Date('2026-09-21T10:00:00Z'),
    updatedAt: new Date('2026-09-21T10:00:00Z'),
    createdBy: 'account-1',
    creator: { id: 'account-1', displayName: 'Alex' },
  };
}

function collection(): CollectionDetail {
  return {
    id: 'collection-1',
    spaceId: 'space-1',
    title: 'Einkauf',
    version: 3,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: new Date('2026-09-21T10:00:00Z'),
    updatedAt: new Date('2026-09-21T10:00:00Z'),
    createdBy: 'account-1',
    creator: { id: 'account-1', displayName: 'Alex' },
    items: [
      item('item-1', 'Milch', false, 0),
      item('item-2', 'Brot', true, 1),
      item('item-3', 'Äpfel', false, 2),
      item('item-4', 'Kaffee', false, 3),
      item('item-5', 'Haferflocken', false, 4),
    ],
  } as CollectionDetail;
}

function rawUpdateResponse(
  updatedItem: CollectionItemDetail,
  achievement: 'collection-completed' | null,
) {
  return {
    raw: {
      headers: {
        get: (name: string) =>
          name === ACHIEVEMENT_HEADER ? achievement : null,
      },
    } as unknown as Response,
    value: vi.fn().mockResolvedValue(updatedItem),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function mockMatchMedia(reducedMotion: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function fireReactAnimationEnd(element: Element): void {
  fireEvent.animationEnd(element);
  if (element.isConnected) {
    fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }));
  }
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  mockMatchMedia(true);
  window.history.replaceState({ idx: 0 }, '', '/today');
});

function renderPinned(
  api: Partial<CollectionsApi>,
  {
    value = collection(),
    sharedAchievementsEnabled = false,
    accountId = 'account-1',
    spaceId = 'space-1',
  }: {
    value?: CollectionDetail;
    sharedAchievementsEnabled?: boolean;
    accountId?: string;
    spaceId?: string;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const queryFn = vi.fn().mockResolvedValue(value);
  const key = authorSummaryQueryKeys.collectionDetail(spaceId, value.id);

  function Harness() {
    const query = useQuery({
      queryKey: key,
      queryFn,
      initialData: value,
      staleTime: Number.POSITIVE_INFINITY,
    });
    if (!query.data) return null;
    return (
      <TodayPinnedCollection
        api={api as CollectionsApi}
        accountId={accountId}
        spaceId={spaceId}
        collection={query.data}
        sharedAchievementsEnabled={sharedAchievementsEnabled}
      />
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, queryFn, key };
}

describe('TodayPinnedCollection', () => {
  it('keeps open work visible and progressively discloses the rest', () => {
    renderPinned({});

    expect(screen.getByText('Milch')).toBeDefined();
    expect(screen.getByText('Äpfel')).toBeDefined();
    expect(screen.getByText('Kaffee')).toBeDefined();
    expect(screen.getByText('Haferflocken')).toBeDefined();
    expect(screen.queryByText('Brot')).toBeNull();

    const disclosure = screen.getByRole('button', {
      name: i18n.t('m5s5.today.pinnedCollection.showMore', { count: 1 }),
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);

    expect(screen.getByText('Brot')).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s5.today.pinnedCollection.showLess'),
      }),
    ).toBeDefined();
  });

  it('publishes an optimistic item toggle without refetching the Collection on success', async () => {
    const request = deferred<ReturnType<typeof rawUpdateResponse>>();
    const updateCollectionItemRaw = vi.fn().mockReturnValue(request.promise);
    const { queryFn } = renderPinned({ updateCollectionItemRaw });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    expect(queryFn).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      );
      await request.promise;
    });

    await waitFor(() =>
      expect(updateCollectionItemRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        collectionId: 'collection-1',
        itemId: 'item-1',
        ifMatch: '1',
        collectionItemUpdate: { completed: true },
      }),
    );
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('rolls the latest failed toggle back to the last confirmed item and reconciles only its detail query', async () => {
    const request = deferred<never>();
    const updateCollectionItemRaw = vi.fn().mockReturnValue(request.promise);
    const { queryFn } = renderPinned({ updateCollectionItemRaw });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      ).toBeDefined(),
    );
    await waitFor(() => expect(updateCollectionItemRaw).toHaveBeenCalledTimes(1));

    await act(async () => {
      request.reject(new Error('request failed'));
      await request.promise.catch(() => undefined);
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      ).toBeDefined(),
    );
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
  });

  it('serializes rapid toggles of one item and uses the newest confirmed version without stale response overwrite', async () => {
    const first = deferred<ReturnType<typeof rawUpdateResponse>>();
    const second = deferred<ReturnType<typeof rawUpdateResponse>>();
    const updateCollectionItemRaw = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderPinned({ updateCollectionItemRaw });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      ).toBeDefined(),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    );

    await waitFor(() => expect(updateCollectionItemRaw).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );

    await act(async () => {
      first.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      );
      await first.promise;
    });

    await waitFor(() =>
      expect(updateCollectionItemRaw).toHaveBeenCalledTimes(2),
    );
    expect(updateCollectionItemRaw.mock.calls[1][0]).toMatchObject({
      itemId: 'item-1',
      ifMatch: '2',
      collectionItemUpdate: { completed: false },
    });
    expect(
      screen
        .getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    await act(async () => {
      second.resolve(
        rawUpdateResponse(item('item-1', 'Milch', false, 0, 3), null),
      );
      await second.promise;
    });
  });

  it('does not let an older failure roll back a newer intent for the same item', async () => {
    const first = deferred<ReturnType<typeof rawUpdateResponse>>();
    const second = deferred<ReturnType<typeof rawUpdateResponse>>();
    const updateCollectionItemRaw = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderPinned({ updateCollectionItemRaw });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      ).toBeDefined(),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      ).toBeDefined(),
    );

    await act(async () => {
      first.reject(new Error('older write failed'));
      await first.promise.catch(() => undefined);
    });

    await waitFor(() =>
      expect(updateCollectionItemRaw).toHaveBeenCalledTimes(2),
    );
    expect(
      screen
        .getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    await act(async () => {
      second.resolve(
        rawUpdateResponse(item('item-1', 'Milch', false, 0, 2), null),
      );
      await second.promise;
    });
  });

  it('lets different items update independently instead of globally disabling the list', async () => {
    const milk = deferred<ReturnType<typeof rawUpdateResponse>>();
    const apples = deferred<ReturnType<typeof rawUpdateResponse>>();
    const updateCollectionItemRaw = vi
      .fn()
      .mockImplementation(({ itemId }) =>
        itemId === 'item-1' ? milk.promise : apples.promise,
      );
    renderPinned({ updateCollectionItemRaw });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      ).toBeDefined(),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Äpfel' }),
      }),
    );

    await waitFor(() => expect(updateCollectionItemRaw).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    ).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Äpfel' }),
        }),
      ).toBeDefined(),
    );

    await act(async () => {
      milk.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      );
      apples.resolve(
        rawUpdateResponse(item('item-3', 'Äpfel', true, 2, 2), null),
      );
      await Promise.all([milk.promise, apples.promise]);
    });
  });

  it('enters and exits the confirmed completion with shared presence motion while domain state changes immediately', async () => {
    mockMatchMedia(false);
    const value = collection();
    value.items = value.items.map((entry) =>
      entry.id === 'item-1' ? entry : { ...entry, completed: true },
    );
    const updateCollectionItemRaw = vi
      .fn()
      .mockResolvedValueOnce(
        rawUpdateResponse(
          item('item-1', 'Milch', true, 0, 2),
          'collection-completed',
        ),
      )
      .mockReturnValueOnce(new Promise(() => undefined));
    renderPinned(
      { updateCollectionItemRaw },
      { value, sharedAchievementsEnabled: true },
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );

    const heading = await screen.findByRole('heading', {
      name: i18n.t('m5s5.today.pinnedCollection.sharedAchievementTitle'),
    });
    const celebration = heading.closest('.shared-achievement-confirmation');
    expect(celebration?.getAttribute('data-presence')).toBe('open');

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    await waitFor(() =>
      expect(celebration?.getAttribute('data-presence')).toBe('exiting'),
    );
    if (celebration) fireReactAnimationEnd(celebration);
    await waitFor(() =>
      expect(
        screen.queryByText(
          i18n.t('m5s5.today.pinnedCollection.sharedAchievementTitle'),
        ),
      ).toBeNull(),
    );
  });

  it('removes completion presentation immediately for reduced motion', async () => {
    const value = collection();
    value.items = value.items.map((entry) =>
      entry.id === 'item-1' ? entry : { ...entry, completed: true },
    );
    const updateCollectionItemRaw = vi
      .fn()
      .mockResolvedValueOnce(
        rawUpdateResponse(
          item('item-1', 'Milch', true, 0, 2),
          'collection-completed',
        ),
      )
      .mockReturnValueOnce(new Promise(() => undefined));
    renderPinned(
      { updateCollectionItemRaw },
      { value, sharedAchievementsEnabled: true },
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await screen.findByRole('heading', {
      name: i18n.t('m5s5.today.pinnedCollection.sharedAchievementTitle'),
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: i18n.t('m5s5.today.pinnedCollection.sharedAchievementTitle'),
        }),
      ).toBeNull(),
    );
  });

  it('opens the add task from the plus, validates, saves locally, and restores focus without a Collection refetch', async () => {
    const request = deferred<CollectionItemDetail>();
    const createCollectionItem = vi.fn().mockReturnValue(request.promise);
    const { queryFn } = renderPinned({ createCollectionItem });
    const add = screen.getByRole('button', {
      name: i18n.t('m5s5.today.pinnedCollection.addAction'),
    });
    add.focus();
    fireEvent.click(add);

    const input = screen.getByLabelText(i18n.t('m5s3.collection.itemTitle'));
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByRole('alert').textContent).toBe(
      i18n.t('m5s5.today.pinnedCollection.addRequired'),
    );
    expect(createCollectionItem).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Butter' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(createCollectionItem).toHaveBeenCalledWith({
      spaceId: 'space-1',
      collectionId: 'collection-1',
        collectionItemCreate: { title: 'Butter' },
      }),
    );

    await act(async () => {
      request.resolve(item('item-6', 'Butter', false, 5, 1));
      await request.promise;
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Butter')).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(add));
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('keeps a failed add task open and returns focus to the editable field', async () => {
    const createCollectionItem = vi.fn().mockRejectedValue(new Error('failed'));
    renderPinned({ createCollectionItem });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s5.today.pinnedCollection.addAction'),
      }),
    );
    const input = screen.getByLabelText(i18n.t('m5s3.collection.itemTitle'));
    fireEvent.change(input, { target: { value: 'Butter' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(createCollectionItem).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('protects a dirty add draft from accidental dismissal and allows explicit cancellation', async () => {
    renderPinned({});
    const add = screen.getByRole('button', {
      name: i18n.t('m5s5.today.pinnedCollection.addAction'),
    });
    fireEvent.click(add);
    const input = screen.getByLabelText(i18n.t('m5s3.collection.itemTitle'));
    fireEvent.change(input, { target: { value: 'Butter' } });

    fireEvent.click(screen.getByRole('button', { name: taskSheets.close }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toBeDefined();
    expect((input as HTMLInputElement).value).toBe('Butter');

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.cancel') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(add));
  });
});
