import { ListEntryIconButton } from './ListEntryActions';
import {
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import type {
  CommentsApi,
  DeleteCommentRequest,
} from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import { authorFirstName } from '../client/authorPresentation';
import {
  type CommentParentKind,
  commentPresenceQueryKey,
  commentsQueryKey,
  listCommentsPage,
} from '../client/commentQueries';
import { assertOnlineWrite } from '../client/connectivity';
import {
  type CreateRequestAttempt,
  submitCreateRequest,
} from '../client/createRequestIdentity';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import {
  captureAuthorizedQuery,
  captureQueryIdentity,
} from '../client/queryIdentity';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { CommentEditor } from './CommentEditor';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';

interface CommentCreateSnapshot {
  readonly spaceId: string;
  readonly parentKind: CommentParentKind;
  readonly parentId: string;
  readonly commentCreate: { readonly body: string };
}

/** A write can refresh its original read, but never another or denied lifetime. */
function captureCommentRefresh(client: QueryClient, key: QueryKey) {
  const ownsQuery = captureQueryIdentity(client, key);
  const isCurrent = () =>
    ownsQuery() &&
    !['unauthorized', 'permission', 'notFound'].includes(
      clientProblemKind(client.getQueryState(key)?.error),
    );
  return {
    isCurrent,
    async refresh(ownsParent: () => boolean = isCurrent) {
      if (!isCurrent() || !ownsParent()) return;
      await client.cancelQueries({ queryKey: key, exact: true });
      if (isCurrent() && ownsParent())
        await client.invalidateQueries({ queryKey: key, exact: true });
    },
  };
}

interface CommentCreateSubmission {
  readonly api: CommentsApi;
  readonly snapshot: CommentCreateSnapshot;
  readonly draftSnapshot: string;
  readonly draftRevision: number;
  readonly ownsTask: () => boolean;
  readonly comments: ReturnType<typeof captureCommentRefresh>;
  readonly presence: ReturnType<typeof captureCommentRefresh>;
  readonly attempt: {
    current: CreateRequestAttempt<CommentCreateSnapshot> | null;
  };
}

interface CommentDeleteSubmission {
  readonly api: CommentsApi;
  readonly request: Readonly<DeleteCommentRequest>;
  readonly ownsTask: () => boolean;
  readonly isCurrent: () => boolean;
  readonly comments: ReturnType<typeof captureCommentRefresh>;
  readonly presence: ReturnType<typeof captureCommentRefresh>;
}

function createComment(
  commentsApi: CommentsApi,
  snapshot: CommentCreateSnapshot,
  idempotencyKey: string,
) {
  const { spaceId, parentId, commentCreate } = snapshot;
  switch (snapshot.parentKind) {
    case 'memory':
      return commentsApi.createMemoryComment({
        spaceId,
        memoryId: parentId,
        commentCreate,
        idempotencyKey,
      });
    case 'heartMoment':
      return commentsApi.createHeartMomentComment({
        spaceId,
        heartMomentId: parentId,
        commentCreate,
        idempotencyKey,
      });
    case 'milestone':
      return commentsApi.createMilestoneComment({
        spaceId,
        milestoneId: parentId,
        commentCreate,
        idempotencyKey,
      });
  }
}

function commentTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

interface CommentsPanelProps {
  commentsApi: CommentsApi;
  spaceId: string;
  parentKind: CommentParentKind;
  parentId: string;
  currentAccountId: string;
  canComment: boolean;
  offline: boolean;
}

export function CommentsPanel(props: CommentsPanelProps) {
  return (
    <CommentsPanelContent
      key={JSON.stringify([
        props.currentAccountId,
        props.spaceId,
        props.parentKind,
        props.parentId,
      ])}
      {...props}
    />
  );
}

function CommentsPanelContent({
  commentsApi,
  spaceId,
  parentKind,
  parentId,
  currentAccountId,
  canComment,
  offline,
}: CommentsPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const commentDraftRef = useRef('');
  const commentDraftRevisionRef = useRef(0);
  const createAttemptRef =
    useRef<CreateRequestAttempt<CommentCreateSnapshot> | null>(null);
  const captureCreateOwnership = useTaskActivation(
    composerOpen && canComment && !offline,
  );
  const createKey = [
    'comment-create',
    currentAccountId,
    spaceId,
    parentKind,
    parentId,
  ];
  const creating = useIsMutating({ mutationKey: createKey, exact: true }) > 0;
  const deleteKey = [
    'comment-delete',
    currentAccountId,
    spaceId,
    parentKind,
    parentId,
  ];
  const deleting = useIsMutating({ mutationKey: deleteKey, exact: true }) > 0;
  const captureDeleteOwnership = useTaskActivation(!offline);
  const queryKey = commentsQueryKey(spaceId, parentKind, parentId);
  const presenceKey = commentPresenceQueryKey(spaceId, parentKind, parentId);
  const commentsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listCommentsPage(commentsApi, parentKind, spaceId, parentId, pageParam),
    enabled: !offline,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    retry: false,
  });

  const createMutation = useMutation({
    mutationKey: createKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (submission: CommentCreateSubmission) => {
      if (!submission.ownsTask() || !submission.comments.isCurrent())
        throw new ClientProblemError('permission');
      assertOnlineWrite();
      return submitCreateRequest({
        previousAttempt: submission.attempt.current,
        snapshot: submission.snapshot,
        rememberAttempt: (attempt) => {
          submission.attempt.current = attempt;
        },
        request: (idempotencyKey) =>
          createComment(submission.api, submission.snapshot, idempotencyKey),
      });
    },
    onSuccess: async (_comment, submission) => {
      if (!submission.comments.isCurrent()) return;
      await Promise.all([
        submission.comments.refresh(),
        submission.presence.refresh(submission.comments.isCurrent),
      ]);
      if (
        submission.ownsTask() &&
        submission.comments.isCurrent() &&
        commentDraftRevisionRef.current === submission.draftRevision &&
        commentDraftRef.current === submission.draftSnapshot
      ) {
        commentDraftRef.current = '';
        setCommentDraft('');
        setComposerOpen(false);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationKey: deleteKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (submission: CommentDeleteSubmission) => {
      try {
        if (!submission.ownsTask() || !submission.isCurrent())
          throw new ClientProblemError('permission');
        assertOnlineWrite();
        await submission.api.deleteComment(submission.request);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (_result, submission) => {
      if (!submission.isCurrent()) return;
      await Promise.all([
        submission.comments.refresh(submission.isCurrent),
        submission.presence.refresh(submission.isCurrent),
      ]);
    },
  });

  function removeComment(comment: CommentDetail) {
    if (queryClient.isMutating({ mutationKey: deleteKey, exact: true })) return;
    deleteMutation.mutate({
      api: commentsApi,
      request: {
        spaceId,
        commentId: comment.id,
        ifMatch: String(comment.version),
      },
      ownsTask: captureDeleteOwnership(),
      isCurrent: captureAuthorizedQuery(queryClient, queryKey),
      comments: captureCommentRefresh(queryClient, queryKey),
      presence: captureCommentRefresh(queryClient, presenceKey),
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftSnapshot = commentDraftRef.current;
    const draftRevision = commentDraftRevisionRef.current;
    const body = draftSnapshot.trim();
    if (
      !body ||
      queryClient.isMutating({ mutationKey: createKey, exact: true })
    )
      return;
    createMutation.mutate({
      api: commentsApi,
      snapshot: { spaceId, parentKind, parentId, commentCreate: { body } },
      draftSnapshot,
      draftRevision,
      ownsTask: captureCreateOwnership(),
      comments: captureCommentRefresh(queryClient, queryKey),
      presence: captureCommentRefresh(queryClient, presenceKey),
      attempt: createAttemptRef,
    });
  }

  const comments =
    commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const canReadComments =
    commentsQuery.data !== undefined &&
    !['unauthorized', 'permission', 'notFound'].includes(
      clientProblemKind(commentsQuery.error),
    );
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
      ) : commentsQuery.error && !canReadComments ? (
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
                  <span className="comment-author">
                    <strong>{authorFirstName(comment.author)}</strong>
                    {own ? (
                      <span className="comment-author-self">
                        {' · '}
                        {t('comments.authorSelf')}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    <time dateTime={comment.createdAt.toISOString()}>
                      {commentTimestamp(comment.createdAt)}
                    </time>
                    {edited ? ` · ${t('comments.edited')}` : ''}
                  </span>
                  {own && !offline && editingId !== comment.id ? (
                    <ListEntryIconButton
                      className="comment-edit"
                      icon="edit"
                      label={t('comments.edit')}
                      onClick={() => setEditingId(comment.id)}
                    />
                  ) : null}
                </div>
                {own && editingId === comment.id ? (
                  <CommentEditor
                    key={comment.id}
                    comment={comment}
                    commentsApi={commentsApi}
                    spaceId={spaceId}
                    parentKind={parentKind}
                    parentId={parentId}
                    currentAccountId={currentAccountId}
                    onClose={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <p>{comment.body}</p>
                    {own && !offline ? (
                      <details className="comment-menu">
                        <summary
                          className="comment-menu-trigger"
                          aria-label={t('comments.moreActions')}
                          title={t('comments.moreActions')}
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
                            className="comment-menu-item comment-delete comment-menu-item-danger"
                            onClick={(e) => {
                              const details = (e.target as HTMLElement).closest(
                                'details',
                              );
                              if (details) details.open = false;
                              removeComment(comment);
                            }}
                            disabled={deleting}
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

      {!offline && commentsQuery.error && canReadComments ? (
        <ProblemState
          error={commentsQuery.error}
          onRetry={() => void commentsQuery.refetch()}
        />
      ) : null}

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
            value={commentDraft}
            onChange={(event) => {
              commentDraftRevisionRef.current += 1;
              commentDraftRef.current = event.currentTarget.value;
              setCommentDraft(event.currentTarget.value);
            }}
          />
          <div className="comment-compose-actions">
            <button type="submit" disabled={creating}>
              {creating ? t('comments.sending') : t('comments.send')}
            </button>
            <button
              type="button"
              className="tertiary"
              onClick={() => {
                createMutation.reset();
                commentDraftRef.current = '';
                setCommentDraft('');
                setComposerOpen(false);
              }}
              disabled={creating}
            >
              {t('comments.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {createMutation.error &&
      createMutation.variables?.ownsTask() &&
      createMutation.variables.comments.isCurrent() ? (
        <ProblemState error={createMutation.error} />
      ) : null}
      {deleteMutation.error &&
      deleteMutation.variables?.ownsTask() &&
      deleteMutation.variables.isCurrent() ? (
        <ProblemState error={deleteMutation.error} />
      ) : null}
    </section>
  );
}
