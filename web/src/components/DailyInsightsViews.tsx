import type { TFunction } from 'i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  compact,
  daysWithValues,
  deriveBothGood,
  deriveEnergyVersusPrevious,
  deriveHighlights,
  derivePartnerEnergyVibe,
  deriveSharedDays,
  deriveVibeEnergy,
  deriveWeekdayEnergy,
  deriveWeekendEnergy,
  type DerivedInsight,
  energyBand,
  energyPosition,
  goodWeekdays,
  type InsightDay,
  type InsightModules,
  type InsightKind,
  type IsoDate,
  mondayOf,
  monthStart,
  monthWeeks,
  relationSummary,
  VIBE_GLYPHS,
  weekDates,
} from '../client/dailyInsightsModel';
import {
  MORE_INSIGHTS_PATTERNS_ROUTE,
  MORE_INSIGHTS_RECAP_ROUTE,
  MORE_INSIGHTS_ROUTE,
} from '../client/routes';
import { useTranslation } from '../i18n';
import {
  daySummary,
  EnergyWeekChart,
  VibeWeekChart,
  type ChartDimension,
} from './DailyInsightsCharts';
import {
  formatDayLong,
  formatDayNumber,
  formatDayShort,
  formatWeekdayLong,
  formatWeekdayShort,
  Handwriting,
  InsightIcon,
  type InsightIconName,
  InsightStatement,
  type InsightPerson,
  PersonLegend,
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
      <circle className="insight-landscape-sun" cx="70" cy="50" r="22" />
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

export function WeekView({ days, people, modules }: ViewProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const withValues = daysWithValues(days);
  const partnerName = partnerNameOf(
    people,
    t('dailyInsights.people.partnerFallback'),
  );

  if (withValues === 0) {
    return <EmptyCard />;
  }

  const statements = compact([
    deriveBothGood(days, modules),
    deriveWeekendEnergy(days, modules),
    deriveVibeEnergy(days, modules),
    deriveSharedDays(days),
  ]).map((insight) => describeInsight(t, insight, partnerName));
  const hero = heroSentence(t, days, modules);

  return (
    <>
      {modules.vibe ? (
        <VibeWeekChart
          days={days}
          people={people}
          selected={selected}
          onSelect={setSelected}
        />
      ) : null}
      {modules.energy ? (
        <EnergyWeekChart
          days={days}
          people={people}
          selected={selected}
          onSelect={setSelected}
        />
      ) : null}
      <p className="insight-note">{t('dailyInsights.gapNote')}</p>
      {withValues < 3 ? (
        <p className="insight-note">{t('dailyInsights.sparse')}</p>
      ) : null}
      {statements.length > 0 ? (
        <ul
          className="insight-statements insight-statements-grid"
          aria-label={t('dailyInsights.week.insightsLabel')}
        >
          {statements.map((statement) => (
            <InsightStatement key={statement.title} {...statement} />
          ))}
        </ul>
      ) : null}
      <section
        className="insight-closing"
        aria-label={t('dailyInsights.nav.recap')}
      >
        <ClosingLandscape />
        <div className="insight-closing-copy">
          <h2>{hero}</h2>
          <p>{t('dailyInsights.week.closingBody')}</p>
          <Link className="insight-cta" to={MORE_INSIGHTS_RECAP_ROUTE}>
            {t('dailyInsights.week.closingCta')}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
        <Handwriting>{t('dailyInsights.week.closingHandwriting')}</Handwriting>
      </section>
    </>
  );
}

/** One data-derived sentence; never a claim the values cannot support. */
export function heroSentence(
  t: TFunction,
  days: readonly InsightDay[],
  modules: InsightModules,
): string {
  const both = deriveBothGood(days, modules);
  if (both && Number(both.params.count) >= 2) {
    return t('dailyInsights.recap.hero.bothGood', { count: both.params.count });
  }
  const weekend = deriveWeekendEnergy(days, modules);
  if (weekend?.params.direction === 'higher') {
    return t('dailyInsights.recap.hero.weekendEnergy_higher');
  }
  if (both) {
    return t('dailyInsights.recap.hero.bothGood', { count: both.params.count });
  }
  if (deriveSharedDays(days)) return t('dailyInsights.recap.hero.sharedDays');
  if (daysWithValues(days) > 0) return t('dailyInsights.recap.hero.fallback');
  return t('dailyInsights.recap.hero.empty');
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
              <span key={date}>{formatWeekdayShort(date)}</span>
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

export function RecapView({
  days,
  previousDays,
  people,
  modules,
}: ViewProps & { previousDays: readonly InsightDay[] }) {
  const { t } = useTranslation();
  const partnerName = partnerNameOf(
    people,
    t('dailyInsights.people.partnerFallback'),
  );
  if (daysWithValues(days) === 0) return <EmptyCard />;

  const statements = compact([
    deriveEnergyVersusPrevious(days, previousDays, modules),
    deriveBothGood(days, modules),
    deriveVibeEnergy(days, modules),
    deriveWeekendEnergy(days, modules),
    deriveSharedDays(days),
  ])
    .slice(0, 3)
    .map((insight) => describeInsight(t, insight, partnerName));
  const highlights = deriveHighlights(days, modules);
  const own = people.find((person) => person.key === 'own');
  const partner = people.find((person) => person.key === 'partner');

  return (
    <>
      <section className="insight-hero" aria-labelledby="insight-hero-title">
        <ClosingLandscape />
        <p className="insight-eyebrow">{t('dailyInsights.recap.heroLabel')}</p>
        <h2 id="insight-hero-title">{heroSentence(t, days, modules)}</h2>
        <Handwriting>{t('dailyInsights.recap.heroHandwriting')}</Handwriting>
      </section>

      <section className="insight-card" aria-labelledby="insight-noticed-title">
        <header className="insight-card-header">
          <div className="insight-card-heading">
            <h2 id="insight-noticed-title">
              {t('dailyInsights.recap.noticedTitle')}
            </h2>
            <p>{t('dailyInsights.recap.noticedSubtitle')}</p>
          </div>
          <Handwriting>
            {t('dailyInsights.recap.noticedHandwriting')}
          </Handwriting>
        </header>
        {statements.length > 0 ? (
          <ul className="insight-statements">
            {statements.map((statement) => (
              <InsightStatement key={statement.title} {...statement} />
            ))}
          </ul>
        ) : (
          <p className="insight-note">
            {t('dailyInsights.recap.noticedEmpty')}
          </p>
        )}
      </section>

      <section
        className="insight-card"
        aria-labelledby="insight-highlights-title"
      >
        <header className="insight-card-header">
          <div className="insight-card-heading">
            <h2 id="insight-highlights-title">
              {t('dailyInsights.recap.highlightsTitle')}
            </h2>
            <p>{t('dailyInsights.recap.highlightsSubtitle')}</p>
          </div>
          <Link className="insight-link" to={MORE_INSIGHTS_ROUTE}>
            {t('dailyInsights.recap.highlightsAll')}
            <span aria-hidden="true"> →</span>
          </Link>
        </header>
        {highlights.length > 0 ? (
          <ul className="insight-highlights">
            {highlights.map((highlight) => (
              <li key={highlight.date} className="insight-highlight">
                <time dateTime={highlight.date}>
                  {formatDayShort(highlight.date)}
                </time>
                <span className="insight-highlight-moods">
                  {[own, partner].map((person) => {
                    if (!person) return null;
                    const value = highlight[person.key];
                    return (
                      <span
                        key={person.key}
                        className={`insight-mood insight-series-${person.key}`}
                        role="img"
                        aria-label={`${person.name}: ${
                          highlight.kind === 'bothGood'
                            ? t(`dailyVibe.values.${value.vibe}`)
                            : t('dailyInsights.percentage', {
                                value: value.energy,
                              })
                        }`}
                      >
                        {highlight.kind === 'bothGood' && value.vibe
                          ? VIBE_GLYPHS[value.vibe]
                          : t('dailyInsights.percentage', {
                              value: value.energy,
                            })}
                      </span>
                    );
                  })}
                  <InsightIcon
                    name="heart"
                    className="insight-highlight-heart"
                  />
                </span>
                <strong>
                  {highlight.kind === 'bothGood'
                    ? t('dailyInsights.recap.highlightBothGood')
                    : t('dailyInsights.recap.highlightBothEnergy')}
                </strong>
                <span>
                  {highlight.kind === 'bothGood'
                    ? t('dailyInsights.recap.highlightBothGoodBody')
                    : t('dailyInsights.recap.highlightBothEnergyBody')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="insight-note">
            {t('dailyInsights.recap.highlightsEmpty')}
          </p>
        )}
      </section>

      <section className="insight-closing insight-closing-discover">
        <ClosingLandscape />
        <div className="insight-closing-copy">
          <InsightIcon name="bars" className="insight-title-icon" />
          <h2>{t('dailyInsights.recap.discoverBody')}</h2>
          <p>{t('dailyInsights.recap.discoverSubline')}</p>
          <Link className="insight-cta" to={MORE_INSIGHTS_PATTERNS_ROUTE}>
            {t('dailyInsights.recap.discoverCta')}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </section>
    </>
  );
}
