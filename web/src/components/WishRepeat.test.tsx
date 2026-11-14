// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { WishToPlanResponse } from '../api/generated/models/WishToPlanResponse';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { WishProductPage } from './WishProductPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const COMPLETED: WishDetail = {
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-09-01T10:00:00Z'),
  createdBy: 'account-anna',
  creator: { id: 'account-anna', displayName: 'Anna' },
  plan: null,
  hasMemory: false,
  followedFromWishId: null,
  seriesId: 'wish-1',
  seriesPosition: 1,
  id: 'wish-1',
  spaceId: 'space-1',
  status: 'COMPLETED',
  title: 'Baltic Sea weekend',
  updatedAt: new Date('2026-09-12T09:00:00Z'),
  version: 2,
};

const REPEATED: WishDetail = {
  ...COMPLETED,
  followedFromWishId: COMPLETED.id,
  id: 'wish-2',
  seriesPosition: 2,
  status: 'OPEN',
  version: 1,
};

function plannedPair(): WishToPlanResponse {
  const plan: PlanDetail = {
    capabilities: { canComment: false, canDelete: false, canEdit: true },
    createdAt: new Date('2026-10-01T09:00:00Z'),
    createdBy: 'account-anna',
    creator: { id: 'account-anna', displayName: 'Anna' },
    description: null,
    experiencedOn: null,
    id: 'plan-9',
    placeId: null,
    plannedEnd: null,
    plannedOn: null,
    plannedStart: null,
    sourceWishId: REPEATED.id,
    spaceId: 'space-1',
    status: 'IDEA',
    title: REPEATED.title,
    updatedAt: new Date('2026-10-01T09:00:00Z'),
    version: 1,
  };
  return { wish: { ...REPEATED, status: 'PLANNED', version: 2 }, plan };
}

function Probe() {
  const location = useLocation();
  return <output aria-label="current-location">{location.pathname}</output>;
}

