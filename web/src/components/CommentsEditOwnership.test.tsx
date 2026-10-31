// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import {
  type CommentParentKind,
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

const original: CommentDetail = {
  id: 'own',
  spaceId: 'space-1',
  authorId: 'me',
  author: { id: 'me', displayName: 'Lea' },
  body: 'Original words',
  createdAt: new Date('2026-01-20T12:00:00Z'),
  updatedAt: new Date('2026-01-20T12:00:00Z'),
  version: 7,
};
const other = { ...original, id: 'other', body: 'Another comment' };
const saved = { ...original, body: 'Submitted words', version: 8 };
const listMethods = {
  memory: 'listMemoryComments',
  heartMoment: 'listHeartMomentComments',
  milestone: 'listMilestoneComments',
} as const;

function setup(kind: CommentParentKind = 'memory') {
  const response = deferred<CommentDetail>();
  const update = vi
    .fn()
    .mockReturnValueOnce(response.promise)
    .mockImplementation(async (request) => ({
      ...saved,
      body: request.commentUpdate.body,
      version: 9,
    }));
  const list = vi.fn(async () => ({
    items: [saved, other],
    hasMore: false,
    nextCursor: null,
  }));
  const api = {
    [listMethods[kind]]: list,
    updateComment: update,
  } as unknown as CommentsApi;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: 2, retryDelay: 0 },
    },
  });
  clients.push(client);
  const key = commentsQueryKey('space-1', kind, 'parent-1');
  const data = {
    pages: [{ items: [original, other], hasMore: false, nextCursor: null }],
    pageParams: [null],
  };
  client.setQueryData(key, data);
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
        <CommentsPanel {...props} />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(ui());
  return {
    response,
    update,
    list,
    client,
    key,
    data,
    view,
    rerender: (patch: Partial<typeof props>) => {
      props = { ...props, ...patch };
      view.rerender(ui());
    },
  };
}

async function edit(body = 'Original words') {
  const user = userEvent.setup();
  const card = screen.getByText(body, { selector: 'p' }).closest('li');
  if (!card) throw new Error('Expected comment card');
  await user.click(within(card).getByRole('button', { name: copy.edit }));
  const field = within(card).getByRole<HTMLTextAreaElement>('textbox');
  fireEvent.change(field, { target: { value: 'Submitted words' } });
  const form = field.closest('form');
  if (!form) throw new Error('Expected edit form');
  return { field, form, user };
}

async function submitEdit() {
  const editor = await edit();
  fireEvent.submit(editor.form);
  return editor;
}

describe.each(['memory', 'heartMoment', 'milestone'] as const)(
  '%s comment edit draft ownership',
  (kind) => {
    for (const sameWords of [false, true]) {
      it(`retains a later ${sameWords ? 'same-value revision' : 'draft'} and saves it only deliberately with the confirmed version`, async () => {
        const state = setup(kind);
        const { field, form } = await submitEdit();
        await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
        fireEvent.change(field, { target: { value: 'Later words' } });
        if (sameWords)
          fireEvent.change(field, { target: { value: 'Submitted words' } });
        await act(async () => state.response.resolve(saved));
        await waitFor(() => expect(state.client.isMutating()).toBe(0));
        expect(screen.getByRole('textbox')).toBe(field);
        expect(field.value).toBe(sameWords ? 'Submitted words' : 'Later words');
        expect(state.update).toHaveBeenCalledTimes(1);
        fireEvent.submit(form);
        await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
        expect(state.update.mock.calls[1][0]).toEqual({
          spaceId: 'space-1',
          commentId: 'own',
          ifMatch: '8',
          commentUpdate: { body: field.value },
        });
        await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      });
    }
  },
);

