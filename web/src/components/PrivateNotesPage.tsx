import { type FormEvent, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { PrivateNoteDetail } from '../api/generated/models/PrivateNoteDetail';
import {
  PRIVATE_NOTES_PATH,
  privateApiCall,
  privateAreaQueryKeys,
  privateNoteEditPath,
  privateNotePath,
} from '../client/privateArea';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import {
  DeleteConfirmation,
  LoadMoreButton,
  PrivateAreaBackToHub,
  PrivateAreaDetailBack,
  PrivateEditorDiscardSheet,
  usePrivateAreaTaskContext,
  usePrivateTaskEditorLifecycle,
} from './PrivateAreaLayout';
import { UiState } from './UiState';
import { useRequiredTitleValidation } from './useRequiredTitleValidation';

const PAGE_SIZE = 20;

type Props = {
  api: PrivateAreaApi;
  accountId: string;
  spaceId: string;
};

function usePrivateNote(
  api: PrivateAreaApi,
  accountId: string,
  spaceId: string,
) {
  const { noteId } = useParams();
  const query = useQuery({
    queryKey: privateAreaQueryKeys.note(
      accountId,
      spaceId,
      noteId ?? 'missing',
    ),
    queryFn: () => {
      if (!noteId) throw new Error('Missing private note route parameter.');
      return privateApiCall(() => api.getPrivateNote({ spaceId, noteId }));
    },
    enabled: Boolean(noteId),
    retry: false,
  });
  return { noteId, query };
}

function PrivateNoteFields({
  note,
  titleValidation,
}: {
  note?: PrivateNoteDetail;
  titleValidation: ReturnType<typeof useRequiredTitleValidation>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field-group">
        <label htmlFor="private-note-title">
          {t('privateArea.notes.titleLabel')}
        </label>
        <input
          ref={titleValidation.inputRef}
          id="private-note-title"
          name="title"
          required
          maxLength={200}
          defaultValue={note?.title ?? ''}
          aria-invalid={titleValidation.invalid || undefined}
          aria-describedby={
            titleValidation.invalid ? 'private-note-title-error' : undefined
          }
          onChange={(event) =>
            titleValidation.handleChange(event.currentTarget.value)
          }
        />
        {titleValidation.invalid ? (
          <p
            id="private-note-title-error"
            className="status status-error"
            role="alert"
          >
            {t('privateArea.titleRequired')}
          </p>
        ) : null}
      </div>
      <div className="field-group">
        <label htmlFor="private-note-body">
          {t('privateArea.notes.bodyLabel')}
        </label>
        <textarea
          id="private-note-body"
          name="body"
          rows={8}
          defaultValue={note?.body ?? ''}
        />
      </div>
      <label className="private-area-check" htmlFor="private-note-pinned">
        <input
          id="private-note-pinned"
          name="pinned"
          type="checkbox"
          defaultChecked={note?.pinned ?? false}
        />
        <span>{t('privateArea.notes.pinnedLabel')}</span>
      </label>
    </>
  );
}

export function PrivateNotesListPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: privateAreaQueryKeys.notes(accountId, spaceId),
    queryFn: ({ pageParam }) =>
      privateApiCall(() =>
        api.listPrivateNotes({ spaceId, cursor: pageParam, limit: PAGE_SIZE }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        before={<PrivateAreaBackToHub />}
        title={t('privateArea.notes.title')}
        description={t('privateArea.notes.intro')}
        action={
          <Link className="button-link" to={`${PRIVATE_NOTES_PATH}/new`}>
            {t('privateArea.notes.add')}
          </Link>
        }
      />
      {query.isLoading ? (
        <UiState kind="loading" title={t('privateArea.notes.loading')} />
      ) : null}
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && notes.length === 0 ? (
        <UiState
          kind="empty"
          title={t('privateArea.notes.emptyTitle')}
          body={t('privateArea.notes.emptyBody')}
        />
      ) : null}
      {notes.length > 0 ? (
        <section className="private-area-results" aria-live="polite">
          <ul className="private-area-list layout-columns layout-columns-dense">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  className="private-area-card private-area-card-clickable"
                  to={privateNotePath(note.id)}
                >
                  <div className="private-area-card-main">
                    <div className="private-area-card-heading">
                      <h2>{note.title}</h2>
                      {note.pinned ? (
                        <span className="private-area-badge">
                          {t('privateArea.notes.pinned')}
                        </span>
                      ) : null}
                    </div>
                    {note.body ? (
                      <p className="private-area-excerpt">{note.body}</p>
                    ) : null}
                  </div>
                  <span className="private-area-card-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <LoadMoreButton
            hasMore={Boolean(query.hasNextPage)}
            loading={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
          />
        </section>
      ) : null}
    </>
  );
}

export function PrivateNoteCreatePage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: { title: string; body: string; pinned: boolean }) =>
      privateApiCall(() =>
        api.createPrivateNote({ spaceId, privateNoteCreate: values }),
      ),
    onSuccess: async (note) => {
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.notes(accountId, spaceId),
      });
      closeTask(() => {
        navigate(privateNotePath(note.id), {
          replace: true,
          state: navigationState,
        });
      });
    },
  });
  const titleValidation = useRequiredTitleValidation(
    mutation.error,
    'PRIVATE_NOTE_TITLE_REQUIRED',
    mutation.reset,
  );
  const {
    navigationState,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = usePrivateTaskEditorLifecycle({
    fallbackPath: PRIVATE_NOTES_PATH,
    isDirty: dirty,
    isCloseBlocked: mutation.isPending,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const title = titleValidation.validate(String(data.get('title') || ''));
    if (title === null) return;
    mutation.mutate({
      title,
      body: String(data.get('body') || '').trim(),
      pinned: data.get('pinned') === 'on',
    });
  }

  return (
    <>
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending}
          >
            {t('privateArea.notes.detailBack')}
          </button>
        }
        title={t('privateArea.notes.createTitle')}
        description={t('privateArea.notes.intro')}
      />
      <section className="form-card private-area-editor">
        <form
          className="form-grid"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <PrivateNoteFields titleValidation={titleValidation} />
          <div className="form-actions">
            <button
              type="button"
              className="button-link secondary-link"
              onClick={requestClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('privateArea.saving')
                : t('privateArea.save')}
            </button>
          </div>
        </form>
        {mutation.error && !titleValidation.serverInvalid ? (
          <ProblemState error={mutation.error} />
        ) : null}
      </section>
      <PrivateEditorDiscardSheet
        open={showDiscardConfirm}
        onKeep={keepEditing}
        onDiscard={() => closeTask()}
      />
    </>
  );
}

