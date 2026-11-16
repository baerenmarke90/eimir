import type { TFunction } from 'i18next';
import { type ReactNode, useState } from 'react';
import {
  compact,
  type DerivedInsight,
  daysWithValues,
  deriveEnergyVersusPrevious,
  deriveHighlights,
  derivePartnerEnergyVibe,
  deriveSharedDays,
  deriveVibeEnergy,
  deriveWeekdayEnergy,
  deriveWeekendEnergy,
  energyBand,
  energyPosition,
  goodWeekdays,
  type InsightDay,
  type InsightKind,
  type InsightModules,
  type IsoDate,
  mondayOf,
  monthStart,
  monthWeeks,
  relationSummary,
  VIBE_GLYPHS,
  weekDates,
} from '../client/dailyInsightsModel';
import { useTranslation } from '../i18n';
import {
  type ChartDimension,
  daySummary,
  WeekCharts,
} from './DailyInsightsCharts';
import {
  formatDayLong,
  formatDayNumber,
  formatDayShort,
  formatWeekdayLong,
  Handwriting,
  InsightIcon,
  type InsightIconName,
  type InsightPerson,
  InsightStatement,
  PersonLegend,
  WeekdayLabel,
} from './DailyInsightsParts';

export interface ViewProps {
  /** Days that are part of the displayed period (already windowed). */
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  modules: InsightModules;
}

interface StatementCopy {
  icon: InsightIconName;
  title: string;
  body: string;
}

const STATEMENT_ICONS: Record<InsightKind, InsightIconName> = {
  bothGood: 'calendar',
  weekendEnergy: 'bars',
  vibeEnergy: 'hearts',
  sharedDays: 'sprout',
  energyVersusPrevious: 'sun',
  weekdayEnergy: 'moon',
  partnerEnergyVibe: 'trend',
};

/** Localized statement for a derived insight; wording is descriptive only. */
export function describeInsight(
  t: TFunction,
  insight: DerivedInsight,
  partnerName: string,
): StatementCopy {
  const { kind, params } = insight;
  const base = `dailyInsights.insight.${kind}`;
  const icon = STATEMENT_ICONS[kind];
  switch (kind) {
    case 'bothGood': {
      const values = {
        count: params.count,
        weekday: formatWeekdayLong(String(params.date)),
      };
      return {
        icon,
        title: t(`${base}.title`, values),
        body: t(`${base}.body`, values),
      };
    }
    case 'weekdayEnergy':
      return {
        icon,
        title: t(`${base}_${params.direction}.title`, {
          weekday: t(`dailyInsights.weekdayAdverb.${params.weekday}`),
        }),
        body: t(`${base}_${params.direction}.body`),
      };
    case 'weekendEnergy':
    case 'energyVersusPrevious':
      return {
        icon,
        title: t(`${base}_${params.direction}.title`),
        body: t(`${base}_${params.direction}.body`),
      };
    case 'partnerEnergyVibe':
      return {
        icon,
        title: t(`${base}_${params.energyOf}.title`, { name: partnerName }),
        body: t(`${base}_${params.energyOf}.body`),
      };
    default:
      return {
        icon,
        title: t(`${base}.title`, params),
        body: t(`${base}.body`, params),
      };
  }
}

function partnerNameOf(people: readonly InsightPerson[], fallback: string) {
  return people.find((person) => person.key === 'partner')?.name ?? fallback;
}

function ClosingLandscape() {
  return (
    <svg
      className="insight-landscape"
      viewBox="0 0 320 120"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="insight-landscape-sun" cx="262" cy="42" r="18" />
      <path
        className="insight-landscape-far"
        d="M0 84c40-26 78-30 120-10 38 18 74 4 104-14 34-20 66-14 96 2v58H0Z"
      />
      <path
        className="insight-landscape-near"
        d="M0 104c50-18 96-16 140-2 44 14 96 12 180-8v26H0Z"
      />
    </svg>
  );
}

/* Week — Pro Screen A ---------------------------------------------------- */

