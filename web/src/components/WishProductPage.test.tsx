// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { WishProductPage } from './WishProductPage';

const OPEN_WISH: WishDetail = {
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-09-01T10:00:00Z'),
  createdBy: 'account-anna',
  creator: { id: 'account-anna', displayName: 'Anna' },
  id: 'wish-1',
  spaceId: 'space-1',
  status: 'OPEN',
  title: 'Nordlichter sehen',
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  version: 1,
};

function completedWish(): WishDetail {
  return {
    ...OPEN_WISH,
    status: 'COMPLETED',
    version: 2,
    updatedAt: new Date('2026-09-12T09:00:00Z'),
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="current-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderWish(
  wish: WishDetail,
  completeWish = vi.fn().mockResolvedValue(completedWish()),
  places: Array<{ id: string; name: string }> = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.wishDetail('space-1', wish.id),
    wish,
  );
  queryClient.setQueryData(
    authorSummaryQueryKeys.placeOptions('space-1'),
    places,
  );

  const apis = {
    wishes: {
      completeWish,
      getWish: vi.fn().mockResolvedValue(wish),
    },
  } as unknown as SharedPlanningApis;

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/wishes/${wish.id}`]}>
        <Routes>
          <Route
            path="/plan/wishes/:wishId"
            element={<WishProductPage apis={apis} spaceId="space-1" />}
          />
          <Route path="/story/memories/new" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { completeWish };
}

describe('WishProductPage direct completion', () => {
  it('reads conversion places from the canonical selector cache', () => {
    renderWish(OPEN_WISH, undefined, [{ id: 'place-lake', name: 'Lake' }]);

    expect(screen.getByRole('option', { name: 'Lake' })).toBeTruthy();
  });

  it('offers direct completion only while the Wish is open', () => {
    renderWish(OPEN_WISH);

    expect(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.complete') }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.convert') }),
    ).toBeTruthy();
  });

  it('completes server-side, focuses the continuation, and restores focus when dismissed', async () => {
    const user = userEvent.setup();
    const completeWish = vi.fn().mockResolvedValue(completedWish());
    renderWish(OPEN_WISH, completeWish);

    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.complete') }),
    );

    await waitFor(() => {
      expect(completeWish).toHaveBeenCalledWith({
        spaceId: 'space-1',
        wishId: OPEN_WISH.id,
        ifMatch: '1',
      });
    });

    const heading = await screen.findByRole('heading', {
      name: i18n.t('m5s3.wish.completionTitle'),
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.createMemory') }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.completionDone') }),
    );

    expect(screen.getByText(i18n.t('m5s3.wish.completedBody'))).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('m5s3.common.back') }),
    );
  });

  it('hands completion to the canonical Memory composer without publishing Wish text in the URL', async () => {
    const user = userEvent.setup();
    renderWish(OPEN_WISH);

    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.complete') }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.wish.createMemory'),
      }),
    );

    expect(screen.getByLabelText('current-location').textContent).toBe(
      '/story/memories/new',
    );
  });

  it('does not infer a Memory continuation when an already-completed Wish is reloaded', () => {
    renderWish(completedWish());

    expect(screen.getByText(i18n.t('m5s3.wish.completedBody'))).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: i18n.t('m5s3.wish.createMemory') }),
    ).toBeNull();
  });
});
