import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { CommentDetail } from '../api/generated/models/CommentDetail';
import {
  type CommentParentKind,
  commentsQueryKey,
} from '../client/commentQueries';
import { assertOnlineWrite } from '../client/connectivity';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTaskActivation } from '../client/useTaskActivation';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';

export function CommentEditor({
  comment,
  commentsApi,
  spaceId,
  parentKind,
  parentId,
  currentAccountId,
  onClose,
}: {
  comment: CommentDetail;
  commentsApi: CommentsApi;
  spaceId: string;
  parentKind: CommentParentKind;
  parentId: string;
  currentAccountId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const captureOwnership = useTaskActivation(true);
  const [draft, setDraft] = useState(comment.body);
  const draftRef = useRef({ value: comment.body, revision: 0 });
  // Background reads cannot silently rebase text authored against an older version.
  const versionRef = useRef(comment.version);
  const mutationKey = [
    'comment-update',
    currentAccountId,
    spaceId,
    parentKind,
    parentId,
    comment.id,
  ];
  const pending = useIsMutating({ mutationKey, exact: true }) > 0;
  type Submission = {
    api: CommentsApi;
    client: typeof client;
    queryKey: ReturnType<typeof commentsQueryKey>;
    isCurrent: () => boolean;
    ownsTask: () => boolean;
    close: () => void;
    spaceId: string;
    commentId: string;
    version: number;
    draft: typeof draftRef.current;
  };
  const mutation = useMutation({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (submission: Submission) => {
      try {
        if (!submission.ownsTask() || !submission.isCurrent())
          throw new ClientProblemError('permission');
        assertOnlineWrite();
        return await submission.api.updateComment({
          spaceId: submission.spaceId,
          commentId: submission.commentId,
          ifMatch: String(submission.version),
          commentUpdate: { body: submission.draft.value.trim() },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (updated, submission) => {
      if (!submission.isCurrent()) return;
      if (submission.ownsTask()) versionRef.current = updated.version;
      await submission.client.invalidateQueries({
        queryKey: submission.queryKey,
        exact: true,
      });
      if (
        submission.isCurrent() &&
        submission.ownsTask() &&
        draftRef.current.revision === submission.draft.revision &&
        draftRef.current.value === submission.draft.value
      )
        submission.close();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !draftRef.current.value.trim() ||
      client.isMutating({ mutationKey, exact: true })
    )
      return;
    const queryKey = commentsQueryKey(spaceId, parentKind, parentId);
    mutation.mutate({
      api: commentsApi,
      client,
      queryKey,
      isCurrent: captureAuthorizedQuery(client, queryKey),
      ownsTask: captureOwnership(),
      close: onClose,
      spaceId,
      commentId: comment.id,
      version: versionRef.current,
      draft: { ...draftRef.current },
    });
  }

  return (
    <>
      <form className="comment-edit-form" onSubmit={submit}>
        <label htmlFor={`${parentKind}-${comment.id}-edit`}>
          {t('comments.inputLabel')}
        </label>
        <textarea
          id={`${parentKind}-${comment.id}-edit`}
          name="editedComment"
          rows={3}
          maxLength={2000}
          required
          value={draft}
          onChange={(event) => {
            draftRef.current = {
              value: event.currentTarget.value,
              revision: draftRef.current.revision + 1,
            };
            setDraft(event.currentTarget.value);
          }}
        />
        <div className="comment-edit-actions">
          <button type="submit" disabled={pending}>
            {pending ? t('comments.saving') : t('comments.save')}
          </button>
          <button
            type="button"
            className="tertiary"
            onClick={onClose}
            disabled={pending}
          >
            {t('comments.cancel')}
          </button>
        </div>
      </form>
      {mutation.error &&
      mutation.variables?.ownsTask() &&
      mutation.variables.isCurrent() ? (
        <ProblemState error={mutation.error} />
      ) : null}
    </>
  );
}
