import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { RecapsApi } from '../api/generated/apis/RecapsApi';
import type { RecapPeriod } from '../api/generated/models/RecapPeriod';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { RecapView } from '../api/generated/models/RecapView';
import { Configuration } from '../client/apiConfiguration';
import { normalizeClientError } from '../client/problemDetails';
import {
  recapDate,
  recapHeadline,
  recapPeriodKey,
  recapPeriodLabel,
  recapSourcePath,
} from '../client/recaps';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  MORE_PASSPORT_ROUTE,
  MORE_PROFILE_ROUTE,
  MEMORY_CREATE_ROUTE,
  recapDetailPath,
} from '../client/routes';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import type { ProfilePageProps } from './ProfilePage';
import { RelationshipPassport } from './RelationshipPassport';
import { RecapTasks } from './RecapTasks';
import { UiState } from './UiState';
import './RelationshipRecapsPage.css';

export type RecapsPageProps = ProfilePageProps & { mediaApis: ReferenceApis };
export type RecapMediaProps = Pick<
  RecapsPageProps,
  'mediaApis' | 'spaceId' | 'account'
>;
const POLL_WINDOW_MS = 120_000;

async function authorized<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function RecapMedia({
  source,
  mediaApis,
  spaceId,
  account,
}: RecapMediaProps & { source: RecapSourceView }) {
  const parentType =
    source.kind === 'MEMORY' ||
    source.kind === 'HEART_MOMENT' ||
    source.kind === 'PLAN'
      ? source.kind
      : null;
  const load = useCallback(
    (parentId: string, attachmentId: string, signal?: AbortSignal) => {
      if (!parentType)
        return Promise.reject(new Error('No authorized media parent.'));
      return loadAuthorizedStoryImage(
        mediaApis,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        { signal, variant: 'thumbnail' },
      );
    },
    [mediaApis, spaceId, parentType],
  );
  if (!source.available || !source.previewAttachmentId || !parentType)
    return null;
  return (
    <MemoryPreview
      memoryId={source.id}
      attachmentId={source.previewAttachmentId}
      loadImage={load}
      isSensitive={source.previewIsSensitive}
      allowReveal
      loadingMode="near-viewport"
      resourceScopeKey={JSON.stringify([
        'recap-media',
        account.id,
        spaceId,
        source.key,
      ])}
    />
  );
}

function PeriodNote({ value }: { value: RecapView }) {
  const { t } = useTranslation();
  return (
    <p className="recap-period-note">
      {value.savedAt
        ? t('recaps.saved')
        : value.isPartial
          ? t('recaps.partial', {
              date: recapDate(value.throughOn, resolvedLocale()),
            })
          : t('recaps.complete')}
    </p>
  );
}

function Cover({
  value,
  featured,
  ...media
}: RecapMediaProps & { value: RecapView; featured: boolean }) {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  const source = value.sources.find((item) => item.available);
  const hasPhoto = Boolean(source?.previewAttachmentId);
  const label = recapPeriodLabel(value, resolvedLocale());
  return (
    <article
      className={`recap-cover${featured ? ' recap-cover-featured' : ''}${value.kind === 'YEAR' ? ' recap-cover-year' : ''}`}
    >
      <div className={`recap-cover-art${hasPhoto ? ' has-photo' : ''}`}>
        {source && hasPhoto ? (
          <RecapMedia {...media} source={source} />
        ) : (
          <div className="recap-cover-words">
            <EimirIcon name="kapitel" />
            <p>{source?.title ?? t('recaps.lead')}</p>
          </div>
        )}
        <span className="recap-edition-mark" aria-hidden="true">
          {value.kind === 'YEAR'
            ? value.year
            : new Intl.NumberFormat(resolvedLocale(), {
                minimumIntegerDigits: 2,
              }).format(value.month ?? 1)}
        </span>
      </div>
      <div className="recap-cover-copy">
        <div className="recap-cover-kicker">
          <span>{label}</span>
          {value.savedAt ? <span>{t('recaps.saved')}</span> : null}
        </div>
        <h2>
          {value.status === 'EMPTY'
            ? t('recaps.emptyTitle')
            : recapHeadline(value, t)}
        </h2>
        {featured ? (
          <p>{value.introduction ?? t('recaps.fallbackIntro')}</p>
        ) : null}
        <PeriodNote value={value} />
        <Link
          className={featured ? 'button-link recap-open' : 'recap-text-link'}
          to={`${recapDetailPath(value.id)}${value.kind === 'YEAR' ? '?tab=years' : ''}`}
          onClick={(event) => {
            if (
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              event.button === 0
            ) {
              event.preventDefault();
              void navigate(
                `${recapDetailPath(value.id)}${value.kind === 'YEAR' ? '?tab=years' : ''}`,
                { state: { taskOriginKey: captureOrigin() } },
              );
            }
          }}
          state={{ taskOriginKey: null }}
        >
          {value.status === 'PENDING'
            ? t('recaps.pendingTitle')
            : t('recaps.open')}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </article>
  );
}

