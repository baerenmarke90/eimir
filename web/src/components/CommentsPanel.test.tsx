// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import storyProducts from '../i18n/locales/storyProducts';
import { CommentsPanel } from './CommentsPanel';

afterEach(cleanup);

function comment(overrides: Partial<CommentDetail>): CommentDetail {
  return {
    author: { id: 'author-1', displayName: 'Lea' },
    authorId: 'author-1',
    body: 'A first comment',
    createdAt: new Date('2026-08-01T10:00:00Z'),
    id: 'comment-1',
    spaceId: 'space-1',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function queryClientWithComments(
  comments: CommentDetail[],
  page: { hasMore?: boolean; nextCursor?: string | null } = {},
): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(['comments', 'space-1', 'memory', 'memory-1'], {
    pages: [
      {
        items: comments,
        hasMore: page.hasMore ?? false,
        nextCursor: page.nextCursor ?? null,
      },
    ],
    pageParams: [null],
  });
  return queryClient;
}

function renderPanel(
  comments: CommentDetail[],
  page?: { hasMore?: boolean; nextCursor?: string | null },
): string {
  const queryClient = queryClientWithComments(comments, page);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <CommentsPanel
        commentsApi={{} as CommentsApi}
        spaceId="space-1"
        parentKind="memory"
        parentId="memory-1"
        currentAccountId="me"
        canComment={true}
        offline={false}
      />
    </QueryClientProvider>,
  );
}

function renderInteractivePanel(
  comments: CommentDetail[],
  overrides: Partial<CommentsApi> = {},
) {
  const queryClient = queryClientWithComments(comments);
  return render(
    <QueryClientProvider client={queryClient}>
      <CommentsPanel
        commentsApi={overrides as CommentsApi}
        spaceId="space-1"
        parentKind="memory"
        parentId="memory-1"
        currentAccountId="me"
        canComment={true}
        offline={false}
      />
    </QueryClientProvider>,
  );
}

describe('CommentsPanel', () => {
  it('offers editing only on the caller’s own comment', () => {
    const html = renderPanel([
      comment({ id: 'own', authorId: 'me', body: 'Mine to fix' }),
      comment({ id: 'partner', authorId: 'them', body: 'Not mine' }),
    ]);

    // #604: editing was previously reachable nowhere in this markup.
    expect(html).toContain('Bearbeiten');
    // Exactly one comment is the caller's own, so exactly one edit button.
    expect(html.match(/comment-edit\b/g)?.length).toBe(1);
  });

  it('never offers editing or deleting a comment that is not the caller’s own', () => {
    const html = renderPanel([comment({ id: 'partner', authorId: 'them' })]);

    expect(html).not.toContain('comment-edit');
    expect(html).not.toContain('comment-delete');
  });

  it('shows the edited marker once updatedAt has moved past createdAt', () => {
    const html = renderPanel([
      comment({
        id: 'own',
        authorId: 'me',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-02T10:00:00Z'),
      }),
    ]);

    expect(html).toContain('bearbeitet');
  });

  it('uses first names and marks only the current viewer with the self marker (#1064)', () => {
    const html = renderPanel([
      comment({
        id: 'own',
        authorId: 'me',
        author: { id: 'me', displayName: 'Philipp Reis' },
      }),
      comment({
        id: 'partner',
        authorId: 'them',
        author: { id: 'them', displayName: 'Alex Winter' },
      }),
    ]);

    expect(html).toContain('<strong>Philipp</strong>');
    expect(html).toContain('<strong>Alex</strong>');
    expect(html).not.toContain('Philipp Reis');
    expect(html).not.toContain('Alex Winter');
    expect(html.split(storyProducts.comments.authorSelf).length - 1).toBe(1);
  });

  describe('"Kommentieren" sits at the end of the comment flow (#1015)', () => {
    it('shows the heading with the compose trigger directly below it for zero comments', () => {
      const html = renderPanel([]);

      expect(html).toContain('Kommentare');
      expect(html).toContain('Kommentieren');
      expect(html.indexOf('Kommentare')).toBeLessThan(
        html.indexOf('Kommentieren'),
      );
    });

    it('places a single comment before the compose trigger', () => {
      const html = renderPanel([
        comment({ id: 'only', body: 'Only comment here' }),
      ]);

      expect(html.indexOf('Only comment here')).toBeLessThan(
        html.indexOf('Kommentieren'),
      );
    });

    it('places all comments before the compose trigger for two or more comments', () => {
      const html = renderPanel([
        comment({ id: 'first', body: 'First comment body' }),
        comment({ id: 'second', body: 'Second comment body' }),
      ]);

      expect(html.indexOf('First comment body')).toBeLessThan(
        html.indexOf('Kommentieren'),
      );
      expect(html.indexOf('Second comment body')).toBeLessThan(
        html.indexOf('Kommentieren'),
      );
    });

    it('places "Weitere Kommentare laden" before the compose trigger when paginated', () => {
      const html = renderPanel(
        [comment({ id: 'only', body: 'Only comment here' })],
        { hasMore: true, nextCursor: 'cursor-2' },
      );

      expect(html).toContain('Weitere Kommentare laden');
      expect(html.indexOf('Weitere Kommentare laden')).toBeLessThan(
        html.indexOf('Kommentieren'),
      );
    });

    it('replaces the trigger with the composer on click and restores it on cancel', async () => {
      const user = userEvent.setup();
      renderInteractivePanel([]);

      const trigger = await screen.findByRole('button', {
        name: 'Kommentieren',
      });
      await user.click(trigger);

      expect(screen.getByPlaceholderText('Schreib etwas dazu …')).toBeTruthy();
      // The trigger is gone; only the composer's submit button (same label,
      // different role semantics: type="submit" inside the form) remains.
      expect(
        screen
          .getByRole('button', { name: 'Kommentieren' })
          .getAttribute('type'),
      ).toBe('submit');
      expect(
        screen.getAllByRole('button', { name: 'Kommentieren' }),
      ).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(
        await screen.findByRole('button', { name: 'Kommentieren' }),
      ).toBeTruthy();
      expect(screen.queryByPlaceholderText('Schreib etwas dazu …')).toBeNull();
    });

    it('submits the composed body through the create mutation', async () => {
      const user = userEvent.setup();
      const createMemoryComment = vi
        .fn()
        .mockResolvedValue(comment({ id: 'new', body: 'A brand new comment' }));
      renderInteractivePanel([], { createMemoryComment });

      await user.click(
        await screen.findByRole('button', { name: 'Kommentieren' }),
      );
      await user.type(
        screen.getByPlaceholderText('Schreib etwas dazu …'),
        'A brand new comment',
      );
      await user.click(screen.getByRole('button', { name: 'Kommentieren' }));

      expect(createMemoryComment).toHaveBeenCalledWith({
        spaceId: 'space-1',
        memoryId: 'memory-1',
        commentCreate: { body: 'A brand new comment' },
      });
    });
  });

  describe('comment overflow menu copy (#1015)', () => {
    it('offers the shortened "Löschen" label instead of "Eigenen Kommentar löschen"', () => {
      const html = renderPanel([
        comment({ id: 'own', authorId: 'me', body: 'Mine to remove' }),
      ]);

      expect(html).toContain('Bearbeiten');
      expect(html).toContain('Löschen');
      expect(html).not.toContain('Eigenen Kommentar löschen');
    });
  });
});
