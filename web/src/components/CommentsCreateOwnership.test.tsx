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
import { ResponseError } from '../api/generated/runtime';
import {
  type CommentParentKind,
  commentPresenceQueryKey,
  commentsQueryKey,
  listCommentsPage,
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
const created: CommentDetail = {
  id: 'new-1',
  spaceId: 'space-1',
  authorId: 'me',
  author: { id: 'me', displayName: 'Lea' },
  body: 'Submitted words',
  createdAt: new Date('2026-10-18T12:00:00Z'),
  updatedAt: new Date('2026-10-18T12:00:00Z'),
  version: 1,
};
const methods = {
  memory: ['createMemoryComment', 'listMemoryComments', 'memoryId'],
  heartMoment: [
    'createHeartMomentComment',
    'listHeartMomentComments',
    'heartMomentId',
  ],
  milestone: ['createMilestoneComment', 'listMilestoneComments', 'milestoneId'],
} as const;
const empty = {
  items: [] as CommentDetail[],
  hasMore: false,
  nextCursor: null,
};
function setup(
  kind: CommentParentKind = 'memory',
  options: {
    seed?: boolean;
    initialRead?: ReturnType<typeof deferred<typeof empty>>;
  } = {},
) {
  const response = deferred<CommentDetail>();
  const post = vi
    .fn()
    .mockReturnValueOnce(response.promise)
    .mockImplementation(async (request) => ({
      ...created,
      id: 'new-2',
      body: request.commentCreate.body,
    }));
  const list = vi.fn(async () => ({ ...empty, items: [created] }));
  if (options.initialRead)
    list.mockReturnValueOnce(options.initialRead.promise);
  const api = {
    [methods[kind][0]]: post,
    [methods[kind][1]]: list,
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
  const data = { pages: [empty], pageParams: [null] };
  if (options.seed !== false) client.setQueryData(key, data);
  client.setQueryData(presence, false);
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
    post,
    list,
    api,
    view,
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
async function compose(body = 'Submitted words') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: copy.send }));
  const field = screen.getByRole<HTMLTextAreaElement>('textbox');
  fireEvent.change(field, { target: { value: body } });
  const form = field.closest('form');
  if (!form) throw new Error('Expected comment composer');
  return { field, form, user };
}
async function submit() {
  const editor = await compose();
  fireEvent.submit(editor.form);
  return editor;
}

describe.each(['memory', 'heartMoment', 'milestone'] as const)(
  '%s comment create ownership',
  (kind) => {
    it('admits one immediate duplicate form submission', async () => {
      const state = setup(kind);
      const { form } = await compose();
      act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });
      await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
      expect(state.post.mock.calls[0][0]).toEqual({
        spaceId: 'space-1',
        [methods[kind][2]]: 'parent-1',
        commentCreate: { body: 'Submitted words' },
        idempotencyKey: expect.any(String),
      });
      await act(async () => state.response.resolve(created));
    });

    it('keeps resource pending across return and never consumes the new composer draft', async () => {
      const state = setup(kind);
      await submit();
      await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
      state.show(false);
      state.show(true);
      const next = await compose('New visit draft');
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: copy.sending })
          .disabled,
      ).toBe(true);
      fireEvent.submit(next.form);
      expect(state.post).toHaveBeenCalledTimes(1);
      await act(async () => state.response.resolve(created));
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(screen.getByRole('textbox')).toBe(next.field);
      expect(next.field.value).toBe('New visit draft');
      expect(state.post).toHaveBeenCalledTimes(1);
      fireEvent.submit(next.form);
      await waitFor(() => expect(state.post).toHaveBeenCalledTimes(2));
      expect(state.post.mock.calls[1][0].idempotencyKey).not.toBe(
        state.post.mock.calls[0][0].idempotencyKey,
      );
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });
  },
);

