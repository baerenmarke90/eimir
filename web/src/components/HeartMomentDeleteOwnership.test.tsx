// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import {
  act,
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
import type { HeartMomentDetail } from '../api/generated/models/HeartMomentDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { ReferenceApis } from '../client/referenceFlow';
import storyProducts from '../i18n/locales/storyProducts';
import de from '../i18n/locales/de';
import { HeartMomentProductPage } from './HeartMomentProductPage';

vi.mock('../client/photoPlaces', async (original) => ({
  ...(await original<object>()),
  photoPlacesRequest: vi
    .fn()
    .mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
}));

const { revoke } = vi.hoisted(() => ({ revoke: vi.fn() }));
vi.mock('../client/productReadCache', async (original) => ({
  ...(await original<object>()),
  deleteProductReadCacheEntry: revoke,
}));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const heartMoment: HeartMomentDetail = {
  id: 'heart-1',
  spaceId: 'space-1',
  text: 'Our shared beginning',
  tags: [],
  emotion: 'LOVED',
  visibility: 'SHARED',
  attachment: null,
  happenedOn: new Date('2026-08-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  version: 1,
  author: { id: 'account-1', displayName: 'Alex' },
  authorId: 'account-1',
  capabilities: { canEdit: true, canDelete: true, canComment: true },
};
const copy = storyProducts.heartMomentProduct;
const key = authorSummaryQueryKeys.heartMoment('space-1', heartMoment.id);
const read = (value = heartMoment) => ({ value, source: 'network' as const });

function Position() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

function setup(mode: 'edit' | 'create' = 'edit') {
  const pending = deferred();
  const deleteHeartMoment = vi.fn(() => pending.promise);
  const createHeartMoment = vi.fn(
    () => new Promise<HeartMomentDetail>(() => {}),
  );
  const updateHeartMoment = vi.fn(
    () => new Promise<HeartMomentDetail>(() => {}),
  );
  const changeHeartMomentVisibility = vi.fn(
    () => new Promise<HeartMomentDetail>(() => {}),
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  client.setQueryData(key, read());
  const apis = {
    comments: {
      listHeartMomentComments: vi
        .fn()
        .mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    },
    heartMoments: {
      createHeartMoment,
      deleteHeartMoment,
      updateHeartMoment,
      changeHeartMomentVisibility,
      getHeartMoment: vi.fn(() => new Promise<HeartMomentDetail>(() => {})),
    },
  } as unknown as ReferenceApis;
  let scope = { accountId: 'account-1', spaceId: 'space-1', apis };
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          mode === 'create'
            ? '/story/heart-moments/new'
            : '/story/heart-moments/heart-1/edit',
        ]}
      >
        <Position />
        <Link to="/other">Other task</Link>
        <Link to="/story/heart-moments/heart-1/edit">Return to edit</Link>
        <Link to="/story/heart-moments/heart-2/edit">Another Heart Moment</Link>
        <Routes>
          <Route
            path="/story/heart-moments/new"
            element={
              <HeartMomentProductPage
                apiBaseUrl="https://example.test"
                accessToken="test-token"
                loadAttachment={async () => 'unused-photo'}
                mode="create"
                apis={scope.apis}
                spaceId={scope.spaceId}
                currentAccountId={scope.accountId}
              />
            }
          />
          <Route
            path="/story/heart-moments/:heartMomentId/edit"
            element={
              <HeartMomentProductPage
                apiBaseUrl="https://example.test"
                accessToken="test-token"
                loadAttachment={async () => 'unused-photo'}
                mode="edit"
                apis={scope.apis}
                spaceId={scope.spaceId}
                currentAccountId={scope.accountId}
              />
            }
          />
          <Route
            path="/story/heart-moments/:heartMomentId"
            element={
              <HeartMomentProductPage
                apiBaseUrl="https://example.test"
                accessToken="test-token"
                loadAttachment={async () => 'unused-photo'}
                mode="detail"
                apis={scope.apis}
                spaceId={scope.spaceId}
                currentAccountId={scope.accountId}
              />
            }
          />
          <Route path="/story" element={<p>Timeline result</p>} />
          <Route path="/other" element={<p>Unrelated task</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  const confirm = async () => {
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.delete }));
    return screen.getByRole('button', {
      name: copy.deleteConfirm,
    });
  };
  const submit = async () => {
    await userEvent.setup().click(await confirm());
    await waitFor(() => expect(deleteHeartMoment).toHaveBeenCalledTimes(1));
  };
  const settle = async () => {
    await act(async () => pending.resolve());
    await waitFor(() => expect(client.isMutating()).toBe(0));
  };
  return {
    client,
    pending,
    deleteHeartMoment,
    createHeartMoment,
    updateHeartMoment,
    changeHeartMomentVisibility,
    apis,
    confirm,
    submit,
    settle,
    setScope(next: Partial<typeof scope>) {
      scope = { ...scope, ...next };
      view.rerender(tree());
    },
  };
}

