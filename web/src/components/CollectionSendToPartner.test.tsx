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
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
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
  withPin?: boolean;
  listed?: typeof collection;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const shown = options.listed ?? collection;
  queryClient.setQueryData(
    ['m5-s3', 'collection', 'space-1', 'collection-1'],
    shown,
  );
  const dashboardApi = {
    listDashboardModulePreferences: vi.fn().mockResolvedValue({ items: [] }),
    updateDashboardModulePreference: vi.fn(),
  } as unknown as DashboardApi;
  const send = options.send ?? vi.fn().mockResolvedValue(undefined);
  const apis = {
    collections: {
      getCollection: vi.fn().mockResolvedValue(shown),
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
                  dashboardApi={options.withPin ? dashboardApi : undefined}
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

  it('lists Edit first, the list actions after it and Delete last', async () => {
    const item = (id: string, position: number) => ({
      capabilities: { canComment: false, canDelete: true, canEdit: true },
      collectionId: 'collection-1',
      completed: false,
      createdAt: new Date('2026-08-01T10:00:00Z'),
      createdBy: 'account-1',
      creator: collection.creator,
      id,
      position,
      title: id,
      updatedAt: new Date('2026-08-01T10:00:00Z'),
      version: 1,
    });
    renderList({
      partnerId: 'account-2',
      withPin: true,
      listed: {
        ...collection,
        items: [item('Passport', 0), item('Tickets', 1)],
      } as unknown as typeof collection,
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.collection.menu.open'),
      }),
    );
    // The partner is known a moment later; the Send row then joins the menu.
    await screen.findByText(sendLabel());
    const rows = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('item-menu-option'))
      .map((button) => button.textContent);
    expect(rows).toEqual([
      i18n.t('common.edit'),
      i18n.t('m5s3.collection.sort'),
      sendLabel(),
      i18n.t('m5s3.collection.pinToToday'),
      i18n.t('m5s3.common.delete'),
    ]);
    expect(
      screen
        .queryByRole('button', { name: i18n.t('common.edit') })
        ?.closest('.item-menu'),
    ).not.toBeNull();
  });

  it('offers no send row without a partner', async () => {
    renderList({ partnerId: null });
    await screen.findByRole('heading', { name: collection.title });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.collection.menu.open') }),
    );
    const rows = (await screen.findAllByRole('button'))
      .filter((button) => button.classList.contains('item-menu-option'))
      .map((button) => button.textContent);
    expect(rows).toEqual([i18n.t('common.edit'), i18n.t('m5s3.common.delete')]);
  });
});