export function WeekView({
  days,
  previousDays,
  people,
  modules,
  weeklyReview,
}: ViewProps & {
  previousDays: readonly InsightDay[];
  weeklyReview?: ReactNode;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const withValues = daysWithValues(days);
  const latestDay = days.filter((day) => daysWithValues([day]) > 0).at(-1);
  const partnerName = partnerNameOf(
    people,
    t('dailyInsights.people.partnerFallback'),
  );

  if (!latestDay) {
    return (
      <>
        <EmptyCard />
        {weeklyReview}
      </>
    );
  }

  const dimensions: ChartDimension[] = [
    ...(modules.vibe ? (['vibe'] as const) : []),
    ...(modules.energy ? (['energy'] as const) : []),
  ];
  const highlights = deriveHighlights(days, modules);
  const highlightGroups = (['bothGood', 'bothEnergy'] as const).map((kind) => ({
    kind,
    dates: highlights
      .filter((item) => item.kind === kind)
      .map((item) => item.date),
  }));
  const statements = compact([
    deriveEnergyVersusPrevious(days, previousDays, modules),
    deriveWeekendEnergy(days, modules),
    deriveVibeEnergy(days, modules),
    deriveSharedDays(days),
  ]).map((insight) => describeInsight(t, insight, partnerName));

  return (
    <>
      <WeekCharts
        days={days}
        people={people}
        dimensions={dimensions}
        selected={selected ?? latestDay.date}
        onSelect={setSelected}
        highlights={highlights}
      />
      <section
        className="insight-card insight-week-recap"
        id="wochenrueckblick"
        aria-labelledby="insight-week-recap-title"
        tabIndex={-1}
      >
        <h2 id="insight-week-recap-title">{t('dailyInsights.week.summary')}</h2>
        {highlights.length > 0 ? (
          <ul className="insight-week-highlights">
            {highlightGroups.map(({ kind, dates }) =>
              dates.length > 0 ? (
                <li key={kind} data-highlight={kind}>
                  <span>
                    <InsightIcon name={kind === 'bothGood' ? 'sun' : 'bolt'} />
                    {t(
                      kind === 'bothGood'
                        ? 'dailyInsights.recap.highlightBothGood'
                        : 'dailyInsights.recap.highlightBothEnergy',
                    )}
                  </span>
                  <span>
                    {dates.map((date) => (
                      <button
                        type="button"
                        key={date}
                        aria-label={formatDayLong(date)}
                        onClick={() => setSelected(date)}
                      >
                        {formatDayShort(date)}
                      </button>
                    ))}
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p>{t('dailyInsights.week.noHighlights')}</p>
        )}
        {statements.length > 0 ? (
          <details className="insight-week-observations">
            <summary>{t('dailyInsights.recap.noticedTitle')}</summary>
            <ul className="insight-statements">
              {statements.map((statement) => (
                <InsightStatement key={statement.title} {...statement} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>
      <p className="insight-note">{t('dailyInsights.gapNote')}</p>
      {withValues < 3 ? (
        <p className="insight-note">{t('dailyInsights.sparse')}</p>
      ) : null}
      {weeklyReview}
    </>
  );
}

function EmptyCard() {
  const { t } = useTranslation();
  return (
    <section className="insight-card insight-empty">
      <InsightIcon name="sparkle" className="insight-title-icon" />
      <h2>{t('dailyInsights.empty.title')}</h2>
      <p>{t('dailyInsights.empty.body')}</p>
    </section>
  );
}

/* Patterns — Pro Screen B ------------------------------------------------ */

function DayCell({
  day,
  modules,
  people,
  selected,
  onSelect,
}: {
  day: InsightDay | null;
  modules: InsightModules;
  people: readonly InsightPerson[];
  selected: IsoDate | null;
  onSelect: (date: IsoDate | null) => void;
}) {
  const { t } = useTranslation();
  if (day === null)
    return <span className="insight-cell insight-cell-outside" />;
  const dimensions: ChartDimension[] = [
    ...(modules.vibe ? (['vibe'] as const) : []),
    ...(modules.energy ? (['energy'] as const) : []),
  ];
  return (
    <button
      type="button"
      className="insight-cell"
      aria-pressed={selected === day.date}
      aria-label={t('dailyInsights.patterns.matrixDayLabel', {
        date: formatDayLong(day.date),
        summary: daySummary(t, day, people, dimensions),
      })}
      onClick={() => onSelect(selected === day.date ? null : day.date)}
    >
      <span className="insight-cell-number" aria-hidden="true">
        {formatDayNumber(day.date)}
      </span>
      <span className="insight-cell-marks" aria-hidden="true">
        {modules.vibe
          ? people.map((person) => {
              const vibe = day[person.key].vibe;
              return vibe === null ? (
                <span
                  key={`v-${person.key}`}
                  className="insight-mark insight-mark-empty"
                />
              ) : (
                <span
                  key={`v-${person.key}`}
                  className={`insight-mark insight-mark-vibe insight-series-${person.key}`}
                  data-vibe={vibe}
                >
                  {VIBE_GLYPHS[vibe]}
                </span>
              );
            })
          : null}
        {modules.energy
          ? people.map((person) => {
              const energy = day[person.key].energy;
              return energy === null ? (
                <span
                  key={`e-${person.key}`}
                  className="insight-mark insight-mark-empty"
                />
              ) : (
                <span
                  key={`e-${person.key}`}
                  className={`insight-mark insight-mark-energy insight-series-${person.key}`}
                  data-band={energyBand(energy)}
                >
                  <span
                    className="insight-mark-fill"
                    style={{
                      height: `${Math.round(energyPosition(energy) * 100)}%`,
                    }}
                  />
                </span>
              );
            })
          : null}
      </span>
    </button>
  );
}

export function PatternsView({
  days,
  people,
  modules,
  monthDate,
}: ViewProps & { monthDate: IsoDate }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const partnerName = partnerNameOf(
    people,
    t('dailyInsights.people.partnerFallback'),
  );
  const byDate = new Map(days.map((day) => [day.date, day]));
  const weeks = monthWeeks(monthDate);
  const withValues = daysWithValues(days);

  if (withValues === 0) return <EmptyCard />;

  const dimensions: ChartDimension[] = [
    ...(modules.vibe ? (['vibe'] as const) : []),
    ...(modules.energy ? (['energy'] as const) : []),
  ];
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const statements = compact([
    deriveWeekdayEnergy(days, modules),
    derivePartnerEnergyVibe(days, modules),
    deriveVibeEnergy(days, modules),
  ]).map((insight) => describeInsight(t, insight, partnerName));
  const relation = relationSummary(days);
  const populatedLanes = relation.lanes.filter(
    (lane) => lane.energies.length > 0,
  );
  const relationReady =
    modules.vibe &&
    modules.energy &&
    relation.samples >= 6 &&
    populatedLanes.length >= 2;
  const good = goodWeekdays(days, modules);
  const goodLabels = good.map((weekday) =>
    t(`dailyInsights.weekdayPlural.${weekday}`),
  );

  return (
    <>
      <section className="insight-card" aria-labelledby="insight-glance-title">
        <header className="insight-card-header">
          <div className="insight-card-heading">
            <h2 id="insight-glance-title">
              {t('dailyInsights.patterns.glanceTitle')}
            </h2>
            <p>{t('dailyInsights.patterns.glanceSubtitle')}</p>
          </div>
          <PersonLegend people={people} />
        </header>
        <fieldset className="insight-matrix" data-people={people.length}>
          <legend className="sr-only">
            {t('dailyInsights.patterns.matrixLabel')}
          </legend>
          <div className="insight-matrix-head" aria-hidden="true">
            {weekDates(mondayOf(monthStart(monthDate))).map((date) => (
              <WeekdayLabel key={date} date={date} />
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div
              className="insight-matrix-week"
              key={week.find(Boolean) ?? weekIndex}
            >
              <span className="insight-matrix-week-label">
                {t('dailyInsights.patterns.weekLabel', {
                  number: weekIndex + 1,
                })}
              </span>
              <div className="insight-matrix-days">
                {week.map((date, index) => (
                  <DayCell
                    key={date ?? `outside-${weekIndex}-${index}`}
                    day={
                      date === null
                        ? null
                        : (byDate.get(date) ?? emptyDay(date))
                    }
                    modules={modules}
                    people={people}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        <ul
          className="insight-legend-scale"
          aria-label={t('dailyInsights.patterns.legendVibe')}
        >
          {modules.vibe
            ? Object.keys(VIBE_GLYPHS).map((vibe) => (
                <li key={vibe}>
                  <span
                    className="insight-mark insight-mark-vibe"
                    data-vibe={vibe}
                    aria-hidden="true"
                  >
                    {VIBE_GLYPHS[vibe as keyof typeof VIBE_GLYPHS]}
                  </span>
                  {t(`dailyVibe.values.${vibe}`)}
                </li>
              ))
            : null}
        </ul>
        <p className="insight-chart-detail" aria-live="polite">
          {selectedDay
            ? t('dailyInsights.patterns.matrixDayLabel', {
                date: formatDayLong(selectedDay.date),
                summary: daySummary(t, selectedDay, people, dimensions),
              })
            : t('dailyInsights.chart.detailHint')}
        </p>
        <p className="insight-note">{t('dailyInsights.gapNote')}</p>
      </section>

      <section
        className="insight-card"
        aria-labelledby="insight-patterns-title"
      >
        <header className="insight-card-header">
          <div className="insight-card-heading">
            <h2 id="insight-patterns-title">
              {t('dailyInsights.patterns.calmTitle')}
            </h2>
            <p>{t('dailyInsights.patterns.calmSubtitle')}</p>
          </div>
          <p className="insight-reassurance">
            <InsightIcon name="sparkle" className="insight-title-icon" />
            {t('dailyInsights.patterns.calmNote')}
          </p>
        </header>
        {statements.length > 0 ? (
          <ol className="insight-statements insight-statements-numbered">
            {statements.map((statement, index) => (
              <InsightStatement
                key={statement.title}
                index={index + 1}
                {...statement}
              />
            ))}
          </ol>
        ) : (
          <p className="insight-note">
            {t('dailyInsights.patterns.patternsEmpty')}
          </p>
        )}
      </section>

      {modules.vibe && modules.energy ? (
        <section
          className="insight-card"
          aria-labelledby="insight-relation-title"
        >
          <header className="insight-card-header">
            <div className="insight-card-heading">
              <h2 id="insight-relation-title">
                {t('dailyInsights.patterns.relationTitle')}
              </h2>
              <p>{t('dailyInsights.patterns.relationSubtitle')}</p>
            </div>
          </header>
          {relationReady ? (
            <div className="insight-relation">
              <ul className="insight-strip-list">
                {populatedLanes.map((lane) => (
                  <li key={lane.vibe} className="insight-strip">
                    <span className="insight-strip-label">
                      <span
                        className="insight-mark insight-mark-vibe"
                        data-vibe={lane.vibe}
                        aria-hidden="true"
                      >
                        {VIBE_GLYPHS[lane.vibe]}
                      </span>
                      {t(`dailyInsights.lanes.${lane.vibe}`)}
                      <span className="insight-strip-count">
                        {t('dailyInsights.patterns.relationLaneCount', {
                          count: lane.energies.length,
                        })}
                      </span>
                    </span>
                    <span className="insight-strip-track">
                      {lane.energies.map((energy, index) => (
                        <span
                          // Order within a lane is meaningless; index is stable per render.
                          // biome-ignore lint/suspicious/noArrayIndexKey: presentation-only dots
                          key={index}
                          className="insight-strip-dot"
                          data-band={energyBand(energy)}
                          style={{ left: `${energyPosition(energy) * 100}%` }}
                        />
                      ))}
                    </span>
                    <span className="sr-only">
                      {lane.energies
                        .map((energy) =>
                          t('dailyInsights.percentage', { value: energy }),
                        )
                        .join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="insight-strip-axis" aria-hidden="true">
                <span>{t('dailyInsights.patterns.relationLow')}</span>
                <span>{t('dailyInsights.patterns.relationAxis')}</span>
                <span>{t('dailyInsights.patterns.relationHigh')}</span>
              </div>
              <p className="insight-note">
                {t('dailyInsights.patterns.relationNote')}
              </p>
            </div>
          ) : (
            <p className="insight-note">
              {t('dailyInsights.patterns.relationEmpty')}
            </p>
          )}
        </section>
      ) : null}

      <section className="insight-closing" aria-labelledby="insight-good-title">
        <ClosingLandscape />
        <div className="insight-closing-copy">
          <h2 id="insight-good-title">
            {t('dailyInsights.patterns.goodTitle')}
          </h2>
          <p>
            {goodLabels.length > 0
              ? t('dailyInsights.patterns.goodBody')
              : t('dailyInsights.patterns.goodEmpty')}
          </p>
          {goodLabels.length > 0 ? (
            <ul className="insight-chips">
              {goodLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <Handwriting>{t('dailyInsights.patterns.goodHandwriting')}</Handwriting>
      </section>
    </>
  );
}

function emptyDay(date: IsoDate): InsightDay {
  return {
    date,
    own: { vibe: null, energy: null },
    partner: { vibe: null, energy: null },
  };
}

/* Recap — Pro Screen C --------------------------------------------------- */