beforeEach(() => {
  revoke.mockReset().mockResolvedValue(undefined);
  onlineManager.setOnline(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('HeartMoment delete response ownership', () => {
  it('confirms the original version, revokes its persistent read and returns to Timeline', async () => {
    const h = setup();
    await h.submit();
    await h.settle();
    expect(h.deleteHeartMoment).toHaveBeenCalledWith({
      spaceId: 'space-1',
      heartMomentId: heartMoment.id,
      ifMatch: '1',
    });
    expect(revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      heartMoment.id,
    );
    expect(h.client.getQueryData(key)).toBeUndefined();
    expect(screen.getByText('Timeline result')).toBeTruthy();
  });

  it('does not navigate after actual departure or after returning to a new activation', async () => {
    const h = setup();
    await h.submit();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Other task' }));
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to edit' }));
    await h.settle();
    expect(screen.getByLabelText('Current route').textContent).toBe(
      '/story/heart-moments/heart-1/edit',
    );
    expect(h.client.getQueryData(key)).toBeUndefined();
  });

  it('settles its original read without interrupting another task', async () => {
    const h = setup();
    await h.submit();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Other task' }));
    await h.settle();
    expect(screen.getByText('Unrelated task')).toBeTruthy();
    expect(h.client.getQueryData(key)).toBeUndefined();
  });

  it('does not evict a replacement Query or navigate', async () => {
    const h = setup();
    await h.submit();
    act(() => {
      h.client.removeQueries({ queryKey: key });
      h.client.setQueryData(
        key,
        read({ ...heartMoment, text: 'Replacement read' }),
      );
    });
    await h.settle();
    expect(h.client.getQueryData(key)).toEqual(
      read({ ...heartMoment, text: 'Replacement read' }),
    );
    expect(screen.getByLabelText('Current route').textContent).toContain(
      '/edit',
    );
  });

  it.each(['unauthorized', 'permission', 'notFound'] as const)(
    'preserves a later %s read',
    async (kind) => {
      const h = setup();
      await h.submit();
      const denied = new ClientProblemError(kind);
      await act(async () => {
        await h.client
          .fetchQuery({
            queryKey: key,
            staleTime: 0,
            queryFn: () => Promise.reject(denied),
            retry: false,
          })
          .catch(() => {});
      });
      await h.settle();
      expect(h.client.getQueryState(key)?.error).toBe(denied);
      expect(screen.getByLabelText('Current route').textContent).toContain(
        '/edit',
      );
    },
  );

  it('rechecks ownership after persistent revocation', async () => {
    const h = setup();
    const revoking = deferred();
    revoke.mockReturnValue(revoking.promise);
    await h.submit();
    await act(async () => h.pending.resolve());
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    act(() => {
      h.client.removeQueries({ queryKey: key });
      h.client.setQueryData(key, read());
    });
    await act(async () => revoking.resolve());
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.client.getQueryData(key)).toEqual(read());
    expect(screen.getByLabelText('Current route').textContent).toContain(
      '/edit',
    );
  });

  it('rechecks ownership after projection recovery', async () => {
    const h = setup();
    const recovery = deferred();
    vi.spyOn(h.client, 'invalidateQueries').mockImplementation(
      () => recovery.promise,
    );
    await h.submit();
    await act(async () => h.pending.resolve());
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    act(() => {
      h.client.removeQueries({ queryKey: key });
      h.client.setQueryData(key, read());
    });
    await act(async () => recovery.resolve());
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.client.getQueryData(key)).toEqual(read());
    expect(screen.getByLabelText('Current route').textContent).toContain(
      '/edit',
    );
  });

  it('does not follow a reused route to another Heart Moment', async () => {
    const h = setup();
    await h.submit();
    const otherKey = authorSummaryQueryKeys.heartMoment('space-1', 'heart-2');
    act(() =>
      h.client.setQueryData(otherKey, read({ ...heartMoment, id: 'heart-2' })),
    );
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Another Heart Moment' }));
    await h.settle();
    expect(h.client.getQueryData(otherKey)).toBeTruthy();
    expect(h.client.getQueryData(key)).toBeUndefined();
    expect(screen.getByLabelText('Current route').textContent).toContain(
      'heart-2/edit',
    );
  });

  it('keeps the submitting Account, Space and API through a scope change', async () => {
    const h = setup();
    await h.submit();
    const otherKey = authorSummaryQueryKeys.heartMoment(
      'space-2',
      heartMoment.id,
    );
    act(() =>
      h.client.setQueryData(
        otherKey,
        read({ ...heartMoment, spaceId: 'space-2' }),
      ),
    );
    h.setScope({ accountId: 'account-2', spaceId: 'space-2' });
    await h.settle();
    expect(revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      heartMoment.id,
    );
    expect(h.client.getQueryData(otherKey)).toBeTruthy();
    expect(screen.getByLabelText('Current route').textContent).toContain(
      '/edit',
    );
  });

  it('rejects a Query replacement during awaited cancellation before dispatch', async () => {
    const h = setup();
    const cancel = deferred();
    vi.spyOn(h.client, 'cancelQueries').mockReturnValue(cancel.promise);
    fireEvent.click(await h.confirm());
    await act(async () => {
      h.client.removeQueries({ queryKey: key });
      h.client.setQueryData(key, read());
      cancel.resolve();
    });
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.deleteHeartMoment).not.toHaveBeenCalled();
  });

  it('rejects an offline confirmation and never dispatches on reconnect', async () => {
    const h = setup();
    const button = await h.confirm();
    onlineManager.setOnline(false);
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByText(de.states.offline.title)).toBeTruthy(),
    );
    expect(h.client.isMutating()).toBe(0);
    await act(async () => onlineManager.setOnline(true));
    expect(h.deleteHeartMoment).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.deleteConfirm }));
    await waitFor(() => expect(h.deleteHeartMoment).toHaveBeenCalledTimes(1));
    await h.settle();
  });

  it('preserves pending protection after leaving and returning', async () => {
    const h = setup();
    await h.submit();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Other task' }));
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to edit' }));
    expect(
      (screen.getByRole('button', { name: copy.deleting }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: copy.save }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await h.settle();
  });

  it('admits only one synchronous confirmation and prevents a competing save', async () => {
    const h = setup();
    const button = await h.confirm();
    act(() => {
      button.click();
      button.click();
      screen.getByRole('button', { name: copy.save }).click();
    });
    await waitFor(() => expect(h.deleteHeartMoment).toHaveBeenCalledTimes(1));
    expect(h.updateHeartMoment).not.toHaveBeenCalled();
    await h.settle();
  });

  it('prevents deletion while an edit is pending', async () => {
    const h = setup();
    const button = await h.confirm();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() => expect(h.updateHeartMoment).toHaveBeenCalledTimes(1));
    await act(async () => fireEvent.click(button));
    expect(h.deleteHeartMoment).not.toHaveBeenCalled();
  });
  it.each(['version', 'permission', 'cache', 'departure'] as const)(
    'rejects changed %s admission after cancellation',
    async (change) => {
      const h = setup();
      const cancel = deferred();
      vi.spyOn(h.client, 'cancelQueries').mockReturnValue(cancel.promise);
      fireEvent.click(await h.confirm());
      if (change === 'departure') {
        await userEvent
          .setup()
          .click(screen.getByRole('link', { name: 'Other task' }));
      } else {
        act(() =>
          h.client.setQueryData(
            key,
            change === 'cache'
              ? { ...read(), source: 'cache' }
              : read({
                  ...heartMoment,
                  ...(change === 'version'
                    ? { version: 2 }
                    : {
                        capabilities: {
                          ...heartMoment.capabilities,
                          canDelete: false,
                        },
                      }),
                }),
          ),
        );
      }
      await act(async () => cancel.resolve());
      await waitFor(() => expect(h.client.isMutating()).toBe(0));
      expect(h.deleteHeartMoment).not.toHaveBeenCalled();
    },
  );

  it('revokes the original persistent snapshot after its Query is removed', async () => {
    const h = setup();
    await h.submit();
    act(() => h.client.removeQueries({ queryKey: key }));
    await h.settle();
    expect(revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      heartMoment.id,
    );
    expect(h.client.getQueryData(key)).toBeUndefined();
    expect(screen.getByLabelText('Current route').textContent).toContain(
      '/edit',
    );
  });

  it('keeps failed deletion local and requires deliberate retry', async () => {
    const h = setup();
    await h.submit();
    await act(async () =>
      h.pending.reject(new ClientProblemError('server', 503)),
    );
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.client.getQueryData(key)).toEqual(read());
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current route').textContent).toContain(
      '/edit',
    );
    const retry = deferred();
    h.deleteHeartMoment.mockReturnValue(retry.promise);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.deleteConfirm }));
    await waitFor(() => expect(h.deleteHeartMoment).toHaveBeenCalledTimes(2));
    await act(async () => retry.resolve());
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(screen.getByText('Timeline result')).toBeTruthy();
  });
  it('deletes an owner-only Heart Moment without publishing it first', async () => {
    const h = setup();
    act(() =>
      h.client.setQueryData(
        key,
        read({ ...heartMoment, visibility: 'PRIVATE' }),
      ),
    );
    await h.submit();
    await h.settle();
    expect(h.changeHeartMomentVisibility).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(
      'account-1',
      'space-1',
      'heartMoment',
      heartMoment.id,
    );
    expect(screen.getByText('Timeline result')).toBeTruthy();
  });

  it('prevents a visibility write from the real detail while deletion is pending', async () => {
    const h = setup();
    await h.submit();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: copy.backToHeartMoment }));
    const visibility = screen.getByRole('button', { name: copy.makePrivate });
    expect((visibility as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(visibility));
    expect(h.changeHeartMomentVisibility).not.toHaveBeenCalled();
    await h.settle();
    expect(screen.getByLabelText('Current route').textContent).toBe(
      '/story/heart-moments/heart-1',
    );
  });

  it('prevents competing delete and save after a pending visibility action enters Edit', async () => {
    const h = setup();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: copy.backToHeartMoment }));
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.makePrivate }));
    await waitFor(() =>
      expect(h.changeHeartMomentVisibility).toHaveBeenCalledTimes(1),
    );
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to edit' }));
    const open = screen.getByRole('button', { name: copy.delete });
    const save = screen.getByRole('button', { name: copy.save });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(open);
      fireEvent.click(save);
    });
    expect(h.deleteHeartMoment).not.toHaveBeenCalled();
    expect(h.updateHeartMoment).not.toHaveBeenCalled();
  });
});

