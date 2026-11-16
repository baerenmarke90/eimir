import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorFirstName } from '../client/authorPresentation';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { MORE_NOTES_ROUTE, sharedNoteEditPath } from '../client/routes';
import { noteDisplayTitle } from '../client/sharedNotes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ListEntryIconButton } from './ListEntryActions';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { NoteBody, NoteCreatorLine, NoteEditorLine } from './SharedNoteParts';
import {
  useSharedNote,
  useSharedNoteDelete,
  useSharedNotePresentation,
} from './sharedNoteHooks';
import { UiState } from './UiState';
import { VisibilityBadge } from './VisibilityBadge';
import './SharedNotes.css';

function MenuOption({
  icon,
  title,
  hint,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: EimirIconName;
  title: string;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="shared-note-menu-option"
      data-danger={danger || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <EimirIcon name={icon} />
      <span className="shared-note-menu-copy">
        <strong>{title}</strong>
        <span>{hint}</span>
      </span>
    </button>
  );
}

/** Reading comes before editing: the page shows the note, then offers to change it. */
export function SharedNoteReadPage({
  apis,
  spaceId,
  accountId,
}: {
  apis: Pick<SharedPlanningApis, 'sharedNotes'>;
  spaceId: string;
  accountId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { noteId } = useParams();
  const client = useQueryClient();
  const { captureOrigin, requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const noteQuery = useSharedNote(apis.sharedNotes, spaceId, noteId);
  const presentation = useSharedNotePresentation(apis.sharedNotes, spaceId);
  const remove = useSharedNoteDelete(apis.sharedNotes, spaceId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const deleteSheet = useRef<ShortTaskSheetHandle>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const note = noteQuery.data;

  // A partner's change that arrives while this page is open is announced once.
  const seenVersion = useRef<number | null>(null);
  useEffect(() => {
    if (!note) return;
    const previous = seenVersion.current;
    seenVersion.current = note.version;
    if (previous !== null && note.version > previous && note.editor) {
      if (note.editor.id !== accountId)
        postSnackbar('sharedNotes.read.updatedByPartner', {
          name: authorFirstName(note.editor),
        });
    }
  }, [note, accountId]);

  const openedId = note?.id;
  useEffect(() => {
    if (openedId) headingRef.current?.focus({ preventScroll: true });
  }, [openedId]);

  if (noteQuery.isPending && !note)
    return (
      <div className="page shared-content-page">
        <UiState kind="loading" title={t('states.loading.title')} />
      </div>
    );
  if (noteQuery.error && !note)
    return (
      <div className="page shared-content-page">
        <ProblemState
          error={noteQuery.error}
          onRetry={() => void noteQuery.refetch()}
        />
      </div>
    );
  if (!note) return null;

  const current: SharedNoteDetail = note;
  const untitled = t('sharedNotes.untitled');
  const displayTitle = noteDisplayTitle(current, untitled);

  function edit() {
    void navigate(sharedNoteEditPath(current.id), {
      state: { taskOriginKey: captureOrigin() },
    });
  }

  function setPresentation(change: {
    pinned?: boolean;
    wirTitleOnly?: boolean;
  }) {
    presentation.mutate(
      { noteId: current.id, ...change },
      {
        onSuccess: () => {
          setMenuOpen(false);
          postSnackbar(
            change.pinned === true
              ? 'sharedNotes.toast.pinned'
              : change.pinned === false
                ? 'sharedNotes.toast.unpinned'
                : change.wirTitleOnly
                  ? 'sharedNotes.toast.titleOnly'
                  : 'sharedNotes.toast.excerpt',
          );
        },
      },
    );
  }

  return (
    <div className="page shared-content-page shared-note-read">
      <PageHeader
        itemLabel={t('sharedNotes.read.itemLabel')}
        titleAction={
          <ListEntryIconButton
            ref={menuTrigger}
            icon="more"
            className="tertiary shared-note-menu-trigger"
            label={t('sharedNotes.read.menu')}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => {
              presentation.reset();
              setMenuOpen(true);
            }}
          />
        }
        title={
          <span ref={headingRef} tabIndex={-1}>
            {displayTitle}
          </span>
        }
        metadata={
          <VisibilityBadge
            visibility="SPACE_SHARED"
            size="small"
            customLabel={t('sharedNotes.audience')}
          />
        }
      />

      {current.body.trim() ? (
        <NoteBody body={current.body} />
      ) : (
        <p className="shared-note-meta">{t('sharedNotes.read.noBody')}</p>
      )}

      <div className="shared-note-authors">
        <NoteCreatorLine note={current} accountId={accountId} />
        <NoteEditorLine
          note={current}
          accountId={accountId}
          variant="changed"
        />
      </div>

      {current.capabilities.canEdit ? (
        <div>
          <AddActionButton
            label={t('sharedNotes.read.edit')}
            icon="pen"
            onClick={edit}
          />
        </div>
      ) : null}

      <ShortTaskSheet
        open={menuOpen}
        title={t('sharedNotes.menu.title')}
        restoreFocusRef={menuTrigger}
        isCloseBlocked={presentation.isPending}
        onClose={() => setMenuOpen(false)}
      >
        <div className="shared-note-menu">
          {current.capabilities.canEdit ? (
            <MenuOption
              icon="highlights"
              title={
                current.pinned
                  ? t('sharedNotes.menu.unpin')
                  : t('sharedNotes.menu.pin')
              }
              hint={
                current.pinned
                  ? t('sharedNotes.menu.unpinHint')
                  : t('sharedNotes.menu.pinHint')
              }
              disabled={presentation.isPending}
              onClick={() => setPresentation({ pinned: !current.pinned })}
            />
          ) : null}
          {current.capabilities.canEdit && current.pinned ? (
            <MenuOption
              icon={current.wirTitleOnly ? 'eye' : 'eye-off'}
              title={
                current.wirTitleOnly
                  ? t('sharedNotes.menu.wirExcerpt')
                  : t('sharedNotes.menu.wirTitleOnly')
              }
              hint={
                current.wirTitleOnly
                  ? t('sharedNotes.menu.wirExcerptHint')
                  : t('sharedNotes.menu.wirTitleOnlyHint')
              }
              disabled={presentation.isPending}
              onClick={() =>
                setPresentation({ wirTitleOnly: !current.wirTitleOnly })
              }
            />
          ) : null}
          {current.capabilities.canDelete ? (
            <MenuOption
              icon="trash"
              danger
              title={t('sharedNotes.menu.delete')}
              hint={t('sharedNotes.menu.deleteHint')}
              disabled={presentation.isPending}
              onClick={() => {
                setMenuOpen(false);
                remove.reset();
                setDeleteOpen(true);
              }}
            />
          ) : null}
          {presentation.error ? (
            <ProblemState error={presentation.error} />
          ) : null}
        </div>
      </ShortTaskSheet>

      <ShortTaskSheet
        ref={deleteSheet}
        open={deleteOpen}
        role="alertdialog"
        title={t('sharedNotes.delete.title')}
        restoreFocusRef={menuTrigger}
        isCloseBlocked={remove.isPending}
        onClose={() => setDeleteOpen(false)}
      >
        <p>{t('sharedNotes.delete.body', { title: displayTitle })}</p>
        {remove.error ? <ProblemState error={remove.error} /> : null}
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            disabled={remove.isPending}
            onClick={() => deleteSheet.current?.requestClose()}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="danger"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(current, {
                onSuccess: () => {
                  postSnackbar('sharedNotes.toast.deleted');
                  deleteSheet.current?.closeForNavigation(() => {
                    requestReturn(originKey, MORE_NOTES_ROUTE);
                    client.removeQueries({
                      queryKey: authorSummaryQueryKeys.sharedNoteDetail(
                        spaceId,
                        current.id,
                      ),
                    });
                  });
                },
              })
            }
          >
            {remove.isPending
              ? t('sharedNotes.delete.pending')
              : t('sharedNotes.delete.confirm')}
          </button>
        </div>
      </ShortTaskSheet>
    </div>
  );
}
