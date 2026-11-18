import { useQuery } from '@tanstack/react-query';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
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
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { DashboardSharedStorySummary } from '../api/generated/models/DashboardSharedStorySummary';
import { dashboardItemTitle } from '../client/dashboardPresentation';
import {
  storyLifelineEntriesQueryKey,
  storyLifelineQueryKey,
} from '../client/dashboardQueries';
import { formatCalendarDate } from '../client/formatRecency';
import { dashboardItemPath } from '../client/m4Product';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { normalizeClientError } from '../client/problemDetails';
import { appRoutePath } from '../client/routes';
import {
  buildLifeline,
  dotEntry,
  entryDot,
  type LifelineColumn,
  type LifelineKind,
  type LifelineModel,
  lifelineKindOf,
  monthTicks,
  nearestColumn,
} from '../client/storyLifeline';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { StoryKindGlyph } from './StoryKindGlyph';
import { TodayDestinationLink } from './TodayDestinationLink';
import './SharedStorySummary.css';

const HINT_STORAGE_KEY = 'eimir-story-lifeline-hint-v2';
/** Room one short month label needs, in ems of the axis text. */
const TICK_LABEL_EMS = 2.8;
/** Room the today label needs at the end of the axis, in ems. */
const TODAY_LABEL_EMS = 3.4;
/** Fallback axis room before the band has been measured. */
const DEFAULT_AXIS = { width: 320, fontSize: 13 };
/** Movement before a press becomes a horizontal or vertical drag. */
const DRAG_THRESHOLD = 6;
/** Vertical travel that moves the selection by one entry. */
const DRAG_ENTRY_STEP = 14;
/** The most rows the full variant lists around the selected entry. */
const FAN_ROWS = 6;
/** The most pagination dots the preview shows around the selection. */
const PAGER_DOTS = 9;
/** Horizontal travel on the preview that changes the entry. */
const SWIPE_COMMIT = 40;
/** The swiped card fades with distance, never below this much. */
const SWIPE_FADE_DISTANCE = 200;
const SWIPE_FADE_MAX = 0.5;

const KIND_LABEL: Record<LifelineKind, string> = {
  memories: 'm5s5.dashboard.storyLifelineKindMemory',
  heartMoments: 'm5s5.dashboard.storyLifelineKindHeartMoment',
  milestones: 'm5s5.dashboard.storyLifelineKindMilestone',
};

type LoadMemoryImage = (
  memoryId: string,
  attachmentId: string,
  signal?: AbortSignal,
  variant?: 'original' | 'thumbnail',
) => Promise<ObjectUrlSource>;

/** `compact` on Wir: one preview card. `full` on Eure Geschichte: a list. */
export type SharedStorySummaryVariant = 'compact' | 'full';

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
  variant?: SharedStorySummaryVariant;
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

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/**
 * `Eure Geschichte` (#1770): the shape of the couple's shared story as a
 * lifeline from its start to today. A period is chosen sideways; within it
 * every entry can be chosen on its own, read lazily from the server.
 */
