// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import {
  type CommentParentKind,
  commentPresenceQueryKey,
  commentsQueryKey,
} from '../client/commentQueries';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import storyProducts from '../i18n/locales/storyProducts';
import { CommentsPanel } from './CommentsPanel';

const copy = storyProducts.comments;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const own: CommentDetail = {
  id: 'comment-1',
  spaceId: 'space-1',
  authorId: 'me',
  author: { id: 'me', displayName: 'Lea' },
  body: 'My original comment',
  createdAt: new Date('2026-10-19T12:00:00Z'),
  updatedAt: new Date('2026-10-19T12:00:00Z'),
  version: 7,
};
const empty = {
  items: [] as CommentDetail[],
  hasMore: false,
  nextCursor: null,
};
const methods = {
  memory: 'listMemoryComments',
  heartMoment: 'listHeartMomentComments',
  milestone: 'listMilestoneComments',
} as const;
function setup(kind: CommentParentKind = 'memory') {
  const response = deferred<void>();
  const remove = vi
    .fn()
    .mockReturnValueOnce(response.promise)
    .mockResolvedValue(undefined);
  const list = vi.fn(async () => empty);
  const api = {
    deleteComment: remove,
    [methods[kind]]: list,
  } as unknown as CommentsApi;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: 2, retryDelay: 0 },
    },
  });
  clients.push(client);
  const key = commentsQueryKey('space-1', kind, 'parent-1');
  const presence = commentPresenceQueryKey('space-1', kind, 'parent-1');
  const data = {
    pages: [{ ...empty, items: [{ ...own }] }],
    pageParams: [null],
  };
  client.setQueryData(key, data);
  client.setQueryData(presence, true);
  let visible = true;
  let props: ComponentProps<typeof CommentsPanel> = {
    commentsApi: api,
    spaceId: 'space-1',
    parentKind: kind,
    parentId: 'parent-1',
    currentAccountId: 'me',
    canComment: true,
    offline: false,
  };
  const ui = () => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        {visible ? <CommentsPanel {...props} /> : null}
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(ui());
  return {
    client,
    key,
    presence,
    data,
    response,
    remove,
    list,
    api,
    rerender(patch: Partial<typeof props>) {
      props = { ...props, ...patch };
      view.rerender(ui());
    },
    show(value: boolean) {
      visible = value;
      view.rerender(ui());
    },
  };
}
async function deleteButton() {
  await userEvent.setup().click(screen.getByLabelText(copy.moreActions));
  return screen.getByRole<HTMLButtonElement>('button', { name: copy.delete });
}
async function submit() {
  fireEvent.click(await deleteButton());
}

describe.each(['memory', 'heartMoment', 'milestone'] as const)(
  '%s comment delete admission',
  (kind) => {
    it('admits one synchronous double activation with the original If-Match', async () => {
      const state = setup(kind);
      const button = await deleteButton();
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
      expect(state.remove).toHaveBeenCalledWith({
        spaceId: 'space-1',
        commentId: own.id,
        ifMatch: '7',
      });
      await act(async () => state.response.resolve());
    });

    it('retains pending admission across departure and return until canonical refresh', async () => {
      const state = setup(kind);
      await submit();
      await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
      state.show(false);
      state.show(true);
      const button = await deleteButton();
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(state.remove).toHaveBeenCalledTimes(1);
      await act(async () => state.response.resolve());
      await waitFor(() => expect(screen.queryByText(own.body)).toBeNull());
    });
  },
);

