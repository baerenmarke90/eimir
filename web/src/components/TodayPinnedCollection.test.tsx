// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import * as snackbar from '../client/snackbar';
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

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
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

  function Harness({ activeAccount = accountId, activeSpace = spaceId } = {}) {
    const query = useQuery({
      queryKey: authorSummaryQueryKeys.collectionDetail(activeSpace, value.id),
      queryFn,
      initialData: value,
      staleTime: Number.POSITIVE_INFINITY,
    });
    if (!query.data) return null;
    return (
      <TodayPinnedCollection
        api={api as CollectionsApi}
        accountId={activeAccount}
        spaceId={activeSpace}
        collection={query.data}
        sharedAchievementsEnabled={sharedAchievementsEnabled}
      />
    );
  }

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    queryClient,
    queryFn,
    key,
    unmount: view.unmount,
    changeScope: (activeAccount: string, activeSpace = spaceId) =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Harness activeAccount={activeAccount} activeSpace={activeSpace} />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
  };
}

describe('TodayPinnedCollection', () => {
  function submitAdd(title = 'Butter') {
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s5.today.pinnedCollection.addAction'),
      }),
    );
    const input = screen.getByLabelText(
      i18n.t('m5s3.collection.itemTitle'),
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: title } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    return input;
  }

  it.each(['query', 'browser'] as const)(
    'rejects an offline add without reconnect replay (%s signal)',
    async (signal) => {
      const create = vi.fn().mockResolvedValue(item('item-6', 'Butter'));
      const { queryClient } = renderPinned({ createCollectionItem: create });
      if (signal === 'query') onlineManager.setOnline(false);
      else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const input = submitAdd();
      await waitFor(() =>
        expect(input.getAttribute('aria-invalid')).toBe('true'),
      );
      expect(input.value).toBe('Butter');
      expect(create).not.toHaveBeenCalled();
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .some((m) => m.state.isPaused),
      ).toBe(false);
      vi.restoreAllMocks();
      onlineManager.setOnline(true);
      await act(async () => Promise.resolve());
      expect(create).not.toHaveBeenCalled();
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    },
  );

  it('admits only one add while the submitted request is pending', async () => {
    const held = deferred<CollectionItemDetail>();
    const create = vi.fn().mockReturnValue(held.promise);
    const { queryClient } = renderPinned({ createCollectionItem: create });
    const input = submitAdd();
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
    held.resolve(item('item-6', 'Butter'));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it.each(['success', 'failure'] as const)(
    'preserves a newer add draft after the submitted request ends in %s',
    async (outcome) => {
      const held = deferred<CollectionItemDetail>();
      const create = vi.fn().mockReturnValue(held.promise);
      const { queryClient } = renderPinned({ createCollectionItem: create });
      const input = submitAdd();
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      fireEvent.change(input, { target: { value: 'Rice' } });
      const close = screen.getByRole('button', { name: taskSheets.close });
      close.focus();
      await act(async () => {
        if (outcome === 'success') held.resolve(item('item-6', 'Butter'));
        else held.reject(new Error('failed'));
      });
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(input.value).toBe('Rice');
      expect(input.getAttribute('aria-invalid')).toBe('false');
      expect(document.activeElement).toBe(close);
      if (outcome === 'failure')
        expect(screen.getByText(i18n.t('states.unknown.title'))).toBeDefined();
    },
  );

  it.each(['account', 'space'] as const)(
    'does not settle an old add into a new %s task',
    async (scope) => {
      const held = deferred<CollectionItemDetail>();
      const create = vi.fn().mockReturnValue(held.promise);
      const { queryClient, queryFn, key, changeScope } = renderPinned({
        createCollectionItem: create,
      });
      submitAdd();
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      changeScope('account-2', scope === 'space' ? 'space-2' : 'space-1');
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s5.today.pinnedCollection.addAction'),
        }),
      );
      const input = screen.getByLabelText(
        i18n.t('m5s3.collection.itemTitle'),
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Rice' } });
      held.resolve(item('item-6', 'Butter'));
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(input.value).toBe('Rice');
      expect(
        queryClient
          .getQueryData<CollectionDetail>(key)
          ?.items.some((entry) => entry.id === 'item-6'),
      ).toBe(false);
      expect(queryFn).not.toHaveBeenCalled();
    },
  );

  it.each([
    'removed',
    'replacement',
    'unauthorized',
    'permission',
    'notFound',
  ] as const)(
    'leaves a %s detail untouched by a late add response',
    async (change) => {
      const held = deferred<CollectionItemDetail>();
      const create = vi.fn().mockReturnValue(held.promise);
      const { queryClient, queryFn, key } = renderPinned({
        createCollectionItem: create,
      });
      submitAdd();
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      if (change === 'removed' || change === 'replacement') {
        queryClient.removeQueries({ queryKey: key, exact: true });
        if (change === 'replacement')
          queryClient.setQueryData(key, collection());
      } else {
        queryClient
          .getQueryCache()
          .find({ queryKey: key, exact: true })
          ?.setState({
            error: new ClientProblemError(change),
            status: 'error',
          });
      }
      const before = queryClient.getQueryState(key);
      held.resolve(item('item-6', 'Butter'));
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(queryClient.getQueryState(key)).toEqual(before);
      expect(queryFn).not.toHaveBeenCalled();
    },
  );

  it('does not resurrect a created item absent from a newer collection read', async () => {
    const held = deferred<CollectionItemDetail>();
    const create = vi.fn().mockReturnValue(held.promise);
    const { queryClient, queryFn, key } = renderPinned({
      createCollectionItem: create,
    });
    submitAdd();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const newer = { ...collection(), version: 5 };
    queryFn.mockReturnValue(new Promise(() => undefined));
    await act(async () => queryClient.setQueryData(key, newer));
    held.resolve(item('item-6', 'Butter'));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(queryClient.getQueryData(key)).toEqual(newer);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('drops an add whose original task ended before dispatch', async () => {
    const admission = deferred<void>();
    const create = vi.fn();
    const { queryClient, unmount } = renderPinned({
      createCollectionItem: create,
    });
    queryClient.getMutationCache().config.onMutate = () => admission.promise;
    submitAdd();
    unmount();
    admission.resolve();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(create).not.toHaveBeenCalled();
  });

  it('rechecks connectivity at actual add dispatch', async () => {
    const admission = deferred<void>();
    const create = vi.fn();
    const { queryClient } = renderPinned({ createCollectionItem: create });
    queryClient.getMutationCache().config.onMutate = () => admission.promise;
    const input = submitAdd();
    onlineManager.setOnline(false);
    admission.resolve();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(create).not.toHaveBeenCalled();
    expect(input.value).toBe('Butter');
    expect(queryClient.getMutationCache().getAll()[0]?.state.isPaused).toBe(
      false,
    );
  });

  it('settles a dispatched add into its original authorized detail after unmount', async () => {
    const held = deferred<CollectionItemDetail>();
    const create = vi.fn().mockReturnValue(held.promise);
    const { queryClient, key, unmount } = renderPinned({
      createCollectionItem: create,
    });
    submitAdd();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    unmount();
    held.resolve(item('item-6', 'Butter'));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(
      queryClient.getQueryData<CollectionDetail>(key)?.items.at(-1)?.title,
    ).toBe('Butter');
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('keeps a newer created item and completes its task independently of overview lifetime', async () => {
    const held = deferred<CollectionItemDetail>();
    const create = vi.fn().mockReturnValue(held.promise);
    const { queryClient, queryFn, key } = renderPinned({
      createCollectionItem: create,
    });
    const listKey = authorSummaryQueryKeys.collections('space-1');
    queryClient.setQueryData(listKey, []);
    submitAdd();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    queryClient.removeQueries({ queryKey: listKey, exact: true });
    queryClient.setQueryData(listKey, []);
    const newer = {
      ...collection(),
      version: 5,
      items: [
        ...collection().items,
        item('item-6', 'Cultured butter', true, 5, 3),
      ],
    };
    queryFn.mockReturnValue(new Promise(() => undefined));
    await act(async () => queryClient.setQueryData(key, newer));
    held.resolve(item('item-6', 'Butter'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(queryClient.getQueryData(key)).toEqual(newer);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false);
  });

  it('does not cancel a replacement query before admitting an obsolete intent', async () => {
    const update = vi.fn();
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    const admission = deferred<void>();
    queryClient.getMutationCache().config.onMutate = () => admission.promise;
    const cancel = vi.spyOn(queryClient, 'cancelQueries');
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    queryClient.removeQueries({ queryKey: key, exact: true });
    queryClient.setQueryData(key, collection());
    admission.resolve();
    await waitFor(() =>
      expect(queryClient.getMutationCache().getAll()[0]?.state.status).toBe(
        'success',
      ),
    );
    expect(cancel).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(key)).toEqual(collection());
  });

  it.each(['account', 'space'] as const)(
    'isolates pending and queued toggles after a %s change',
    async (scope) => {
      const held = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi.fn().mockReturnValue(held.promise);
      const { queryClient, key, changeScope } = renderPinned({
        updateCollectionItemRaw: update,
      });
      const feedback = vi.spyOn(snackbar, 'postSnackbar');
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(queryClient.isMutating()).toBe(2));
      changeScope('account-2', scope === 'space' ? 'space-2' : 'space-1');
      const previous = queryClient.getQueryData(key);
      await act(async () =>
        held.resolve(
          rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
        ),
      );
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(update).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(key)).toEqual(previous);
      expect(feedback).not.toHaveBeenCalled();
    },
  );

  it.each(['unauthorized', 'permission', 'notFound'] as const)(
    'preserves a newer %s read after a failed toggle',
    async (kind) => {
      const held = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi.fn().mockReturnValue(held.promise);
      const { queryClient, queryFn, key } = renderPinned({
        updateCollectionItemRaw: update,
      });
      const feedback = vi.spyOn(snackbar, 'postSnackbar');
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      await act(async () => {
        queryFn.mockRejectedValue(new ClientProblemError(kind));
        await queryClient.refetchQueries({ queryKey: key, exact: true });
      });
      const previous = queryClient.getQueryState(key);
      queryFn.mockClear();
      await act(async () => held.reject(new Error('write failed')));
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(queryClient.getQueryState(key)).toEqual(previous);
      expect(queryFn).not.toHaveBeenCalled();
      expect(feedback).not.toHaveBeenCalled();
    },
  );

  it('retains an equal-version authorized item instead of a late confirmation', async () => {
    const held = deferred<ReturnType<typeof rawUpdateResponse>>();
    const update = vi.fn().mockReturnValue(held.promise);
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const authoritative = {
      ...collection(),
      items: [item('item-1', 'Read result', false, 4, 2)],
    };
    await act(async () => queryClient.setQueryData(key, authoritative));
    await act(async () =>
      held.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      ),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(queryClient.getQueryData(key)).toEqual(authoritative);
  });

  it('does not apply optimism after cancellation replaces the query', async () => {
    const update = vi.fn().mockReturnValue(new Promise(() => undefined));
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    vi.spyOn(queryClient, 'cancelQueries').mockImplementationOnce(async () => {
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, collection());
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() =>
      expect(queryClient.getMutationCache().getAll()[0]?.state.status).toBe(
        'success',
      ),
    );
    expect(update).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(key)).toEqual(collection());
  });

  it.each(['success', 'failure'] as const)(
    'settles dispatched work but drops a queued intent when Today unmounts (%s)',
    async (outcome) => {
      const held = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi.fn().mockReturnValue(held.promise);
      const { queryClient, key, unmount } = renderPinned({
        updateCollectionItemRaw: update,
      });
      const feedback = vi.spyOn(snackbar, 'postSnackbar');
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(queryClient.isMutating()).toBe(2));
      unmount();
      await act(async () => {
        if (outcome === 'success')
          held.resolve(
            rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
          );
        else held.reject(new Error('write failed'));
      });
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(update).toHaveBeenCalledTimes(1);
      expect(
        queryClient.getQueryData<CollectionDetail>(key)?.items[0],
      ).toMatchObject({
        completed: outcome === 'success',
        version: outcome === 'success' ? 2 : 1,
      });
      expect(feedback).not.toHaveBeenCalled();
    },
  );

  const toggleMilk = () =>
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );

  it.each(['success', 'failure'] as const)(
    'retains concurrent item content and root-owned order after a late %s',
    async (outcome) => {
      const held = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi.fn().mockReturnValue(held.promise);
      const { queryClient, queryFn, key } = renderPinned({
        updateCollectionItemRaw: update,
      });
      toggleMilk();
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      queryFn.mockReturnValue(new Promise(() => undefined));
      const newer = {
        ...collection(),
        version: 4,
        items: [
          { ...item('item-1', 'Oat milk', false, 4, 5) },
          ...collection().items.slice(1),
        ],
      };
      await act(async () => queryClient.setQueryData(key, newer));
      await act(async () => {
        if (outcome === 'success') {
          held.resolve(
            rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
          );
        } else held.reject(new Error('write failed'));
      });
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(queryClient.getQueryData(key)).toEqual(newer);
    },
  );

  it('confirms only the completion fields while preserving a newer collection order', async () => {
    const held = deferred<ReturnType<typeof rawUpdateResponse>>();
    const update = vi.fn().mockReturnValue(held.promise);
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    toggleMilk();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await act(async () =>
      queryClient.setQueryData<CollectionDetail>(key, (current) => ({
        ...(current ?? collection()),
        version: 4,
        items: (current ?? collection()).items.map((entry) =>
          entry.id === 'item-1' ? { ...entry, position: 4 } : entry,
        ),
      })),
    );
    await act(async () =>
      held.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      ),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(
      queryClient.getQueryData<CollectionDetail>(key)?.items[0],
    ).toMatchObject({ position: 4, version: 2, completed: true });
  });

  it.each(['removed', 'replacement', 'denied'] as const)(
    'does not reconcile, refetch or celebrate after its query is %s',
    async (change) => {
      const held = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi.fn().mockReturnValue(held.promise);
      const { queryClient, queryFn, key } = renderPinned({
        updateCollectionItemRaw: update,
      });
      const feedback = vi.spyOn(snackbar, 'postSnackbar');
      toggleMilk();
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      await act(async () => {
        if (change === 'denied') {
          queryFn.mockRejectedValue(new ClientProblemError('permission', 403));
          await queryClient.refetchQueries({ queryKey: key, exact: true });
        } else {
          queryClient.removeQueries({ queryKey: key, exact: true });
          if (change === 'replacement')
            queryClient.setQueryData(key, collection());
        }
      });
      const previous = queryClient.getQueryState(key);
      queryFn.mockClear();
      await act(async () =>
        held.resolve(
          rawUpdateResponse(
            item('item-1', 'Milch', true, 0, 2),
            'collection-completed',
          ),
        ),
      );
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(queryClient.getQueryState(key)).toEqual(previous);
      expect(queryFn).not.toHaveBeenCalled();
      expect(feedback).not.toHaveBeenCalled();
    },
  );

  it('does not dispatch a queued intent into a replacement query', async () => {
    const held = deferred<ReturnType<typeof rawUpdateResponse>>();
    const update = vi.fn().mockReturnValue(held.promise);
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    toggleMilk();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(2));
    await act(async () => {
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, collection());
    });
    await act(async () =>
      held.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      ),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(update).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(key)).toEqual(collection());
  });

  it('keeps a newer confirmed item version for the next deliberate intent', async () => {
    const held = deferred<ReturnType<typeof rawUpdateResponse>>();
    const update = vi
      .fn()
      .mockReturnValueOnce(held.promise)
      .mockReturnValue(new Promise(() => undefined));
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    toggleMilk();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await act(async () =>
      queryClient.setQueryData<CollectionDetail>(key, (current) => ({
        ...(current ?? collection()),
        items: [
          item('item-1', 'Milch', false, 0, 5),
          ...(current ?? collection()).items.slice(1),
        ],
      })),
    );
    await act(async () =>
      held.resolve(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      ),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    toggleMilk();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0]).toMatchObject({
      ifMatch: '5',
      collectionItemUpdate: { completed: true },
    });
  });

  it.each(['query manager', 'browser'])(
    'ends a Today checkbox attempt reported offline by the %s without replay',
    async (source) => {
      const update = vi
        .fn()
        .mockResolvedValue(
          rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
        );
      const { queryClient, key } = renderPinned({
        updateCollectionItemRaw: update,
      });
      const feedback = vi.spyOn(snackbar, 'postSnackbar');
      if (source === 'query manager') onlineManager.setOnline(false);
      else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );

      await waitFor(() =>
        expect(feedback).toHaveBeenCalledWith(
          'm5s5.today.pinnedCollection.toggleFailed',
        ),
      );
      expect(queryClient.isMutating()).toBe(0);
      expect(queryClient.getQueryState(key)?.fetchStatus).toBe('idle');
      expect(update).not.toHaveBeenCalled();
      expect(
        queryClient.getQueryData<CollectionDetail>(key)?.items[0].completed,
      ).toBe(false);
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false');

      vi.restoreAllMocks();
      await act(async () => onlineManager.setOnline(true));
      expect(update).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(
        queryClient.getQueryData<CollectionDetail>(key)?.items[0],
      ).toMatchObject({
        completed: true,
        version: 2,
      });
    },
  );

  it.each(['query manager', 'browser'])(
    'rejects a new offline Today intent from the %s without superseding its online predecessor',
    async (source) => {
      const first = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(
          rawUpdateResponse(item('item-1', 'Milch', false, 0, 3), null),
        );
      const { queryClient, key } = renderPinned({
        updateCollectionItemRaw: update,
      });
      const feedback = vi.spyOn(snackbar, 'postSnackbar');
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      if (source === 'query manager') onlineManager.setOnline(false);
      else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      );
      await waitFor(() =>
        expect(feedback).toHaveBeenCalledWith(
          'm5s5.today.pinnedCollection.toggleFailed',
        ),
      );
      expect(queryClient.isMutating()).toBe(1);
      expect(
        queryClient.getQueryData<CollectionDetail>(key)?.items[0].completed,
      ).toBe(true);

      vi.restoreAllMocks();
      await act(async () => onlineManager.setOnline(true));
      await act(async () => {
        first.resolve(
          rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
        );
        await first.promise;
      });
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(update).toHaveBeenCalledTimes(1);
      expect(
        queryClient.getQueryData<CollectionDetail>(key)?.items[0],
      ).toMatchObject({
        completed: true,
        version: 2,
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(update.mock.calls[1][0]).toMatchObject({
        ifMatch: '2',
        collectionItemUpdate: { completed: false },
      });
    },
  );

  it.each(['query manager', 'browser'])(
    'rechecks the %s at dispatch when an earlier Today checkbox write was held',
    async (source) => {
      const first = deferred<ReturnType<typeof rawUpdateResponse>>();
      const update = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(
          rawUpdateResponse(item('item-1', 'Milch', false, 0, 3), null),
        );
      const { queryClient, queryFn, key } = renderPinned({
        updateCollectionItemRaw: update,
      });

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(queryClient.isMutating()).toBe(2));
      if (source === 'query manager') onlineManager.setOnline(false);
      else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      await act(async () => {
        first.resolve(
          rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
        );
        await first.promise;
      });
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(update).toHaveBeenCalledTimes(1);
      expect(
        queryClient.getQueryData<CollectionDetail>(key)?.items[0],
      ).toMatchObject({
        completed: true,
        version: 2,
      });
      expect(queryClient.getQueryState(key)?.fetchStatus).toBe('idle');
      queryFn.mockResolvedValue({
        ...collection(),
        items: [
          item('item-1', 'Milch', true, 0, 2),
          ...collection().items.slice(1),
        ],
      });

      vi.restoreAllMocks();
      await act(async () => onlineManager.setOnline(true));
      expect(update).toHaveBeenCalledTimes(1);
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(update.mock.calls[1][0]).toMatchObject({
        ifMatch: '2',
        collectionItemUpdate: { completed: false },
      });
    },
  );

  it('ends a queued Today checkbox attempt after its predecessor fails offline', async () => {
    const first = deferred<ReturnType<typeof rawUpdateResponse>>();
    const update = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(
        rawUpdateResponse(item('item-1', 'Milch', true, 0, 2), null),
      );
    const { queryClient, key } = renderPinned({
      updateCollectionItemRaw: update,
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(2));
    onlineManager.setOnline(false);
    await act(async () => {
      first.reject(new Error('connection lost'));
      await first.promise.catch(() => undefined);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryData<CollectionDetail>(key)?.items[0],
    ).toMatchObject({
      completed: false,
      version: 1,
    });
    expect(queryClient.getQueryState(key)?.fetchStatus).toBe('idle');
    await act(async () => onlineManager.setOnline(true));
    expect(update).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0]).toMatchObject({
      ifMatch: '1',
      collectionItemUpdate: { completed: true },
    });
  });

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
    await waitFor(() =>
      expect(updateCollectionItemRaw).toHaveBeenCalledTimes(1),
    );

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

    await waitFor(() =>
      expect(updateCollectionItemRaw).toHaveBeenCalledTimes(1),
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

  it('lets different items update independently while completed rows leave the compact slice immediately', async () => {
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

    await waitFor(() =>
      expect(updateCollectionItemRaw).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markOpen', { title: 'Milch' }),
      }),
    ).toBeDefined();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Äpfel' }),
        }),
      ).toBeNull(),
    );
    expect(screen.getByText('Brot')).toBeDefined();

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

  it('opens the add task from the plus, saves locally, then reconciles the canonical Collection detail', async () => {
    const request = deferred<CollectionItemDetail>();
    const createCollectionItem = vi.fn().mockReturnValue(request.promise);
    const { queryClient, queryFn, key } = renderPinned({
      createCollectionItem,
    });
    const refreshed = collection();
    refreshed.version = 4;
    refreshed.items = [
      ...refreshed.items,
      item('item-6', 'Butter', false, 5, 1),
    ];
    queryFn.mockResolvedValue(refreshed);
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
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData<CollectionDetail>(key)?.version).toBe(4);
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
