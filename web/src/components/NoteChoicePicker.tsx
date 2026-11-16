import { useInfiniteQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { sortByProductLabel } from '../client/productLabelOrder';
import {
  noteDisplayTitle,
  noteExcerpt,
  SHARED_NOTE_PAGE_SIZE,
  sharedNoteApiCall,
} from '../client/sharedNotes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PlanCollectionLinks.css';

/**
 * Choose shared notes to link to a Plan. Only shared notes are ever offered:
 * private notes live in their own area and never reach this list.
 */
export function NoteChoicePicker({
  apis,
  spaceId,
  excludedIds = [],
  disabled,
  onChoose,
  onCreateNew,
  renderTrigger,
}: {
  apis: Pick<SharedPlanningApis, 'sharedNotes'>;
  spaceId: string;
  excludedIds?: string[];
  disabled: boolean;
  onChoose: (notes: SharedNoteDetail[]) => void | Promise<void>;
  onCreateNew: () => void;
  renderTrigger?: (open: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const capture = useTaskActivation(open, spaceId);
  const choices = useInfiniteQuery({
    queryKey: [...authorSummaryQueryKeys.sharedNotes(spaceId), 'plan-choice'],
    enabled: open,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      sharedNoteApiCall(() =>
        apis.sharedNotes.listSharedNotes(
          {
            spaceId,
            cursor: pageParam,
            limit: SHARED_NOTE_PAGE_SIZE,
          },
          { signal },
        ),
      ),
    getNextPageParam: (page, _pages, last, cursors) =>
      page.nextCursor &&
      page.nextCursor !== last &&
      !cursors.includes(page.nextCursor)
        ? page.nextCursor
        : undefined,
  });
  // The whole set is needed before choosing, so the later pages load at once.
  useEffect(() => {
    if (open && choices.hasNextPage && !choices.isFetching && !choices.error)
      void choices.fetchNextPage();
  }, [
    open,
    choices.hasNextPage,
    choices.isFetching,
    choices.error,
    choices.fetchNextPage,
  ]);
  const untitled = t('sharedNotes.untitled');
  const items = sortByProductLabel(
    (choices.data?.pages.flatMap((page) => page.items) ?? []).filter(
      (note) => !excludedIds.includes(note.id),
    ),
    (note) => noteDisplayTitle(note, untitled),
    resolvedLocale(),
  );
  const assembling =
    choices.isPending || choices.isFetching || choices.hasNextPage;

  async function confirm() {
    if (disabled || linking || inFlight.current || selected.length === 0)
      return;
    const owns = capture();
    inFlight.current = true;
    setLinking(true);
    setError(null);
    try {
      await onChoose(items.filter((note) => selected.includes(note.id)));
      if (owns()) setOpen(false);
    } catch (failure) {
      if (owns()) setError(failure);
    } finally {
      inFlight.current = false;
      if (owns()) setLinking(false);
    }
  }

  function begin() {
    setSelected([]);
    setError(null);
    setOpen(true);
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => {
          trigger.current =
            document.activeElement instanceof HTMLButtonElement
              ? document.activeElement
              : null;
          begin();
        })
      ) : (
        <AddActionButton
          ref={trigger}
          label={t('sharedNotes.plan.choose')}
          icon="notes"
          disabled={disabled}
          onClick={begin}
        />
      )}
      <ShortTaskSheet
        open={open}
        title={t('sharedNotes.plan.choose')}
        restoreFocusRef={trigger}
        isDirty={selected.length > 0}
        isCloseBlocked={linking}
        onClose={() => setOpen(false)}
      >
        <div className="plan-collection-picker">
          <p className="muted">{t('sharedNotes.plan.hint')}</p>
          {assembling ? <p role="status">{t('states.loading.title')}</p> : null}
          {choices.error ? (
            <ProblemState
              error={choices.error}
              onRetry={() => void choices.refetch()}
            />
          ) : null}
          {!assembling && !choices.error && items.length === 0 ? (
            <p>{t('sharedNotes.plan.noChoices')}</p>
          ) : null}
          {!assembling && !choices.error && items.length > 0 ? (
            <ul className="plan-collection-choices">
              {items.map((note) => (
                <li key={note.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(note.id)}
                      disabled={linking}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, note.id]
                            : previous.filter((id) => id !== note.id),
                        )
                      }
                    />
                    <span>
                      <strong>{noteDisplayTitle(note, untitled)}</strong>
                      <span className="muted shared-note-choice-excerpt">
                        {noteExcerpt(note)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <ProblemState error={error} /> : null}
          <button
            type="button"
            disabled={
              linking ||
              disabled ||
              Boolean(assembling) ||
              Boolean(choices.error) ||
              selected.length === 0
            }
            onClick={() => void confirm()}
          >
            {linking ? t('m5s3.common.saving') : t('sharedNotes.plan.link')}
          </button>
          <AddActionButton
            label={t('sharedNotes.plan.createNew')}
            icon="notes"
            disabled={linking || disabled}
            onClick={() => {
              setOpen(false);
              onCreateNew();
            }}
          />
        </div>
      </ShortTaskSheet>
    </>
  );
}
