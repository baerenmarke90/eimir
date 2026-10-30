// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WishSelectionView } from '../api/generated/models/WishSelectionView';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { wishSelectionQueryKey } from '../client/wishSelection';
import m5s3 from '../i18n/locales/m5s3';
import taskBoundary from '../i18n/locales/taskBoundary';
import copy from '../i18n/locales/wishSelection';
import { WishSelectionPage } from './WishSelectionPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => onlineManager.setOnline(true));

const candidates = [
  {
    wishId: 'pasta',
    title: 'Pasta night',
    version: 1,
    status: 'OPEN' as const,
    planId: null,
  },
  {
    wishId: 'lake',
    title: 'Walk by the lake',
    version: 1,
    status: 'OPEN' as const,
    planId: null,
  },
  {
    wishId: 'spa',
    title: 'Visit the spa',
    version: 1,
    status: 'OPEN' as const,
    planId: null,
  },
];

function projection(
  state: WishSelectionView['resultState'] = 'CHOOSING',
): WishSelectionView {
  return {
    id: state === 'NO_ROUND' ? null : 'round-1',
    version: state === 'NO_ROUND' ? 0 : 1,
    roundToken: state === 'NO_ROUND' ? 'absent' : 'round-1:1',
    title: state === 'NO_ROUND' ? null : 'Our weekend',
    candidates: state === 'NO_ROUND' ? [] : structuredClone(candidates),
    own: {
      favoriteWishIds:
        state === 'READY' || state === 'WAITING' ? ['pasta', 'lake'] : [],
      published: state === 'READY' || state === 'WAITING',
      version: state === 'READY' || state === 'WAITING' ? 1 : 0,
    },
    selectionToken:
      state === 'NO_ROUND'
        ? null
        : `round-1:1:${state === 'READY' || state === 'WAITING' ? 1 : 0}`,
    resultState: state,
    commonWishIds: state === 'READY' ? ['pasta'] : [],
  };
}

