import { useQuery } from '@tanstack/react-query';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardSharedStorySummary } from '../api/generated/models/DashboardSharedStorySummary';
import { dashboardItemTitle } from '../client/dashboardPresentation';
import { storyLifelineQueryKey } from '../client/dashboardQueries';
import { formatCalendarDate } from '../client/formatRecency';
import { dashboardItemPath } from '../client/m4Product';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { normalizeClientError } from '../client/problemDetails';
import { appRoutePath } from '../client/routes';
import {
  buildLifeline,
  type LifelineColumn,
  type LifelineKind,
  type LifelineModel,
  monthTicks,
  nearestColumn,
} from '../client/storyLifeline';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { TodayDestinationLink } from './TodayDestinationLink';
import './SharedStorySummary.css';

const HINT_STORAGE_KEY = 'eimir-story-lifeline-hint-v1';
/** Room one short month label needs, in ems of the axis text. */
const TICK_LABEL_EMS = 2.8;
/** Room the today label needs at the end of the axis, in ems. */
const TODAY_LABEL_EMS = 3.4;
/** Fallback axis room before the band has been measured. */
const DEFAULT_AXIS = { width: 320, fontSize: 13 };

const KIND_ICON: Record<string, EimirIconName> = {
  MEMORY: 'erinnerungen',
  HEART_MOMENT: 'momente',
  MILESTONE: 'meilensteine',
};

type LoadMemoryImage = (
  memoryId: string,
  attachmentId: string,
  signal?: AbortSignal,
  variant?: 'original' | 'thumbnail',
) => Promise<ObjectUrlSource>;

interface SharedStorySummaryProps {
  /** Dashboard totals, shown until the lifeline arrives or if it fails. */
  summary: DashboardSharedStorySummary;
  accountId: string;
  spaceId: string;
  dashboardApi?: DashboardApi;
  loadMemoryImage?: LoadMemoryImage;
  /**
   * The id of a heading the host already shows for the lifeline. The section
   * is then named by it and renders no title of its own.
   */
  labelledBy?: string;
}

function readHintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === 'seen';
  } catch {
    return false;
  }
}

function rememberHintSeen() {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, 'seen');
  } catch {
    /* The hint simply shows again next time. */
  }
}

/**
 * Wir `Eure Geschichte` (#1770): the shape of the couple's shared story as a
 * lifeline from its start to today, with on-demand previews instead of
 * repeating photos that `Euer Moment` and the monthly mosaic already show.
 */
