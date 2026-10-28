// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import * as readCache from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import * as snackbar from '../client/snackbar';
import { TaskOriginProvider } from '../client/taskOrigin';
import de from '../i18n/locales/de';
import memoryProduct from '../i18n/locales/memoryProduct';
import { MemoryProductPage } from './MemoryProductPage';

const key = authorSummaryQueryKeys.memory('space-1', 'memory-1');
const memory: MemoryDetail = {
  id: 'memory-1',
  spaceId: 'space-1',
  authorId: 'account-1',
  author: { id: 'account-1', displayName: 'Anna' },
  title: 'Our afternoon',
  body: 'A shared memory',
  tags: [],
  attachments: [],
  happenedOn: null,
  createdAt: new Date('2026-10-17T10:00:00Z'),
  updatedAt: new Date('2026-10-17T10:00:00Z'),
  version: 1,
  capabilities: { canEdit: true, canDelete: true, canComment: false },
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
beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  client.setQueryData(key, { value: memory, source: 'network' });
  const response = deferred<void>();
  const updateResponse = deferred<MemoryDetail>();
  const remove = vi.fn(() => response.promise);
  const update = vi.fn(() => updateResponse.promise);
  // Hold canonical recovery so refetches cannot hide callback corruption.
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const revoke = vi.spyOn(readCache, 'deleteProductReadCacheEntry');
  const toast = vi.spyOn(snackbar, 'postSnackbar');
  function Application({
    accountId = 'account-1',
    spaceId = 'space-1',
  }: {
    accountId?: string;
    spaceId?: string;
  }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/story/memories/memory-1/edit']}>
          <TaskOriginProvider accountId={accountId} spaceId={spaceId}>
            <Location />
            <nav>
              <Link to="/away">Leave editor</Link>
              <Link to="/story/memories/memory-1/edit">
                Return to first editor
              </Link>
              <Link to="/story/memories/memory-2/edit">Open second editor</Link>
            </nav>
            <Routes>
              <Route
                path="/story/memories/:memoryId/edit"
                element={
                  <MemoryProductPage
                    mode="edit"
                    apis={
                      {
                        memories: {
                          deleteMemory: remove,
                          updateMemory: update,
                        },
                        story: { recordStoryView: async () => undefined },
                      } as unknown as ReferenceApis
                    }
                    apiBaseUrl="https://example.test"
                    accessToken="token"
                    currentAccountId={accountId}
                    spaceId={spaceId}
                    loadMemoryImage={async () => ''}
                  />
                }
              />
              <Route path="/story" element={<h1>Timeline</h1>} />
              <Route path="/away" element={<h1>Another task</h1>} />
            </Routes>
          </TaskOriginProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  const view = render(<Application />);
  async function confirm() {
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: memoryProduct.delete }));
    return screen.getByRole('button', {
      name: memoryProduct.deleteConfirm,
    });
  }
  async function start() {
    await userEvent.setup().click(await confirm());
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  }
  async function settle(success = true) {
    await act(async () => {
      if (success) response.resolve();
      else response.reject(new ClientProblemError('server', 503));
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
  }
  const leave = () =>
    userEvent.setup().click(screen.getByRole('link', { name: 'Leave editor' }));
  const path = () => screen.getByTestId('location').textContent;
  return {
    client,
    response,
    updateResponse,
    remove,
    update,
    invalidate,
    revoke,
    toast,
    confirm,
    start,
    settle,
    leave,
    path,
    switchScope: (scope: { accountId?: string; spaceId?: string }) =>
      view.rerender(<Application {...scope} />),
  };
}

describe('Memory delete response and task ownership', () => {
  it('confirms the normal delete, revokes its original snapshot and returns once', async () => {
    const s = setup();
    await s.start();
    expect(s.path()).toBe('/story/memories/memory-1/edit');
    expect(s.client.getQueryData(key)).toBeDefined();
    expect(s.toast).not.toHaveBeenCalled();
    await s.settle();
    expect(s.remove).toHaveBeenCalledWith({
      spaceId: 'space-1',
      memoryId: 'memory-1',
      ifMatch: '1',
    });
    expect(s.revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'memory',
      'memory-1',
    );
    expect(s.client.getQueryData(key)).toBeUndefined();
    expect(s.path()).toBe('/story');
    expect(s.toast).toHaveBeenCalledTimes(1);
  });
  it('admits only one synchronous confirmation', async () => {
    const s = setup();
    const button = await s.confirm();
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(s.remove).toHaveBeenCalled());
    expect(s.remove).toHaveBeenCalledTimes(1);
    await s.settle();
  });
  it('rejects offline deletion without reconnect replay and permits deliberate retry', async () => {
    const s = setup();
    const button = await s.confirm();
    onlineManager.setOnline(false);
    await userEvent.setup().click(button);
    await waitFor(() => expect(s.client.isMutating()).toBe(0));
    expect(s.remove).not.toHaveBeenCalled();
    await act(async () => {
      onlineManager.setOnline(true);
      await s.client.resumePausedMutations();
    });
    expect(s.remove).not.toHaveBeenCalled();
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: memoryProduct.deleteConfirm,
      }),
    );
    await waitFor(() => expect(s.remove).toHaveBeenCalledTimes(1));
    await s.settle();
  });
  it('evicts the original authorized read after leaving without navigating or posting a toast', async () => {
    const s = setup();
    await s.start();
    await s.leave();
    await s.settle();
    expect(s.client.getQueryData(key)).toBeUndefined();
    expect(s.path()).toBe('/away');
    expect(s.toast).not.toHaveBeenCalled();
  });
  for (const replacement of [false, true]) {
    it(`does not remove a ${replacement ? 'replacement' : 'collected'} Query or navigate after success`, async () => {
      const s = setup();
      await s.start();
      await s.leave();
      act(() => {
        s.client.removeQueries({ queryKey: key, exact: true });
        if (replacement)
          s.client.setQueryData(key, {
            value: { ...memory, version: 8 },
            source: 'network',
          });
      });
      const current = s.client.getQueryData(key);
      await s.settle();
      expect(s.client.getQueryData(key)).toBe(current);
      expect(s.invalidate).not.toHaveBeenCalled();
      expect(s.path()).toBe('/away');
      expect(s.toast).not.toHaveBeenCalled();
    });
  }
  for (const kind of ['unauthorized', 'permission', 'notFound'] as const) {
    it(`retains a later ${kind} read after confirmed deletion`, async () => {
      const s = setup();
      await s.start();
      const denial = new ClientProblemError(
        kind,
        kind === 'unauthorized' ? 401 : kind === 'permission' ? 403 : 404,
      );
      await act(async () => {
        await s.client
          .fetchQuery({
            queryKey: key,
            staleTime: 0,
            queryFn: async () => {
              throw denial;
            },
            retry: false,
          })
          .catch(() => undefined);
      });
      expect(s.client.getQueryState(key)?.error).toBe(denial);
      await s.settle();
      expect(s.client.getQueryState(key)?.error).toBe(denial);
      expect(s.invalidate).not.toHaveBeenCalled();
      expect(s.path()).toBe('/story/memories/memory-1/edit');
      expect(s.toast).not.toHaveBeenCalled();
    });
  }
  it('keeps a different Memory and its editor after route reuse', async () => {
    const s = setup();
    await s.start();
    const otherKey = authorSummaryQueryKeys.memory('space-1', 'memory-2');
    act(() =>
      s.client.setQueryData(otherKey, {
        value: {
          ...memory,
          id: 'memory-2',
          title: 'Another memory',
          version: 7,
        },
        source: 'network',
      }),
    );
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Open second editor' }));
    const other = s.client.getQueryData(otherKey);
    await s.settle();
    expect(s.client.getQueryData(otherKey)).toBe(other);
    expect(s.client.getQueryData(key)).toBeUndefined();
    expect(s.path()).toBe('/story/memories/memory-2/edit');
    expect(s.toast).not.toHaveBeenCalled();
  });
  it('binds persistent revocation and settlement to the original Account after replacement', async () => {
    const s = setup();
    await s.start();
    act(() => {
      s.client.clear();
      s.client.setQueryData(key, {
        value: { ...memory, version: 9 },
        source: 'network',
      });
    });
    s.switchScope({ accountId: 'account-2' });
    const other = s.client.getQueryData(key);
    await s.settle();
    expect(s.revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'memory',
      'memory-1',
    );
    expect(s.client.getQueryData(key)).toBe(other);
    expect(s.invalidate).not.toHaveBeenCalled();
    expect(s.path()).toBe('/story/memories/memory-1/edit');
    expect(s.toast).not.toHaveBeenCalled();
  });
  it('binds recovery to the original Space after props change', async () => {
    const s = setup();
    await s.start();
    const otherKey = authorSummaryQueryKeys.memory('space-2', 'memory-1');
    act(() =>
      s.client.setQueryData(otherKey, {
        value: { ...memory, spaceId: 'space-2', version: 7 },
        source: 'network',
      }),
    );
    s.switchScope({ spaceId: 'space-2' });
    const other = s.client.getQueryData(otherKey);
    await s.settle();
    expect(s.client.getQueryData(otherKey)).toBe(other);
    expect(s.client.getQueryData(key)).toBeUndefined();
    expect(
      s.invalidate.mock.calls.every(([o]) => !o?.queryKey?.includes('space-2')),
    ).toBe(true);
    expect(s.path()).toBe('/story/memories/memory-1/edit');
    expect(s.toast).not.toHaveBeenCalled();
  });
  it('rechecks ownership after awaited persistent revocation', async () => {
    const s = setup();
    const revocation = deferred<void>();
    s.revoke.mockImplementationOnce(() => revocation.promise);
    await s.start();
    await act(async () => s.response.resolve());
    await waitFor(() => expect(s.revoke).toHaveBeenCalled());
    act(() => {
      s.client.removeQueries({ queryKey: key, exact: true });
      s.client.setQueryData(key, {
        value: { ...memory, version: 8 },
        source: 'network',
      });
    });
    const current = s.client.getQueryData(key);
    await act(async () => revocation.resolve());
    await waitFor(() => expect(s.client.isMutating()).toBe(0));
    expect(s.client.getQueryData(key)).toBe(current);
    expect(s.path()).toBe('/story/memories/memory-1/edit');
  });
  it('rechecks task ownership after awaited projection recovery', async () => {
    const s = setup();
    const recovery = deferred<void>();
    s.invalidate.mockImplementationOnce(() => recovery.promise);
    await s.start();
    await act(async () => s.response.resolve());
    await waitFor(() => expect(s.invalidate).toHaveBeenCalled());
    await s.leave();
    await act(async () => recovery.resolve());
    await waitFor(() => expect(s.client.isMutating()).toBe(0));
    expect(s.path()).toBe('/away');
    expect(s.toast).not.toHaveBeenCalled();
  });
  for (const denied of [false, true]) {
    it(`preserves a later ${denied ? 'denied read' : 'replacement Query'} during awaited projection recovery`, async () => {
      const s = setup();
      const recovery = deferred<void>();
      s.invalidate.mockImplementationOnce(() => recovery.promise);
      await s.start();
      await act(async () => s.response.resolve());
      await waitFor(() => expect(s.invalidate).toHaveBeenCalled());
      const denial = new ClientProblemError('permission', 403);
      if (denied) {
        await act(async () => {
          await s.client
            .fetchQuery({
              queryKey: key,
              staleTime: 0,
              retry: false,
              queryFn: async () => {
                throw denial;
              },
            })
            .catch(() => undefined);
        });
        expect(s.client.getQueryState(key)?.error).toBe(denial);
      } else
        act(() => {
          s.client.removeQueries({ queryKey: key, exact: true });
          s.client.setQueryData(key, {
            value: { ...memory, version: 8 },
            source: 'network',
          });
        });
      const current = s.client.getQueryData(key);
      await act(async () => recovery.resolve());
      await waitFor(() => expect(s.client.isMutating()).toBe(0));
      expect(s.client.getQueryData(key)).toBe(current);
      if (denied) expect(s.client.getQueryState(key)?.error).toBe(denial);
      expect(s.path()).toBe('/story/memories/memory-1/edit');
      expect(s.toast).not.toHaveBeenCalled();
    });
  }
  for (const change of ['remove', 'version', 'leave'] as const) {
    it(`does not dispatch after ${change} during awaited cancellation`, async () => {
      const s = setup();
      const cancellation = deferred<void>();
      vi.spyOn(s.client, 'cancelQueries').mockImplementationOnce(
        () => cancellation.promise,
      );
      await userEvent.setup().click(await s.confirm());
      if (change === 'leave') await s.leave();
      else
        act(() => {
          if (change === 'remove')
            s.client.removeQueries({ queryKey: key, exact: true });
          else
            s.client.setQueryData(key, {
              value: { ...memory, version: 2 },
              source: 'network',
            });
        });
      await act(async () => cancellation.resolve());
      expect(s.remove).not.toHaveBeenCalled();
      await waitFor(() => expect(s.client.isMutating()).toBe(0));
    });
  }
  it('restores global pending protection after a real leave and return without reviving navigation ownership', async () => {
    const s = setup();
    await s.start();
    await s.leave();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to first editor' }));
    const pending = await screen.findByRole('button', {
      name: memoryProduct.deleting,
    });
    expect(pending.hasAttribute('disabled')).toBe(true);
    await s.settle();
    expect(s.path()).toBe('/story/memories/memory-1/edit');
    expect(s.toast).not.toHaveBeenCalled();
  });
  it('does not show an old failure on another Memory', async () => {
    const s = setup();
    await s.start();
    const otherKey = authorSummaryQueryKeys.memory('space-1', 'memory-2');
    act(() =>
      s.client.setQueryData(otherKey, {
        value: { ...memory, id: 'memory-2', title: 'Second memory' },
        source: 'network',
      }),
    );
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Open second editor' }));
    await s.settle(false);
    expect(screen.queryByText(de.states.server.title)).toBeNull();
    expect(s.path()).toBe('/story/memories/memory-2/edit');
  });
  it('does not admit an edit while deletion is pending', async () => {
    const s = setup();
    await s.start();
    const save = screen.getByRole('button', {
      name: memoryProduct.save,
    });
    expect(save.hasAttribute('disabled')).toBe(true);
    const form = save.closest('form');
    if (!form) throw new Error('The Memory save action has no form');
    fireEvent.submit(form);
    expect(s.update).not.toHaveBeenCalled();
    await s.settle();
  });
  it('does not admit deletion while an edit is pending', async () => {
    const s = setup();
    const confirm = await s.confirm();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: memoryProduct.save }));
    await waitFor(() => expect(s.update).toHaveBeenCalledTimes(1));
    expect(confirm.hasAttribute('disabled')).toBe(true);
    confirm.click();
    expect(s.remove).not.toHaveBeenCalled();
    await act(async () =>
      s.updateResponse.reject(new ClientProblemError('server', 503)),
    );
  });
});