describe('comment delete request and task lifetime', () => {
  it('does not dispatch when the panel leaves before execution', async () => {
    const state = setup();
    const button = await deleteButton();
    act(() => {
      fireEvent.click(button);
      state.show(false);
    });
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('captures the API and comment version before deferred execution', async () => {
    const state = setup();
    const button = await deleteButton();
    const replacement = vi.fn();
    act(() => {
      fireEvent.click(button);
      state.rerender({
        commentsApi: {
          deleteComment: replacement,
          listMemoryComments: state.list,
        } as unknown as CommentsApi,
      });
      state.data.pages[0].items[0].version = 8;
    });
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    expect(replacement).not.toHaveBeenCalled();
    expect(state.remove.mock.calls[0][0].ifMatch).toBe('7');
    await act(async () => state.response.resolve());
  });

  it('does not show a late failure after offline reactivation', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    state.rerender({ offline: true });
    state.rerender({ offline: false });
    await act(async () => state.response.reject(new Error('old task failed')));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(
      screen.queryByText(de.states.unknown.title, { exact: true }),
    ).toBeNull();
    expect(screen.getByText(own.body)).toBeTruthy();
  });

  it('preserves content on failure and permits only deliberate retry', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    await act(async () =>
      state.response.reject(new ClientProblemError('server', 503)),
    );
    await screen.findByText(de.states.server.title, { exact: true });
    expect(screen.getByText(own.body)).toBeTruthy();
    expect(state.remove).toHaveBeenCalledTimes(1);
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(own.body)).toBeNull());
  });
});

describe('comment delete query authority', () => {
  for (const denied of ['unauthorized', 'permission', 'notFound'] as const) {
    it(`does not dispatch after a ${denied} read wins before execution`, async () => {
      const state = setup();
      const button = await deleteButton();
      act(() => {
        fireEvent.click(button);
        state.client
          .getQueryCache()
          .find({ queryKey: state.key, exact: true })
          ?.setState({
            error: new ClientProblemError(denied),
            status: 'error',
          });
      });
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(state.remove).not.toHaveBeenCalled();
    });
  }

  it('rechecks the original parent lifetime after awaiting read cancellation', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    state.show(false);
    const cancellation = deferred<void>();
    const cancel = vi
      .spyOn(state.client, 'cancelQueries')
      .mockReturnValue(cancellation.promise);
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve());
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    state.client.removeQueries({ queryKey: state.key, exact: true });
    state.client.setQueryData(state.key, state.data);
    await act(async () => cancellation.resolve());
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate).not.toHaveBeenCalled();
  });

  for (const target of ['comments', 'presence'] as const) {
    for (const change of [
      'removed',
      'replacement',
      'unauthorized',
      'permission',
      'notFound',
    ] as const) {
      it(`does not refresh ${target} after ${change} wins`, async () => {
        const state = setup();
        await submit();
        await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
        state.show(false);
        const key = target === 'comments' ? state.key : state.presence;
        if (change === 'removed' || change === 'replacement') {
          state.client.removeQueries({ queryKey: key, exact: true });
          if (change === 'replacement')
            state.client.setQueryData(
              key,
              target === 'comments' ? state.data : true,
            );
        } else
          await state.client
            .fetchQuery({
              queryKey: key,
              staleTime: 0,
              retry: false,
              queryFn: () => Promise.reject(new ClientProblemError(change)),
            })
            .catch(() => undefined);
        const invalidate = vi.spyOn(state.client, 'invalidateQueries');
        await act(async () => state.response.resolve());
        await waitFor(() => expect(state.client.isMutating()).toBe(0));
        expect(invalidate).not.toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: key }),
        );
        if (target === 'comments') expect(invalidate).not.toHaveBeenCalled();
        else
          expect(invalidate).toHaveBeenCalledWith({
            queryKey: state.key,
            exact: true,
          });
      });
    }
  }

  it('does not invalidate a presence read created after admission', async () => {
    const state = setup();
    state.client.removeQueries({ queryKey: state.presence, exact: true });
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    state.client.setQueryData(state.presence, true);
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve());
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: state.presence }),
    );
  });

  it('refreshes only the exact admitted queries after departure', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    state.show(false);
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve());
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: state.key, exact: true }],
      [{ queryKey: state.presence, exact: true }],
    ]);
  });

  it('cancels a stale pre-delete read and obtains a fresh canonical page', async () => {
    const state = setup();
    const oldRead = deferred<typeof empty>();
    state.list.mockReturnValueOnce(oldRead.promise);
    act(() => {
      void state.client.refetchQueries({ queryKey: state.key, exact: true });
    });
    await waitFor(() => expect(state.list).toHaveBeenCalledTimes(1));
    await submit();
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
    await act(async () => state.response.resolve());
    await waitFor(() => expect(screen.queryByText(own.body)).toBeNull());
    await act(async () => oldRead.resolve({ ...empty, items: [own] }));
    expect(screen.queryByText(own.body)).toBeNull();
  });
});