describe('HeartMoment save response ownership for sensitive-media editing', () => {
  it('preserves a replacement Account read after a late save', async () => {
    const h = setup();
    const response = deferred<HeartMomentDetail>();
    h.updateHeartMoment.mockReturnValueOnce(response.promise);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() => expect(h.updateHeartMoment).toHaveBeenCalledTimes(1));
    h.setScope({ accountId: 'account-2' });
    const replacement = {
      ...heartMoment,
      text: 'Replacement access snapshot',
      version: 99,
      capabilities: { ...heartMoment.capabilities, canEdit: false },
    };
    act(() => h.client.setQueryData(key, read(replacement)));
    await act(async () =>
      response.resolve({ ...heartMoment, text: 'Late save', version: 2 }),
    );
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.client.getQueryData(key)).toEqual(read(replacement));
    expect(screen.getByLabelText('Current route').textContent).toBe(
      '/story/heart-moments/heart-1/edit',
    );
  });

  it('retains a newer authoritative version when an older save response arrives', async () => {
    const h = setup();
    const response = deferred<HeartMomentDetail>();
    h.updateHeartMoment.mockReturnValueOnce(response.promise);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() => expect(h.updateHeartMoment).toHaveBeenCalledTimes(1));
    const newer = {
      ...heartMoment,
      text: 'Newer authoritative text',
      version: 99,
    };
    act(() => h.client.setQueryData(key, read(newer)));
    await act(async () => response.resolve({ ...heartMoment, version: 2 }));
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.client.getQueryData(key)).toEqual(read(newer));
    expect(screen.getByLabelText('Current route').textContent).toBe(
      '/story/heart-moments/heart-1/edit',
    );
  });
});