describe('Memory save response ownership for sensitive-media editing', () => {
  it('does not publish a late save into a replacement Account read', async () => {
    const s = setup();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: memoryProduct.save }));
    await waitFor(() => expect(s.update).toHaveBeenCalledTimes(1));
    s.switchScope({ accountId: 'account-2' });
    const replacement = {
      ...memory,
      title: 'Replacement access snapshot',
      version: 99,
      capabilities: { ...memory.capabilities, canEdit: false },
    };
    act(() =>
      s.client.setQueryData(key, { value: replacement, source: 'network' }),
    );
    await act(async () =>
      s.updateResponse.resolve({ ...memory, title: 'Late save', version: 2 }),
    );
    await waitFor(() => expect(s.client.isMutating()).toBe(0));
    expect(s.client.getQueryData(key)).toEqual({
      value: replacement,
      source: 'network',
    });
    expect(s.path()).toBe('/story/memories/memory-1/edit');
  });

  it('does not navigate away from a later task after a save response', async () => {
    const s = setup();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: memoryProduct.save }));
    await waitFor(() => expect(s.update).toHaveBeenCalledTimes(1));
    await s.leave();
    await act(async () => s.updateResponse.resolve({ ...memory, version: 2 }));
    await waitFor(() => expect(s.client.isMutating()).toBe(0));
    expect(s.path()).toBe('/away');
  });
});