describe('comment create admission and task lifetime', () => {
  it('does not show an old failure in a reactivated composer', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    state.rerender({ canComment: false });
    state.rerender({ canComment: true });
    await act(async () =>
      state.response.reject(new Error('old activation failed')),
    );
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe(
      'Submitted words',
    );
    expect(
      screen.queryByText(de.states.unknown.title, { exact: true }),
    ).toBeNull();
  });

  it('binds the admitted API before mutation execution', async () => {
    const state = setup();
    const replacementPost = vi.fn();
    const { form } = await compose();
    act(() => {
      fireEvent.submit(form);
      state.rerender({
        commentsApi: {
          createMemoryComment: replacementPost,
          listMemoryComments: state.list,
        } as unknown as CommentsApi,
      });
    });
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    expect(replacementPost).not.toHaveBeenCalled();
    await act(async () => state.response.resolve(created));
  });

  it('does not dispatch after its composer unmounts before execution', async () => {
    const state = setup();
    const { form } = await compose();
    act(() => {
      fireEvent.submit(form);
      state.show(false);
    });
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(state.post).not.toHaveBeenCalled();
  });

  it('does not consume a different activation after capability returns', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    state.rerender({ canComment: false });
    state.rerender({ canComment: true });
    const field = screen.getByRole<HTMLTextAreaElement>('textbox');
    await act(async () => state.response.resolve(created));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(screen.getByRole('textbox')).toBe(field);
    expect(field.value).toBe('Submitted words');
  });

  it('keeps text authored during the post-success refresh', async () => {
    const state = setup();
    const read = deferred<typeof empty>();
    state.list.mockReturnValueOnce(read.promise);
    const { field } = await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    await act(async () => state.response.resolve(created));
    await waitFor(() => expect(state.list).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: 'Typed during refresh' } });
    await act(async () => read.resolve({ ...empty, items: [created] }));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(field.value).toBe('Typed during refresh');
    expect(screen.getByRole('textbox')).toBe(field);
  });

  it('cancels the initial pre-create read and obtains a fresh canonical page', async () => {
    const oldRead = deferred<typeof empty>();
    const state = setup('memory', { seed: false, initialRead: oldRead });
    const { field } = await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: 'Later words' } });
    await act(async () => state.response.resolve(created));
    await waitFor(() => expect(state.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    await screen.findByText('Submitted words', { selector: 'p' });
    await act(async () => oldRead.resolve(empty));
    expect(screen.getByText('Submitted words', { selector: 'p' })).toBeTruthy();
    expect(field.value).toBe('Later words');
  });

  it('allows deliberate creation after a transient initial read failure', async () => {
    const initial = deferred<typeof empty>();
    const state = setup('memory', { seed: false, initialRead: initial });
    await act(async () =>
      initial.reject(new ClientProblemError('server', 503)),
    );
    await screen.findByText(de.states.server.title, { exact: true });
    await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    await act(async () => state.response.resolve(created));
    await screen.findByText('Submitted words', { selector: 'p' });
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('retains unknown-outcome retry identity and does not automatically retry', async () => {
    const state = setup();
    const { form } = await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    await act(async () => state.response.reject(new Error('response lost')));
    await screen.findByText(de.states.unknown.title, { exact: true });
    expect(state.post).toHaveBeenCalledTimes(1);
    fireEvent.submit(form);
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(2));
    expect(state.post.mock.calls[1][0].idempotencyKey).toBe(
      state.post.mock.calls[0][0].idempotencyKey,
    );
  });
});

describe('comment create cache authority', () => {
  for (const status of [401, 403, 404]) {
    it(`recognizes a real HTTP ${status} presence-read denial before late completion`, async () => {
      const state = setup();
      await submit();
      await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
      state.show(false);
      state.list.mockRejectedValueOnce(
        new ResponseError(new Response('{}', { status })),
      );
      await state.client
        .fetchQuery({
          queryKey: state.presence,
          staleTime: 0,
          retry: false,
          queryFn: () =>
            listCommentsPage(
              state.api,
              'memory',
              'space-1',
              'parent-1',
              null,
              1,
            ),
        })
        .catch(() => undefined);
      const invalidate = vi.spyOn(state.client, 'invalidateQueries');
      await act(async () => state.response.resolve(created));
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(state.client.getQueryState(state.presence)?.error).toBeInstanceOf(
        ClientProblemError,
      );
      expect(invalidate).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: state.presence }),
      );
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: state.key,
        exact: true,
      });
    });
  }

  it('rechecks exact Query ownership after awaiting read cancellation', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    state.show(false);
    const cancellation = deferred<void>();
    const cancel = vi
      .spyOn(state.client, 'cancelQueries')
      .mockReturnValue(cancellation.promise);
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve(created));
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    state.client.removeQueries({ queryKey: state.key, exact: true });
    state.client.setQueryData(state.key, state.data);
    await act(async () => cancellation.resolve());
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate).not.toHaveBeenCalled();
    expect(state.client.getQueryData(state.key)).toEqual(state.data);
  });

  for (const target of ['comments', 'presence'] as const) {
    for (const change of [
      'removed',
      'replacement',
      'unauthorized',
      'permission',
      'notFound',
    ] as const) {
      it(`does not refresh ${target} after its ${change} lifetime wins`, async () => {
        const state = setup();
        await submit();
        await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
        state.show(false);
        const key = target === 'comments' ? state.key : state.presence;
        if (change === 'removed' || change === 'replacement') {
          state.client.removeQueries({ queryKey: key, exact: true });
          if (change === 'replacement')
            state.client.setQueryData(
              key,
              target === 'comments' ? state.data : false,
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
        await act(async () => state.response.resolve(created));
        await waitFor(() => expect(state.client.isMutating()).toBe(0));
        expect(invalidate).not.toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: key }),
        );
        if (target === 'presence')
          expect(invalidate).toHaveBeenCalledWith({
            queryKey: state.key,
            exact: true,
          });
        else expect(invalidate).not.toHaveBeenCalled();
      });
    }
  }

  for (const denied of ['unauthorized', 'permission', 'notFound'] as const) {
    it(`does not dispatch against a ${denied} comments read`, async () => {
      const state = setup();
      const { form } = await compose();
      await act(async () => {
        await state.client
          .fetchQuery({
            queryKey: state.key,
            staleTime: 0,
            retry: false,
            queryFn: () => Promise.reject(new ClientProblemError(denied)),
          })
          .catch(() => undefined);
      });
      fireEvent.submit(form);
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(state.post).not.toHaveBeenCalled();
    });
  }

  it('does not refresh a presence query first created after submission', async () => {
    const state = setup();
    state.client.removeQueries({ queryKey: state.presence, exact: true });
    await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    state.client.setQueryData(state.presence, false);
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve(created));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: state.presence }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: state.key,
      exact: true,
    });
  });

  it('refreshes only original exact queries after departure', async () => {
    const state = setup();
    await submit();
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    state.show(false);
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve(created));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: state.key, exact: true }],
      [{ queryKey: state.presence, exact: true }],
    ]);
  });
});