describe('HeartMoment create response ownership', () => {
  it.each(['account', 'route'] as const)(
    'ignores a late create response after a %s change',
    async (change) => {
      const h = setup('create');
      const response = deferred<HeartMomentDetail>();
      h.createHeartMoment.mockReturnValueOnce(response.promise);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(copy.textLabel), 'Original draft');
      await user.click(screen.getByRole('button', { name: copy.save }));
      await waitFor(() => expect(h.createHeartMoment).toHaveBeenCalledTimes(1));
      if (change === 'account') {
        h.setScope({ accountId: 'account-2' });
        await user.clear(screen.getByLabelText(copy.textLabel));
        await user.type(
          screen.getByLabelText(copy.textLabel),
          'Replacement draft',
        );
      } else {
        await user.click(screen.getByRole('link', { name: 'Other task' }));
      }
      await act(async () => response.resolve(heartMoment));
      await waitFor(() => expect(h.client.isMutating()).toBe(0));
      expect(screen.getByLabelText('Current route').textContent).toBe(
        change === 'account' ? '/story/heart-moments/new' : '/other',
      );
      if (change === 'account')
        expect(
          (screen.getByLabelText(copy.textLabel) as HTMLTextAreaElement).value,
        ).toBe('Replacement draft');
    },
  );
});