export function RelationshipRecapsPage(props: RecapsPageProps) {
  const { recapId } = useParams();
  const api = useMemo(
    () =>
      new RecapsApi(
        new Configuration({
          basePath: props.apiBaseUrl,
          headers: { Authorization: `Bearer ${props.accessToken}` },
        }),
      ),
    [props.apiBaseUrl, props.accessToken],
  );
  return recapId ? (
    <RecapReader
      key={`${props.account.id}:${props.spaceId}:${recapId}`}
      {...props}
      api={api}
      recapId={recapId}
    />
  ) : (
    <RecapLibrary
      key={`${props.account.id}:${props.spaceId}`}
      {...props}
      api={api}
    />
  );
}

function RecapLibrary({ api, ...props }: RecapsPageProps & { api: RecapsApi }) {
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const [requesting, setRequesting] = useState(false);
  const started = useRef(Date.now());
  const prepared = useRef(false);
  const kind = search.get('tab') === 'years' ? 'YEAR' : 'MONTH';
  const key = ['relationship-recaps', props.account.id, props.spaceId, kind];
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      authorized(
        api.getRecapOverview(
          { spaceId: props.spaceId, offset: pageParam, kind },
          { signal },
        ),
      ),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * 24 : undefined,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (state) =>
      document.visibilityState !== 'hidden' &&
      Date.now() - started.current < POLL_WINDOW_MS &&
      state.state.data?.pages.some((page) =>
        page.editions.some((item) => item.status === 'PENDING'),
      )
        ? 2500
        : false,
  });
  const allowed = query.data?.pages[0]?.canCompose === true;
  useEffect(() => {
    if (!allowed || prepared.current) return;
    prepared.current = true;
    const controller = new AbortController();
    void authorized(
      api.prepareRelationshipRecaps(
        { spaceId: props.spaceId },
        { signal: controller.signal },
      ),
    )
      .then(() =>
        client.invalidateQueries({
          queryKey: ['relationship-recaps', props.account.id, props.spaceId],
        }),
      )
      .catch(async (cause) => {
        if (!controller.signal.aborted)
          setError(await normalizeClientError(cause));
      });
    return () => controller.abort();
  }, [allowed, api, props.spaceId, props.account.id, client]);
  const editions = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.editions) ?? []).map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ].filter((item) => item.kind === kind);
  const periods =
    query.data?.pages[0]?.periods.filter(
      (period) =>
        period.kind === kind &&
        !editions.some(
          (item) => recapPeriodKey(item) === recapPeriodKey(period),
        ),
    ) ?? [];
  async function openPeriod(period: RecapPeriod) {
    setRequesting(true);
    setError(null);
    try {
      const result = await authorized(
        api.requestRelationshipRecap({
          spaceId: props.spaceId,
          recapRequest: { ...period, variant: 0 },
        }),
      );
      void navigate(
        `${recapDetailPath(result.id)}${kind === 'YEAR' ? '?tab=years' : ''}`,
      );
    } catch (cause) {
      setError(await normalizeClientError(cause));
    } finally {
      setRequesting(false);
    }
  }
  return (
    <div className="page recap-library">
      <Link className="recap-back" to="/more">
        ‹ {t('recaps.backMore')}
      </Link>
      <PageHeader
        eyebrow={t('recaps.automatic')}
        title={t('recaps.shortTitle')}
        titleAction={<ProMark label={t('recaps.pro')} />}
        description={t('recaps.intro')}
      />
      <div className="recap-tabs" role="tablist" aria-label={t('recaps.tabs')}>
        {(['MONTH', 'YEAR'] as const).map((value) => (
          <button
            key={value}
            id={`recap-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={value === kind}
            aria-controls="recap-library-panel"
            tabIndex={value === kind ? 0 : -1}
            onClick={() =>
              setSearch(value === 'YEAR' ? { tab: 'years' } : {}, {
                replace: true,
              })
            }
            onKeyDown={(event) => {
              if (
                ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'MONTH'
                    : event.key === 'End'
                      ? 'YEAR'
                      : kind === 'MONTH'
                        ? 'YEAR'
                        : 'MONTH';
                setSearch(next === 'YEAR' ? { tab: 'years' } : {}, {
                  replace: true,
                });
                document.getElementById(`recap-tab-${next}`)?.focus();
              }
            }}
          >
            {t(value === 'MONTH' ? 'recaps.months' : 'recaps.years')}
          </button>
        ))}
      </div>
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {error ? (
        <ProblemState
          error={error}
          onRetry={() => {
            setError(null);
            void query.refetch();
          }}
        />
      ) : null}
      {query.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : null}
      <div
        role="tabpanel"
        id="recap-library-panel"
        aria-labelledby={`recap-tab-${kind}`}
      >
        {!query.isPending && !query.error && !allowed ? (
          <section className="recap-gate">
            <h2>{t('recaps.gateTitle')}</h2>
            <p>{t('recaps.gateBody')}</p>
            <Link to={`${MORE_PROFILE_ROUTE}#profile-premium`}>
              {t('recaps.gateLink')}
            </Link>
          </section>
        ) : null}
        {editions.length > 0 ? (
          <>
            <p className="recap-section-label">{t('recaps.current')}</p>
            <Cover {...props} value={editions[0]} featured />
            {editions.length > 1 ? (
              <section
                className="recap-archive"
                aria-label={t('recaps.archive')}
              >
                <h2>{t('recaps.archive')}</h2>
                {editions.slice(1).map((value) => (
                  <Cover
                    key={value.id}
                    {...props}
                    value={value}
                    featured={false}
                  />
                ))}
              </section>
            ) : null}
          </>
        ) : null}
        {allowed && !query.isPending && !editions.length && !periods.length ? (
          <UiState
            kind="empty"
            title={t('recaps.emptyTitle')}
            body={t('recaps.emptyBody')}
            action={
              <Link className="button-link" to={MEMORY_CREATE_ROUTE}>
                {t('recaps.emptyAction')}
              </Link>
            }
          />
        ) : null}
        {allowed && periods.length > 0 ? (
          <section className="recap-available">
            <h2>{t('recaps.available')}</h2>
            {periods.map((period) => (
              <button
                className="recap-period-button"
                key={recapPeriodKey(period)}
                type="button"
                disabled={requesting}
                onClick={() => void openPeriod(period)}
              >
                <span>{recapPeriodLabel(period, resolvedLocale())}</span>
                <span>{t('recaps.create')} →</span>
              </button>
            ))}
          </section>
        ) : null}
        {query.hasNextPage ? (
          <button
            type="button"
            className="secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('recaps.more')}
          </button>
        ) : null}
      </div>
      <details className="recap-explanation">
        <summary>{t('recaps.about')}</summary>
        <p>{t('recaps.aboutBody')}</p>
      </details>
      <details
        className="recap-explanation"
        open={search.get('details') === 'relationship'}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (open === (search.get('details') === 'relationship')) return;
          const next = new URLSearchParams(search);
          if (open) next.set('details', 'relationship');
          else next.delete('details');
          setSearch(next, { replace: true });
        }}
      >
        <summary>{t('recaps.details')}</summary>
        <RelationshipPassport {...props} />
      </details>
    </div>
  );
}

