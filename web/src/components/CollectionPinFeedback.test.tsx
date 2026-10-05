// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import type { DashboardModulePreferenceView } from '../api/generated/models/DashboardModulePreferenceView';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import de from '../i18n/locales/de';
import m5s3 from '../i18n/locales/m5s3';
import { CollectionProductPage } from './CollectionProductPage';

afterEach(cleanup);
const accountId = 'account-1';
const spaceId = 'space-1';
const collectionId = 'list-1';
const key = dashboardPreferencesQueryKey(accountId, spaceId);
const preference = (
  selectedCollectionId?: string,
  visible = false,
): DashboardModulePreferenceView => ({
  moduleKey: 'pinned_collection',
  selectedCollectionId,
  visible,
});
const initial = (): DashboardModulePreferenceList => ({
  items: [
    { moduleKey: 'upcoming', visible: true, itemLimit: 1 },
    preference('old-list'),
    { moduleKey: 'keepsake', visible: true },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function setup(start = initial()) {
  let current = start;
  const writes: ReturnType<typeof deferred<DashboardModulePreferenceView>>[] =
    [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(key, current);
  const get = vi.fn(async () => current);
  const update = vi.fn(
    (
      _request: Parameters<DashboardApi['updateDashboardModulePreference']>[0],
    ) => {
      const write = deferred<DashboardModulePreferenceView>();
      writes.push(write);
      return write.promise;
    },
  );
  const dashboardApi = {
    listDashboardModulePreferences: get,
    updateDashboardModulePreference: update,
  } as unknown as DashboardApi;
  const apis = {
    collections: {
      getCollection: vi.fn(async () => ({
        id: collectionId,
        spaceId,
        title: 'Travel preparations',
        items: [],
        version: 1,
        capabilities: { canEdit: true, canDelete: true, canComment: false },
      })),
    },
  } as unknown as SharedPlanningApis;
  const tree = (owner = accountId, space = spaceId) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/collections/${collectionId}`]}>
        <Routes>
          <Route
            path="/plan/collections/:collectionId"
            element={
              <CollectionProductPage
                apis={apis}
                dashboardApi={dashboardApi}
                accountId={owner}
                spaceId={space}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    queryClient,
    writes,
    get,
    update,
    view,
    tree,
    current: () => current,
    replace: (next: DashboardModulePreferenceList) => {
      current = next;
    },
    confirm: async (row: DashboardModulePreferenceView, index = 0) => {
      current = {
        items: current.items.map((item) =>
          item.moduleKey === row.moduleKey ? row : item,
        ),
      };
      await act(async () => writes[index].resolve(row));
    },
  };
}

function pinButton() {
  return screen.getByRole('button', { name: m5s3.collection.pinToToday });
}
function unpinButton() {
  return screen.getByRole('button', { name: m5s3.collection.unpinFromToday });
}
function cached(harness: ReturnType<typeof setup>, queryKey = key) {
  return harness.queryClient.getQueryData<DashboardModulePreferenceList>(
    queryKey,
  );
}

it('selects immediately, announces pending, blocks rapid duplicates, then removes with a fresh explicit toggle', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  const button = pinButton();
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(unpinButton().getAttribute('aria-pressed')).toBe('true');
  expect(button.hasAttribute('disabled')).toBe(true);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe(de.common.saving);
  expect(button.getAttribute('aria-describedby')).toBe(status.id);
  expect(cached(h)?.items[1]).toEqual(preference(collectionId, true));
  expect(cached(h)?.items[0]).toEqual(initial().items[0]);
  expect(h.update.mock.calls[0][0]).toMatchObject({
    spaceId,
    dashboardModulePreferenceUpdate: {
      selectedCollectionId: collectionId,
      visible: true,
    },
  });
  await h.confirm(preference(collectionId, true));
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(button);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(pinButton().getAttribute('aria-pressed')).toBe('false');
  expect(cached(h)?.items[1]).toEqual(preference(undefined, true));
  expect(h.update.mock.calls[1][0].dashboardModulePreferenceUpdate).toEqual({
    selectedCollectionId: null,
    visible: undefined,
  });
  await h.confirm(preference(undefined, true), 1);
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
});

it('keeps the submitted selection through background reads and preserves replacement rows on failure', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  fireEvent.click(pinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const newer = {
    items: [
      { moduleKey: 'keepsake', visible: false },
      preference('newer-list', false),
      { moduleKey: 'upcoming', visible: true, itemLimit: 3 as const },
    ],
  };
  h.replace(newer);
  await act(async () =>
    h.queryClient.invalidateQueries({ queryKey: key, exact: true }),
  );
  expect(unpinButton().getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('status')).toBeDefined();
  const read = deferred<DashboardModulePreferenceList>();
  h.get.mockImplementation(() => read.promise);
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('server', 500)),
  );
  await waitFor(() => expect(cached(h)).toEqual(newer));
  expect(pinButton().getAttribute('aria-pressed')).toBe('false');
  await act(async () => read.resolve(newer));
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  expect(h.update).toHaveBeenCalledTimes(1);
});

it('rolls back its selection and visibility while retaining unrelated module changes and order', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  fireEvent.click(pinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const optimistic = cached(h);
  if (!optimistic) throw new Error('Missing optimistic preferences');
  const reordered = {
    items: [
      optimistic.items[2],
      optimistic.items[1],
      { ...optimistic.items[0], itemLimit: 3 as const },
    ],
  };
  await act(async () => h.queryClient.setQueryData(key, reordered));
  const read = deferred<DashboardModulePreferenceList>();
  h.get.mockImplementation(() => read.promise);
  await act(async () => h.writes[0].reject(new ClientProblemError('offline')));
  await waitFor(() => expect(cached(h)?.items[1]).toEqual(initial().items[1]));
  expect(cached(h)?.items.map((item) => item.moduleKey)).toEqual([
    'keepsake',
    'pinned_collection',
    'upcoming',
  ]);
  expect(cached(h)?.items[2].itemLimit).toBe(3);
  const recovered = cached(h);
  if (!recovered) throw new Error('Missing recovered preferences');
  await act(async () => read.resolve(recovered));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: de.common.retry })).toBeDefined(),
  );
  fireEvent.click(screen.getByRole('button', { name: de.common.retry }));
  await waitFor(() => expect(h.get.mock.calls.length).toBe(2));
  expect(h.update).toHaveBeenCalledTimes(1);
});

it('preserves hidden visibility when removing an already selected list', async () => {
  const h = setup({ items: [preference(collectionId, false)] });
  await waitFor(() =>
    expect(unpinButton().hasAttribute('disabled')).toBe(false),
  );
  fireEvent.click(unpinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(cached(h)?.items[0]).toEqual(preference(undefined, false));
  await h.confirm(preference(undefined, false));
  expect(cached(h)?.items[0].visible).toBe(false);
});

it('reads current preferences after conflict or failed recovery and never replays the write', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  fireEvent.click(pinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  h.replace({ items: [preference(collectionId, true)] });
  h.get.mockRejectedValue(new ClientProblemError('offline'));
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('conflict', 409)),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: de.common.retry })).toBeDefined(),
  );
  expect(pinButton().hasAttribute('disabled')).toBe(true);
  h.get.mockImplementation(async () => h.current());
  fireEvent.click(screen.getByRole('button', { name: de.common.retry }));
  await waitFor(() =>
    expect(unpinButton().hasAttribute('disabled')).toBe(false),
  );
  expect(h.update).toHaveBeenCalledTimes(1);
  fireEvent.click(unpinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(
    h.update.mock.calls[1][0].dashboardModulePreferenceUpdate
      .selectedCollectionId,
  ).toBeNull();
  await h.confirm(preference(undefined, true), 1);
});

it.each(['success', 'failure'])(
  'does not recreate removed preferences on late %s',
  async (outcome) => {
    const h = setup();
    await waitFor(() =>
      expect(pinButton().hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(pinButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    h.view.unmount();
    h.queryClient.removeQueries({ queryKey: key, exact: true });
    await act(async () =>
      outcome === 'success'
        ? h.writes[0].resolve(preference(collectionId, true))
        : h.writes[0].reject(new ClientProblemError('server', 500)),
    );
    expect(cached(h)).toBeUndefined();
    expect(h.get).not.toHaveBeenCalled();
  },
);

it('does not mutate a replacement query at the same key on late success', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  fireEvent.click(pinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  h.view.unmount();
  h.queryClient.removeQueries({ queryKey: key, exact: true });
  const replacement = { items: [preference('replacement-list', false)] };
  h.queryClient.setQueryData(key, replacement);
  await act(async () => h.writes[0].resolve(preference(collectionId, true)));
  expect(cached(h)).toEqual(replacement);
  expect(h.get).not.toHaveBeenCalled();
});

it.each(['account', 'space'])(
  'keeps late reconciliation in the initiating scope after a %s switch',
  async (dimension) => {
    const h = setup();
    await waitFor(() =>
      expect(pinButton().hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(pinButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const owner = dimension === 'account' ? 'account-2' : accountId;
    const space = dimension === 'space' ? 'space-2' : spaceId;
    const otherKey = dashboardPreferencesQueryKey(owner, space);
    const other = { items: [preference('other-list', false)] };
    h.queryClient.setQueryData(otherKey, other);
    h.view.rerender(h.tree(owner, space));
    await waitFor(() =>
      expect(pinButton().getAttribute('aria-pressed')).toBe('false'),
    );
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => h.writes[0].resolve(preference(collectionId, true)));
    expect(cached(h, otherKey)).toEqual(other);
    expect(cached(h)?.items[1]).toEqual(preference(collectionId, true));
    expect(h.get).not.toHaveBeenCalled();
  },
);

it('prevents a second write after detail remount while the initiating mutation is pending', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  fireEvent.click(pinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  h.view.unmount();
  const nextView = render(h.tree());
  expect(unpinButton().hasAttribute('disabled')).toBe(true);
  fireEvent.click(unpinButton());
  expect(h.update).toHaveBeenCalledTimes(1);
  await h.confirm(preference(collectionId, true));
  await waitFor(() =>
    expect(unpinButton().hasAttribute('disabled')).toBe(false),
  );
  nextView.unmount();
});

it('blocks denied preference reads and removes the invalid selected state', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  h.get.mockRejectedValue(new ClientProblemError('permission', 403));
  await act(async () =>
    h.queryClient.resetQueries({ queryKey: key, exact: true }),
  );
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(true));
  fireEvent.click(pinButton());
  expect(h.update).not.toHaveBeenCalled();
  expect(screen.getByText(de.states.permission.title)).toBeDefined();
  expect(pinButton().getAttribute('aria-pressed')).toBe('false');
});

it('preserves a newer authoritative row when an older pin response arrives before recovery finishes', async () => {
  const h = setup();
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  fireEvent.click(pinButton());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const newer = {
    items: [
      preference('newer-list', false),
      { moduleKey: 'upcoming', visible: false, itemLimit: 3 as const },
    ],
  };
  await act(async () => h.queryClient.setQueryData(key, newer));
  const read = deferred<DashboardModulePreferenceList>();
  h.get.mockImplementation(() => read.promise);
  await act(async () => h.writes[0].resolve(preference(collectionId, true)));
  expect(cached(h)).toEqual(newer);
  expect(pinButton().getAttribute('aria-pressed')).toBe('false');
  expect(pinButton().hasAttribute('disabled')).toBe(true);
  await act(async () => read.resolve(newer));
  await waitFor(() => expect(pinButton().hasAttribute('disabled')).toBe(false));
  expect(cached(h)).toEqual(newer);
});
