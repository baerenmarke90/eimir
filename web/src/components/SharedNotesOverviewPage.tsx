import { useQuery } from '@tanstack/react-query';
import {
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { NOTE_CREATE_ROUTE, sharedNoteDetailPath } from '../client/routes';
import {
  noteDisplayTitle,
  noteExcerpt,
  noteMatchesQuery,
  SHARED_NOTE_PAGE_SIZE,
  sharedNoteApiCall,
  splitPinned,
  withPinnedNotes,
} from '../client/sharedNotes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { NoteEditorLine } from './SharedNoteParts';
import { StatusScope } from './StatusScope';
import { UiState } from './UiState';
import './SharedContentPages.css';
import './SharedNotes.css';

type NoteScope = 'ALL' | 'PINNED';

function isModifiedClick(event: MouseEvent): boolean {
  return Boolean(
    event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey,
  );
}

function NoteCard({
  note,
  accountId,
  onOpen,
  cardRef,
}: {
  note: SharedNoteDetail;
  accountId: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  cardRef: (element: HTMLAnchorElement | null) => void;
}) {
  const { t } = useTranslation();
  const excerpt = noteExcerpt(note);
  return (
    <li>
      <Link
        ref={cardRef}
        className="shared-note-card"
        data-pinned={note.pinned || undefined}
        to={sharedNoteDetailPath(note.id)}
        onClick={onOpen}
      >
        <h3>{noteDisplayTitle(note, t('sharedNotes.untitled'))}</h3>
        {excerpt ? <p className="shared-note-excerpt">{excerpt}</p> : null}
        <NoteEditorLine note={note} accountId={accountId} />
      </Link>
    </li>
  );
}

function NoteSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="shared-note-skeletons" role="status">
      <span className="sr-only">{t('sharedNotes.loading')}</span>
      <div
        className="shared-note-skeleton story-media-skeleton"
        aria-hidden="true"
      />
      <div
        className="shared-note-skeleton story-media-skeleton"
        aria-hidden="true"
      />
      <div
        className="shared-note-skeleton story-media-skeleton"
        aria-hidden="true"
      />
    </div>
  );
}