function RecapReader({
  api,
  recapId,
  ...props
}: RecapsPageProps & { api: RecapsApi; recapId: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { requestReturn, captureOrigin } = useTaskOrigin();
  const [task, setTask] = useState<'selection' | 'reflection' | 'save' | null>(
    null,
  );
  const started = useRef(Date.now());
  const key = ['relationship-recap', props.account.id, props.spaceId, recapId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      authorized(
        api.getRelationshipRecap(
          { spaceId: props.spaceId, recapId },
          { signal },
        ),
      ),
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (state) =>
      document.visibilityState !== 'hidden' &&
      Date.now() - started.current < POLL_WINDOW_MS &&
      state.state.data?.status === 'PENDING'
        ? 2500
        : false,
  });
  const entitlements = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: props.apiBaseUrl,
          headers: { Authorization: `Bearer ${props.accessToken}` },
        }),
      ),
    [props.apiBaseUrl, props.accessToken],
  );
  const capability = useQuery({
    queryKey: ['recap-capability', props.account.id, props.spaceId],
    queryFn: ({ signal }) =>
      authorized(
        entitlements.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
          { spaceId: props.spaceId },
          { signal },
        ),
      ).then((view) => view.capabilities.includes('relationship.passport')),
    retry: false,
    gcTime: 0,
  });
  const value = query.data;
  const pageCount = (value?.sources.length ?? 0) + 2;
  const requestedPage = Number(search.get('page'));
  const page = Number.isInteger(requestedPage)
    ? Math.max(0, Math.min(pageCount - 1, requestedPage))
    : 0;
  const setPage = (next: number) => {
    const update = new URLSearchParams(search);
    if (next) update.set('page', String(next));
    else update.delete('page');
    setSearch(update, { replace: true });
  };
  const source = value?.sources[page - 1];
  const cover = value?.sources.find(
    (item) => item.available && item.previewAttachmentId,
  );
  const back = () =>
    requestReturn(
      (location.state as { taskOriginKey?: unknown } | null)?.taskOriginKey,
      `${MORE_PASSPORT_ROUTE}${search.get('tab') === 'years' ? '?tab=years' : ''}`,
    );
  return (
    <div className="page recap-reader">
      <div className="recap-reader-top">
        <button type="button" className="recap-back" onClick={back}>
          ‹ {t('recaps.back')}
        </button>
        {value ? (
          <span>{recapPeriodLabel(value, resolvedLocale())}</span>
        ) : null}
      </div>
      {query.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : value ? (
        <>
          {value.status === 'PENDING' ? (
            <UiState
              kind="loading"
              title={t('recaps.pendingTitle')}
              body={t(
                Date.now() - started.current < POLL_WINDOW_MS
                  ? 'recaps.pendingBody'
                  : 'recaps.pendingLong',
              )}
              action={
                <button
                  type="button"
                  onClick={() => {
                    started.current = Date.now();
                    void query.refetch();
                  }}
                >
                  {t('recaps.retry')}
                </button>
              }
            />
          ) : value.status === 'PAUSED' ? (
            <UiState
              kind="empty"
              title={t('recaps.shortTitle')}
              body={t('recaps.paused')}
            />
          ) : (
            <>
              <div className="recap-progress" aria-hidden="true">
                {[
                  'cover',
                  ...value.sources.map((item) => item.key),
                  'reflections',
                ].map((step, index) => (
                  <span key={step} data-complete={index <= page} />
                ))}
              </div>
              <article
                className="recap-spread"
                key={`${recapId}:${page}`}
                aria-label={t('recaps.page', {
                  page: page + 1,
                  count: pageCount,
                })}
              >
                {page === 0 ? (
                  <>
                    <p className="eyebrow">{t('recaps.automatic')}</p>
                    <h1>
                      {value.status === 'EMPTY'
                        ? t('recaps.emptyTitle')
                        : recapHeadline(value, t)}
                    </h1>
                    <PeriodNote value={value} />
                    {cover ? (
                      <div className="recap-reader-photo">
                        <RecapMedia {...props} source={cover} />
                      </div>
                    ) : (
                      <div className="recap-reader-seal">
                        <EimirIcon name="gemeinsam" />
                      </div>
                    )}
                    <p className="recap-reader-intro">
                      {value.status === 'EMPTY'
                        ? t('recaps.emptyBody')
                        : (value.introduction ?? t('recaps.fallbackIntro'))}
                    </p>
                  </>
                ) : source ? (
                  <>
                    <p className="eyebrow">
                      {t(`recaps.sourceKind.${source.kind}`)}
                      {source.occurredOn
                        ? ` · ${recapDate(source.occurredOn, resolvedLocale())}`
                        : ''}
                    </p>
                    <h1>
                      {source.available
                        ? source.title || t('recaps.untitled')
                        : t('recaps.sourceUnavailable')}
                    </h1>
                    {source.available && source.previewAttachmentId ? (
                      <div className="recap-reader-photo">
                        <RecapMedia {...props} source={source} />
                      </div>
                    ) : null}
                    {source.available &&
                    source.excerpt &&
                    source.excerpt !== source.title ? (
                      <p className="recap-original-text">{source.excerpt}</p>
                    ) : null}
                    {source.available ? (
                      <Link
                        className="recap-text-link"
                        to={recapSourcePath(source)}
                        state={{ taskOriginKey: null }}
                        onClick={(event) => {
                          const origin = captureOrigin();
                          // React Router receives the scoped opaque return key through navigation.
                          if (
                            origin &&
                            !event.ctrlKey &&
                            !event.metaKey &&
                            !event.shiftKey &&
                            event.button === 0
                          ) {
                            event.preventDefault();
                            void navigate(recapSourcePath(source), {
                              state: { taskOriginKey: origin },
                            });
                          }
                        }}
                      >
                        {t('recaps.source')} ↗
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="eyebrow">{t('recaps.shortTitle')}</p>
                    <h1>{t('recaps.finishTitle')}</h1>
                    <p className="recap-reader-intro">
                      {t('recaps.finishBody')}
                    </p>
                    {value.reflections.map((note) => (
                      <blockquote className="recap-reflection" key={note.id}>
                        <p>{note.text}</p>
                        <footer>
                          {t('recaps.sharedBy', { name: note.displayName })}
                        </footer>
                      </blockquote>
                    ))}
                    {value.ownDraft ? (
                      <div className="recap-private-draft">
                        <EimirIcon name="nurfuer" />
                        <strong>{t('recaps.privateDraft')}</strong>
                        <p>{value.ownDraft.text}</p>
                      </div>
                    ) : null}
                    {!value.savedAt && (capability.data || value.ownDraft) ? (
                      <button
                        type="button"
                        onClick={() => setTask('reflection')}
                      >
                        {t('recaps.ownWords')}
                      </button>
                    ) : null}
                    {value.reflections.some(
                      (note) => note.ownerId === props.account.id,
                    ) ? (
                      <button
                        type="button"
                        className="recap-text-button"
                        onClick={() => setTask('reflection')}
                      >
                        {t('recaps.withdraw')}
                      </button>
                    ) : null}
                    {value.savedAt ? (
                      <p className="recap-period-note">
                        {t('recaps.savedHelp')}
                      </p>
                    ) : capability.data ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setTask('save')}
                      >
                        {t('recaps.save')}
                      </button>
                    ) : null}
                  </>
                )}
              </article>
              <nav
                className="recap-page-controls"
                aria-label={t('recaps.shortTitle')}
              >
                <button
                  type="button"
                  className="secondary"
                  disabled={page === 0}
                  aria-label={t('recaps.previous')}
                  onClick={() => setPage(page - 1)}
                >
                  ←
                </button>
                <span aria-live="polite">
                  {t('recaps.page', { page: page + 1, count: pageCount })}
                </span>
                <button
                  type="button"
                  disabled={page === pageCount - 1}
                  aria-label={t('recaps.next')}
                  onClick={() => setPage(page + 1)}
                >
                  →
                </button>
              </nav>
              {!value.savedAt && capability.data ? (
                <div className="recap-reader-tools">
                  <button
                    type="button"
                    className="recap-text-button"
                    onClick={() => setTask('selection')}
                  >
                    {t('recaps.edit')}
                  </button>
                  <button
                    type="button"
                    className="recap-text-button"
                    onClick={() => setTask('reflection')}
                  >
                    {t('recaps.ownWords')}
                  </button>
                </div>
              ) : null}
            </>
          )}
          <RecapTasks
            key={`${recapId}:${task}`}
            task={task}
            onClose={() => setTask(null)}
            api={api}
            value={value}
            {...props}
            canCompose={capability.data === true}
            onUpdated={async () => {
              await query.refetch();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