export function SharedStorySummary({
  summary,
  accountId,
  spaceId,
  dashboardApi,
  loadMemoryImage,
  labelledBy,
}: SharedStorySummaryProps) {
  const { t } = useTranslation();
  const headingId = 'shared-story-summary-heading';
  const lifelineQuery = useQuery({
    queryKey: storyLifelineQueryKey(accountId, spaceId),
    enabled: Boolean(dashboardApi && accountId && spaceId),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!dashboardApi) throw new Error('Dashboard API is unavailable');
      try {
        return await dashboardApi.getStoryLifeline({ spaceId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const model = useMemo(
    () => (lifelineQuery.data ? buildLifeline(lifelineQuery.data) : null),
    [lifelineQuery.data],
  );
  // One source of numbers at a time, so the parts always add up.
  const totals = model?.totals ?? {
    memories: summary.memories,
    heartMoments: summary.heartMoments,
    milestones: summary.milestones,
    total: summary.memories + summary.heartMoments + summary.milestones,
  };
  const locale = resolvedLocale();
  const formattedCount = new Intl.NumberFormat(locale).format(totals.total);
  const caption = model
    ? t('m5s5.dashboard.storyLifelineCaption', {
        count: totals.total,
        formattedCount,
        since: sinceLabel(model, locale),
      })
    : t('m5s5.dashboard.storyLifelineTotal', {
        count: totals.total,
        formattedCount,
      });

  return (
    <section
      className="shared-story-summary"
      aria-labelledby={labelledBy ?? headingId}
    >
      {labelledBy ? null : (
        <h2 id={headingId} className="today-section-title">
          {t('m5s5.dashboard.storySummaryTitle')}
        </h2>
      )}
      <p className="shared-story-summary-caption">
        {totals.total > 0 ? caption : t('m5s5.dashboard.storyLifelineEmpty')}
      </p>
      {model?.drawable && model.columns.length > 0 ? (
        <LifelineBand
          model={model}
          spaceId={spaceId}
          loadMemoryImage={loadMemoryImage}
        />
      ) : null}
      <StoryLegend totals={totals} />
    </section>
  );
}

function sinceLabel(model: LifelineModel, locale: string): string {
  const sameYear =
    model.rangeStart.getUTCFullYear() === model.today.getUTCFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(model.rangeStart);
}

function StoryLegend({ totals }: { totals: Record<LifelineKind, number> }) {
  const { t } = useTranslation();
  const numberFormat = new Intl.NumberFormat(resolvedLocale());
  const storyBaseRoute = appRoutePath('story');
  const metrics = [
    {
      key: 'memories' as const,
      label: t('m5s5.dashboard.storySummaryMemories'),
      ariaLabel: t('m5s5.dashboard.storySummaryMemoriesCount', {
        count: totals.memories,
      }),
      to: `${storyBaseRoute}?tab=timeline&type=MEMORY`,
    },
    {
      key: 'heartMoments' as const,
      label: t('m5s5.dashboard.storySummaryHeartMoments'),
      ariaLabel: t('m5s5.dashboard.storySummaryHeartMomentsCount', {
        count: totals.heartMoments,
      }),
      to: `${storyBaseRoute}?tab=timeline&type=HEART_MOMENT`,
    },
    {
      key: 'milestones' as const,
      label: t('m5s5.dashboard.storySummaryMilestones'),
      ariaLabel: t('m5s5.dashboard.storySummaryMilestonesCount', {
        count: totals.milestones,
      }),
      to: `${storyBaseRoute}?tab=timeline&type=MILESTONE`,
    },
  ].filter((metric) => totals[metric.key] > 0);
  if (metrics.length === 0) return null;
  return (
    <ul className="shared-story-summary-values">
      {metrics.map((metric) => (
        <li className="shared-story-summary-metric" key={metric.key}>
          <Link
            to={metric.to}
            className={`shared-story-summary-row shared-story-summary-category-${metric.key}`}
            aria-label={metric.ariaLabel}
          >
            <span className="shared-story-summary-dot" aria-hidden="true" />
            <span className="shared-story-summary-label">
              <strong className="shared-story-summary-number">
                {numberFormat.format(totals[metric.key])}
              </strong>{' '}
              {metric.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function periodLabel(
  column: LifelineColumn,
  unit: LifelineModel['unit'],
  t: ReturnType<typeof useTranslation>['t'],
  locale: string,
): string {
  if (unit === 'week')
    return t('m5s5.dashboard.storyLifelineWeekOf', {
      date: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(column.start),
    });
  const format = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (unit === 'month') return format.format(column.start);
  const last = new Date(
    Date.UTC(column.start.getUTCFullYear(), column.start.getUTCMonth() + 2, 1),
  );
  return format.formatRange(column.start, last);
}

function LifelineBand({
  model,
  spaceId,
  loadMemoryImage,
}: {
  model: LifelineModel;
  spaceId: string;
  loadMemoryImage?: LoadMemoryImage;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const bandRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const ticksRef = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState(DEFAULT_AXIS);
  const columns = model.columns;
  const last = columns.length - 1;
  const current = active === null ? null : (columns[active] ?? null);

  useEffect(() => {
    if (active === null) return;
    const dismiss = (event: Event) => {
      if (!containerRef.current?.contains(event.target as Node))
        setActive(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [active]);

  // Axis labels must not collide at any width or text size.
  useLayoutEffect(() => {
    const node = ticksRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      const fontSize = Number.parseFloat(getComputedStyle(node).fontSize);
      if (width > 0 && fontSize > 0)
        setAxis((previous) =>
          previous.width === width && previous.fontSize === fontSize
            ? previous
            : { width, fontSize },
        );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const markInteracted = () => {
    if (hintSeen) return;
    setHintSeen(true);
    rememberHintSeen();
  };

  const columnAt = (clientX: number) => {
    const band = bandRef.current?.getBoundingClientRect();
    if (!band || band.width <= 0) return null;
    const index = nearestColumn(
      columns,
      Math.min(1, Math.max(0, (clientX - band.left) / band.width)),
    );
    return index < 0 ? null : index;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrubbing(true);
    setActive(columnAt(event.clientX));
    markInteracted();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (scrubbing || event.pointerType === 'mouse')
      setActive(columnAt(event.clientX));
  };
  const endScrub = () => setScrubbing(false);
  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && !scrubbing) setActive(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? last;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      next = active === null ? last : Math.max(0, from - 1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
      next = active === null ? last : Math.min(last, from + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape' && active !== null) {
      event.preventDefault();
      setActive(null);
      return;
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      previewRef.current?.querySelector('a')?.click();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    markInteracted();
  };

  const valueText = (column: LifelineColumn) =>
    t('m5s5.dashboard.storyLifelineValue', {
      period: periodLabel(column, model.unit, t, locale),
      entries: t('m5s5.dashboard.storyLifelineEntries', {
        count: column.total,
      }),
      title: dashboardItemTitle(column.highlight, t).title,
    });

  const ticks: { label: string; position: number }[] = [];
  const tickFormat = new Intl.DateTimeFormat(locale, {
    ...(model.unit === 'quarter'
      ? { year: 'numeric' as const }
      : { month: 'short' as const }),
    timeZone: 'UTC',
  });
  for (const tick of monthTicks(model)) {
    const previous = ticks.at(-1);
    const minGap = (axis.fontSize * TICK_LABEL_EMS) / axis.width;
    const todayZone = 1 - (axis.fontSize * TODAY_LABEL_EMS) / axis.width;
    if (tick.position + minGap > todayZone) continue;
    if (previous && tick.position - previous.position < minGap) continue;
    ticks.push({
      label: tickFormat.format(tick.start),
      position: tick.position,
    });
  }

  return (
    <div
      ref={containerRef}
      className={`shared-story-lifeline${current ? ' is-active' : ''}${scrubbing ? ' is-scrubbing' : ''}`}
    >
      <div
        ref={bandRef}
        className="shared-story-lifeline-band"
        role="slider"
        tabIndex={0}
        aria-label={t('m5s5.dashboard.storyLifelineAria')}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active ?? last}
        aria-valuetext={valueText(current ?? columns[last])}
        aria-describedby={current ? previewId : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      >
        {columns.map((column, index) => (
          <span
            key={column.key}
            className={`shared-story-lifeline-column${index === active ? ' is-current' : ''}`}
            style={{ '--lifeline-x': column.position } as CSSProperties}
            aria-hidden="true"
          >
            {column.dots.map((kind, stack) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional.
                key={stack}
                className={`shared-story-lifeline-dot shared-story-summary-category-${kind}`}
              />
            ))}
          </span>
        ))}
        <span className="shared-story-lifeline-axis" aria-hidden="true" />
        <span className="shared-story-lifeline-now" aria-hidden="true" />
        {current ? (
          <span
            className="shared-story-lifeline-cursor"
            style={{ '--lifeline-x': current.position } as CSSProperties}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div
        ref={ticksRef}
        className="shared-story-lifeline-ticks"
        aria-hidden="true"
      >
        {ticks.map((tick) => (
          <span
            key={`${tick.label}:${tick.position}`}
            className="shared-story-lifeline-tick"
            style={{ '--lifeline-x': tick.position } as CSSProperties}
          >
            {tick.label}
          </span>
        ))}
        <span className="shared-story-lifeline-today">
          {t('m5s5.dashboard.storyLifelineToday')}
        </span>
      </div>
      {current ? (
        <div
          ref={previewRef}
          id={previewId}
          className="shared-story-lifeline-preview"
          style={{ '--lifeline-x': current.position } as CSSProperties}
        >
          <LifelinePreview
            column={current}
            unitLabel={periodLabel(current, model.unit, t, locale)}
            spaceId={spaceId}
            loadMemoryImage={loadMemoryImage}
          />
        </div>
      ) : null}
      {hintSeen ? null : (
        <p className="shared-story-lifeline-hint">
          {t('m5s5.dashboard.storyLifelineHint')}
        </p>
      )}
    </div>
  );
}

function LifelinePreview({
  column,
  unitLabel,
  spaceId,
  loadMemoryImage,
}: {
  column: LifelineColumn;
  unitLabel: string;
  spaceId: string;
  loadMemoryImage?: LoadMemoryImage;
}) {
  const { t } = useTranslation();
  const item = column.highlight;
  const { title } = dashboardItemTitle(item, t);
  const date = item.occurredOn ?? item.createdAt;
  const path = dashboardItemPath(item.type, item.id);
  const glyph = (
    <span className="shared-story-lifeline-glyph" aria-hidden="true">
      <EimirIcon name={KIND_ICON[item.type] ?? 'erinnerungen'} />
    </span>
  );
  const content = (
    <>
      <span className="shared-story-lifeline-preview-media">
        {item.previewAttachmentId && loadMemoryImage ? (
          <MemoryPreview
            memoryId={item.id}
            attachmentId={item.previewAttachmentId}
            isSensitive={item.previewIsSensitive}
            hasThumbnail={item.previewHasThumbnail}
            loadImage={loadMemoryImage}
            resourceScopeKey={`story-lifeline:${spaceId}:${item.id}`}
            fallback={glyph}
          />
        ) : (
          glyph
        )}
      </span>
      <span className="shared-story-lifeline-preview-text">
        <strong>{title}</strong>
        <span>
          {[
            date ? formatCalendarDate(date) : unitLabel,
            t('m5s5.dashboard.storyLifelineEntries', { count: column.total }),
          ].join(' · ')}
        </span>
      </span>
    </>
  );
  return path ? (
    <TodayDestinationLink
      to={path}
      className="shared-story-lifeline-preview-card"
    >
      {content}
    </TodayDestinationLink>
  ) : (
    <span className="shared-story-lifeline-preview-card">{content}</span>
  );
}
