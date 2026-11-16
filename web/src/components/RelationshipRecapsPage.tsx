import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
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
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { RecapsApi } from '../api/generated/apis/RecapsApi';
import type { RecapView } from '../api/generated/models/RecapView';
import { Configuration } from '../client/apiConfiguration';
import { isCapacitorNativePlatform } from '../client/config';
import { normalizeClientError } from '../client/problemDetails';
import {
  recapDate,
  recapHeadline,
  recapPeriodKey,
  recapPeriodLabel,
  recapPeriodStatus,
  recapScenes,
  recapSourcePath,
} from '../client/recaps';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  MEMORY_CREATE_ROUTE,
  proPaywallPath,
  recapDetailPath,
  STORY_RECAPS_ROUTE,
} from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { handleTabKeyDown } from '../client/tabKeyboard';
import { useTaskOrigin } from '../client/taskOrigin';
import {
  storyReadingDuration,
  useStoryPlayback,
} from '../client/useStoryPlayback';
import { resolvedLocale, useTranslation } from '../i18n';
import { languageName, resolveSupportedLocale } from '../i18n/locale';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import type { ProfilePageProps } from './ProfilePage';
import { ProMark } from './ProMark';
import { RecapMedia, type RecapMediaProps } from './RecapMedia';
import { RecapTasks } from './RecapTasks';
import { BackSlotHost, TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import './RelationshipRecapsPage.css';

export type RecapsPageProps = ProfilePageProps & { mediaApis: ReferenceApis };
const POLL_WINDOW_MS = 120_000;
/** Earlier periods arrive in server-paced batches; a calm cadence is enough. */
const PREPARING_POLL_MS = 15_000;
const PREPARING_WINDOW_MS = 30 * 60_000;

async function authorized<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function PeriodNote({
  value,
  canCompose,
}: {
  value: RecapView;
  canCompose: boolean;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  return (
    <span className="recap-period-note">
      {!canCompose && value.isPartial && !value.savedAt
        ? t('recaps.partialThrough', {
            date: recapDate(value.throughOn, locale),
          })
        : recapPeriodStatus(value, locale, t)}
    </span>
  );
}

function RecapEditionLink({
  value,
  className,
  children,
}: {
  value: Pick<RecapView, 'id' | 'kind'>;
  className: string;
  children: ReactNode;
}) {
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  const detailPath = `${recapDetailPath(value.id)}${value.kind === 'YEAR' ? '?tab=years' : ''}`;
  function openReader(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    void navigate(detailPath, { state: { taskOriginKey: captureOrigin() } });
  }

  return (
    <Link
      className={className}
      to={detailPath}
      onClick={openReader}
      state={{ taskOriginKey: null }}
    >
      {children}
    </Link>
  );
}

function Cover({
  value,
  canCompose,
  ...media
}: RecapMediaProps & { value: RecapView; canCompose: boolean }) {
  const { t } = useTranslation();
  const source = value.sources.find((item) => item.available);
  const hasPhoto = Boolean(source?.previewAttachmentId);
  const locale = resolvedLocale();
  const label = recapPeriodLabel(value, locale);
  return (
    <article className="recap-cover recap-cover-featured">
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
            : new Intl.NumberFormat(locale, {
                minimumIntegerDigits: 2,
              }).format(value.month ?? 1)}
        </span>
      </div>
      <div className="recap-cover-copy">
        <div className="recap-cover-kicker">
          <span>{label}</span>
        </div>
        <h2 lang={value.headline ? value.locale : undefined}>
          {recapHeadline(value, t)}
        </h2>
        <p lang={value.introduction ? value.locale : undefined}>
          {value.introduction ?? t('recaps.fallbackIntro')}
        </p>
        <PeriodNote value={value} canCompose={canCompose} />
        <RecapEditionLink className="button-link recap-open" value={value}>
          {t('recaps.open')}
        </RecapEditionLink>
      </div>
    </article>
  );
}

function ArchiveRow({
  value,
  canCompose,
  ...media
}: RecapMediaProps & { value: RecapView; canCompose: boolean }) {
  const { t } = useTranslation();
  // Sensitive previews have their own reveal control in the reader.
  const photo = value.sources.find(
    (source) =>
      source.available &&
      source.previewAttachmentId &&
      source.previewIsSensitive === false,
  );
  return (
    <li>
      <RecapEditionLink className="recap-archive-row" value={value}>
        <span className="recap-archive-copy">
          <span>{recapPeriodLabel(value, resolvedLocale())}</span>
          <strong lang={value.headline ? value.locale : undefined}>
            {recapHeadline(value, t)}
          </strong>
          <PeriodNote value={value} canCompose={canCompose} />
        </span>
        {photo ? (
          <div className="recap-archive-art" aria-hidden="true">
            <RecapMedia {...media} source={photo} />
          </div>
        ) : null}
      </RecapEditionLink>
    </li>
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
  const client = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const started = useRef(Date.now());
  const prepared = useRef(false);
  const kind = search.get('tab') === 'years' ? 'YEAR' : 'MONTH';
  function selectPeriod(value: 'MONTH' | 'YEAR') {
    setSearch(value === 'YEAR' ? { tab: 'years' } : {}, { replace: true });
  }
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
    refetchInterval: (state) => {
      if (document.visibilityState === 'hidden') return false;
      const pages = state.state.data?.pages ?? [];
      const elapsed = Date.now() - started.current;
      if (
        elapsed < POLL_WINDOW_MS &&
        pages.some((page) =>
          page.editions.some((item) => item.status === 'PENDING'),
        )
      )
        return 2500;
      return elapsed < PREPARING_WINDOW_MS &&
        pages[0]?.periods.some((period) => period.kind === kind)
        ? PREPARING_POLL_MS
        : false;
    },
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
  const ready = editions.filter((item) => item.status === 'READY');
  const featured = ready.find((item) => item.isPartial && !item.savedAt);
  const archive = ready.filter((item) => item.id !== featured?.id);
  const unready = editions.filter((item) => item.status !== 'READY');
  const periods =
    query.data?.pages[0]?.periods.filter(
      (period) =>
        period.kind === kind &&
        !editions.some(
          (item) => recapPeriodKey(item) === recapPeriodKey(period),
        ),
    ) ?? [];
  return (
    <div className="page recap-library">
      <PageHeader
        eyebrow={t('recaps.automatic')}
        title={t('recaps.shortTitle')}
        titleAction={<ProMark label={t('recaps.pro')} />}
        description={t('recaps.intro')}
      />
      <div
        className="recap-tabs"
        role="tablist"
        aria-label={t('recaps.tabs')}
        onKeyDown={(event) =>
          handleTabKeyDown(event, (tab) =>
            selectPeriod(tab.id === 'recap-tab-YEAR' ? 'YEAR' : 'MONTH'),
          )
        }
      >
        {(['MONTH', 'YEAR'] as const).map((value) => (
          <button
            key={value}
            id={`recap-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={value === kind}
            aria-controls="recap-library-panel"
            tabIndex={value === kind ? 0 : -1}
            onClick={() => selectPeriod(value)}
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
        {featured ? (
          <>
            <p className="recap-section-label">{t('recaps.current')}</p>
            <Cover {...props} value={featured} canCompose={allowed} />
          </>
        ) : null}
        {archive.length > 0 ? (
          <section
            className="recap-archive"
            aria-labelledby="recap-archive-title"
          >
            <h2 id="recap-archive-title">{t('recaps.archive')}</h2>
            <ul className="recap-library-list">
              {archive.map((value) => (
                <ArchiveRow
                  key={value.id}
                  {...props}
                  value={value}
                  canCompose={allowed}
                />
              ))}
            </ul>
          </section>
        ) : null}
        {unready.length > 0 || (allowed && periods.length > 0) ? (
          <section
            className="recap-unready"
            aria-labelledby="recap-unready-title"
          >
            <h2 id="recap-unready-title">{t('recaps.otherPeriods')}</h2>
            <ul className="recap-library-list">
              {unready.map((value) => (
                <li key={value.id}>
                  <RecapEditionLink className="recap-status-row" value={value}>
                    <strong>{recapPeriodLabel(value, resolvedLocale())}</strong>
                    <span>
                      {t(
                        value.status === 'EMPTY'
                          ? 'recaps.emptyTitle'
                          : value.status === 'PAUSED'
                            ? 'recaps.generationPaused'
                            : 'recaps.preparing',
                      )}
                    </span>
                  </RecapEditionLink>
                </li>
              ))}
              {allowed
                ? periods.map((period) => (
                    <li
                      className="recap-status-row"
                      key={recapPeriodKey(period)}
                    >
                      <strong>
                        {recapPeriodLabel(period, resolvedLocale())}
                      </strong>
                      <span>{t('recaps.preparing')}</span>
                    </li>
                  ))
                : null}
            </ul>
          </section>
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
        {query.hasNextPage ? (
          <AutoLoadMore
            query={query}
            className="secondary"
            blocked={query.isFetchingNextPage}
          >
            {t('recaps.more')}
          </AutoLoadMore>
        ) : null}
        {!query.isPending && !query.error && !allowed ? (
          <section className="recap-gate">
            <h2>{t('recaps.gateTitle')}</h2>
            <p>{t('recaps.gateBody')}</p>
            <Link to={proPaywallPath('recaps')}>{t('recaps.gateLink')}</Link>
          </section>
        ) : null}
      </div>
      <details className="recap-explanation">
        <summary>{t('recaps.about')}</summary>
        <p>{t('recaps.aboutBody')}</p>
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
  const { requestReturn, captureOrigin, resolveOrigin } = useTaskOrigin();
  const [task, setTask] = useState<'selection' | 'reflection' | null>(null);
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
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlements, props.spaceId),
    [entitlements, props.spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const capability = useSpaceCapability({
    accountId: props.account.id,
    spaceId: props.spaceId,
    load: loadEntitlement,
    capability: 'relationship.passport',
  });
  const value = query.data;
  const scenes = useMemo(() => (value ? recapScenes(value) : []), [value]);
  const pageCount = scenes.length || 2;
  const requestedPage = Number(search.get('page'));
  const page = Number.isInteger(requestedPage)
    ? Math.max(0, Math.min(pageCount - 1, requestedPage))
    : 0;
  const ownsRouteEntry = useCallback(() => {
    const entry = window.history.state;
    // Native Back retires an entry before the router commits the next render.
    // A retired reader must not replace that destination with its old URL.
    return (
      !Number.isInteger(entry?.idx) ||
      (entry?.key ?? 'default') === location.key
    );
  }, [location.key]);
  const setPage = (next: number, automatic = false) => {
    if (!ownsRouteEntry()) return;
    const update = new URLSearchParams(search);
    if (next) update.set('page', String(next));
    else update.delete('page');
    setSearch(update, {
      replace: true,
      state: { ...location.state, inPlaceRouteUpdate: automatic },
    });
  };
  const scene = scenes[page];
  const source = scene?.type === 'highlight' ? scene.source : undefined;
  const mosaic = useMemo(
    () =>
      (value?.sources ?? [])
        .filter((item) => item.available && item.previewAttachmentId)
        .slice(0, 4),
    [value],
  );
  const cover = mosaic[0];
  // A recap plays like a photo memory: it starts on open and after returning
  // from a source. Reduced motion keeps it paused inside the playback hook.
  const autoStart = true;
  // The legacy playback intent is still consumed so it never lingers in the URL.
  useEffect(() => {
    if (!search.has('play') || !ownsRouteEntry()) return;
    const update = new URLSearchParams(search);
    update.delete('play');
    setSearch(update, { replace: true, state: location.state });
  }, [location.state, ownsRouteEntry, search, setSearch]);
  const pageKey = `${recapId}:${page}:${value?.version ?? 0}`;
  const pageMedia =
    scene?.type === 'cover'
      ? cover
      : source?.available && source.previewAttachmentId
        ? source
        : undefined;
  const mediaKey = `${pageKey}:${pageMedia?.key ?? ''}:${pageMedia?.previewAttachmentId ?? ''}`;
  const [settledMedia, setSettledMedia] = useState<string | null>(null);
  const settleMedia = useCallback(() => setSettledMedia(mediaKey), [mediaKey]);
  const duration = storyReadingDuration(
    scene?.type === 'facts'
      ? 'count label '.repeat(scene.lines.length + 2)
      : scene?.type === 'rhythm'
        ? 'count label '.repeat(scene.buckets.length + 2)
        : !scene || scene.type === 'cover'
          ? `${value?.headline ?? ''} ${value?.introduction ?? t('recaps.fallbackIntro')}`
          : `${source?.title ?? ''} ${source?.excerpt ?? ''}`,
  );
  const playback = useStoryPlayback({
    pageKey,
    duration,
    autoStart,
    ready:
      value?.status === 'READY' && (!pageMedia || settledMedia === mediaKey),
    blocked: Boolean(
      task ||
        query.isError ||
        (value &&
          value.status !== 'PENDING' &&
          (value.status !== 'READY' ||
            page === pageCount - 1 ||
            source?.available === false)),
    ),
    onAdvance: () => setPage(Math.min(page + 1, pageCount - 1), true),
  });
  // Taps and arrow keys can arrive faster than a render commits, while this
  // render still holds the previous page and route entry. The intended page is
  // kept until it is committed and replayed once after the commit if needed.
  const target = useRef<{ page: number; automatic: boolean } | null>(null);
  const turnPage = useRef<(step: number, automatic?: boolean) => void>(
    () => undefined,
  );
  useLayoutEffect(() => {
    turnPage.current = (step, automatic = false) => {
      const from = target.current?.page ?? page;
      const next = Math.max(0, Math.min(pageCount - 1, from + step));
      if (next === from) return;
      target.current = { page: next, automatic };
      setPage(next, automatic);
    };
    const pending = target.current;
    if (!pending) return;
    // One replay only: a target that cannot be reached must not loop.
    target.current = null;
    if (pending.page !== page) setPage(pending.page, pending.automatic);
  });
  // Tap turns the page, a held finger pauses, a horizontal swipe turns it too.
  // The explicit controls below remain the complete non-gesture path.
  const gesture = useRef<{
    x: number;
    y: number;
    at: number;
    resume: boolean;
    interactive: boolean;
  } | null>(null);
  const beginGesture = (event: PointerEvent<HTMLElement>) => {
    // The on-picture toggle owns its own press; it must not pause first.
    if (
      event.target instanceof Element &&
      event.target.closest('.recap-playback-toggle')
    ) {
      gesture.current = null;
      return;
    }
    const interactive =
      event.target instanceof Element &&
      event.target.closest(
        'a,button,input,textarea,select,summary,[contenteditable="true"]',
      ) !== null;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      resume: playback.playing && !interactive,
      interactive,
    };
    playback.pause();
  };
  const endGesture = (event: PointerEvent<HTMLElement>) => {
    const started = gesture.current;
    gesture.current = null;
    if (!started || started.interactive) return;
    const dx = event.clientX - started.x;
    const dy = event.clientY - started.y;
    let step = 0;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5)
      step = dx < 0 ? 1 : -1;
    else if (
      Math.abs(dx) < 10 &&
      Math.abs(dy) < 10 &&
      performance.now() - started.at < 350
    ) {
      const frame = event.currentTarget.getBoundingClientRect();
      step = event.clientX < frame.left + frame.width * 0.3 ? -1 : 1;
    }
    if (step) turnPage.current(step, started.resume);
    if (started.resume) playback.play();
  };
  // Arrow keys turn pages while no task sheet or text field owns the keyboard.
  useEffect(() => {
    if (task) return;
    const turn = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') ||
        (event.target instanceof HTMLElement &&
          event.target.matches(
            'input,textarea,select,[role="tab"],[contenteditable="true"]',
          ))
      )
        return;
      turnPage.current(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', turn);
    return () => window.removeEventListener('keydown', turn);
  }, [task]);
  // Page arrows are a browser control; the native app turns pages by touch and
  // keeps them only for assistive technology.
  const native = isCapacitorNativePlatform();
  // The toggle sits centred on the stage like a video control. The closing
  // scene keeps it in the control row: its own actions occupy the stage.
  const overlayPlay = Boolean(scene && scene.type !== 'closing');
  const centredOnStage =
    scene?.type === 'facts' ||
    scene?.type === 'rhythm' ||
    (scene?.type === 'cover' && mosaic.length === 0) ||
    (scene?.type === 'highlight' && scene.layout !== 'photo');
  const toggleLabel = t(
    playback.playing
      ? 'recaps.pause'
      : page === pageCount - 1
        ? 'recaps.replay'
        : 'recaps.play',
  );
  // Text-led scenes keep the toggle in the stage but below the copy, so a paused
  // reader never covers the title or a quote.
  const playbackToggle = (overlay: boolean, inline = false) =>
    value?.status === 'READY' ? (
      <button
        type="button"
        className={`recap-playback-toggle${overlay ? ' recap-playback-overlay' : ''}${inline ? ' recap-playback-inline' : ''}`}
        data-playing={playback.playing}
        onClick={() => {
          if (playback.playing) playback.pause();
          else {
            if (page === pageCount - 1) setPage(0);
            playback.play();
          }
        }}
      >
        <span aria-hidden="true">{playback.playing ? 'Ⅱ' : '▶'}</span>
        {overlay ? <span className="sr-only">{toggleLabel}</span> : toggleLabel}
      </button>
    ) : null;
  const back = () =>
    requestReturn(
      (location.state as { taskOriginKey?: unknown } | null)?.taskOriginKey,
      `${STORY_RECAPS_ROUTE}${search.get('tab') === 'years' ? '?tab=years' : ''}`,
    );
  const originPath = resolveOrigin(
    (location.state as { taskOriginKey?: unknown } | null)?.taskOriginKey,
  )?.to;
  const returnsToWir = originPath === '/today';
  // The Discover lead (#1907 F4) opens the reader from Momente itself.
  const returnsToMomente =
    originPath === '/story' || originPath?.startsWith('/story?') === true;
  return (
    <div
      className="page recap-reader"
      data-playing={playback.running}
      style={{ '--recap-dwell': `${duration}ms` } as CSSProperties}
    >
      <div className="recap-reader-top">
        {/* Back and the period share the reader's top row (#1907 C4). */}
        <BackSlotHost />
        <TaskBackButton onClick={back}>
          {t(
            returnsToWir
              ? 'navigation.today'
              : returnsToMomente
                ? 'navigation.story'
                : 'recaps.back',
          )}
        </TaskBackButton>
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
                {scenes.map(({ key: step }, index) => (
                  <span
                    key={step}
                    data-complete={index < page}
                    data-current={index === page}
                  >
                    <span
                      className="recap-step-fill"
                      key={`${step}:${pageKey}`}
                    />
                  </span>
                ))}
              </div>
              <article
                className={`recap-spread recap-scene-${scene?.type ?? 'cover'}${
                  scene?.type === 'highlight'
                    ? ` recap-layout-${scene.layout}`
                    : ''
                }`}
                key={`${recapId}:${page}`}
                onPointerDownCapture={beginGesture}
                onPointerUp={endGesture}
                onPointerCancel={() => {
                  gesture.current = null;
                }}
                onFocusCapture={(event) => {
                  if (
                    event.target instanceof HTMLElement &&
                    !event.target.closest('.recap-playback-toggle') &&
                    event.target.matches(
                      'a,button,input,textarea,select,[contenteditable="true"]',
                    )
                  )
                    playback.pause();
                }}
                onKeyDownCapture={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
                    return;
                  // Let the focused toggle own keyboard activation.
                  if (
                    (event.key === 'Enter' || event.key === ' ') &&
                    event.target instanceof Element &&
                    event.target.closest('.recap-playback-toggle')
                  )
                    return;
                  playback.pause();
                }}
                aria-label={t('recaps.page', {
                  page: page + 1,
                  count: pageCount,
                })}
              >
                {centredOnStage ? playbackToggle(true, true) : null}
                {!scene || scene.type === 'cover' ? (
                  <>
                    {mosaic.length ? (
                      <div className="recap-mosaic" data-count={mosaic.length}>
                        {mosaic.map((item, index) => (
                          <div className="recap-mosaic-cell" key={item.key}>
                            <RecapMedia
                              {...props}
                              source={item}
                              quality={index === 0 ? 'original' : 'thumbnail'}
                              onSettled={index === 0 ? settleMedia : undefined}
                            />
                          </div>
                        ))}
                        {playbackToggle(true)}
                      </div>
                    ) : (
                      <div className="recap-reader-seal">
                        <EimirIcon name="gemeinsam" />
                      </div>
                    )}
                    <div className="recap-scene-copy">
                      <p className="eyebrow">{t('recaps.automatic')}</p>
                      <h1 lang={value.headline ? value.locale : undefined}>
                        {value.status === 'EMPTY'
                          ? t('recaps.emptyTitle')
                          : recapHeadline(value, t)}
                      </h1>
                      <PeriodNote
                        value={value}
                        canCompose={capability.data !== false}
                      />
                      <p
                        className="recap-reader-intro"
                        lang={value.introduction ? value.locale : undefined}
                      >
                        {value.status === 'EMPTY'
                          ? t('recaps.emptyBody')
                          : (value.introduction ?? t('recaps.fallbackIntro'))}
                      </p>
                      {value.introduction ? (
                        <p className="recap-ai-note">
                          {t('recaps.aiDraft')}
                          {resolveSupportedLocale(value.locale) !==
                          resolvedLocale()
                            ? ` · ${t('recaps.originalLanguage', { language: languageName(value.locale, resolvedLocale()) })}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : scene.type === 'facts' ? (
                  <div className="recap-scene-copy">
                    <p className="eyebrow">
                      {recapPeriodLabel(value, resolvedLocale())}
                    </p>
                    <h1>{t('recaps.factsTitle')}</h1>
                    <ul className="recap-facts">
                      {scene.lines.map((line, index) => (
                        <li
                          key={line.kind}
                          style={{ '--recap-index': index } as CSSProperties}
                        >
                          <strong>
                            {new Intl.NumberFormat(resolvedLocale()).format(
                              line.count,
                            )}
                          </strong>
                          <span>
                            {t(`recaps.facts.${line.kind}`, {
                              count: line.count,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {scene.busiestMonth ? (
                      <p className="recap-facts-busiest">
                        {t('recaps.factsBusiest', {
                          month: new Intl.DateTimeFormat(resolvedLocale(), {
                            month: 'long',
                            timeZone: 'UTC',
                          }).format(
                            new Date(
                              Date.UTC(value.year, scene.busiestMonth - 1, 1),
                            ),
                          ),
                        })}
                      </p>
                    ) : null}
                    <p className="recap-period-note">{t('recaps.factsNote')}</p>
                  </div>
                ) : scene.type === 'rhythm' ? (
                  <div className="recap-scene-copy">
                    <p className="eyebrow">
                      {recapPeriodLabel(value, resolvedLocale())}
                    </p>
                    <h1>{t('recaps.rhythm.title')}</h1>
                    <p className="recap-reader-intro">
                      {t('recaps.rhythm.summary', { count: scene.total })}
                    </p>
                    <ol
                      className="recap-rhythm"
                      style={
                        {
                          '--recap-columns': scene.buckets.length,
                        } as CSSProperties
                      }
                    >
                      {scene.buckets.map((bucket) => (
                        <li
                          key={bucket.index}
                          data-leading={bucket.index === scene.leading}
                          style={
                            {
                              '--recap-share':
                                bucket.goodDays /
                                Math.max(
                                  ...scene.buckets.map((item) => item.goodDays),
                                ),
                            } as CSSProperties
                          }
                        >
                          <span
                            className="recap-rhythm-bar"
                            aria-hidden="true"
                          />
                          <span className="recap-rhythm-label">
                            {value.kind === 'YEAR'
                              ? new Intl.DateTimeFormat(resolvedLocale(), {
                                  month: 'short',
                                  timeZone: 'UTC',
                                }).format(
                                  new Date(
                                    Date.UTC(value.year, bucket.index - 1, 1),
                                  ),
                                )
                              : t('recaps.rhythm.week', {
                                  count: bucket.index,
                                })}
                          </span>
                          <strong>
                            {new Intl.NumberFormat(resolvedLocale()).format(
                              bucket.goodDays,
                            )}
                            <span className="sr-only">
                              {' '}
                              {t('recaps.rhythm.days', {
                                count: bucket.goodDays,
                              })}
                            </span>
                          </strong>
                        </li>
                      ))}
                    </ol>
                    <p className="recap-period-note">
                      {t('recaps.rhythm.note')}
                    </p>
                  </div>
                ) : source ? (
                  <>
                    {scene.type === 'highlight' && scene.layout === 'photo' ? (
                      <div className="recap-scene-media">
                        <RecapMedia
                          {...props}
                          source={source}
                          quality="original"
                          onSettled={settleMedia}
                        />
                      </div>
                    ) : null}
                    {scene.type === 'highlight' && scene.layout === 'photo'
                      ? playbackToggle(true)
                      : null}
                    {scene.type === 'highlight' &&
                    scene.layout === 'title' &&
                    source.available ? (
                      <div className="recap-scene-emblem">
                        <EimirIcon
                          name={
                            source.kind === 'MILESTONE'
                              ? 'meilensteine'
                              : 'kapitel'
                          }
                        />
                      </div>
                    ) : null}
                    <div className="recap-scene-copy">
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
                      {source.available &&
                      source.excerpt &&
                      source.excerpt !== source.title ? (
                        <p className="recap-original-text">{source.excerpt}</p>
                      ) : null}
                      {source.available && source.quote ? (
                        <blockquote className="recap-quote">
                          <p>
                            {source.quote.authorName
                              ? t('recaps.quote', {
                                  name: source.quote.authorName,
                                  text: source.quote.text,
                                })
                              : t('recaps.quoteAnonymous', {
                                  text: source.quote.text,
                                })}
                          </p>
                        </blockquote>
                      ) : null}
                      {source.available &&
                      scene.type === 'highlight' &&
                      scene.layout === 'photo' &&
                      source.mutualReaction ? (
                        <p className="recap-reaction-line">
                          {source.mutualReaction === 'LOVE' ? (
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path
                                fill="currentColor"
                                d="M12 21.2 10.6 20C5.4 15.3 2 12.2 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.8-3.4 6.9-8.6 11.6L12 21.2Z"
                              />
                            </svg>
                          ) : null}
                          {t(`recaps.mutualReaction.${source.mutualReaction}`)}
                        </p>
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
                          {t('recaps.source')}
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="recap-scene-copy">
                    <p className="eyebrow">{t('recaps.shortTitle')}</p>
                    <h1>{t('recaps.finishTitle')}</h1>
                    <p
                      className="recap-reader-intro"
                      lang={value.introduction ? value.locale : undefined}
                    >
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
                    {capability.data || value.ownDraft ? (
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
                    ) : null}
                  </div>
                )}
              </article>
              <nav
                className="recap-page-controls"
                data-native={native}
                aria-label={t('recaps.shortTitle')}
              >
                <button
                  type="button"
                  className={native ? 'sr-only' : 'secondary'}
                  disabled={page === 0}
                  aria-label={t('recaps.previous')}
                  onClick={() => setPage(page - 1)}
                >
                  {t('recaps.previous')}
                </button>
                <div className="recap-playback-center">
                  {overlayPlay ? null : playbackToggle(false)}
                  <span aria-live={playback.playing ? 'off' : 'polite'}>
                    {t('recaps.page', { page: page + 1, count: pageCount })}
                  </span>
                </div>
                <button
                  type="button"
                  className={native ? 'sr-only' : undefined}
                  disabled={page === pageCount - 1}
                  aria-label={t('recaps.next')}
                  onClick={() => setPage(page + 1)}
                >
                  {t('recaps.next')}
                </button>
              </nav>
              {page === 0 ? (
                <p className="recap-gesture-hint" data-native={native}>
                  {t('recaps.gestureHint')}
                </p>
              ) : null}
              {capability.data ? (
                <div className="recap-reader-tools">
                  {value.savedAt ? null : (
                    <button
                      type="button"
                      className="recap-text-button"
                      onClick={() => setTask('selection')}
                    >
                      {t('recaps.edit')}
                    </button>
                  )}
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
