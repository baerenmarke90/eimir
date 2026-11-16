import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { ClientProblemError } from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { NOTE_CREATE_ROUTE, sharedNoteEditPath } from '../client/routes';
import {
  noteDisplayTitle,
  noteExcerpt,
  sharedNoteApiCall,
} from '../client/sharedNotes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { ListEntryIconButton } from './ListEntryActions';
import { NoteChoicePicker } from './NoteChoicePicker';
import { ComposerChip } from './PageComposer';
import { ProblemState } from './ProblemState';
import { ContentChevron } from './SharedContentSheet';
import { NoteBody, NoteEditorLine } from './SharedNoteParts';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PlanCollectionLinks.css';
import './SharedContentPages.css';
import './SharedNotes.css';

/**
 * Shared notes linked to a Plan. The Planning system owns the link: a note
 * knows nothing about the Plans that show it. Linking and unlinking happen only
 * while the Plan is edited and take effect at once, without saving the Plan.
 */
export function PlanNoteLinks({
  apis,
  spaceId,
  accountId,
  plan,
  disabled,
  editing = false,
  onNavigate,
  renderTrigger,
}: {
  apis: Pick<SharedPlanningApis, 'sharedNotes' | 'plans'>;
  spaceId: string;
  accountId: string;
  plan: PlanDetail;
  disabled: boolean;
  editing?: boolean;
  /** Leaving a Plan being edited goes through its discard guard. */
  onNavigate?: (destination: () => void) => void;
  renderTrigger?: (open: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const inFlight = useRef(false);
  const section = useRef<HTMLElement>(null);
  const rowTrigger = useRef<HTMLButtonElement | null>(null);
  const previewSheet = useRef<ShortTaskSheetHandle>(null);
  const openChoices = useRef<() => void>(() => {});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const canManage = editing && plan.capabilities.canEdit;
  const capture = useTaskActivation(canManage);
  const mutationKey = ['plan-write', spaceId, plan.id] as const;
  const key = authorSummaryQueryKeys.planNotes(spaceId, plan.id);
  const untitled = t('sharedNotes.untitled');
  const linked = useQuery({
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) =>
      sharedNoteApiCall(() =>
        apis.plans.listPlanNotes({ spaceId, planId: plan.id }, { signal }),
      ),
  });
  const notes = sortByProductLabel(
    linked.data ?? [],
    (note) => noteDisplayTitle(note, untitled),
    resolvedLocale(),
  );
  const mutation = useMutation({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (intent: {
      ids: string[];
      unlink: boolean;
      owns: () => boolean;
    }) => {
      assertOnlineWrite();
      for (const sharedNoteId of intent.ids) {
        if (!intent.owns()) throw new ClientProblemError('permission');
        await sharedNoteApiCall(() =>
          intent.unlink
            ? apis.plans.unlinkPlanNote({
                spaceId,
                planId: plan.id,
                sharedNoteId,
              })
            : apis.plans.linkPlanNote({
                spaceId,
                planId: plan.id,
                sharedNoteId,
              }),
        );
      }
    },
    onSettled: (_data, _error, intent) => {
      inFlight.current = false;
      if (intent.owns()) void client.invalidateQueries({ queryKey: key });
    },
  });

  /** Resolves true only when the change was actually sent, never for a skipped call. */
  async function mutate(ids: string[], unlink: boolean): Promise<boolean> {
    if (
      !ids.length ||
      disabled ||
      inFlight.current ||
      !canManage ||
      client.isMutating({ mutationKey, exact: true }) > 0 ||
      linked.error
    )
      return false;
    const ownsTask = capture();
    const ownsPlan = captureAuthorizedQuery(
      client,
      authorSummaryQueryKeys.planDetail(spaceId, plan.id),
    );
    const ownsNotes = captureAuthorizedQuery(client, key);
    inFlight.current = true;
    await mutation.mutateAsync({
      ids,
      unlink,
      owns: () => ownsTask() && ownsPlan() && ownsNotes(),
    });
    return true;
  }

  function createNew() {
    const destination = () =>
      void navigate(NOTE_CREATE_ROUTE, {
        state: { taskOriginKey: captureOrigin(), linkPlanId: plan.id },
      });
    if (onNavigate) onNavigate(destination);
    else destination();
  }

  const pending = disabled || mutation.isPending;
  const preview: SharedNoteDetail | undefined = notes.find(
    (note) => note.id === previewId,
  );
  if (!canManage && !linked.isPending && !linked.error && !notes.length)
    return null;
  return (
    <section
      ref={section}
      tabIndex={-1}
      className="planen-section plan-collection-links plan-note-links"
      aria-labelledby="plan-notes-heading"
    >
      <h2 id="plan-notes-heading" className={editing ? 'sr-only' : undefined}>
        {t('sharedNotes.plan.heading')}
      </h2>
      {linked.isPending ? (
        <p role="status">{t('states.loading.title')}</p>
      ) : null}
      {linked.error ? (
        <ProblemState
          error={linked.error}
          onRetry={() => void linked.refetch()}
        />
      ) : null}
      <ul
        className={
          editing
            ? 'composer-selected-chips plan-collection-chips'
            : 'content-overview-list'
        }
      >
        {notes.map((note) => {
          const title = noteDisplayTitle(note, untitled);
          return (
            <li key={note.id} className="plan-collection-row">
              {editing ? (
                <ComposerChip
                  icon="notes"
                  onClick={() => openChoices.current()}
                >
                  {title}
                </ComposerChip>
              ) : (
                <button
                  type="button"
                  className="content-overview-row tertiary"
                  disabled={disabled}
                  aria-label={t('sharedNotes.plan.openNote', { title })}
                  onClick={(event) => {
                    rowTrigger.current = event.currentTarget;
                    setPreviewId(note.id);
                  }}
                >
                  <span className="content-overview-icon">
                    <DestinationIcon icon="notes" />
                  </span>
                  <span className="content-overview-copy">
                    <strong>{title}</strong>
                    <span className="muted shared-note-choice-excerpt">
                      {noteExcerpt(note)}
                    </span>
                  </span>
                  <ContentChevron />
                </button>
              )}
              {canManage ? (
                <ListEntryIconButton
                  icon="unlink"
                  className="tertiary"
                  label={t('sharedNotes.plan.unlink', { title })}
                  disabled={pending || Boolean(linked.error)}
                  onClick={() =>
                    void mutate([note.id], true)
                      .then((sent) => {
                        if (!sent) return;
                        postSnackbar('sharedNotes.plan.unlinked', { title });
                        section.current?.focus();
                      })
                      .catch(() => {})
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {editing && notes.length > 0 ? (
        <p className="muted">{t('sharedNotes.plan.immediate')}</p>
      ) : null}
      {canManage ? (
        <NoteChoicePicker
          apis={apis}
          spaceId={spaceId}
          excludedIds={notes.map((note) => note.id)}
          disabled={pending || linked.isPending || Boolean(linked.error)}
          onCreateNew={createNew}
          renderTrigger={(open) => {
            openChoices.current = open;
            return renderTrigger ? renderTrigger(open) : null;
          }}
          onChoose={async (chosen) => {
            const sent = await mutate(
              chosen.map((note) => note.id),
              false,
            );
            if (sent)
              postSnackbar('sharedNotes.plan.linked', {
                count: chosen.length,
              });
          }}
        />
      ) : null}
      <ShortTaskSheet
        ref={previewSheet}
        open={preview !== undefined}
        title={preview ? noteDisplayTitle(preview, untitled) : untitled}
        restoreFocusRef={rowTrigger}
        onClose={() => setPreviewId(null)}
      >
        {preview ? (
          <div className="shared-note-preview">
            <NoteBody body={preview.body} />
            <NoteEditorLine note={preview} accountId={accountId} />
            <div className="shared-note-preview-actions">
              {preview.capabilities.canEdit ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    previewSheet.current?.closeForNavigation(() =>
                      navigate(sharedNoteEditPath(preview.id), {
                        state: { taskOriginKey: captureOrigin() },
                      }),
                    )
                  }
                >
                  {t('sharedNotes.read.edit')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => previewSheet.current?.requestClose()}
              >
                {t('sharedNotes.plan.done')}
              </button>
            </div>
          </div>
        ) : null}
      </ShortTaskSheet>
      {mutation.error ? <ProblemState error={mutation.error} /> : null}
    </section>
  );
}
