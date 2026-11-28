import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type KeyboardEvent,
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import {
  authorSummaryQueryKeys,
  invalidateSharedNoteConsumers,
} from '../client/authorSummaryConsumers';
import { authorFirstName } from '../client/authorPresentation';
import { assertOnlineWrite } from '../client/connectivity';
import { clientProblemKind } from '../client/problemDetails';
import {
  MORE_NOTES_ROUTE,
  planDetailPath,
  sharedNoteDetailPath,
} from '../client/routes';
import {
  continueBulletOnEnter,
  insertBulletAtCaret,
  isPresentationOnlyChange,
  type NoteDraft,
  noteDraftOf,
  noteDraftsEqual,
  noteHasContent,
  SHARED_NOTE_BODY_MAX,
  SHARED_NOTE_TITLE_MAX,
  sharedNoteApiCall,
} from '../client/sharedNotes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { ComposerTool, ComposerToolRow } from './PageComposer';
import { PlanningDiscardSheet } from './PlanningEditorLifecycle';
import { ProblemState } from './ProblemState';
import { useSharedNote } from './sharedNoteHooks';
import { ComposerHeader } from './StoryFormPageShell';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import { VisibilityBadge } from './VisibilityBadge';
import './FreeComposer.css';
import './PageComposer.css';
import './SharedNotes.css';

type Apis = Pick<SharedPlanningApis, 'sharedNotes' | 'plans'>;

type SaveOutcome =
  | { kind: 'saved'; note: SharedNoteDetail }
  | { kind: 'conflict'; latest: SharedNoteDetail };