function renderTask(initial = projection()) {
  let current = structuredClone(initial);
  let sourceWishes = candidates.map((candidate) => ({
    id: candidate.wishId,
    title: candidate.title,
    status: candidate.status,
  }));
  const getWishSelection = vi.fn(async () => structuredClone(current));
  const replaceWishSelectionRound = vi.fn(async (request) => {
    current = projection();
    current.title = request.wishSelectionRoundUpdate.title ?? null;
    current.candidates = candidates.filter((candidate) =>
      request.wishSelectionRoundUpdate.wishIds.includes(candidate.wishId),
    );
    return structuredClone(current);
  });
  const updateOwnWishSelection = vi.fn(async (request) => {
    current.own = {
      ...request.wishSelectionUpdate,
      version: current.own.version + 1,
    };
    current.selectionToken = `round-1:1:${current.own.version}`;
    current.resultState = current.own.published ? 'WAITING' : 'CHOOSING';
    current.commonWishIds = [];
    return structuredClone(current);
  });
  const closeWishSelectionRound = vi.fn(async () => {
    current = projection('NO_ROUND');
  });
  const createWish = vi.fn(async ({ wishCreate }) => {
    const result = {
      id: 'new-wish',
      title: wishCreate.title,
      status: 'OPEN' as const,
    };
    sourceWishes = [...sourceWishes, result];
    return result;
  });
  const convertWishToPlan = vi.fn(
    async (
      _request: Parameters<SharedPlanningApis['plans']['convertWishToPlan']>[0],
    ) => ({
      wish: { id: 'pasta' },
      plan: { id: 'actual-plan' },
    }),
  );
  const apis = {
    wishSelections: {
      getWishSelection,
      replaceWishSelectionRound,
      updateOwnWishSelection,
      closeWishSelectionRound,
    },
    wishes: {
      listWishes: vi.fn(async () => ({
        items: sourceWishes,
        nextCursor: null,
        hasMore: false,
      })),
      createWish,
    },
    plans: { convertWishToPlan },
  } as unknown as SharedPlanningApis;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function tree(accountId: string) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/choose']}>
          <Routes>
            <Route
              path="/plan/choose"
              element={
                <WishSelectionPage
                  apis={apis}
                  spaceId="space-1"
                  accountId={accountId}
                />
              }
            />
            <Route
              path="/plan/plans/:planId"
              element={<p>Canonical Plan result</p>}
            />
            <Route path="/plan" element={<p>Planning hub</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  const rendered = render(tree('account-a'));
  return {
    ...rendered,
    queryClient,
    apis,
    getWishSelection,
    replaceWishSelectionRound,
    updateOwnWishSelection,
    closeWishSelectionRound,
    createWish,
    convertWishToPlan,
    switchAccount: (account: string) => rendered.rerender(tree(account)),
  };
}

describe('WishSelectionPage', () => {
  it('starts a bounded round from real Wishes without opening the keyboard', async () => {
    const { replaceWishSelectionRound } = renderTask(projection('NO_ROUND'));
    const pasta = await screen.findByRole('checkbox', {
      name: candidates[0].title,
    });
    expect(document.activeElement).not.toBe(
      screen.getByPlaceholderText(copy.occasionPlaceholder),
    );
    const start = screen.getByRole('button', { name: copy.start });
    expect(start).toHaveProperty('disabled', true);
    fireEvent.click(pasta);
    expect(start).toHaveProperty('disabled', true);
    fireEvent.click(
      screen.getByRole('checkbox', { name: candidates[1].title }),
    );
    fireEvent.click(start);
    await screen.findByRole('heading', { name: copy.chooseTitle });
    expect(replaceWishSelectionRound).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: 'absent',
      wishSelectionRoundUpdate: {
        wishIds: ['pasta', 'lake'],
        title: undefined,
      },
    });
  });

  it('does not publish before the deliberate Share action', async () => {
    const { updateOwnWishSelection } = renderTask();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await screen.findByRole('heading', { name: copy.waitingTitle });
    expect(updateOwnWishSelection).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: 'round-1:1:0',
      wishSelectionUpdate: { favoriteWishIds: ['pasta'], published: true },
    });
    expect(screen.queryByText(copy.sharedTitle)).toBeNull();
  });

  it('allows zero favorites and shows the authoritative waiting state', async () => {
    const { updateOwnWishSelection } = renderTask();
    fireEvent.click(
      await screen.findByRole('button', { name: copy.shareNone }),
    );
    await screen.findByRole('heading', { name: copy.waitingTitle });
    expect(
      updateOwnWishSelection.mock.calls[0][0].wishSelectionUpdate
        .favoriteWishIds,
    ).toEqual([]);
  });

  it('renders only server-authorized common favorites', async () => {
    renderTask(projection('READY'));
    await screen.findByRole('heading', { name: copy.sharedTitle });
    expect(
      screen.getByRole('heading', { name: candidates[0].title }),
    ).toBeTruthy();
    expect(screen.queryByText(candidates[1].title)).toBeNull();
    expect(screen.queryByText(candidates[2].title)).toBeNull();
  });

  it('keeps the zero-match path useful without claiming mutual agreement', async () => {
    const initial = projection('READY');
    initial.commonWishIds = [];
    renderTask(initial);
    await screen.findByRole('heading', { name: copy.noMatchTitle });
    fireEvent.click(screen.getByRole('button', { name: copy.ownContinue }));
    await screen.findByRole('heading', { name: copy.ownTitle });
    expect(screen.getByText(copy.ownBody)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: copy.prepare })[0]);
    expect(await screen.findByText(copy.proposal)).toBeTruthy();
  });

  it('withdraws publication before editing a shared selection', async () => {
    const { updateOwnWishSelection } = renderTask(projection('READY'));
    fireEvent.click(
      await screen.findByRole('button', { name: copy.changeOwn }),
    );
    const pasta = await screen.findByRole('checkbox', {
      name: candidates[0].title,
    });
    expect(pasta).toHaveProperty('checked', true);
    expect(
      updateOwnWishSelection.mock.calls[0][0].wishSelectionUpdate.published,
    ).toBe(false);
    expect(
      screen.queryByRole('heading', { name: copy.sharedTitle }),
    ).toBeNull();
  });

  it('preserves selected favorites after a failed publication', async () => {
    const { updateOwnWishSelection } = renderTask();
    updateOwnWishSelection.mockRejectedValueOnce(
      new ClientProblemError('server'),
    );
    const pasta = await screen.findByRole('checkbox', {
      name: candidates[0].title,
    });
    fireEvent.click(pasta);
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await waitFor(() =>
      expect(updateOwnWishSelection).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(pasta).toHaveProperty('checked', true);
    expect(
      screen.queryByRole('heading', { name: copy.waitingTitle }),
    ).toBeNull();
  });

  it('does not queue or replay publication while offline', async () => {
    const { updateOwnWishSelection } = renderTask();
    const pasta = await screen.findByRole('checkbox', {
      name: candidates[0].title,
    });
    fireEvent.click(pasta);
    onlineManager.setOnline(false);
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    expect(pasta).toHaveProperty('checked', true);
  });

  it('retains a dirty selection when Back is cancelled', async () => {
    renderTask();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    fireEvent.click(screen.getByRole('button', { name: taskBoundary.back }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.common.keepEditing }),
    );
    expect(
      screen.getByRole('checkbox', { name: candidates[0].title }),
    ).toHaveProperty('checked', true);
  });

  it('uses canonical Wish-to-Plan conversion and opens the actual undated result', async () => {
    const { convertWishToPlan } = renderTask(projection('READY'));
    fireEvent.click(await screen.findByRole('button', { name: copy.prepare }));
    fireEvent.click(await screen.findByRole('button', { name: copy.savePlan }));
    await screen.findByText('Canonical Plan result');
    expect(convertWishToPlan).toHaveBeenCalledWith({
      spaceId: 'space-1',
      wishId: 'pasta',
      ifMatch: '1',
      wishToPlan: {
        title: candidates[0].title,
        description: undefined,
        schedule: undefined,
      },
    });
  });

  it('preserves date-only Plan semantics', async () => {
    const { convertWishToPlan } = renderTask(projection('READY'));
    fireEvent.click(await screen.findByRole('button', { name: copy.prepare }));
    const date = document.querySelector('input[type="date"]');
    expect(date).toBeTruthy();
    fireEvent.change(date as HTMLInputElement, {
      target: { value: '2026-11-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.savePlan }));
    await waitFor(() => expect(convertWishToPlan).toHaveBeenCalledTimes(1));
    expect(convertWishToPlan.mock.calls[0][0].wishToPlan.schedule).toEqual({
      plannedOn: new Date('2026-11-01T00:00:00Z'),
    });
  });

  it('opens a converted source without creating another Plan', async () => {
    const initial = projection('READY');
    initial.candidates[0].planId = 'already-created';
    initial.candidates[0].status = 'PLANNED';
    initial.commonWishIds = [];
    const { convertWishToPlan } = renderTask(initial);
    fireEvent.click(
      await screen.findByRole('link', {
        name: copy.openPlanFor.replace('{{title}}', candidates[0].title),
      }),
    );
    await screen.findByText('Canonical Plan result');
    expect(convertWishToPlan).not.toHaveBeenCalled();
  });

  it('does not reuse consent when a source requires review', async () => {
    renderTask(projection('NEEDS_IDEAS'));
    await screen.findByRole('heading', { name: copy.changedTitle });
    expect(screen.queryByRole('button', { name: copy.share })).toBeNull();
    expect(screen.getByRole('button', { name: copy.reviewIdeas })).toBeTruthy();
  });

  it('does not overwrite a local draft when another device changes the round', async () => {
    const { queryClient, updateOwnWishSelection } = renderTask();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    const changed = projection();
    changed.version = 2;
    changed.roundToken = 'round-1:2';
    changed.selectionToken = 'round-1:2:0';
    act(() =>
      queryClient.setQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
        changed,
      ),
    );
    expect(
      screen.getByRole('checkbox', { name: candidates[0].title }),
    ).toHaveProperty('checked', true);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
  });

  it('keeps the personal draft and offers explicit reload when a source changes', async () => {
    const { queryClient, updateOwnWishSelection } = renderTask();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    const changed = projection('NEEDS_IDEAS');
    changed.candidates[0].version = 2;
    act(() =>
      queryClient.setQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
        changed,
      ),
    );
    expect(
      screen.getByRole('checkbox', { name: candidates[0].title }),
    ).toHaveProperty('checked', true);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(screen.getByText(copy.changedBody)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.reload }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.common.keepEditing }),
    );
    expect(
      screen.getByRole('checkbox', { name: candidates[0].title }),
    ).toHaveProperty('checked', true);
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
  });

  it('keeps a round-setup draft when a source is removed on another device', async () => {
    const { queryClient, replaceWishSelectionRound } = renderTask(
      projection('READY'),
    );
    fireEvent.click(await screen.findByText(copy.moreActions));
    fireEvent.click(screen.getByRole('button', { name: copy.changeIdeas }));
    fireEvent.change(screen.getByLabelText(copy.occasion), {
      target: { value: 'A new occasion' },
    });
    const changed = projection('NEEDS_IDEAS');
    changed.candidates = changed.candidates.slice(1);
    act(() =>
      queryClient.setQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
        changed,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.replace })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(screen.getByLabelText(copy.occasion)).toHaveProperty(
      'value',
      'A new occasion',
    );
    expect(screen.getByRole('button', { name: copy.reload })).toBeTruthy();
    expect(replaceWishSelectionRound).not.toHaveBeenCalled();
  });

  it('clears personal drafts when the active account changes', async () => {
    const { switchAccount } = renderTask();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    switchAccount('account-b');
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: candidates[0].title }),
      ).toHaveProperty('checked', false),
    );
  });

  it('ignores a late publication response after the active account changes', async () => {
    const { switchAccount, updateOwnWishSelection, queryClient } = renderTask();
    let resolvePublication: (view: WishSelectionView) => void = () => {
      throw new Error('Publication was not started.');
    };
    updateOwnWishSelection.mockImplementationOnce(
      () =>
        new Promise<WishSelectionView>((resolve) => {
          resolvePublication = resolve;
        }),
    );
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await waitFor(() =>
      expect(updateOwnWishSelection).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByRole('button', { name: taskBoundary.back }),
    ).toHaveProperty('disabled', true);
    switchAccount('account-b');
    await screen.findByRole('checkbox', { name: candidates[0].title });
    await act(async () => resolvePublication(projection('READY')));
    expect(
      screen.queryByRole('heading', { name: copy.sharedTitle }),
    ).toBeNull();
    expect(
      screen.getByRole('checkbox', { name: candidates[0].title }),
    ).toHaveProperty('checked', false);
    expect(
      queryClient.getQueryData<WishSelectionView>(
        wishSelectionQueryKey('', 'account-b', 'space-1'),
      )?.own.published,
    ).toBe(false);
    expect(
      queryClient.getQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
      ),
    ).toBeUndefined();
  });

  it('adds new ideas through normal idempotent Wish creation', async () => {
    const { createWish } = renderTask(projection('NO_ROUND'));
    const input = await screen.findByPlaceholderText(copy.newIdeaPlaceholder);
    fireEvent.change(input, { target: { value: 'Make bread together' } });
    fireEvent.click(screen.getByRole('button', { name: copy.addIdea }));
    expect(
      await screen.findByRole('checkbox', { name: 'Make bread together' }),
    ).toHaveProperty('checked', true);
    expect(createWish).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      wishCreate: { title: 'Make bread together' },
    });
  });
});