function renderCompleted({
  wish = COMPLETED,
  repeatWish = vi.fn().mockResolvedValue(REPEATED),
  convertWishToPlan = vi.fn().mockResolvedValue(plannedPair()),
}: {
  wish?: WishDetail;
  repeatWish?: ReturnType<typeof vi.fn>;
  convertWishToPlan?: ReturnType<typeof vi.fn>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.wishDetail('space-1', wish.id),
    wish,
  );
  queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), []);
  const apis = {
    plans: { convertWishToPlan },
    wishes: {
      getWish: vi.fn(async ({ wishId }: { wishId: string }) =>
        wishId === REPEATED.id ? REPEATED : wish,
      ),
      repeatWish,
    },
  } as unknown as SharedPlanningApis;
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/wishes/${wish.id}`]}>
        <Probe />
        <Routes>
          <Route
            path="/plan/wishes/:wishId"
            element={<WishProductPage apis={apis} spaceId="space-1" />}
          />
          <Route path="/plan/plans/:planId" element={<span />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { repeatWish, convertWishToPlan, queryClient };
}

const action = () =>
  screen.getByRole('button', { name: i18n.t('wishRepeat.action') });

describe('Nochmal erleben (#1816)', () => {
  it('is offered on a completed wish only', () => {
    renderCompleted();
    expect(action()).toBeTruthy();
    cleanup();
    renderCompleted({ wish: { ...COMPLETED, status: 'OPEN', version: 1 } });
    expect(
      screen.queryByRole('button', { name: i18n.t('wishRepeat.action') }),
    ).toBeNull();
  });

  it('is hidden when the wish cannot be edited', () => {
    renderCompleted({
      wish: {
        ...COMPLETED,
        capabilities: { canComment: false, canDelete: false, canEdit: false },
      },
    });
    expect(
      screen.queryByRole('button', { name: i18n.t('wishRepeat.action') }),
    ).toBeNull();
  });

  it('creates the follow-up wish from the unchanged proposal and opens it', async () => {
    const user = userEvent.setup();
    const { repeatWish, convertWishToPlan } = renderCompleted();

    await user.click(action());
    const title = screen.getByLabelText(i18n.t('wishRepeat.sheet.titleLabel'));
    expect((title as HTMLInputElement).value).toBe(COMPLETED.title);
    await user.click(
      screen.getByRole('button', { name: i18n.t('wishRepeat.sheet.create') }),
    );

    await waitFor(() => expect(repeatWish).toHaveBeenCalledTimes(1));
    expect(repeatWish).toHaveBeenCalledWith({
      spaceId: 'space-1',
      wishId: COMPLETED.id,
      idempotencyKey: expect.any(String),
      wishRepeat: {},
    });
    expect(convertWishToPlan).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText('current-location').textContent).toBe(
        `/plan/wishes/${REPEATED.id}`,
      ),
    );
  });

  it('sends an edited title only', async () => {
    const user = userEvent.setup();
    const { repeatWish } = renderCompleted();

    await user.click(action());
    const title = screen.getByLabelText(i18n.t('wishRepeat.sheet.titleLabel'));
    await user.clear(title);
    await user.type(title, 'Baltic Sea in winter');
    await user.click(
      screen.getByRole('button', { name: i18n.t('wishRepeat.sheet.create') }),
    );

    await waitFor(() => expect(repeatWish).toHaveBeenCalled());
    expect(repeatWish.mock.calls[0][0].wishRepeat).toEqual({
      title: 'Baltic Sea in winter',
    });
  });

  it('continues into the plan conversion for "Gleich planen"', async () => {
    const user = userEvent.setup();
    const { repeatWish, convertWishToPlan } = renderCompleted();

    await user.click(action());
    await user.click(
      screen.getByRole('button', { name: i18n.t('wishRepeat.sheet.planNow') }),
    );

    await waitFor(() => expect(convertWishToPlan).toHaveBeenCalledTimes(1));
    expect(repeatWish).toHaveBeenCalledTimes(1);
    expect(convertWishToPlan).toHaveBeenCalledWith({
      spaceId: 'space-1',
      wishId: REPEATED.id,
      ifMatch: '1',
      wishToPlan: {},
    });
    await waitFor(() =>
      expect(screen.getByLabelText('current-location').textContent).toBe(
        '/plan/plans/plan-9',
      ),
    );
  });

  it('lands on the new wish when the plan conversion fails', async () => {
    const user = userEvent.setup();
    const { convertWishToPlan } = renderCompleted({
      convertWishToPlan: vi.fn().mockRejectedValue(new Error('conflict')),
    });

    await user.click(action());
    await user.click(
      screen.getByRole('button', { name: i18n.t('wishRepeat.sheet.planNow') }),
    );

    await waitFor(() => expect(convertWishToPlan).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText('current-location').textContent).toBe(
        `/plan/wishes/${REPEATED.id}`,
      ),
    );
  });

  it('protects against a double tap and keeps the sheet open on failure', async () => {
    const user = userEvent.setup();
    let reject: (reason: Error) => void = () => undefined;
    const repeatWish = vi.fn(
      () =>
        new Promise<WishDetail>((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderCompleted({ repeatWish });

    await user.click(action());
    const create = screen.getByRole('button', {
      name: i18n.t('wishRepeat.sheet.create'),
    });
    await user.click(create);
    await user.click(create);
    expect(repeatWish).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole('button', {
          name: i18n.t('wishRepeat.sheet.creating'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    reject(new Error('offline'));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: i18n.t('wishRepeat.sheet.create'),
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(screen.getByLabelText('current-location').textContent).toBe(
      `/plan/wishes/${COMPLETED.id}`,
    );
  });

  it('keeps one request identity across a retry of the same proposal', async () => {
    const user = userEvent.setup();
    const repeatWish = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValue(REPEATED);
    renderCompleted({ repeatWish });

    await user.click(action());
    const create = () =>
      screen.getByRole('button', { name: i18n.t('wishRepeat.sheet.create') });
    await user.click(create());
    await waitFor(() => expect(repeatWish).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((create() as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(create());

    await waitFor(() => expect(repeatWish).toHaveBeenCalledTimes(2));
    expect(repeatWish.mock.calls[1][0].idempotencyKey).toBe(
      repeatWish.mock.calls[0][0].idempotencyKey,
    );
  });
});
