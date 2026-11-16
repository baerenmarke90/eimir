import type { TFunction } from 'i18next';
import { type CSSProperties, useId } from 'react';
import type { DailyVibe } from '../api/generated/models/DailyVibe';
import {
  energyBand,
  energySegments,
  type Highlight,
  type InsightDay,
  type IsoDate,
  type PersonKey,
  VIBE_LANES,
} from '../client/dailyInsightsModel';
import { useTranslation } from '../i18n';
import {
  formatDayLong,
  type InsightPerson,
  PersonLegend,
  WeekdayLabel,
} from './DailyInsightsParts';

const ENERGY_TICKS = [100, 50, 0];

export function personVibeText(t: TFunction, vibe: DailyVibe | null): string {
  return vibe === null
    ? t('dailyInsights.noValue')
    : t(`dailyVibe.values.${vibe}`);
}

export function personEnergyText(t: TFunction, energy: number | null): string {
  return energy === null
    ? t('dailyInsights.noValue')
    : `${t('dailyInsights.percentage', { value: energy })} (${t(`dailyInsights.bands.${energyBand(energy)}`)})`;
}

export type ChartDimension = 'vibe' | 'energy';

/** One accessible sentence per day: every value is text, never color alone. */
export function daySummary(
  t: TFunction,
  day: InsightDay,
  people: readonly InsightPerson[],
  dimensions: readonly ChartDimension[],
): string {
  return people
    .map((person) => {
      const value = day[person.key];
      const rendered = dimensions.map((dimension) =>
        dimension === 'vibe'
          ? personVibeText(t, value.vibe)
          : personEnergyText(t, value.energy),
      );
      return `${person.name}: ${rendered.join(', ')}`;
    })
    .join('; ');
}

function WeekDays({
  days,
  selected,
  onSelect,
  people,
  dimensions,
  highlights,
}: {
  days: readonly InsightDay[];
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
  people: readonly InsightPerson[];
  dimensions: readonly ChartDimension[];
  highlights: readonly Highlight[];
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="insight-chart-columns insight-week-days">
      <legend className="sr-only">{t('dailyInsights.chart.dayGroup')}</legend>
      {days.map((day) => {
        const highlight = highlights.find((entry) => entry.date === day.date);
        return (
          <button
            key={day.date}
            type="button"
            className="insight-chart-column"
            aria-pressed={selected === day.date}
            aria-label={t('dailyInsights.chart.dayLabel', {
              date: formatDayLong(day.date),
              summary: daySummary(t, day, people, dimensions),
            })}
            aria-description={
              highlight
                ? t(
                    highlight.kind === 'bothGood'
                      ? 'dailyInsights.recap.highlightBothGood'
                      : 'dailyInsights.recap.highlightBothEnergy',
                  )
                : undefined
            }
            data-highlight={highlight?.kind}
            onClick={() => onSelect(day.date)}
          >
            <WeekdayLabel date={day.date} />
          </button>
        );
      })}
    </fieldset>
  );
}