/** Overview of the couple's shared notes: pinned first, then by last edit. */
export function SharedNotesOverviewPage({
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { captureOrigin, registerOriginMetadata, resolveOrigin } =
    useTaskOrigin();
  const scope: NoteScope =
    searchParams.get('scope') === 'PINNED' ? 'PINNED' : 'ALL';
  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const [query, setQuery] = useState(
    () => resolveOrigin(returnKey)?.sharedNotesSearch ?? '',
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());
  const restoredRef = useRef<unknown>(null);

  const notes = useWarmInfiniteQuery({
    queryKey: authorSummaryQueryKeys.sharedNoteOverview(spaceId),
    queryFn: ({ pageParam, signal }) =>
      sharedNoteApiCall(() =>
        apis.sharedNotes.listSharedNotes(
          {
            spaceId,
            cursor: pageParam ?? undefined,
            limit: SHARED_NOTE_PAGE_SIZE,
          },
          { signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

  // Pages come in recency order, so an old pinned note can sit on a page that
  // is not loaded yet. The pinned set is read on its own to lead the overview.
  const pinnedNotes = useQuery({
    queryKey: [
      ...authorSummaryQueryKeys.sharedNoteOverview(spaceId),
      'pinned',
    ] as const,
    queryFn: ({ signal }) =>
      sharedNoteApiCall(() =>
        apis.sharedNotes.listSharedNotes(
          { spaceId, pinned: true, limit: SHARED_NOTE_PAGE_SIZE },
          { signal },
        ),
      ),
    retry: false,
  });

  const loaded = useMemo(() => {
    const paged = notes.data?.pages.flatMap((page) => page.items) ?? [];
    return withPinnedNotes(paged, pinnedNotes.data?.items ?? []);
  }, [notes.data, pinnedNotes.data]);
  const trimmedQuery = query.trim();
  const visible = useMemo(() => {
    const pool = scope === 'PINNED' ? loaded.filter((n) => n.pinned) : loaded;
    return trimmedQuery
      ? pool.filter((note) => noteMatchesQuery(note, trimmedQuery))
      : pool;
  }, [loaded, scope, trimmedQuery]);

  // The filter only sees loaded notes, so a search keeps loading until the
  // whole set is there rather than silently hiding later pages.
  useEffect(() => {
    if (
      trimmedQuery &&
      notes.hasNextPage &&
      !notes.isFetching &&
      !notes.isError
    )
      void notes.fetchNextPage();
  }, [
    trimmedQuery,
    notes.hasNextPage,
    notes.isFetching,
    notes.isError,
    notes.fetchNextPage,
  ]);

  useEffect(
    () => registerOriginMetadata({ sharedNotesSearch: query }),
    [query, registerOriginMetadata],
  );

  // Back from a note restores its card's place and focus.
  useLayoutEffect(() => {
    if (!notes.data || restoredRef.current === returnKey) return;
    const origin = resolveOrigin(returnKey);
    restoredRef.current = returnKey;
    if (!origin) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scrollY });
      if (origin.selectedKey)
        cardRefs.current
          .get(origin.selectedKey)
          ?.focus({ preventScroll: true });
    });
  }, [notes.data, returnKey, resolveOrigin]);

  function open(event: MouseEvent<HTMLAnchorElement>, note: SharedNoteDetail) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    void navigate(sharedNoteDetailPath(note.id), {
      state: {
        taskOriginKey: captureOrigin({
          sharedNotesSearch: query,
          selectedKey: note.id,
        }),
      },
    });
  }

  function changeScope(next: NoteScope) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next === 'ALL') params.delete('scope');
        else params.set('scope', next);
        return params;
      },
      { replace: true },
    );
  }

  const { pinned, rest } = splitPinned(visible);
  const firstUse =
    Boolean(notes.data) && loaded.length === 0 && !notes.hasNextPage;
  const cardFor = (note: SharedNoteDetail) => (
    <NoteCard
      key={note.id}
      note={note}
      accountId={accountId}
      onOpen={(event) => open(event, note)}
      cardRef={(element) => {
        if (element) cardRefs.current.set(note.id, element);
        else cardRefs.current.delete(note.id);
      }}
    />
  );

  return (
    <div className="page shared-content-page shared-notes-page">
      <PageHeader
        className="content-overview-heading"
        title={t('sharedNotes.title')}
        action={
          firstUse ? undefined : (
            <AddActionButton
              floating
              label={t('sharedNotes.create')}
              icon="notes"
              onClick={() =>
                void navigate(NOTE_CREATE_ROUTE, {
                  state: {
                    taskOriginKey: captureOrigin({ sharedNotesSearch: query }),
                  },
                })
              }
            />
          )
        }
      />

      <StatusScope<NoteScope>
        label={t('sharedNotes.scopeLabel')}
        value={scope}
        options={(['ALL', 'PINNED'] as const).map((value) => ({
          value,
          label: t(`sharedNotes.scope.${value}`),
        }))}
        onChange={changeScope}
      />

      <div className="shared-note-search">
        <EimirIcon name="suche" />
        <input
          ref={searchRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          maxLength={200}
          placeholder={t('sharedNotes.search')}
          aria-label={t('sharedNotes.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="shared-note-search-clear tertiary"
            aria-label={t('sharedNotes.searchClear')}
            title={t('sharedNotes.searchClear')}
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
          >
            <EimirIcon name="close" />
          </button>
        ) : null}
      </div>

      {notes.data &&
      (notes.isCached ||
        notes.fetchStatus === 'paused' ||
        (typeof navigator !== 'undefined' && navigator.onLine === false)) ? (
        <OverviewCacheNotice
          cachedAt={notes.cachedAt ?? new Date(notes.dataUpdatedAt)}
        />
      ) : null}

      <section className="shared-notes-results" aria-live="polite">
        {notes.isLoading ? <NoteSkeleton /> : null}
        {notes.error && !notes.data ? (
          <ProblemState
            error={notes.error}
            onRetry={() => void notes.refetch()}
          />
        ) : null}

        {firstUse ? (
          <UiState
            kind="empty"
            title={t('sharedNotes.empty.title')}
            body={t('sharedNotes.empty.body')}
            action={
              <AddActionButton
                label={t('sharedNotes.createFirst')}
                icon="notes"
                onClick={() =>
                  void navigate(NOTE_CREATE_ROUTE, {
                    state: { taskOriginKey: captureOrigin() },
                  })
                }
              />
            }
          />
        ) : null}

        {notes.data && !firstUse && visible.length === 0 ? (
          trimmedQuery ? (
            <UiState
              kind="empty"
              title={t('sharedNotes.noMatch.title', { query: trimmedQuery })}
              body={t('sharedNotes.noMatch.body')}
              action={
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  {t('sharedNotes.searchClear')}
                </button>
              }
            />
          ) : (
            <UiState
              kind="empty"
              title={t('sharedNotes.noPinned.title')}
              body={t('sharedNotes.noPinned.body')}
            />
          )
        ) : null}

        {visible.length > 0 && trimmedQuery ? (
          <>
            <p className="shared-note-count" role="status">
              {t('sharedNotes.results', { count: visible.length })}
            </p>
            <ul className="shared-note-list">{visible.map(cardFor)}</ul>
          </>
        ) : null}

        {visible.length > 0 && !trimmedQuery && scope === 'PINNED' ? (
          <ul className="shared-note-list">{pinned.map(cardFor)}</ul>
        ) : null}

        {visible.length > 0 && !trimmedQuery && scope === 'ALL' ? (
          <>
            {pinned.length > 0 ? (
              <section aria-labelledby="shared-notes-pinned-heading">
                <h2
                  id="shared-notes-pinned-heading"
                  className="shared-note-section"
                >
                  <EimirIcon name="gemeinsam" />
                  {t('sharedNotes.sectionPinned')}
                </h2>
                <ul className="shared-note-list">{pinned.map(cardFor)}</ul>
              </section>
            ) : null}
            {rest.length > 0 ? (
              <section aria-labelledby="shared-notes-recent-heading">
                <h2
                  id="shared-notes-recent-heading"
                  className="shared-note-section"
                >
                  {pinned.length > 0
                    ? t('sharedNotes.sectionRecent')
                    : t('sharedNotes.sectionAll')}
                </h2>
                <ul className="shared-note-list">{rest.map(cardFor)}</ul>
              </section>
            ) : null}
          </>
        ) : null}

        {notes.error && notes.data ? (
          <ProblemState
            error={notes.error}
            onRetry={() => void notes.refetch()}
          />
        ) : null}

        {notes.hasNextPage && !trimmedQuery ? (
          <AutoLoadMore
            query={notes}
            className="tertiary compact-action"
            blocked={notes.isFetchingNextPage}
          >
            {notes.isFetchingNextPage
              ? t('sharedNotes.loadingMore')
              : t('sharedNotes.loadMore')}
          </AutoLoadMore>
        ) : null}
      </section>
    </div>
  );
}