describe('comment editor task and resource ownership', () => {
  for (const outcome of ['success', 'failure'] as const) {
    it(`a departed edit ${outcome} cannot close or report an error on another comment's draft`, async () => {
      const state = setup();
      await submitEdit();
      await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
      const next = await edit('Another comment');
      fireEvent.change(next.field, { target: { value: 'A different task' } });
      await act(async () =>
        outcome === 'success'
          ? state.response.resolve(saved)
          : state.response.reject(new Error('old task failed')),
      );
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(screen.getByRole('textbox')).toBe(next.field);
      expect(next.field.value).toBe('A different task');
      expect(
        screen.queryByText(de.states.unknown.title, { exact: true }),
      ).toBeNull();
    });
  }

  for (const patch of [
    { parentId: 'parent-2' },
    { spaceId: 'space-2' },
    { currentAccountId: 'them' },
  ]) {
    it(`does not carry an edit into ${JSON.stringify(patch)}`, async () => {
      const state = setup();
      await submitEdit();
      await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
      state.client.setQueryData(
        commentsQueryKey(
          patch.spaceId ?? 'space-1',
          'memory',
          patch.parentId ?? 'parent-1',
        ),
        state.data,
      );
      state.rerender(patch);
      expect(screen.queryByRole('textbox')).toBeNull();
      await act(async () => state.response.resolve(saved));
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  }

  it('admits only one immediate duplicate form submission', async () => {
    const state = setup();
    const { form } = await edit();
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    await act(async () => state.response.resolve(saved));
  });

  it('keeps an old in-flight update pending across an editor return', async () => {
    const state = setup();
    const first = await submitEdit();
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    await edit('Another comment');
    const next = await edit();
    expect(next.field).not.toBe(first.field);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: copy.saving })
        .disabled,
    ).toBe(true);
    fireEvent.submit(next.form);
    expect(state.update).toHaveBeenCalledTimes(1);
    await act(async () => state.response.resolve(saved));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(screen.getByRole('textbox')).toBe(next.field);
    expect(next.field.value).toBe('Submitted words');
  });

  it('keeps newer text after failure and retries once with the original version', async () => {
    const state = setup();
    const { field, form } = await submitEdit();
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: 'Later words' } });
    await act(async () => state.response.reject(new Error('response lost')));
    await screen.findByText(de.states.unknown.title, { exact: true });
    expect(field.value).toBe('Later words');
    expect(state.update).toHaveBeenCalledTimes(1);
    fireEvent.submit(form);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
    expect(state.update.mock.calls[1][0].ifMatch).toBe('7');
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('does not dispatch work when its editor departs before mutation execution', async () => {
    const state = setup();
    const { form } = await edit();
    act(() => {
      fireEvent.submit(form);
      state.view.unmount();
    });
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe('comment edit query authority', () => {
  for (const denied of ['unauthorized', 'permission', 'notFound'] as const) {
    it(`does not retain readable comments or the editor after a ${denied} refresh`, async () => {
      const state = setup();
      await edit();
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
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      expect(
        screen.queryByText('Another comment', { selector: 'p' }),
      ).toBeNull();
      expect(
        screen.getByText(
          de.states[denied === 'unauthorized' ? 'session' : 'permission'].title,
          { exact: true },
        ),
      ).toBeTruthy();
    });
  }

  it('retains the newer edit when the successful PATCH is followed by a failed refresh', async () => {
    const state = setup();
    state.list.mockRejectedValueOnce(new ClientProblemError('server', 503));
    const { field, form } = await submitEdit();
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: 'Keep after failed refresh' } });
    await act(async () => state.response.resolve(saved));
    await screen.findByText(de.states.server.title, { exact: true });
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(screen.getByRole('textbox')).toBe(field);
    expect(field.value).toBe('Keep after failed refresh');
    fireEvent.submit(form);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
    expect(state.update.mock.calls[1][0].ifMatch).toBe('8');
  });

  it('keeps the submitted API and identity if props change before dispatch', async () => {
    const state = setup();
    const replacementUpdate = vi.fn();
    const { form } = await edit();
    act(() => {
      fireEvent.submit(form);
      state.rerender({
        commentsApi: {
          updateComment: replacementUpdate,
        } as unknown as CommentsApi,
      });
    });
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    expect(state.update.mock.calls[0][0]).toEqual({
      spaceId: 'space-1',
      commentId: 'own',
      ifMatch: '7',
      commentUpdate: { body: 'Submitted words' },
    });
    expect(replacementUpdate).not.toHaveBeenCalled();
    await act(async () => state.response.resolve(saved));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
  });

  it('does not rebase an open draft onto a newer background read', async () => {
    const state = setup();
    const { form, field } = await edit();
    const newer = { ...original, body: 'Changed elsewhere', version: 9 };
    await act(async () =>
      state.client.setQueryData(state.key, {
        ...state.data,
        pages: [{ ...state.data.pages[0], items: [newer, other] }],
      }),
    );
    expect(field.value).toBe('Submitted words');
    fireEvent.submit(form);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    expect(state.update.mock.calls[0][0].ifMatch).toBe('7');
    await act(async () =>
      state.response.reject(new ClientProblemError('conflict', 409)),
    );
    await screen.findByText(de.states.conflict.title, { exact: true });
    expect(field.value).toBe('Submitted words');
    expect(state.client.getQueryData(state.key)).toEqual({
      ...state.data,
      pages: [{ ...state.data.pages[0], items: [newer, other] }],
    });
  });

  it('retains text authored during the confirmed update refetch', async () => {
    const state = setup();
    const read = deferred<{
      items: CommentDetail[];
      hasMore: boolean;
      nextCursor: null;
    }>();
    state.list.mockReturnValueOnce(read.promise);
    const { field } = await submitEdit();
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    await act(async () => state.response.resolve(saved));
    await waitFor(() => expect(state.list).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: 'Typed during refresh' } });
    await act(async () =>
      read.resolve({ items: [saved, other], hasMore: false, nextCursor: null }),
    );
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(screen.getByRole('textbox')).toBe(field);
    expect(field.value).toBe('Typed during refresh');
  });

  for (const changed of [
    'removed',
    'replacement',
    'unauthorized',
    'permission',
    'notFound',
  ] as const) {
    it(`cannot refresh a ${changed} query after a late success`, async () => {
      const state = setup();
      await submitEdit();
      await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
      state.view.unmount();
      if (changed === 'removed' || changed === 'replacement') {
        state.client.removeQueries({ queryKey: state.key, exact: true });
        if (changed === 'replacement')
          state.client.setQueryData(state.key, state.data);
      } else {
        await state.client
          .fetchQuery({
            queryKey: state.key,
            staleTime: 0,
            retry: false,
            queryFn: () => Promise.reject(new ClientProblemError(changed)),
          })
          .catch(() => undefined);
      }
      const invalidate = vi.spyOn(state.client, 'invalidateQueries');
      await act(async () => state.response.resolve(saved));
      await waitFor(() => expect(state.client.isMutating()).toBe(0));
      expect(invalidate).not.toHaveBeenCalled();
      if (changed === 'removed')
        expect(state.client.getQueryData(state.key)).toBeUndefined();
      else expect(state.client.getQueryData(state.key)).toEqual(state.data);
    });
  }

  it('can invalidate its exact original authorized query after unmount', async () => {
    const state = setup();
    await submitEdit();
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    state.view.unmount();
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve(saved));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: state.key,
      exact: true,
    });
  });

  it('refreshes the original parent rather than the panel now being viewed', async () => {
    const state = setup();
    await submitEdit();
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    const nextKey = commentsQueryKey('space-1', 'memory', 'parent-2');
    state.client.setQueryData(nextKey, state.data);
    state.rerender({ parentId: 'parent-2' });
    const invalidate = vi.spyOn(state.client, 'invalidateQueries');
    await act(async () => state.response.resolve(saved));
    await waitFor(() => expect(state.client.isMutating()).toBe(0));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: state.key,
      exact: true,
    });
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: nextKey }),
    );
  });
});
