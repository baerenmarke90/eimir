// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import { i18n } from '../i18n';
import { TodayPinnedCollection } from './TodayPinnedCollection';

function item(id: string, title: string, completed = false, position = 0) {
  return {
    id,
    collectionId: 'collection-1',
    title,
    completed,
    position,
    version: 1,
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

function renderPinned(api: Partial<CollectionsApi>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPinnedCollection
          api={api as CollectionsApi}
          spaceId="space-1"
          collection={collection()}
          onRefresh={onRefresh}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onRefresh };
}

describe('TodayPinnedCollection', () => {
  it('keeps the projection compact while preserving completion state', () => {
    renderPinned({});

    expect(screen.getByText('Milch')).toBeDefined();
    expect(screen.getByText('Brot')).toBeDefined();
    expect(screen.getByText('Kaffee')).toBeDefined();
    expect(screen.queryByText('Haferflocken')).toBeNull();
    expect(
      screen.getByText(
        i18n.t('m5s5.today.pinnedCollection.more', { count: 1 }),
      ),
    ).toBeDefined();
    expect(
      screen
        .getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Brot' }),
        })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('completes an item through the existing Collection mutation', async () => {
    const updateCollectionItem = vi
      .fn()
      .mockResolvedValue(item('item-1', 'Milch', true));
    const { onRefresh } = renderPinned({ updateCollectionItem });

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Milch' }),
      }),
    );

    await waitFor(() =>
      expect(updateCollectionItem).toHaveBeenCalledWith({
        spaceId: 'space-1',
        collectionId: 'collection-1',
        itemId: 'item-1',
        ifMatch: '1',
        collectionItemUpdate: { completed: true },
      }),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(
      screen.queryByText(i18n.t('m5s3.plan.sharedAchievementTitle')),
    ).toBeNull();
  });

  it('adds an item through the existing Collection mutation', async () => {
    const createCollectionItem = vi
      .fn()
      .mockResolvedValue(item('item-6', 'Butter'));
    const { onRefresh } = renderPinned({ createCollectionItem });

    const input = screen.getByPlaceholderText(
      i18n.t('m5s5.today.pinnedCollection.addPlaceholder'),
    );
    fireEvent.change(input, { target: { value: 'Butter' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(createCollectionItem).toHaveBeenCalledWith({
        spaceId: 'space-1',
        collectionId: 'collection-1',
        collectionItemCreate: { title: 'Butter' },
      }),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
