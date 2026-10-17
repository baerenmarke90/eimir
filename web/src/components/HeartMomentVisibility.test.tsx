// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import type { HeartMomentDetail } from '../api/generated/models/HeartMomentDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { ProductReadResult } from '../client/productReadCache';
import * as readCache from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider } from '../client/taskOrigin';
import storyProducts from '../i18n/locales/storyProducts';
import { HeartMomentProductPage } from './HeartMomentProductPage';

const KEY = authorSummaryQueryKeys.heartMoment('space-1', 'heart-1');
const moment: HeartMomentDetail = {
  id: 'heart-1',
  spaceId: 'space-1',
  text: 'A shared afternoon',
  emotion: HeartEmotion.LOVED,
  visibility: ContentVisibility.SHARED,
  happenedOn: new Date('2026-10-17T00:00:00Z'),
  createdAt: new Date('2026-10-17T00:00:00Z'),
  updatedAt: new Date('2026-10-17T00:00:00Z'),
  version: 1,
  tags: [],
  attachment: null,
  author: { id: 'account-1', displayName: 'Anna' },
  authorId: 'account-1',
  capabilities: { canComment: true, canDelete: true, canEdit: true },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  client.setQueryData(KEY, { value: moment, source: 'network' });
  const result = deferred<HeartMomentDetail>();
  const change = vi.fn(() => result.promise);
  // Hold recovery at the Query boundary so a refetch cannot mask settlement.
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const revoke = vi.spyOn(readCache, 'deleteProductReadCacheEntry');
  function Application({
    accountId = 'account-1',
    spaceId = 'space-1',
  }: {
    accountId?: string;
    spaceId?: string;
  }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/story/heart-moments/heart-1']}>
          <TaskOriginProvider accountId={accountId} spaceId={spaceId}>
            <Routes>
              <Route
                path="/story/heart-moments/:heartMomentId"
                element={
                  <HeartMomentProductPage
                    mode="detail"
                    apis={
                      {
                        heartMoments: { changeHeartMomentVisibility: change },
                        comments: {
                          listHeartMomentComments: async () => ({
                            items: [],
                            hasMore: false,
                          }),
                        },
                        story: { recordStoryView: async () => undefined },
                      } as unknown as ReferenceApis
                    }
                    apiBaseUrl="https://example.test"
                    accessToken="token"
                    spaceId={spaceId}
                    currentAccountId={accountId}
                    loadAttachment={async () => 'blob:visibility-test-photo'}
                  />
                }
              />
            </Routes>
          </TaskOriginProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  const view = render(<Application />);
  async function start() {
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.makePrivate,
      }),
    );
    await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  }
  async function settle(success: boolean) {
    await act(async () => {
      if (success)
        result.resolve({
          ...moment,
          version: 2,
          visibility: ContentVisibility.PRIVATE,
        });
      else result.reject(new ClientProblemError('server', 503));
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
  }
  return {
    client,
    result,
    change,
    invalidate,
    revoke,
    start,
    settle,
    switchScope: (scope: { accountId?: string; spaceId?: string }) =>
      view.rerender(<Application {...scope} />),
  };
}

describe('HeartMoment visibility response ownership', () => {
  it('admits only one synchronous submission for the displayed version', async () => {
    const state = setup();
    const button = screen.getByRole('button', {
      name: storyProducts.heartMomentProduct.makePrivate,
    });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(state.change).toHaveBeenCalled());
    expect(state.change).toHaveBeenCalledTimes(1);
    await state.settle(true);
  });

  it('settles an offline attempt without a queued privacy write on reconnect', async () => {
    const state = setup();
    onlineManager.setOnline(false);
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.makePrivate,
      }),
    );
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(state.change).not.toHaveBeenCalled();
    await act(async () => {
      onlineManager.setOnline(true);
      await state.client.resumePausedMutations();
    });
    expect(state.change).not.toHaveBeenCalled();
    await state.start();
    await state.settle(true);
  });

  for (const replacement of [false, true]) {
    it(`rejects dispatch after ${replacement ? 'replacement' : 'removal'} during awaited cancellation`, async () => {
      const state = setup();
      const cancellation = deferred<void>();
      const cancel = vi
        .spyOn(state.client, 'cancelQueries')
        .mockImplementationOnce(() => cancellation.promise);
      await userEvent.setup().click(
        screen.getByRole('button', {
          name: storyProducts.heartMomentProduct.makePrivate,
        }),
      );
      await waitFor(() => expect(cancel).toHaveBeenCalled());
      act(() => {
        state.client.removeQueries({ queryKey: KEY, exact: true });
        if (replacement)
          state.client.setQueryData(KEY, {
            value: { ...moment, version: 8 },
            source: 'network',
          });
      });
      const current = state.client.getQueryData(KEY);
      await act(async () => cancellation.resolve());
      expect(state.change).not.toHaveBeenCalled();
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(state.client.getQueryData(KEY)).toBe(current);
    });
  }

  it('binds the admitted request and settlement to their original Space', async () => {
    const state = setup();
    const cancellation = deferred<void>();
    const cancel = vi
      .spyOn(state.client, 'cancelQueries')
      .mockImplementationOnce(() => cancellation.promise);
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.makePrivate,
      }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    const otherKey = authorSummaryQueryKeys.heartMoment('space-2', 'heart-1');
    act(() =>
      state.client.setQueryData(otherKey, {
        value: { ...moment, spaceId: 'space-2', version: 7 },
        source: 'network',
      }),
    );
    state.switchScope({ spaceId: 'space-2' });
    await act(async () => cancellation.resolve());
    await waitFor(() => expect(state.change).toHaveBeenCalledTimes(1));
    expect(state.change.mock.calls[0]).toEqual([
      expect.objectContaining({ spaceId: 'space-1' }),
    ]);
    const other = state.client.getQueryData(otherKey);
    await state.settle(true);
    expect(state.client.getQueryData(otherKey)).toBe(other);
    expect(
      state.client.getQueryData<ProductReadResult<HeartMomentDetail>>(KEY)
        ?.value.version,
    ).toBe(2);
    expect(state.revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      'heart-1',
    );
    expect(
      state.invalidate.mock.calls.every(
        ([options]) => !options?.queryKey?.includes('space-2'),
      ),
    ).toBe(true);
  });

  it('revokes only the original account snapshot after session replacement', async () => {
    const state = setup();
    await state.start();
    act(() => {
      state.client.clear();
      state.client.setQueryData(KEY, {
        value: { ...moment, text: 'Another account', version: 8 },
        source: 'network',
      });
    });
    state.switchScope({ accountId: 'account-2' });
    const replacement = state.client.getQueryData(KEY);
    await state.settle(true);
    await waitFor(() => expect(state.revoke).toHaveBeenCalled());
    expect(state.revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      'heart-1',
    );
    expect(state.revoke).not.toHaveBeenCalledWith(
      'account-2',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(state.client.getQueryData(KEY)).toBe(replacement);
  });

  it('confirms a normal change only after the server responds and revokes its shared snapshot', async () => {
    const state = setup();
    await state.start();
    expect(
      state.client.getQueryData<ProductReadResult<HeartMomentDetail>>(KEY)
        ?.value.visibility,
    ).toBe(ContentVisibility.SHARED);
    await state.settle(true);
    expect(
      state.client.getQueryData<ProductReadResult<HeartMomentDetail>>(KEY)
        ?.value.visibility,
    ).toBe(ContentVisibility.PRIVATE);
    expect(state.revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      'heart-1',
    );
    expect(state.change).toHaveBeenCalledWith({
      spaceId: 'space-1',
      heartMomentId: 'heart-1',
      ifMatch: '1',
      heartMomentVisibilityChange: { visibility: ContentVisibility.PRIVATE },
    });
  });

  for (const success of [false, true]) {
    it(`preserves a newer authorized read after late ${success ? 'success' : 'failure'}`, async () => {
      const state = setup();
      await state.start();
      act(() =>
        state.client.setQueryData(KEY, {
          value: {
            ...moment,
            text: 'Newer author content',
            version: 3,
            visibility: ContentVisibility.PRIVATE,
          },
          source: 'network',
        }),
      );
      const newer = state.client.getQueryData(KEY);
      const currentAction = await screen.findByRole('button', {
        name: storyProducts.heartMomentProduct.makeShared,
      });
      await waitFor(() =>
        expect(currentAction.hasAttribute('disabled')).toBe(false),
      );
      expect(
        screen.queryByText(storyProducts.heartMomentProduct.visibilityChanging),
      ).toBeNull();
      await state.settle(success);
      expect(state.client.getQueryData(KEY)).toBe(newer);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    for (const replacement of [false, true]) {
      it(`does not ${replacement ? 'replace a new Query' : 'recreate a removed Query'} after late ${success ? 'success' : 'failure'}`, async () => {
        const state = setup();
        await state.start();
        act(() => {
          state.client.removeQueries({ queryKey: KEY, exact: true });
          if (replacement)
            state.client.setQueryData(KEY, {
              value: { ...moment, text: 'Replacement session', version: 9 },
              source: 'network',
            });
        });
        const current = state.client.getQueryData(KEY);
        await state.settle(success);
        expect(state.client.getQueryData(KEY)).toBe(current);
        expect(state.invalidate).not.toHaveBeenCalled();
      });
    }

    for (const kind of ['unauthorized', 'permission', 'notFound'] as const) {
      it(`preserves a newer ${kind} read after late ${success ? 'success' : 'failure'}`, async () => {
        const state = setup();
        await state.start();
        const denied = new ClientProblemError(kind);
        await act(async () => {
          await state.client
            .fetchQuery({
              queryKey: KEY,
              queryFn: () => Promise.reject(denied),
              retry: false,
              staleTime: 0,
            })
            .catch(() => undefined);
        });
        expect(state.client.getQueryState(KEY)?.error).toBe(denied);
        await state.settle(success);
        expect(state.client.getQueryState(KEY)?.error).toBe(denied);
        expect(state.invalidate).not.toHaveBeenCalled();
      });
    }
  }

  it('retains an equal-version canonical projection instead of replacing its content', async () => {
    const state = setup();
    await state.start();
    act(() =>
      state.client.setQueryData(KEY, {
        value: {
          ...moment,
          text: 'Canonical read',
          version: 2,
          visibility: ContentVisibility.PRIVATE,
        },
        source: 'network',
      }),
    );
    const canonical = state.client.getQueryData(KEY);
    await state.settle(true);
    expect(state.client.getQueryData(KEY)).toBe(canonical);
  });

  it('rechecks Query ownership after asynchronous persistent-cache revocation', async () => {
    const state = setup();
    const revocation = deferred<void>();
    state.revoke.mockImplementationOnce(() => revocation.promise);
    await state.start();
    await act(async () =>
      state.result.resolve({
        ...moment,
        version: 2,
        visibility: ContentVisibility.PRIVATE,
      }),
    );
    await waitFor(() => expect(state.revoke).toHaveBeenCalledTimes(1));
    act(() => state.client.removeQueries({ queryKey: KEY, exact: true }));
    await act(async () => revocation.resolve());
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(state.client.getQueryData(KEY)).toBeUndefined();
    expect(state.invalidate).not.toHaveBeenCalled();
  });
});