export function SharedStorySummary({
  summary,
  accountId,
  spaceId,
  dashboardApi,
  loadMemoryImage,
  labelledBy,
  variant = 'compact',
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
      className={`shared-story-summary shared-story-summary-${variant}`}
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
          accountId={accountId}
          spaceId={spaceId}
          dashboardApi={dashboardApi}
          loadMemoryImage={loadMemoryImage}
          variant={variant}
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
            className={`shared-story-summary-row story-kind-${metric.key}`}
            aria-label={metric.ariaLabel}
          >
            <StoryKindGlyph
              kind={metric.key}
              className="shared-story-summary-glyph"
            />
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

interface DragState {
  x: number;
  y: number;
  axis: 'x' | 'y' | null;
  moved: boolean;
  startEntry: number | null;
}

function LifelineBand({
  model,
  accountId,
  spaceId,
  dashboardApi,
  loadMemoryImage,
  variant,
}: {
  model: LifelineModel;
  accountId: string;
  spaceId: string;
  dashboardApi?: DashboardApi;
  loadMemoryImage?: LoadMemoryImage;
  variant: SharedStorySummaryVariant;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const bandRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewId = useId();
  const [active, setActive] = useState<number | null>(null);
  // The chosen entry inside the active column; `null` follows its highlight.
  const [entryChoice, setEntryChoice] = useState<number | null>(null);
  // A dot tapped before the column's entries arrived.
  const [requestedDot, setRequestedDot] = useState<number | null>(null);
  const [travel, setTravel] = useState<{ direction: -1 | 0 | 1; at: number }>({
    direction: 0,
    at: 0,
  });
  const [scrubbing, setScrubbing] = useState(false);
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const ticksRef = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState(DEFAULT_AXIS);
  const columns = model.columns;
  const last = columns.length - 1;
  const current = active === null ? null : (columns[active] ?? null);

  const entriesQuery = useQuery({
    queryKey: storyLifelineEntriesQueryKey(
      accountId,
      spaceId,
      current ? isoDay(current.from) : '',
      current ? isoDay(current.to) : '',
    ),
    enabled: Boolean(current && dashboardApi && accountId && spaceId),
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!dashboardApi || !current)
        throw new Error('Dashboard API is unavailable');
      try {
        return await dashboardApi.getStoryLifelineEntries(
          { spaceId, from: current.from, to: current.to },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const entries =
    current && entriesQuery.data && entriesQuery.data.items.length > 0
      ? entriesQuery.data.items
      : null;
  const kinds = useMemo(
    () => (entries ? entries.map((item) => lifelineKindOf(item.type)) : []),
    [entries],
  );
  let selected: number | null = null;
  if (current && entries) {
    const highlightIndex = Math.max(
      0,
      entries.findIndex((item) => item.id === current.highlight.id),
    );
    const fromDot =
      requestedDot === null ? -1 : dotEntry(current, kinds, requestedDot);
    selected = Math.min(
      entries.length - 1,
      entryChoice ?? (fromDot >= 0 ? fromDot : highlightIndex),
    );
  }
  const selectedDot =
    current && selected !== null
      ? entryDot(current, kinds, selected)
      : requestedDot;
  const selectedItem: DashboardItem | null = current
    ? selected !== null && entries
      ? entries[selected]
      : current.highlight
    : null;

  useEffect(() => {
    if (active === null) return;
    // A click, not a press: pressing elsewhere first may shift the layout and
    // swallow the click that follows.
    // The path, not `contains`: a click on a node that re-rendered away is
    // detached by now and would otherwise count as outside.
    const dismiss = (event: Event) => {
      const container = containerRef.current;
      if (container && !event.composedPath().includes(container))
        setActive(null);
    };
    document.addEventListener('click', dismiss);
    return () => document.removeEventListener('click', dismiss);
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

  const markEntryInteraction = () => {
    if (hintSeen) return;
    setHintSeen(true);
    rememberHintSeen();
  };

  const selectColumn = (index: number | null) => {
    if (index === active) return;
    setActive(index);
    setEntryChoice(null);
    setRequestedDot(null);
    setTravel((previous) => ({ direction: 0, at: previous.at + 1 }));
  };

  const chooseEntry = (index: number) => {
    if (!entries || selected === null) return;
    const next = Math.min(entries.length - 1, Math.max(0, index));
    if (next === selected) return;
    setEntryChoice(next);
    setRequestedDot(null);
    setTravel((previous) => ({
      direction: next > selected ? 1 : -1,
      at: previous.at + 1,
    }));
    markEntryInteraction();
  };

  const step = (delta: number) => {
    if (selected !== null) chooseEntry(selected + delta);
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

  /** The dot of a column under a tap, with a finger's tolerance. */
  const dotAt = (column: number, clientX: number, clientY: number) => {
    const dots = bandRef.current?.querySelectorAll<HTMLElement>(
      `[data-lifeline-column="${column}"] [data-lifeline-dot]`,
    );
    let best: number | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const dot of dots ?? []) {
      const box = dot.getBoundingClientRect();
      const reach = Math.max(box.height, 14);
      const dx = Math.abs(box.left + box.width / 2 - clientX);
      const dy = Math.abs(box.top + box.height / 2 - clientY);
      if (dx > Math.max(box.width, 22) || dy > reach) continue;
      if (dy < distance) {
        distance = dy;
        best = Number(dot.dataset.lifelineDot);
      }
    }
    return best;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrubbing(true);
    const column = columnAt(event.clientX);
    const sameColumn = column === active;
    if (!sameColumn) selectColumn(column);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      axis: null,
      moved: false,
      startEntry: sameColumn ? selected : null,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (
      !drag.axis &&
      (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
    )
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (drag.axis === 'x') {
      drag.moved = true;
      selectColumn(columnAt(event.clientX));
    } else if (drag.axis === 'y' && selected !== null) {
      drag.moved = true;
      drag.startEntry ??= selected;
      chooseEntry(drag.startEntry + Math.round(-dy / DRAG_ENTRY_STEP));
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setScrubbing(false);
    if (!drag || drag.moved || active === null || !current) return;
    const dot = dotAt(active, event.clientX, event.clientY);
    if (dot === null) return;
    markEntryInteraction();
    if (!entries) {
      setRequestedDot(dot);
      return;
    }
    const index = dotEntry(current, kinds, dot);
    if (index >= 0) chooseEntry(index);
  };
  const endScrub = () => {
    dragRef.current = null;
    setScrubbing(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? last;
    let next: number | null = null;
    if (event.key === 'ArrowLeft')
      next = active === null ? last : Math.max(0, from - 1);
    else if (event.key === 'ArrowRight')
      next = active === null ? last : Math.min(last, from + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (active === null) selectColumn(last);
      else step(event.key === 'ArrowUp' ? 1 : -1);
      return;
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape' && active !== null) {
      event.preventDefault();
      selectColumn(null);
      return;
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      previewRef.current
        ?.querySelector<HTMLAnchorElement>(
          '.shared-story-lifeline-preview-main',
        )
        ?.click();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    selectColumn(next);
  };

  const kindLabel = (item: DashboardItem) =>
    t(KIND_LABEL[lifelineKindOf(item.type)]);
  const valueText = (column: LifelineColumn) => {
    const item =
      column === current && selectedItem ? selectedItem : column.highlight;
    const base = {
      period: periodLabel(column, model.unit, t, locale),
      entries: t('m5s5.dashboard.storyLifelineEntries', {
        count: column.total,
      }),
      kind: kindLabel(item),
      title: dashboardItemTitle(item, t).title,
    };
    return column === current && entries && selected !== null
      ? t('m5s5.dashboard.storyLifelineValuePosition', {
          ...base,
          position: selected + 1,
          total: entries.length,
        })
      : t('m5s5.dashboard.storyLifelineValue', base);
  };

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

  const hint = hintSeen
    ? null
    : current
      ? current.total > 1
        ? t('m5s5.dashboard.storyLifelineEntryHint')
        : null
      : t('m5s5.dashboard.storyLifelineHint');

  return (
    <div
      ref={containerRef}
      className={`shared-story-lifeline${current ? ' is-active' : ''}${scrubbing ? ' is-scrubbing' : ''}`}
    >
      <div className="shared-story-lifeline-stage">
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
          onPointerUp={onPointerUp}
          onPointerCancel={endScrub}
          onKeyDown={onKeyDown}
        >
          {columns.map((column, index) => (
            <span
              key={column.key}
              className={`shared-story-lifeline-column${index === active ? ' is-current' : ''}`}
              style={{ '--lifeline-x': column.position } as CSSProperties}
              data-lifeline-column={index}
              aria-hidden="true"
            >
              {column.dots.map((kind, stack) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional.
                  key={stack}
                  className={`shared-story-lifeline-dot story-kind-${kind}${index === active && stack === selectedDot ? ' is-selected' : ''}`}
                  data-lifeline-dot={stack}
                >
                  <StoryKindGlyph kind={kind} />
                </span>
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
        {current && selectedItem ? (
          <div
            ref={previewRef}
            id={previewId}
            key={current.key}
            className="shared-story-lifeline-preview"
            style={{ '--lifeline-x': current.position } as CSSProperties}
          >
            <LifelinePreview
              item={selectedItem}
              position={selected}
              count={entries?.length ?? null}
              travel={travel}
              // The full variant announces loading with its list.
              loading={variant === 'compact' && entriesQuery.isPending}
              spaceId={spaceId}
              loadMemoryImage={loadMemoryImage}
              onStep={step}
              onChoose={chooseEntry}
            />
          </div>
        ) : null}
        {current ? (
          <span
            className="shared-story-lifeline-preview-tail"
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
      {hint ? <p className="shared-story-lifeline-hint">{hint}</p> : null}
      {current && variant === 'full' ? (
        <LifelineFan
          column={current}
          period={periodLabel(current, model.unit, t, locale)}
          entries={entries}
          selected={selected}
          highlight={current.highlight}
          loading={entriesQuery.isPending}
          spaceId={spaceId}
          loadMemoryImage={loadMemoryImage}
        />
      ) : null}
    </div>
  );
}

function EntryThumb({
  item,
  spaceId,
  loadMemoryImage,
  className,
}: {
  item: DashboardItem;
  spaceId: string;
  loadMemoryImage?: LoadMemoryImage;
  className: string;
}) {
  const kind = lifelineKindOf(item.type);
  const tile = (
    <span className={`shared-story-lifeline-tile story-kind-${kind}`}>
      <StoryKindGlyph kind={kind} />
    </span>
  );
  return (
    <span className={className} aria-hidden="true">
      {item.previewAttachmentId && loadMemoryImage ? (
        <MemoryPreview
          memoryId={item.id}
          attachmentId={item.previewAttachmentId}
          isSensitive={item.previewIsSensitive}
          hasThumbnail={item.previewHasThumbnail}
          loadImage={loadMemoryImage}
          resourceScopeKey={`story-lifeline:${spaceId}:${item.id}`}
          fallback={tile}
        />
      ) : (
        tile
      )}
    </span>
  );
}

function itemDate(item: DashboardItem): string | null {
  const date = item.occurredOn ?? item.createdAt;
  return date ? formatCalendarDate(date) : null;
}

/**
 * The selected entry, floating above its column inside the graphic. The whole
 * card opens the entry; a sideways swipe on it, its pagination dots or the
 * Left/Right keys move through the period.
 */
function LifelinePreview({
  item,
  position,
  count,
  travel,
  loading,
  spaceId,
  loadMemoryImage,
  onStep,
  onChoose,
}: {
  item: DashboardItem;
  position: number | null;
  count: number | null;
  travel: { direction: -1 | 0 | 1; at: number };
  loading: boolean;
  spaceId: string;
  loadMemoryImage?: LoadMemoryImage;
  onStep: (delta: number) => void;
  onChoose: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { title } = dashboardItemTitle(item, t);
  const kind = lifelineKindOf(item.type);
  const path = dashboardItemPath(item.type, item.id);
  const date = itemDate(item);
  const mainRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  // A click that ends a swipe must not open the entry.
  const swipedRef = useRef(false);
  const refocusRef = useRef(false);

  // Keyboard stepping replaces the focused card; keep focus on the new one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per entry.
  useEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    mainRef.current
      ?.querySelector<HTMLElement>('.shared-story-lifeline-preview-main')
      ?.focus();
  }, [item.id, travel.at]);

  const follow = (dx: number) => {
    const main = mainRef.current;
    if (!main) return;
    main.style.transform = dx ? `translateX(${dx}px)` : '';
    main.style.opacity = dx
      ? String(1 - Math.min(SWIPE_FADE_MAX, Math.abs(dx) / SWIPE_FADE_DISTANCE))
      : '';
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A swipe that ended without a click must not swallow the next tap.
    swipedRef.current = false;
    swipeRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (
      !swipe.moved &&
      Math.abs(dx) > DRAG_THRESHOLD &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      swipe.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      mainRef.current?.classList.add('is-dragging');
    }
    if (swipe.moved) follow(dx);
  };
  const endSwipe = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (!swipe?.moved) return;
    mainRef.current?.classList.remove('is-dragging');
    follow(0);
    swipedRef.current = true;
    const dx = event.clientX - swipe.x;
    // A left swipe brings the next entry, a right swipe the previous one.
    if (commit && Math.abs(dx) > SWIPE_COMMIT) onStep(dx < 0 ? 1 : -1);
  };
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!swipedRef.current) return;
    swipedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    refocusRef.current = (event.target as HTMLElement).classList.contains(
      'shared-story-lifeline-preview-main',
    );
    onStep(event.key === 'ArrowRight' ? 1 : -1);
  };

  const motion =
    travel.direction > 0
      ? ' is-from-right'
      : travel.direction < 0
        ? ' is-from-left'
        : '';
  const content = (
    <>
      <EntryThumb
        item={item}
        spaceId={spaceId}
        loadMemoryImage={loadMemoryImage}
        className="shared-story-lifeline-preview-media"
      />
      <span className="shared-story-lifeline-preview-text">
        <strong>{title}</strong>
        <span className="shared-story-lifeline-preview-meta">
          <StoryKindGlyph kind={kind} />
          {[t(KIND_LABEL[kind]), date].filter(Boolean).join(' · ')}
        </span>
      </span>
    </>
  );
  const dots: number[] = [];
  if (position !== null && count !== null && count > 1) {
    const shown = Math.min(PAGER_DOTS, count);
    const start = Math.min(
      Math.max(0, position - Math.floor(PAGER_DOTS / 2)),
      count - shown,
    );
    for (let index = start; index < start + shown; index += 1) dots.push(index);
  }
  return (
    // The card only adds a swipe to the link and buttons inside it.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above.
    <div
      className="shared-story-lifeline-preview-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endSwipe(event, true)}
      onPointerCancel={(event) => endSwipe(event, false)}
      onClickCapture={onClickCapture}
      onKeyDown={onKeyDown}
    >
      <div ref={mainRef} className="shared-story-lifeline-preview-swipe">
        {path ? (
          <TodayDestinationLink
            key={`${item.id}:${travel.at}`}
            to={path}
            className={`shared-story-lifeline-preview-main${motion}`}
          >
            {content}
          </TodayDestinationLink>
        ) : (
          <span
            key={`${item.id}:${travel.at}`}
            className={`shared-story-lifeline-preview-main${motion}`}
          >
            {content}
          </span>
        )}
      </div>
      {dots.length > 0 && position !== null && count !== null ? (
        <fieldset className="shared-story-lifeline-pager">
          <legend className="sr-only">
            {t('m5s5.dashboard.storyLifelinePosition', {
              position: position + 1,
              total: count,
            })}
          </legend>
          {dots.map((index) => (
            <button
              key={index}
              type="button"
              className="shared-story-lifeline-pager-dot"
              aria-label={t('m5s5.dashboard.storyLifelineEntryLabel', {
                position: index + 1,
                total: count,
              })}
              aria-current={index === position ? 'true' : undefined}
              onClick={() => onChoose(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </fieldset>
      ) : null}
      {loading ? (
        <span className="sr-only" role="status">
          {t('m5s5.dashboard.storyLifelineLoading')}
        </span>
      ) : null}
    </div>
  );
}

/** Full (Eure Geschichte): the period's entries in date order. */
function LifelineFan({
  column,
  period,
  entries,
  selected,
  highlight,
  loading,
  spaceId,
  loadMemoryImage,
}: {
  column: LifelineColumn;
  period: string;
  entries: readonly DashboardItem[] | null;
  selected: number | null;
  highlight: DashboardItem;
  loading: boolean;
  spaceId: string;
  loadMemoryImage?: LoadMemoryImage;
}) {
  const { t } = useTranslation();
  let rows: { item: DashboardItem; index: number }[] = [
    { item: highlight, index: 0 },
  ];
  if (entries) {
    const shown = Math.min(FAN_ROWS, entries.length);
    const start = Math.min(
      Math.max(0, (selected ?? 0) - 2),
      entries.length - shown,
    );
    rows = entries
      .slice(start, start + shown)
      .map((item, offset) => ({ item, index: start + offset }));
  }
  const year = column.start.getUTCFullYear();
  return (
    <div
      className="shared-story-lifeline-fan"
      key={column.key}
      style={{ '--lifeline-x': column.position } as CSSProperties}
    >
      <p className="shared-story-lifeline-fan-head">
        <strong>{period}</strong>
        <span>
          {entries && selected !== null
            ? t('m5s5.dashboard.storyLifelinePosition', {
                position: selected + 1,
                total: entries.length,
              })
            : t('m5s5.dashboard.storyLifelineEntries', {
                count: column.total,
              })}
        </span>
      </p>
      <ol className="shared-story-lifeline-rows">
        {rows.map(({ item, index }, order) => (
          <LifelineRow
            key={item.id}
            item={item}
            order={order}
            selected={entries ? index === selected : true}
            spaceId={spaceId}
            loadMemoryImage={loadMemoryImage}
          />
        ))}
      </ol>
      {loading ? (
        <p className="shared-story-lifeline-loading" role="status">
          {t('m5s5.dashboard.storyLifelineLoading')}
        </p>
      ) : null}
      {column.total > FAN_ROWS ? (
        <Link
          className="shared-story-lifeline-all"
          to={`${appRoutePath('story')}?tab=timeline&year=${year}&order=ASC`}
        >
          {t('m5s5.dashboard.storyLifelineAll', {
            count: column.total,
            period,
          })}
        </Link>
      ) : null}
    </div>
  );
}

function LifelineRow({
  item,
  order,
  selected,
  spaceId,
  loadMemoryImage,
}: {
  item: DashboardItem;
  order: number;
  selected: boolean;
  spaceId: string;
  loadMemoryImage?: LoadMemoryImage;
}) {
  const { t } = useTranslation();
  const kind = lifelineKindOf(item.type);
  const { title } = dashboardItemTitle(item, t);
  const path = dashboardItemPath(item.type, item.id);
  const date = itemDate(item);
  const content = (
    <>
      <EntryThumb
        item={item}
        spaceId={spaceId}
        loadMemoryImage={loadMemoryImage}
        className="shared-story-lifeline-row-media"
      />
      <span className="shared-story-lifeline-row-text">
        <strong>{title}</strong>
        <span>{t(KIND_LABEL[kind])}</span>
      </span>
      {date ? (
        <span className="shared-story-lifeline-row-date">{date}</span>
      ) : null}
      <EimirIcon
        name="chevron-right"
        className="shared-story-lifeline-chevron"
      />
    </>
  );
  const className = `shared-story-lifeline-row story-kind-${kind}${selected ? ' is-selected' : ''}`;
  return (
    <li style={{ '--lifeline-row': order } as CSSProperties}>
      {path ? (
        <TodayDestinationLink to={path} className={className}>
          {content}
        </TodayDestinationLink>
      ) : (
        <span className={className}>{content}</span>
      )}
    </li>
  );
}