function SelectedDay({
  day,
  people,
  dimensions,
}: {
  day: InsightDay;
  people: readonly InsightPerson[];
  dimensions: readonly ChartDimension[];
}) {
  const { t } = useTranslation();
  return (
    <div className="insight-card insight-week-detail" aria-live="polite">
      <h2>{formatDayLong(day.date)}</h2>
      <div className="insight-week-detail-people">
        {people.map((person) => (
          <div key={person.key}>
            <strong>{person.name}</strong>
            <dl>
              {dimensions.map((dimension) => (
                <div key={dimension}>
                  <dt>{t(`dailyInsights.patterns.${dimension}Row`)}</dt>
                  <dd>
                    {dimension === 'vibe'
                      ? personVibeText(t, day[person.key].vibe)
                      : personEnergyText(t, day[person.key].energy)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function seriesClass(person: PersonKey): string {
  return `insight-series insight-series-${person}`;
}

interface WeekChartProps {
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  selectedIndex: number;
}

function PlotSelection({
  selectedIndex,
  count,
}: {
  selectedIndex: number;
  count: number;
}) {
  return (
    <span
      className="insight-plot-selection"
      style={{
        insetInlineStart: `${(selectedIndex / count) * 100}%`,
        inlineSize: `${100 / count}%`,
      }}
      aria-hidden="true"
    />
  );
}

/** Vibe is categorical: one lane per named state and one shape per person. */
function VibeWeekChart({ days, people, selectedIndex }: WeekChartProps) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section className="insight-week-plot" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('dailyInsights.patterns.vibeRow')}</h2>
      <figure
        className="insight-chart insight-chart-vibe"
        aria-label={t('dailyInsights.chart.vibeChartLabel')}
      >
        <ul className="insight-chart-yaxis" aria-hidden="true">
          {VIBE_LANES.map((vibe) => (
            <li key={vibe}>{t(`dailyInsights.lanes.${vibe}`)}</li>
          ))}
        </ul>
        <div className="insight-chart-plot">
          <div className="insight-chart-lanes" aria-hidden="true">
            {VIBE_LANES.map((vibe) => (
              <span key={vibe} className="insight-chart-lane" />
            ))}
          </div>
          <PlotSelection selectedIndex={selectedIndex} count={days.length} />
          {days.map((day, index) =>
            people.map((person) => {
              const vibe = day[person.key].vibe;
              if (vibe === null) return null;
              const lane = VIBE_LANES.indexOf(vibe);
              return (
                <span
                  key={`${day.date}-${person.key}`}
                  className={`${seriesClass(person.key)} insight-vibe-dot`}
                  data-vibe={vibe}
                  data-person={person.key}
                  style={{
                    left: `${((index + 0.5) / days.length) * 100}%`,
                    top: `${((lane + 0.5) / VIBE_LANES.length) * 100}%`,
                  }}
                  aria-hidden="true"
                />
              );
            }),
          )}
        </div>
      </figure>
    </section>
  );
}

/** Energy uses a numeric scale with one line per person and visible gaps. */
function EnergyWeekChart({ days, people, selectedIndex }: WeekChartProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const x = (index: number) => ((index + 0.5) / days.length) * 100;
  const y = (value: number) => 100 - value;
  return (
    <section className="insight-week-plot" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('dailyInsights.patterns.energyRow')}</h2>
      <figure
        className="insight-chart insight-chart-energy"
        aria-label={t('dailyInsights.chart.energyChartLabel')}
      >
        <ul className="insight-chart-yaxis" aria-hidden="true">
          {ENERGY_TICKS.map((value) => (
            <li key={value} style={{ '--y': y(value) / 100 } as CSSProperties}>
              {t('dailyInsights.percentage', { value })}
            </li>
          ))}
        </ul>
        <div className="insight-chart-plot">
          <div className="insight-chart-inner" aria-hidden="true">
            {ENERGY_TICKS.map((value) => (
              <span
                key={value}
                className="insight-chart-gridline"
                style={{ top: `${y(value)}%` }}
              />
            ))}
            <PlotSelection selectedIndex={selectedIndex} count={days.length} />
            <svg
              className="insight-chart-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {people.map((person) =>
                energySegments(days, person.key)
                  .filter((segment) => segment.length > 1)
                  .map((segment) => {
                    const line = segment
                      .map(
                        (point) =>
                          `${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`,
                      )
                      .join(' L');
                    const first = segment[0];
                    return (
                      <g
                        key={`${person.key}-${first.index}`}
                        className={seriesClass(person.key)}
                      >
                        <path className="insight-line" d={`M${line}`} />
                      </g>
                    );
                  }),
              )}
            </svg>
            {days.map((day, index) =>
              people.map((person) => {
                const energy = day[person.key].energy;
                if (energy === null) return null;
                return (
                  <span
                    key={`${day.date}-${person.key}`}
                    className={`${seriesClass(person.key)} insight-energy-dot`}
                    data-person={person.key}
                    style={{
                      left: `${x(index)}%`,
                      top: `${y(energy)}%`,
                    }}
                  />
                );
              }),
            )}
          </div>
        </div>
      </figure>
    </section>
  );
}

export function WeekCharts({
  days,
  people,
  dimensions,
  selected,
  onSelect,
  highlights,
}: {
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  dimensions: readonly ChartDimension[];
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
  highlights: readonly Highlight[];
}) {
  const { t } = useTranslation();
  const selectedIndex = days.findIndex((day) => day.date === selected);
  const activeDay = days[selectedIndex];
  return (
    <>
      <section
        className="insight-card insight-week-charts"
        aria-label={t('dailyInsights.week.subtitle')}
      >
        <PersonLegend people={people} compact />
        {dimensions.includes('vibe') ? (
          <VibeWeekChart
            days={days}
            people={people}
            selectedIndex={selectedIndex}
          />
        ) : null}
        {dimensions.includes('energy') ? (
          <EnergyWeekChart
            days={days}
            people={people}
            selectedIndex={selectedIndex}
          />
        ) : null}
        <WeekDays
          days={days}
          people={people}
          dimensions={dimensions}
          selected={selected}
          onSelect={onSelect}
          highlights={highlights}
        />
      </section>
      {activeDay ? (
        <SelectedDay day={activeDay} people={people} dimensions={dimensions} />
      ) : null}
    </>
  );
}
