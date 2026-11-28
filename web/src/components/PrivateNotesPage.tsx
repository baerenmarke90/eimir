import './FreeComposer.css';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { PrivateNoteDetail } from '../api/generated/models/PrivateNoteDetail';
import { useReturnTo } from '../client/historyEntries';
import {
  capturePrivateCreate,
  capturePrivateDelete,
  capturePrivateEdit,
  PRIVATE_NOTES_PATH,
  privateApiCall,
  privateAreaQueryKeys,
  privateNoteEditPath,
  privateNotePath,
} from '../client/privateArea';
import { useTaskActivation } from '../client/useTaskActivation';
import { useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { PageHeader } from './PageHeader';
import {
  PrivateAreaDetailBack,
  PrivateEditorDiscardSheet,
  PrivateItemLabel,
  PrivateItemMenuSheets,
  PrivateItemMenuTrigger,
  PrivateItemPrivacy,
  usePrivateAreaTaskContext,
  usePrivateItemMenu,
  usePrivateTaskEditorLifecycle,
} from './PrivateAreaLayout';
import { ProblemState } from './ProblemState';
import { TaskBackButton } from './TaskBackButton';
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
        <label htmlFor="private-note-title">{t('common.title')}</label>
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
        title={t('privateArea.notes.title')}
        description={t('privateArea.notes.intro')}
        action={
          <AddActionLink
            floating
            label={t('privateArea.notes.add')}
            to={`${PRIVATE_NOTES_PATH}/new`}
          />
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
                </Link>
              </li>
            ))}
          </ul>
          <AutoLoadMore query={query} className="secondary">
            {t('privateArea.loadMore')}
          </AutoLoadMore>
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
    onMutate: () =>
      capturePrivateCreate(
        queryClient,
        privateAreaQueryKeys.notes(accountId, spaceId),
        captureOwnership(),
      ),
    onSuccess: async (note, _values, context) => {
      await context?.refreshList();
      if (!context?.isCurrentTask()) return;
      closeTask(() => {
        if (!context.isCurrentTask()) return;
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
    captureOwnership,
    fromOverview,
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
          <TaskBackButton
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending}
          >
            {t(
              fromOverview
                ? 'privateArea.backToHub'
                : 'privateArea.notes.detailBack',
            )}
          </TaskBackButton>
        }
        title={t('privateArea.notes.createTitle')}
        description={t('privateArea.notes.intro')}
      />
      <section className="form-card private-area-editor free-composer">
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
              {mutation.isPending ? t('common.saving') : t('common.save')}
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query } = usePrivateNote(api, accountId, spaceId);
  const { navigationState } = usePrivateAreaTaskContext(PRIVATE_NOTES_PATH);
  const menu = usePrivateItemMenu();
  const captureOwnership = useTaskActivation(true);
  const deleteMutation = useMutation({
    mutationFn: (targetNote: PrivateNoteDetail) =>
      privateApiCall(() =>
        api.deletePrivateNote({
          spaceId: targetNote.spaceId,
          noteId: targetNote.id,
          ifMatch: String(targetNote.version),
        }),
      ),
    onMutate: (target) =>
      capturePrivateDelete(
        queryClient,
        privateAreaQueryKeys.note(target.ownerId, target.spaceId, target.id),
        privateAreaQueryKeys.notes(target.ownerId, target.spaceId),
        captureOwnership(),
      ),
    onSuccess: async (_result, _target, context) => {
      if (!context) return;
      await context.refreshList();
      if (!context.isCurrentTask()) {
        context.remove();
        return;
      }
      menu.deleteSheet.current?.closeForNavigation(() => {
        const shouldNavigate = context.isCurrentTask();
        if (context.remove() && shouldNavigate) {
          navigate(PRIVATE_NOTES_PATH, { replace: true });
        }
      });
    },
  });

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
        itemLabel={
          <PrivateItemLabel>
            {t('privateArea.notes.itemLabel')}
          </PrivateItemLabel>
        }
        metadata={<PrivateItemPrivacy />}
        title={note.title}
        titleAction={
          note.capabilities.canEdit || note.capabilities.canDelete ? (
            <PrivateItemMenuTrigger menu={menu} name={note.title} />
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
      <PrivateItemMenuSheets
        menu={menu}
        title={note.title}
        canEdit={note.capabilities.canEdit}
        canDelete={note.capabilities.canDelete}
        onEdit={() =>
          void navigate(privateNoteEditPath(note.id), {
            state: navigationState,
          })
        }
        deletePending={deleteMutation.isPending}
        deleteError={deleteMutation.error}
        onDeleteRequested={() => deleteMutation.reset()}
        onConfirmDelete={() => deleteMutation.mutate(note)}
      />
    </>
  );
}

export function PrivateNoteEditPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const returnTo = useReturnTo();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const { noteId, query } = usePrivateNote(api, accountId, spaceId);

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
          spaceId: note.spaceId,
          noteId: note.id,
          ifMatch: String(note.version),
          privateNoteUpdate: values,
        }),
      ),
    onMutate: ({ note }) =>
      capturePrivateEdit<PrivateNoteDetail>(
        queryClient,
        privateAreaQueryKeys.note(note.ownerId, note.spaceId, note.id),
        privateAreaQueryKeys.notes(note.ownerId, note.spaceId),
      ),
    onSuccess: async (note, _variables, context) => {
      if (!context?.reconcile(note)) return;
      await queryClient.invalidateQueries({ queryKey: context.listKey });
      if (!context.isCurrent()) return;
      closeTask(() => {
        if (!context.isCurrent()) return;
        returnTo(privateNotePath(note.id), { state: navigationState });
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
    isCloseBlocked: mutation.isPending,
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
          <TaskBackButton
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending}
          >
            {t('privateArea.notes.detailBack')}
          </TaskBackButton>
        }
        title={t('privateArea.notes.editTitle')}
        description={t('privateArea.notes.intro')}
      />
      <section className="form-card private-area-editor free-composer">
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
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('common.saving') : t('common.save')}
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
