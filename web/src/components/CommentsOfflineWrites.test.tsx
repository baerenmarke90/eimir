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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import type { CommentParentKind } from '../client/commentQueries';
import de from '../i18n/locales/de';
import storyProducts from '../i18n/locales/storyProducts';
import { CommentsPanel } from './CommentsPanel';

const copy = storyProducts.comments;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

type Operation = 'create' | 'update' | 'delete';
const methods = {
  memory: ['createMemoryComment', 'listMemoryComments', 'memoryId'],
  heartMoment: [
    'createHeartMomentComment',
    'listHeartMomentComments',
    'heartMomentId',
  ],
  milestone: ['createMilestoneComment', 'listMilestoneComments', 'milestoneId'],
} as const;

function setup(kind: CommentParentKind) {
  const own: CommentDetail = {
    id: 'comment-1',
    spaceId: 'space-1',
    authorId: 'me',
    author: { id: 'me', displayName: 'Lea' },
    body: 'Original comment',
    createdAt: new Date('2026-01-20T12:00:00Z'),
    updatedAt: new Date('2026-01-20T12:00:00Z'),
    version: 7,
  };
  let items = [own];
  const page = () => ({ items, hasMore: false, nextCursor: null });
  const create = vi.fn(async () => {
    const added = { ...own, id: 'comment-2', body: 'New comment' };
    items = [...items, added];
    return added;
  });
  const update = vi.fn(async () => {
    const changed = { ...own, body: 'Edited comment', version: 8 };
    items = [changed];
    return changed;
  });
  const remove = vi.fn(async () => {
    items = [];
  });
  const api = {
    [methods[kind][0]]: create,
    [methods[kind][1]]: vi.fn(async () => page()),
    updateComment: update,
    deleteComment: remove,
  } as unknown as CommentsApi;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: 2, retryDelay: 0 },
    },
  });
  clients.push(client);
  client.setQueryData(['comments', 'space-1', kind, 'parent-1'], {
    pages: [page()],
    pageParams: [null],
  });
  const view = render(
    <QueryClientProvider client={client}>
      <CommentsPanel
        commentsApi={api}
        spaceId="space-1"
        parentKind={kind}
        parentId="parent-1"
        currentAccountId="me"
        canComment
        offline={false}
      />
    </QueryClientProvider>,
  );
  return { client, view, create, update, delete: remove };
}

async function prepare(operation: Operation) {
  const user = userEvent.setup();
  if (operation === 'create') {
    await user.click(screen.getByRole('button', { name: copy.send }));
    await user.type(screen.getByRole('textbox'), 'New comment');
  } else {
    await user.click(screen.getByLabelText(copy.edit));
    if (operation === 'update') {
      await user.click(screen.getByRole('button', { name: copy.edit }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Edited comment');
    }
  }
  const name =
    operation === 'create'
      ? copy.send
      : operation === 'update'
        ? copy.save
        : copy.delete;
  const button = screen.getByRole<HTMLButtonElement>('button', { name });
  return () => {
    if (operation === 'delete') fireEvent.click(button);
    else fireEvent.submit(button.closest('form') as HTMLFormElement);
  };
}

describe.each(['memory', 'heartMoment', 'milestone'] as const)(
  '%s comment offline admission',
  (kind) => {
    for (const operation of ['create', 'update', 'delete'] as const) {
      for (const signal of ['query', 'navigator'] as const) {
        it(`${operation}: ${signal} offline settles, never replays, and permits deliberate retry`, async () => {
          const result = setup(kind);
          const submit = await prepare(operation);
          const online = vi
            .spyOn(navigator, 'onLine', 'get')
            .mockReturnValue(signal !== 'navigator');
          await act(async () => {
            onlineManager.setOnline(signal !== 'query');
          });
          submit();
          await screen.findByText(de.states.offline.title, { exact: true });
          expect(result[operation]).not.toHaveBeenCalled();
          expect(
            result.client.getMutationCache().getAll().at(-1)?.state.isPaused,
          ).toBe(false);
          expect(
            result.client.getMutationCache().getAll().at(-1)?.state.status,
          ).toBe('error');
          expect(
            result.client.getQueryData<{ pages: { items: CommentDetail[] }[] }>(
              ['comments', 'space-1', kind, 'parent-1'],
            )?.pages[0].items[0].body,
          ).toBe('Original comment');
          if (operation !== 'delete')
            expect(
              (screen.getByRole('textbox') as HTMLTextAreaElement).value,
            ).toBe(operation === 'create' ? 'New comment' : 'Edited comment');

          online.mockReturnValue(true);
          await act(async () => {
            onlineManager.setOnline(true);
          });
          expect(result[operation]).not.toHaveBeenCalled();
          submit();
          await waitFor(() =>
            expect(result[operation]).toHaveBeenCalledTimes(1),
          );
          if (operation === 'create')
            expect(result.create).toHaveBeenCalledWith({
              spaceId: 'space-1',
              [methods[kind][2]]: 'parent-1',
              commentCreate: { body: 'New comment' },
              idempotencyKey: expect.any(String),
            });
          else
            expect(result[operation]).toHaveBeenCalledWith({
              spaceId: 'space-1',
              commentId: 'comment-1',
              ifMatch: '7',
              ...(operation === 'update'
                ? { commentUpdate: { body: 'Edited comment' } }
                : {}),
            });
          await waitFor(() => expect(result.client.isMutating()).toBe(0));
          if (operation === 'delete')
            expect(screen.queryByText('Original comment')).toBeNull();
          else
            await screen.findByText(
              operation === 'create' ? 'New comment' : 'Edited comment',
              { selector: 'p' },
            );
        });
      }
    }
  },
);

describe('comment writes override inherited retry defaults', () => {
  for (const operation of ['create', 'update', 'delete'] as const) {
    it(`${operation} reports one failed request and waits for a deliberate retry`, async () => {
      const result = setup('memory');
      result[operation].mockRejectedValueOnce(new Error('response lost'));
      const submit = await prepare(operation);
      submit();
      await screen.findByText(de.states.unknown.title, { exact: true });
      await waitFor(() => expect(result.client.isMutating()).toBe(0));
      expect(result[operation]).toHaveBeenCalledTimes(1);
      submit();
      await waitFor(() => expect(result[operation]).toHaveBeenCalledTimes(2));
      if (operation === 'create')
        expect(result.create.mock.calls[1]).toEqual(
          result.create.mock.calls[0],
        );
    });
  }
});