export function PrivateNoteDetailPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const { query } = usePrivateNote(api, accountId, spaceId);
  const { navigationState } = usePrivateAreaTaskContext(PRIVATE_NOTES_PATH);

  if (query.isLoading)
    return <UiState kind="loading" title={t('privateArea.notes.loading')} />;
  if (query.error)
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );
  const note = query.data;
  if (!note) return null;

  return (
    <>
      <PageHeader
        before={
          <PrivateAreaDetailBack
            fallbackPath={PRIVATE_NOTES_PATH}
            fallbackLabel={t('privateArea.notes.detailBack')}
          />
        }
        eyebrow={t('privateArea.privacyLabel')}
        title={note.title}
        action={
          note.capabilities.canEdit ? (
            <Link
              className="button-link secondary-link"
              to={privateNoteEditPath(note.id)}
              state={navigationState}
            >
              {t('privateArea.edit')}
            </Link>
          ) : undefined
        }
      />
      <article className="private-area-detail-card">
        {note.pinned ? (
          <span className="private-area-badge">
            {t('privateArea.notes.pinned')}
          </span>
        ) : null}
        <p className="private-area-detail-body">
          {note.body || t('privateArea.notes.noBody')}
        </p>
      </article>
    </>
  );
}

export function PrivateNoteEditPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const { noteId, query } = usePrivateNote(api, accountId, spaceId);

  const deleteMutation = useMutation({
    mutationFn: (targetNote: PrivateNoteDetail) =>
      privateApiCall(() =>
        api.deletePrivateNote({
          spaceId,
          noteId: targetNote.id,
          ifMatch: String(targetNote.version),
        }),
      ),
    onSuccess: async () => {
      if (noteId) {
        queryClient.removeQueries({
          queryKey: privateAreaQueryKeys.note(accountId, spaceId, noteId),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.notes(accountId, spaceId),
      });
      closeTask(() => navigate(PRIVATE_NOTES_PATH, { replace: true }));
    },
  });

  const mutation = useMutation({
    mutationFn: ({
      note,
      values,
    }: {
      note: PrivateNoteDetail;
      values: { title: string; body: string; pinned: boolean };
    }) =>
      privateApiCall(() =>
        api.updatePrivateNote({
          spaceId,
          noteId: note.id,
          ifMatch: String(note.version),
          privateNoteUpdate: values,
        }),
      ),
    onSuccess: async (note) => {
      queryClient.setQueryData(
        privateAreaQueryKeys.note(accountId, spaceId, note.id),
        note,
      );
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.notes(accountId, spaceId),
      });
      closeTask(() => {
        navigate(privateNotePath(note.id), {
          replace: true,
          state: navigationState,
        });
      });
    },
  });
  const titleValidation = useRequiredTitleValidation(
    mutation.error,
    'PRIVATE_NOTE_TITLE_REQUIRED',
    mutation.reset,
  );
  const detailFallback = noteId ? privateNotePath(noteId) : PRIVATE_NOTES_PATH;
  const {
    navigationState,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = usePrivateTaskEditorLifecycle({
    fallbackPath: detailFallback,
    isDirty: dirty,
    isCloseBlocked: mutation.isPending || deleteMutation.isPending,
    closeToFallback: true,
  });

  if (query.isLoading)
    return <UiState kind="loading" title={t('privateArea.notes.loading')} />;
  if (query.error)
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );
  const note = query.data;
  if (!note) return null;
  if (!note.capabilities.canEdit) {
    return (
      <UiState
        kind="permission"
        title={t('states.permission.title')}
        body={t('states.permission.body')}
      />
    );
  }
  const editableNote: PrivateNoteDetail = note;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const title = titleValidation.validate(String(data.get('title') || ''));
    if (title === null) return;
    mutation.mutate({
      note: editableNote,
      values: {
        title,
        body: String(data.get('body') || '').trim(),
        pinned: data.get('pinned') === 'on',
      },
    });
  }

  return (
    <>
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending || deleteMutation.isPending}
          >
            {t('privateArea.notes.detailBack')}
          </button>
        }
        title={t('privateArea.notes.editTitle')}
        description={t('privateArea.notes.intro')}
      />
      <section className="form-card private-area-editor">
        <form
          className="form-grid"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <PrivateNoteFields note={note} titleValidation={titleValidation} />
          <div className="form-actions">
            <button
              type="button"
              className="button-link secondary-link"
              onClick={requestClose}
              disabled={mutation.isPending || deleteMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('privateArea.saving')
                : t('privateArea.save')}
            </button>
          </div>
        </form>
        {mutation.error && !titleValidation.serverInvalid ? (
          <ProblemState error={mutation.error} />
        ) : null}
      </section>

      {note.capabilities.canDelete ? (
        <article
          className="private-area-detail-card"
          style={{ marginTop: 'var(--space-8)' }}
        >
          <DeleteConfirmation
            onDelete={() => deleteMutation.mutate(note)}
            pending={deleteMutation.isPending}
            error={deleteMutation.error}
          />
        </article>
      ) : null}
      <PrivateEditorDiscardSheet
        open={showDiscardConfirm}
        onKeep={keepEditing}
        onDiscard={() => closeTask()}
      />
    </>
  );
}
