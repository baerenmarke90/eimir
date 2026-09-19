// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import { privateAreaQueryKeys } from '../client/privateArea';
import { i18n } from '../i18n';
import de from '../i18n/locales/de';
import privateArea from '../i18n/locales/privateArea';
import {
  PrivateCollectionDetailPage,
  PrivateCollectionEditPage,
  PrivateCollectionsListPage,
} from './PrivateCollectionsPage';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';
const COLLECTION_ID = 'collection-1';

function collection() {
  return {
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    id: COLLECTION_ID,
    items: [],
    ownerId: ACCOUNT_ID,
    spaceId: SPACE_ID,
    title: 'Packing list',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 1,
  };
}

describe('PrivateCollectionsPage', () => {
  it('shows the title cleanly in the list (#373)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.collections(ACCOUNT_ID, SPACE_ID),
      {
        pages: [{ items: [collection()], nextCursor: null }],
        pageParams: [null],
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PrivateCollectionsListPage
            api={{} as PrivateAreaApi}
            accountId={ACCOUNT_ID}
            spaceId={SPACE_ID}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Packing list');
    // #616: entire card is the primary navigation link without redundant edit button
    expect(html).toContain('private-area-card-clickable');
    expect(html).toContain(`/more/private/collections/${COLLECTION_ID}`);
    expect(html).not.toContain('button-link secondary-link');
  });

  it('does not offer an icon field when editing (#373)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.collection(ACCOUNT_ID, SPACE_ID, COLLECTION_ID),
      collection(),
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/private/collections/${COLLECTION_ID}/edit`]}
        >
          <Routes>
            <Route
              path="/private/collections/:collectionId/edit"
              element={
                <PrivateCollectionEditPage
                  api={{} as PrivateAreaApi}
                  accountId={ACCOUNT_ID}
                  spaceId={SPACE_ID}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).not.toContain('private-collection-icon');
  });

  it('renders private collection items read-first until edit is requested', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.collection(ACCOUNT_ID, SPACE_ID, COLLECTION_ID),
      {
        ...collection(),
        items: [
          {
            id: 'item-1',
            title: 'Order photo album',
            completed: false,
            position: 0,
            version: 1,
          },
          {
            id: 'item-2',
            title: 'Book train tickets',
            completed: true,
            position: 1,
            version: 1,
          },
        ],
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/private/collections/${COLLECTION_ID}`]}
        >
          <Routes>
            <Route
              path="/private/collections/:collectionId"
              element={
                <PrivateCollectionDetailPage
                  api={{} as PrivateAreaApi}
                  accountId={ACCOUNT_ID}
                  spaceId={SPACE_ID}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('planning-collection-items');
    expect(html).toContain('planning-check');
    expect(html).toContain('private-collection-item-title');
    expect(html).toContain('Order photo album');
    expect(html).toContain('Book train tickets');

    // Reading/checking is primary; management chrome stays behind Edit.
    expect(html).not.toContain('planning-inline-create');
    expect(html).not.toContain('private-checklist-title-input');
    expect(html).not.toContain(privateArea.collections.reorderItem);
    expect(html).not.toContain(privateArea.collections.removeItem);
    expect(html).not.toContain('private-checklist-checkbox');
    expect(html).not.toContain('private-area-badge');
  });

  it('discloses collection management controls only in edit mode', () => {
    const sampleCollection = {
      ...collection(),
      items: [
        {
          id: 'item-1',
          title: 'Order photo album',
          completed: false,
          position: 0,
          version: 1,
        },
      ],
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.collection(ACCOUNT_ID, SPACE_ID, COLLECTION_ID),
      sampleCollection,
    );

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/private/collections/${COLLECTION_ID}`]}
        >
          <Routes>
            <Route
              path="/private/collections/:collectionId"
              element={
                <PrivateCollectionDetailPage
                  api={{} as PrivateAreaApi}
                  accountId={ACCOUNT_ID}
                  spaceId={SPACE_ID}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.queryByPlaceholderText(privateArea.collections.itemTitleLabel),
    ).toBeNull();
    expect(
      screen.queryByLabelText(privateArea.collections.rename),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: de.common.edit }));

    expect(
      screen.getByPlaceholderText(privateArea.collections.itemTitleLabel),
    ).toBeDefined();
    expect(
      screen.getByLabelText(privateArea.collections.rename),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: privateArea.collections.reorderItem }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: privateArea.collections.removeItem }),
    ).toBeDefined();
  });

  it('resets isEditing and confirmDelete on successful title update', async () => {
    const sampleCollection = collection();

    const updatePrivateCollectionMock = vi
      .fn()
      .mockImplementation(async ({ privateCollectionUpdate }) => ({
        ...sampleCollection,
        title: privateCollectionUpdate.title,
        version: 2,
      }));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.collection(ACCOUNT_ID, SPACE_ID, COLLECTION_ID),
      sampleCollection,
    );

    const mockApi = {
      getPrivateCollection: vi.fn().mockResolvedValue(sampleCollection),
      updatePrivateCollection: updatePrivateCollectionMock,
    } as unknown as PrivateAreaApi;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/private/collections/${COLLECTION_ID}`]}
        >
          <Routes>
            <Route
              path="/private/collections/:collectionId"
              element={
                <PrivateCollectionDetailPage
                  api={mockApi}
                  accountId={ACCOUNT_ID}
                  spaceId={SPACE_ID}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const editBtn = screen.getByRole('button', { name: de.common.edit });
    fireEvent.click(editBtn);

    const input = screen.getByRole('textbox', {
      name: /titel|privatearea\.collections\.titlelabel/i,
    });
    expect(input).toBeDefined();

    const deleteTrigger = screen.getByRole('button', { name: /^löschen$/i });
    fireEvent.click(deleteTrigger);

    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    ).toBeDefined();

    fireEvent.change(input, { target: { value: 'New Private Packing list' } });

    const saveBtn = screen.getByRole('button', {
      name: /änderungen speichern/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updatePrivateCollectionMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', {
          name: /titel|privatearea\.collections\.titlelabel/i,
        }),
      ).toBeNull();
    });
    expect(screen.getByRole('button', { name: de.common.edit })).toBeDefined();

    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    ).toBeNull();
  });

  it('uses translated saving copy while a title update is pending', async () => {
    const sampleCollection = collection();
    let resolveUpdate:
      | ((value: ReturnType<typeof collection>) => void)
      | undefined;
    const updatePrivateCollectionMock = vi.fn().mockImplementation(
      () =>
        new Promise<ReturnType<typeof collection>>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.collection(ACCOUNT_ID, SPACE_ID, COLLECTION_ID),
      sampleCollection,
    );

    const mockApi = {
      getPrivateCollection: vi.fn().mockResolvedValue(sampleCollection),
      updatePrivateCollection: updatePrivateCollectionMock,
    } as unknown as PrivateAreaApi;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/private/collections/${COLLECTION_ID}`]}
        >
          <Routes>
            <Route
              path="/private/collections/:collectionId"
              element={
                <PrivateCollectionDetailPage
                  api={mockApi}
                  accountId={ACCOUNT_ID}
                  spaceId={SPACE_ID}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
    const input = screen.getByRole('textbox', {
      name: /titel|privatearea\.collections\.titlelabel/i,
    });
    fireEvent.change(input, { target: { value: 'Renamed packing list' } });
    fireEvent.click(
      screen.getByRole('button', { name: /änderungen speichern/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: de.common.saving }),
      ).toBeDefined();
    });

    resolveUpdate?.({
      ...sampleCollection,
      title: 'Renamed packing list',
      version: 2,
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: de.common.edit }),
      ).toBeDefined();
    });
  });
});
