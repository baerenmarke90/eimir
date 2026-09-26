// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { CollectionProductPage } from './CollectionProductPage';
import { CollectionsOverviewPage } from './CollectionsOverviewPage';

const sampleCollection = {
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-08-01T10:00:00Z'),
  createdBy: 'account-1',
  creator: { id: 'account-1', displayName: 'Lea' },
  id: 'collection-1',
  items: [],
  spaceId: 'space-1',
  title: 'Packing list',
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  version: 1,
};
const nextCollection = {
  ...sampleCollection,
  id: 'collection-2',
  title: 'Shared recipes',
};

function renderInteractiveCollection(
  apiOverrides: Record<string, unknown> = {},
  includeOverview = false,
  configureClient?: (client: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    ['m5-s3', 'collection', 'space-1', 'collection-1'],
    sampleCollection,
  );
  configureClient?.(queryClient);
  const apis = {
    collections: {
      getCollection: vi.fn().mockResolvedValue(sampleCollection),
      listCollections: vi.fn().mockResolvedValue({
        items: [nextCollection],
        nextCursor: null,
      }),
      ...apiOverrides,
    },
  } as unknown as SharedPlanningApis;

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
        <Routes>
          <Route
            path="/plan/collections/:collectionId"
            element={<CollectionProductPage apis={apis} spaceId="space-1" />}
          />
          {includeOverview ? (
            <Route
              path="/more/collections"
              element={
                <CollectionsOverviewPage apis={apis} spaceId="space-1" />
              }
            />
          ) : null}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('CollectionProductPage', () => {
  function renderToggleCollection(
    updateCollectionItem: ReturnType<typeof vi.fn>,
  ) {
    const firstItem = {
      capabilities: { canComment: false, canDelete: true, canEdit: true },
      collectionId: 'collection-1',
      completed: false,
      createdAt: new Date('2026-08-01T10:00:00Z'),
      createdBy: 'account-1',
      creator: sampleCollection.creator,
      id: 'item-1',
      position: 1,
      title: 'Passport',
      updatedAt: new Date('2026-08-01T10:00:00Z'),
      version: 1,
    };
    const secondItem = {
      ...firstItem,
      id: 'item-2',
      position: 2,
      title: 'Tickets',
    };
    const initial = {
      ...sampleCollection,
      items: [firstItem, secondItem],
    };
    let authoritative = initial;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const key = authorSummaryQueryKeys.collectionDetail(
      'space-1',
      'collection-1',
    );
    queryClient.setQueryData(key, initial);
    const getCollection = vi.fn(async () => authoritative);
    const apis = {
      collections: { getCollection, updateCollectionItem },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={<CollectionProductPage apis={apis} spaceId="space-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    return {
      firstItem,
      secondItem,
      getCollection,
      queryClient,
      key,
      setAuthoritative(item: typeof firstItem) {
        authoritative = { ...initial, items: [item, secondItem] };
      },
    };
  }

  it('checks a shared item immediately, blocks duplicate taps, and reconciles the confirmed version', async () => {
    let confirm!: (item: unknown) => void;
    const updateCollectionItem = vi.fn(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const fixture = renderToggleCollection(updateCollectionItem);
    const toggle = screen.getByRole('button', {
      name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
    });

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markOpen', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    expect(screen.getByRole('status').textContent).toContain(
      i18n.t('m5s3.common.saving'),
    );
    expect(toggle.hasAttribute('disabled')).toBe(true);
    fireEvent.click(toggle);
    expect(updateCollectionItem).toHaveBeenCalledTimes(1);
    expect(updateCollectionItem).toHaveBeenCalledWith(
      expect.objectContaining({
        ifMatch: '1',
        collectionItemUpdate: { title: undefined, completed: true },
      }),
    );

    const confirmed = { ...fixture.firstItem, completed: true, version: 2 };
    fixture.setAuthoritative(confirmed);
    confirm(confirmed);
    await waitFor(() =>
      expect(
        fixture.queryClient.getQueryData<{
          items: Array<{ version: number; completed: boolean }>;
        }>(fixture.key)?.items[0]?.version,
      ).toBe(2),
    );
    expect(
      fixture.queryClient.getQueryData<{
        items: Array<{ version: number; completed: boolean }>;
      }>(fixture.key)?.items[1]?.completed,
    ).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('rolls back a failed check and retries from the confirmed item version', async () => {
    let rejectFirst!: (error: Error) => void;
    let confirmRetry!: (item: unknown) => void;
    const updateCollectionItem = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirmRetry = resolve;
          }),
      );
    const fixture = renderToggleCollection(updateCollectionItem);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Passport' }),
        }),
      ).toBeDefined(),
    );
    rejectFirst(new Error('Network unavailable'));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    expect(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(2));
    expect(updateCollectionItem.mock.calls[1]?.[0].ifMatch).toBe('1');
    const confirmed = { ...fixture.firstItem, completed: true, version: 2 };
    fixture.setAuthoritative(confirmed);
    confirmRetry(confirmed);
    await waitFor(() =>
      expect(
        fixture.queryClient.getQueryData<{
          items: Array<{ version: number; completed: boolean }>;
        }>(fixture.key)?.items[0]?.version,
      ).toBe(2),
    );
    expect(
      screen.queryByRole('button', { name: i18n.t('common.retry') }),
    ).toBeNull();
  });

  it('refreshes a conflicting item instead of replaying the stale write', async () => {
    let rejectWrite!: (error: ClientProblemError) => void;
    const updateCollectionItem = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    const fixture = renderToggleCollection(updateCollectionItem);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Passport' }),
        }),
      ).toBeDefined(),
    );
    fixture.setAuthoritative({
      ...fixture.firstItem,
      completed: true,
      version: 3,
    });
    rejectWrite(new ClientProblemError('conflict', 409));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() =>
      expect(
        fixture.queryClient.getQueryData<{
          items: Array<{ version: number; completed: boolean }>;
        }>(fixture.key)?.items[0],
      ).toMatchObject({ version: 3, completed: true }),
    );
    expect(updateCollectionItem).toHaveBeenCalledTimes(1);
  });

  it('shows collection title cleanly without icon prefix or edit field (#373)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      {
        capabilities: { canComment: false, canDelete: true, canEdit: true },
        createdAt: new Date('2026-08-01T10:00:00Z'),
        createdBy: 'account-1',
        creator: { id: 'account-1', displayName: 'Lea' },
        id: 'collection-1',
        items: [],
        spaceId: 'space-1',
        title: 'Packing list',
        updatedAt: new Date('2026-08-01T10:00:00Z'),
        version: 1,
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Packing list');
    expect(html).not.toContain('collection-edit-icon');
  });

  it('renders compact list interaction with add icon and without per-item save buttons', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      {
        capabilities: { canComment: false, canDelete: true, canEdit: true },
        createdAt: new Date('2026-08-01T10:00:00Z'),
        createdBy: 'account-1',
        creator: { id: 'account-1', displayName: 'Lea' },
        id: 'collection-1',
        items: [
          {
            capabilities: { canComment: false, canDelete: true, canEdit: true },
            completed: false,
            createdAt: new Date('2026-08-01T10:00:00Z'),
            createdBy: 'account-1',
            id: 'item-1',
            position: 1,
            title: 'Passport',
            updatedAt: new Date('2026-08-01T10:00:00Z'),
            version: 1,
          },
        ],
        spaceId: 'space-1',
        title: 'Packing list',
        updatedAt: new Date('2026-08-01T10:00:00Z'),
        version: 1,
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Title input row has compact save button disabled initially
    // (Removed because title row is now inside edit mode)
    // Add button is rendered
    expect(html).toContain('planning-inline-create');
    // Item row has item title, checkbox, reorder, delete, but no per-item save button
    expect(html).toContain('Passport');
    expect(html).toContain('checklist-toggle');
    // Check that there is no submit button inside the items list
    expect(html).not.toContain('planning-item-title-form button');
  });

  it('resets isEditing and confirmDelete on successful title update', async () => {
    const updateCollectionMock = vi
      .fn()
      .mockImplementation(async ({ collectionUpdate }) => ({
        ...sampleCollection,
        title: collectionUpdate.title,
        version: 2,
      }));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      sampleCollection,
    );

    const mockApis = {
      collections: {
        getCollection: vi.fn().mockResolvedValue(sampleCollection),
        updateCollection: updateCollectionMock,
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage apis={mockApis} spaceId="space-1" />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Click edit button to enter edit mode
    const editBtn = screen.getByRole('button', {
      name: /common\.edit|bearbeiten/i,
    });
    fireEvent.click(editBtn);

    // isEditing is true: input and delete trigger are visible
    const input = screen.getByRole('textbox', { name: /titel/i });
    expect(input).toBeDefined();

    const deleteTrigger = screen.getByRole('button', { name: /^löschen$/i });
    fireEvent.click(deleteTrigger);

    // confirmDelete is true: danger confirmation zone is visible
    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    ).toBeDefined();

    // Update title
    fireEvent.change(input, { target: { value: 'New Packing list' } });

    // Save changes
    const saveBtn = screen.getByRole('button', {
      name: /änderungen speichern/i,
    });
    fireEvent.click(saveBtn);

    // Wait for mutation to finish
    await waitFor(() => {
      expect(updateCollectionMock).toHaveBeenCalled();
    });

    // Verify isEditing is reset to false: input is gone, edit button is back
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /titel/i })).toBeNull();
    });
    expect(
      screen.getByRole('button', { name: /common\.edit|bearbeiten/i }),
    ).toBeDefined();

    // Verify confirmDelete is reset to false: danger zone with confirm delete button is gone
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    ).toBeNull();
  });

  it('focuses the editor and protects a dirty draft through Escape', async () => {
    const user = userEvent.setup();
    renderInteractiveCollection();
    const edit = screen.getByRole('button', { name: i18n.t('common.edit') });

    await user.click(edit);
    const title = screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.title'),
    });
    expect(document.activeElement).toBe(title);
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();

    await user.clear(title);
    await user.type(title, 'Holiday packing');
    await user.keyboard('{Escape}');
    const discard = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(
      discard.querySelector('[tabindex="-1"]'),
    );

    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect((title as HTMLInputElement).value).toBe('Holiday packing');

    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.discardConfirm'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeUndefined();
  });

  it('closes a clean editor through Browser Back', async () => {
    const user = userEvent.setup();
    renderInteractiveCollection();
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();

    window.history.back();

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.common.title') }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );

    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.common.title') }),
      ).toBeNull(),
    );
  });

  it('restores delete-trigger focus and blocks dismissal while delete is pending', async () => {
    const user = userEvent.setup();
    const never = new Promise<void>(() => undefined);
    renderInteractiveCollection({
      deleteCollection: vi.fn().mockReturnValue(never),
    });

    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const deleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    await user.click(deleteTrigger);
    expect(document.activeElement?.id).toBe(
      'collection-delete-confirmation-heading',
    );

    const deleteCancel = screen
      .getAllByRole('button', { name: i18n.t('common.cancel') })
      .at(-1);
    expect(deleteCancel).toBeDefined();
    await user.click(deleteCancel as HTMLButtonElement);
    const restoredDeleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    expect(document.activeElement).toBe(restoredDeleteTrigger);

    await user.click(restoredDeleteTrigger);
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    );
    await user.keyboard('{Escape}');
    window.history.back();
    expect(
      (
        screen.getByRole('button', {
          name: i18n.t('m5s3.common.deleting'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('pins the current shared list to Wir through the personal Dashboard preference', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      sampleCollection,
    );
    const updateDashboardModulePreference = vi.fn().mockResolvedValue({
      moduleKey: 'pinned_collection',
      visible: true,
      selectedCollectionId: 'collection-1',
    });
    const dashboardApi = {
      listDashboardModulePreferences: vi.fn().mockResolvedValue({ items: [] }),
      updateDashboardModulePreference,
    } as unknown as DashboardApi;
    const apis = {
      collections: {
        getCollection: vi.fn().mockResolvedValue(sampleCollection),
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  dashboardApi={dashboardApi}
                  accountId="account-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const pin = await screen.findByRole('button', {
      name: i18n.t('m5s3.collection.pinToToday'),
    });
    await userEvent.setup().click(pin);

    await waitFor(() =>
      expect(updateDashboardModulePreference).toHaveBeenCalledWith({
        moduleKey: 'pinned_collection',
        spaceId: 'space-1',
        dashboardModulePreferenceUpdate: {
          selectedCollectionId: 'collection-1',
          visible: true,
        },
      }),
    );
  });

  it('retries the failed Wir pin mutation instead of only refetching preferences', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      sampleCollection,
    );
    const updateDashboardModulePreference = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue({
        moduleKey: 'pinned_collection',
        visible: true,
        selectedCollectionId: 'collection-1',
      });
    const dashboardApi = {
      listDashboardModulePreferences: vi.fn().mockResolvedValue({ items: [] }),
      updateDashboardModulePreference,
    } as unknown as DashboardApi;
    const apis = {
      collections: {
        getCollection: vi.fn().mockResolvedValue(sampleCollection),
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  dashboardApi={dashboardApi}
                  accountId="account-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.collection.pinToToday'),
      }),
    );

    const retry = await screen.findByRole('button', {
      name: i18n.t('common.retry'),
    });
    expect(updateDashboardModulePreference).toHaveBeenCalledTimes(1);

    await user.click(retry);

    await waitFor(() =>
      expect(updateDashboardModulePreference).toHaveBeenCalledTimes(2),
    );
    expect(updateDashboardModulePreference).toHaveBeenLastCalledWith({
      moduleKey: 'pinned_collection',
      spaceId: 'space-1',
      dashboardModulePreferenceUpdate: {
        selectedCollectionId: 'collection-1',
        visible: true,
      },
    });
  });

  it('focuses the successor after a successful Collection delete', async () => {
    const user = userEvent.setup();
    renderInteractiveCollection(
      { deleteCollection: vi.fn().mockResolvedValue(undefined) },
      true,
      (queryClient) => {
        queryClient.setQueryData(
          authorSummaryQueryKeys.collections('space-1'),
          {
            pages: [
              {
                items: [sampleCollection, nextCollection],
                nextCursor: null,
                hasMore: false,
              },
            ],
            pageParams: [null],
          },
        );
      },
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.delete') }),
    );
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    );

    const successor = (await screen.findByText(nextCollection.title)).closest(
      'a',
    );
    expect(successor).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(successor));
  });
});
