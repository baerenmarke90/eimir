import { authorDisplayName } from '../client/authorPresentation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import {
  commentPresenceQueryKey,
  commentsQueryKey,
  type CommentParentKind,
  listCommentsPage,
} from '../client/commentQueries';
import { normalizeClientError } from '../client/problemDetails';
import { resolvedLocale, useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';

function createComment(
  commentsApi: CommentsApi,
  parentKind: CommentParentKind,
  spaceId: string,
  parentId: string,
  body: string,
) {
  const commentCreate = { body };
  switch (parentKind) {
    case 'memory':
      return commentsApi.createMemoryComment({
        spaceId,
        memoryId: parentId,
        commentCreate,
      });
    case 'heartMoment':
      return commentsApi.createHeartMomentComment({
        spaceId,
        heartMomentId: parentId,
        commentCreate,
      });
    case 'milestone':
      return commentsApi.createMilestoneComment({
        spaceId,
        milestoneId: parentId,
        commentCreate,
      });
  }
}

function commentTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function CommentsPanel({
  commentsApi,
  spaceId,
  parentKind,
  parentId,
  currentAccountId,
  canComment,
  offline,
}: {
  commentsApi: CommentsApi;
  spaceId: string;
  parentKind: CommentParentKind;
  parentId: string;
  currentAccountId: string;
  canComment: boolean;
  offline: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const queryKey = commentsQueryKey(spaceId, parentKind, parentId);
  const presenceKey = commentPresenceQueryKey(spaceId, parentKind, parentId);
  const commentsQuery = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      try {
        return await listCommentsPage(
          commentsApi,
          parentKind,
          spaceId,
          parentId,
          pageParam,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: !offline,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async (body: string) => {
      try {
        return await createComment(
          commentsApi,
          parentKind,
          spaceId,
          parentId,
          body,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: presenceKey }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (comment: CommentDetail) => {
      try {
        await commentsApi.deleteComment({
          spaceId,
          commentId: comment.id,
          ifMatch: String(comment.version),
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: presenceKey }),
      ]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      comment,
      body,
    }: {
      comment: CommentDetail;
      body: string;
    }) => {
      try {
        return await commentsApi.updateComment({
          spaceId,
          commentId: comment.id,
          ifMatch: String(comment.version),
          commentUpdate: { body },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  function submitEdit(
    event: FormEvent<HTMLFormElement>,
    comment: CommentDetail,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = String(data.get('editedComment') || '').trim();
    if (!body) return;
    updateMutation.mutate({ comment, body });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get('comment') || '').trim();
    if (!body) return;
    createMutation.mutate(body, {
      onSuccess: () => {
        form.reset();
        setComposerOpen(false);
      },
    });
  }

  const comments =
    commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const headingId = `${parentKind}-comments-heading`;
  const formId = `${parentKind}-${parentId}-comment-form`;

  return (
    <section
      className="comments-panel comments-panel-compact"
      aria-labelledby={headingId}
    >
      <div className="comments-compact-head">
        <h2
          id={headingId}
          className={
            comments.length === 0 ? 'sr-only' : 'comments-compact-heading'
          }
        >
          {t('comments.heading')}
        </h2>
      </div>

      {offline ? (
        <p className="muted" role="status">
          {t('comments.offline')}
        </p>
      ) : commentsQuery.isLoading ? (
        <UiState kind="loading" title={t('comments.loading')} />
      ) : commentsQuery.error ? (
        <ProblemState
          error={commentsQuery.error}
          onRetry={() => void commentsQuery.refetch()}
        />
      ) : comments.length === 0 ? null : (
        <ol className="comment-list">
          {comments.map((comment) => {
            const edited =
              comment.updatedAt.getTime() !== comment.createdAt.getTime();
            const own = comment.authorId === currentAccountId;
            return (
              <li key={comment.id} className="comment-card">
                <div className="comment-head">
                  <strong>{authorDisplayName(comment.author)}</strong>
                  <span>
                    <time dateTime={comment.createdAt.toISOString()}>
                      {commentTimestamp(comment.createdAt)}
                    </time>
                    {edited ? ` · ${t('comments.edited')}` : ''}
                  </span>
                </div>
                {own && editingId === comment.id ? (
                  <form
                    className="comment-edit-form"
                    onSubmit={(event) => submitEdit(event, comment)}
                  >
                    <label htmlFor={`${parentKind}-${comment.id}-edit`}>
                      {t('comments.inputLabel')}
                    </label>
                    <textarea
                      id={`${parentKind}-${comment.id}-edit`}
                      name="editedComment"
                      rows={3}
                      maxLength={2000}
                      required
                      defaultValue={comment.body}
                    />
                    <div className="comment-edit-actions">
                      <button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending
                          ? t('comments.saving')
                          : t('comments.save')}
                      </button>
                      <button
                        type="button"
                        className="tertiary"
                        onClick={() => setEditingId(null)}
                        disabled={updateMutation.isPending}
                      >
                        {t('comments.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p>{comment.body}</p>
                    {own && !offline ? (
                      <details className="comment-menu">
                        <summary
                          className="comment-menu-trigger"
                          aria-label={t('comments.edit')}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="19" cy="12" r="1.5" />
                            <circle cx="5" cy="12" r="1.5" />
                          </svg>
                        </summary>
                        <div className="comment-menu-dropdown">
                          <button
                            type="button"
                            className="comment-menu-item comment-edit"
                            onClick={(e) => {
                              const details = (e.target as HTMLElement).closest(
                                'details',
                              );
                              if (details) details.open = false;
                              setEditingId(comment.id);
                            }}
                          >
                            {t('comments.edit')}
                          </button>
                          <button
                            type="button"
                            className="comment-menu-item comment-delete comment-menu-item-danger"
                            onClick={(e) => {
                              const details = (e.target as HTMLElement).closest(
                                'details',
                              );
                              if (details) details.open = false;
                              deleteMutation.mutate(comment);
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            {t('comments.delete')}
                          </button>
                        </div>
                      </details>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {commentsQuery.hasNextPage ? (
        <button
          type="button"
          className="secondary"
          onClick={() => void commentsQuery.fetchNextPage()}
          disabled={commentsQuery.isFetchingNextPage}
        >
          {commentsQuery.isFetchingNextPage
            ? t('comments.loadingMore')
            : t('comments.loadMore')}
        </button>
      ) : null}

      {canComment && !offline && !composerOpen ? (
        <button
          type="button"
          className="comment-compose-trigger tertiary"
          aria-controls={formId}
          aria-expanded="false"
          onClick={() => setComposerOpen(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
          <span>{t('comments.send')}</span>
        </button>
      ) : null}

      {canComment && !offline && composerOpen ? (
        <form
          id={formId}
          className="comment-form comment-form-compact"
          onSubmit={submit}
        >
          <label
            className="sr-only"
            htmlFor={`${parentKind}-${parentId}-comment`}
          >
            {t('comments.inputLabel')}
          </label>
          <textarea
            id={`${parentKind}-${parentId}-comment`}
            name="comment"
            rows={3}
            maxLength={2000}
            required
            placeholder={t('comments.placeholder')}
          />
          <div className="comment-compose-actions">
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? t('comments.sending')
                : t('comments.send')}
            </button>
            <button
              type="button"
              className="tertiary"
              onClick={() => {
                createMutation.reset();
                setComposerOpen(false);
              }}
              disabled={createMutation.isPending}
            >
              {t('comments.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {createMutation.error ? (
        <ProblemState error={createMutation.error} />
      ) : null}
      {updateMutation.error ? (
        <ProblemState error={updateMutation.error} />
      ) : null}
      {deleteMutation.error ? (
        <ProblemState error={deleteMutation.error} />
      ) : null}
    </section>
  );
}
