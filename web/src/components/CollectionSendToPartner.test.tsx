// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { PartnerNicknameProvider } from '../client/partnerNickname';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { CollectionProductPage } from './CollectionProductPage';

const collection = {
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

function renderList(options: {
  partnerId: string | null;
  send?: ReturnType<typeof vi.fn>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    ['m5-s3', 'collection', 'space-1', 'collection-1'],
    collection,
  );
  const send = options.send ?? vi.fn().mockResolvedValue(undefined);
  const apis = {
    collections: {
      getCollection: vi.fn().mockResolvedValue(collection),
      sendCollectionToPartner: send,
    },
  } as unknown as SharedPlanningApis;
  const profilesApi = {
    getPartnerNickname: vi
      .fn()
      .mockResolvedValue({ nickname: 'Ben', partnerId: options.partnerId }),
  } as unknown as ProfilesApi;
  render(
    <QueryClientProvider client={queryClient}>
      <PartnerNicknameProvider
        profilesApi={profilesApi}
        spaceId="space-1"
        accountId="account-1"
      >
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  accountId="account-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </PartnerNicknameProvider>
    </QueryClientProvider>,
  );
  return { send, profilesApi };
}

const sendLabel = () => i18n.t('m5s3.collection.menu.send', { name: 'Ben' });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Send a list to the partner (#1907 E2)', () => {
  it('asks first, then sends once and confirms calmly', async () => {
    const { send } = renderList({ partnerId: 'account-2' });
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.collection.menu.open'),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: sendLabel() }));
    expect(send).not.toHaveBeenCalled();
    expect(
      screen.getByText(i18n.t('m5s3.collection.menu.sendBody')),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: sendLabel() }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        spaceId: 'space-1',
        collectionId: 'collection-1',
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await screen.findByRole('status', {
          name: '',
        })
      ).textContent,
    ).toBe(i18n.t('m5s3.collection.menu.sendDone', { name: 'Ben' }));
  });

  it('lets the person back out without sending', async () => {
    const { send } = renderList({ partnerId: 'account-2' });
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.collection.menu.open'),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: sendLabel() }));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.menu.sendKeep'),
      }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a problem and keeps the list when sending fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    renderList({ partnerId: 'account-2', send });
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.collection.menu.open'),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: sendLabel() }));
    fireEvent.click(screen.getByRole('button', { name: sendLabel() }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(
      screen.queryByText(
        i18n.t('m5s3.collection.menu.sendDone', { name: 'Ben' }),
      ),
    ).toBeNull();
  });

  it('offers no menu without a partner', async () => {
    renderList({ partnerId: null });
    await screen.findByRole('heading', { name: collection.title });
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.collection.menu.open'),
      }),
    ).toBeNull();
  });
});