function growField(field: HTMLTextAreaElement) {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

function NoteEditor({
  apis,
  spaceId,
  note,
}: {
  apis: Apis;
  spaceId: string;
  /** The saved note being edited; null for a new one. */
  note: SharedNoteDetail | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const { requestReturn } = useTaskOrigin();
  const routeState = location.state as {
    taskOriginKey?: unknown;
    linkPlanId?: unknown;
  } | null;
  const originKey = routeState?.taskOriginKey;
  const linkPlanId =
    typeof routeState?.linkPlanId === 'string' ? routeState.linkPlanId : null;

  const [draft, setDraft] = useState<NoteDraft>(() =>
    note ? noteDraftOf(note) : { title: '', body: '' },
  );
  // The text the writer started from; only the writer's own changes are dirty.
  const [baseline, setBaseline] = useState<NoteDraft>(() =>
    note ? noteDraftOf(note) : { title: '', body: '' },
  );
  const [version, setVersion] = useState(note?.version ?? 0);
  const [conflict, setConflict] = useState<SharedNoteDetail | null>(null);
  const [seeChanges, setSeeChanges] = useState(false);
  const [needsContent, setNeedsContent] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  const isDirty = note
    ? !noteDraftsEqual(draft, baseline) || conflict !== null
    : draft.title.trim() !== '' || draft.body.trim() !== '';
  const fallbackPath = note ? sharedNoteDetailPath(note.id) : MORE_NOTES_ROUTE;

  const write = (input: NoteDraft, ifMatchVersion: number) => {
    assertOnlineWrite();
    const title = input.title.trim();
    const body = input.body.replace(/\s+$/u, '');
    return sharedNoteApiCall(() =>
      note
        ? apis.sharedNotes.updateSharedNote({
            spaceId,
            sharedNoteId: note.id,
            ifMatch: String(ifMatchVersion),
            sharedNoteUpdate: { title, body },
          })
        : apis.sharedNotes.createSharedNote({
            spaceId,
            sharedNoteCreate: { title, body },
          }),
    );
  };

  const save = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (input: {
      draft: NoteDraft;
      version: number;
    }): Promise<SaveOutcome> => {
      try {
        return { kind: 'saved', note: await write(input.draft, input.version) };
      } catch (error) {
        if (!note || clientProblemKind(error) !== 'conflict') throw error;
        const latest = await sharedNoteApiCall(() =>
          apis.sharedNotes.getSharedNote({
            spaceId,
            sharedNoteId: note.id,
          }),
        );
        // Only pinned / title-only-on-Wir changed: the words are the ones the
        // writer started from, so saving them on the new version loses nothing.
        if (isPresentationOnlyChange(baselineRef.current, latest))
          return {
            kind: 'saved',
            note: await write(input.draft, latest.version),
          };
        return { kind: 'conflict', latest };
      }
    },
  });

  const {
    captureOwnership,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed,
    requestClose,
  } = useTaskEditorLifecycle({
    isDirty,
    isCloseBlocked: save.isPending,
    onClose: () => requestReturn(originKey, fallbackPath),
  });

  useLayoutEffect(() => {
    const field = bodyRef.current;
    if (!field) return;
    growField(field);
    if (caretRef.current !== null) {
      field.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  const startedAsEdit = useRef(note !== null);
  useEffect(() => {
    if (startedAsEdit.current) {
      const field = bodyRef.current;
      field?.focus({ preventScroll: true });
      field?.setSelectionRange(field.value.length, field.value.length);
    } else titleRef.current?.focus({ preventScroll: true });
  }, []);

  async function finishSaved(saved: SharedNoteDetail) {
    client.setQueryData(
      authorSummaryQueryKeys.sharedNoteDetail(spaceId, saved.id),
      saved,
    );
    void invalidateSharedNoteConsumers(client, spaceId);
    if (note) {
      postSnackbar('sharedNotes.toast.saved');
      closeConfirmed(() => requestReturn(originKey, fallbackPath));
      return;
    }
    if (linkPlanId) {
      try {
        await sharedNoteApiCall(() =>
          apis.plans.linkPlanNote({
            spaceId,
            planId: linkPlanId,
            sharedNoteId: saved.id,
          }),
        );
        void client.invalidateQueries({
          queryKey: authorSummaryQueryKeys.planNotes(spaceId, linkPlanId),
        });
        postSnackbar('sharedNotes.toast.linkedPlan');
        closeConfirmed(() =>
          requestReturn(originKey, planDetailPath(linkPlanId)),
        );
        return;
      } catch {
        // The note is saved; the plan can link it again from its own editor.
      }
    }
    postSnackbar('sharedNotes.toast.saved');
    closeConfirmed(() =>
      navigate(sharedNoteDetailPath(saved.id), {
        replace: true,
        state: originKey ? { taskOriginKey: originKey } : undefined,
      }),
    );
  }

  function submit(withVersion = version, withDraft = draft) {
    if (save.isPending) return;
    if (!noteHasContent(withDraft)) {
      setNeedsContent(true);
      return;
    }
    setNeedsContent(false);
    const owns = captureOwnership();
    save.mutate(
      { draft: withDraft, version: withVersion },
      {
        onSuccess: (outcome) => {
          if (!owns()) return;
          if (outcome.kind === 'conflict') {
            setConflict(outcome.latest);
            setSeeChanges(false);
            return;
          }
          void finishSaved(outcome.note);
        },
      },
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A conflict has to be resolved first; its notice offers the ways out.
    if (conflict) return;
    submit();
  }

  function update(next: Partial<NoteDraft>) {
    setDraft((current) => ({ ...current, ...next }));
    if (needsContent) setNeedsContent(false);
    if (save.error) save.reset();
  }

  function insertBullet() {
    const field = bodyRef.current;
    if (!field) return;
    const result = insertBulletAtCaret(
      field.value,
      field.selectionStart ?? field.value.length,
    );
    caretRef.current = result.caret;
    update({ body: result.value });
    field.focus();
  }

  function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    )
      return;
    const field = event.currentTarget;
    const result = continueBulletOnEnter(
      field.value,
      field.selectionStart,
      field.selectionEnd,
    );
    if (!result) return;
    event.preventDefault();
    caretRef.current = result.caret;
    update({ body: result.value });
  }

  function takeTheirs() {
    if (!conflict) return;
    const theirs = noteDraftOf(conflict);
    setDraft(theirs);
    setBaseline(theirs);
    setVersion(conflict.version);
    setConflict(null);
    setSeeChanges(false);
    postSnackbar('sharedNotes.toast.takenTheirs');
    bodyRef.current?.focus();
  }

  function keepMine() {
    if (!conflict) return;
    const latest = conflict;
    setBaseline(noteDraftOf(latest));
    setVersion(latest.version);
    setConflict(null);
    setSeeChanges(false);
    submit(latest.version);
  }

  const problemKind = save.error ? clientProblemKind(save.error) : null;
  const editorName = conflict?.editor
    ? authorFirstName(conflict.editor)
    : t('m5s5.today.relationshipSignal.partnerFallback');
  const saveable = noteHasContent(draft) && conflict === null;

  return (
    <div className="page planning-create-task free-composer quiet-composer page-composer shared-note-editor">
      <ComposerHeader
        before={
          <TaskBackButton
            inline
            onClick={() => requestClose()}
            aria-disabled={save.isPending}
          >
            {t('common.close')}
          </TaskBackButton>
        }
        title={
          note
            ? t('sharedNotes.edit.editTitle')
            : t('sharedNotes.edit.createTitle')
        }
        action={
          <button
            type="submit"
            form="shared-note-form"
            data-saveable={saveable}
            aria-disabled={!saveable || save.isPending}
          >
            {save.isPending ? t('sharedNotes.edit.saving') : t('common.save')}
          </button>
        }
      />

      <VisibilityBadge
        visibility="SPACE_SHARED"
        size="small"
        customLabel={t('sharedNotes.audienceEditing')}
        className="shared-note-audience"
      />

      <div aria-live="polite">
        {conflict ? (
          <section className="shared-note-notice" role="status">
            <p>{t('sharedNotes.conflict.message', { name: editorName })}</p>
            <div className="shared-note-notice-actions">
              <button
                type="button"
                className="tertiary"
                aria-expanded={seeChanges}
                onClick={() => setSeeChanges((open) => !open)}
              >
                {seeChanges
                  ? t('sharedNotes.conflict.hideChanges')
                  : t('sharedNotes.conflict.seeChanges')}
              </button>
              <button
                type="button"
                className="tertiary"
                disabled={save.isPending}
                onClick={keepMine}
              >
                {t('sharedNotes.conflict.keepMine')}
              </button>
            </div>
            {seeChanges ? (
              <>
                <p className="shared-note-theirs-label">
                  {t('sharedNotes.conflict.theirsLabel')}
                </p>
                <p className="shared-note-theirs">
                  {[conflict.title, conflict.body]
                    .filter((part) => part.trim())
                    .join('\n\n')}
                </p>
                <div className="shared-note-notice-actions">
                  <button
                    type="button"
                    className="tertiary"
                    onClick={takeTheirs}
                  >
                    {t('sharedNotes.conflict.takeTheirs')}
                  </button>
                  <span className="muted">
                    {t('sharedNotes.conflict.takeTheirsWarning')}
                  </span>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {needsContent ? (
          <section
            className="shared-note-notice"
            data-kind="error"
            role="alert"
          >
            <p>{t('sharedNotes.edit.needsContent')}</p>
          </section>
        ) : null}

        {problemKind === 'offline' ? (
          <section
            className="shared-note-notice"
            data-kind="error"
            role="alert"
          >
            <p>{t('sharedNotes.edit.offline')}</p>
            <div className="shared-note-notice-actions">
              <button
                type="button"
                className="tertiary"
                onClick={() => submit()}
              >
                {t('common.retry')}
              </button>
            </div>
          </section>
        ) : null}

        {problemKind === 'notFound' ? (
          <section
            className="shared-note-notice"
            data-kind="error"
            role="alert"
          >
            <p>{t('sharedNotes.edit.gone')}</p>
          </section>
        ) : null}
      </div>

      {save.error && problemKind !== 'offline' && problemKind !== 'notFound' ? (
        <ProblemState error={save.error} onRetry={() => submit()} />
      ) : null}

      <form id="shared-note-form" onSubmit={onSubmit}>
        <div className="page-composer-writing composer-authored-surface">
          <label className="sr-only" htmlFor="shared-note-title">
            {t('common.title')}
          </label>
          <input
            ref={titleRef}
            id="shared-note-title"
            className="page-composer-title"
            type="text"
            autoComplete="off"
            maxLength={SHARED_NOTE_TITLE_MAX}
            placeholder={t('sharedNotes.edit.titlePlaceholder')}
            value={draft.title}
            readOnly={save.isPending}
            onChange={(event) => update({ title: event.target.value })}
          />
          <label className="sr-only" htmlFor="shared-note-body">
            {t('sharedNotes.edit.bodyLabel')}
          </label>
          <textarea
            ref={bodyRef}
            id="shared-note-body"
            className="page-composer-prose"
            rows={8}
            maxLength={SHARED_NOTE_BODY_MAX}
            placeholder={t('sharedNotes.edit.bodyPlaceholder')}
            value={draft.body}
            readOnly={save.isPending}
            onChange={(event) => update({ body: event.target.value })}
            onKeyDown={onBodyKeyDown}
          />
        </div>
      </form>

      <ComposerToolRow>
        <ComposerTool
          icon="listen"
          label={t('sharedNotes.edit.bullets')}
          disabled={save.isPending}
          onClick={insertBullet}
        />
      </ComposerToolRow>

      <PlanningDiscardSheet
        open={showDiscardConfirm}
        onKeepEditing={keepEditing}
        onDiscard={() => closeConfirmed()}
      />
    </div>
  );
}

/** Full-screen writing task: one authored frame, never a sheet. */
export function SharedNoteEditorPage({
  apis,
  spaceId,
  mode,
}: {
  apis: Apis;
  spaceId: string;
  mode: 'create' | 'edit';
}) {
  const { t } = useTranslation();
  const { noteId } = useParams();
  const noteQuery = useSharedNote(
    apis.sharedNotes,
    spaceId,
    mode === 'edit' ? noteId : undefined,
  );

  if (mode === 'create')
    return <NoteEditor key="new" apis={apis} spaceId={spaceId} note={null} />;
  if (noteQuery.error && !noteQuery.data)
    return (
      <div className="page shared-content-page">
        <ProblemState
          error={noteQuery.error}
          onRetry={() => void noteQuery.refetch()}
        />
      </div>
    );
  if (!noteQuery.data)
    return (
      <div className="page shared-content-page">
        <UiState kind="loading" title={t('states.loading.title')} />
      </div>
    );
  if (!noteQuery.data.capabilities.canEdit)
    return (
      <div className="page shared-content-page">
        <UiState
          kind="permission"
          title={t('states.permission.title')}
          body={t('states.permission.body')}
        />
      </div>
    );
  return (
    <NoteEditor
      key={noteQuery.data.id}
      apis={apis}
      spaceId={spaceId}
      note={noteQuery.data}
    />
  );
}
