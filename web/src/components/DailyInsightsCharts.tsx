import { type CSSProperties, useId } from 'react';
import type { TFunction } from 'i18next';
import type { DailyVibe } from '../api/generated/models/DailyVibe';
import {
  ENERGY_BANDS,
  energyBand,
  energyPosition,
  energySegments,
  type InsightDay,
  type IsoDate,
  type PersonKey,
  VIBE_GLYPHS,
  VIBE_LANES,
} from '../client/dailyInsightsModel';
import { useTranslation } from '../i18n';
import {
  formatDayLong,
  WeekdayLabel,
  InsightIcon,
  PersonLegend,
  type InsightPerson,
} from './DailyInsightsParts';

/** Centre of each Energy band on the 10–100 scale (bands are 20 wide). */
const BAND_CENTRES: Record<(typeof ENERGY_BANDS)[number], number> = {
  veryHigh: 95,
  high: 75,
  mid: 55,
  low: 35,
  veryLow: 15,
};

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

function WeekAxis({ days }: { days: readonly InsightDay[] }) {
  return (
    <div className="insight-chart-xaxis" aria-hidden="true">
      {days.map((day) => (
        <WeekdayLabel key={day.date} date={day.date} />
      ))}
    </div>
  );
}

function DayColumns({
  days,
  selected,
  onSelect,
  people,
  dimensions,
}: {
  days: readonly InsightDay[];
  selected: IsoDate | null;
  onSelect: (date: IsoDate | null) => void;
  people: readonly InsightPerson[];
  dimensions: readonly ChartDimension[];
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="insight-chart-columns">
      <legend className="sr-only">{t('dailyInsights.chart.dayGroup')}</legend>
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          className="insight-chart-column"
          aria-pressed={selected === day.date}
          aria-label={t('dailyInsights.chart.dayLabel', {
            date: formatDayLong(day.date),
            summary: daySummary(t, day, people, dimensions),
          })}
          onClick={() => onSelect(selected === day.date ? null : day.date)}
        />
      ))}
    </fieldset>
  );
}

function SelectedDay({
  days,
  selected,
  people,
  dimensions,
}: {
  days: readonly InsightDay[];
  selected: IsoDate | null;
  people: readonly InsightPerson[];
  dimensions: readonly ChartDimension[];
}) {
  const { t } = useTranslation();
  const day = days.find((candidate) => candidate.date === selected);
  return (
    <p className="insight-chart-detail" aria-live="polite">
      {day
        ? t('dailyInsights.chart.dayLabel', {
            date: formatDayLong(day.date),
            summary: daySummary(t, day, people, dimensions),
          })
        : t('dailyInsights.chart.detailHint')}
    </p>
  );
}

function ChartHeader({
  id,
  title,
  subtitle,
  icon,
  people,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon: 'heart' | 'bolt';
  people: readonly InsightPerson[];
}) {
  return (
    <header className="insight-card-header">
      <div className="insight-card-heading">
        <h2 id={id}>
          {title}
          <InsightIcon name={icon} className="insight-title-icon" />
        </h2>
        <p>{subtitle}</p>
      </div>
      <PersonLegend people={people} />
    </header>
  );
}

function seriesClass(person: PersonKey): string {
  return `insight-series insight-series-${person}`;
}

/** Vibe is categorical: one lane per named state, marked with glyph + shape. */
export function VibeWeekChart({
  days,
  people,
  selected,
  onSelect,
}: {
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  selected: IsoDate | null;
  onSelect: (date: IsoDate | null) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      className="insight-card insight-chart-card"
      aria-labelledby={titleId}
    >
      <ChartHeader
        id={titleId}
        title={t('dailyInsights.week.vibeTitle')}
        subtitle={t('dailyInsights.week.vibeSubtitle')}
        icon="heart"
        people={people}
      />
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
                    marginLeft: person.key === 'own' ? '-0.4rem' : '0.4rem',
                  }}
                  aria-hidden="true"
                >
                  <span>{VIBE_GLYPHS[vibe]}</span>
                </span>
              );
            }),
          )}
          <DayColumns
            days={days}
            selected={selected}
            onSelect={onSelect}
            people={people}
            dimensions={['vibe']}
          />
        </div>
        <WeekAxis days={days} />
      </figure>
      <SelectedDay
        days={days}
        selected={selected}
        people={people}
        dimensions={['vibe']}
      />
    </section>
  );
}

/** Energy is numeric (10–100): a soft line per person, broken on absent days. */
export function EnergyWeekChart({
  days,
  people,
  selected,
  onSelect,
}: {
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  selected: IsoDate | null;
  onSelect: (date: IsoDate | null) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const x = (index: number) => ((index + 0.5) / days.length) * 100;
  const y = (value: number) => 100 - energyPosition(value) * 100;
  return (
    <section
      className="insight-card insight-chart-card"
      aria-labelledby={titleId}
    >
      <ChartHeader
        id={titleId}
        title={t('dailyInsights.week.energyTitle')}
        subtitle={t('dailyInsights.week.energySubtitle')}
        icon="bolt"
        people={people}
      />
      <figure
        className="insight-chart insight-chart-energy"
        aria-label={t('dailyInsights.chart.energyChartLabel')}
      >
        <ul className="insight-chart-yaxis" aria-hidden="true">
          {ENERGY_BANDS.map((band) => (
            <li
              key={band}
              style={{ '--y': y(BAND_CENTRES[band]) / 100 } as CSSProperties}
            >
              {t(`dailyInsights.bands.${band}`)}
            </li>
          ))}
        </ul>
        <div className="insight-chart-plot">
          <div className="insight-chart-inner" aria-hidden="true">
            {ENERGY_BANDS.map((band) => (
              <span
                key={band}
                className="insight-chart-gridline"
                style={{ top: `${y(BAND_CENTRES[band])}%` }}
              />
            ))}
            <svg
              className="insight-chart-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {people.map((person) =>
                energySegments(days, person.key).map((segment) => {
                  const line = segment
                    .map(
                      (point) =>
                        `${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`,
                    )
                    .join(' L');
                  const first = segment[0];
                  const last = segment[segment.length - 1];
                  return (
                    <g
                      key={`${person.key}-${first.index}`}
                      className={seriesClass(person.key)}
                    >
                      {segment.length > 1 ? (
                        <path
                          className="insight-area"
                          d={`M${x(first.index).toFixed(2)},100 L${line} L${x(last.index).toFixed(2)},100 Z`}
                        />
                      ) : null}
                      {segment.length > 1 ? (
                        <path className="insight-line" d={`M${line}`} />
                      ) : null}
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
          <DayColumns
            days={days}
            selected={selected}
            onSelect={onSelect}
            people={people}
            dimensions={['energy']}
          />
        </div>
        <WeekAxis days={days} />
      </figure>
      <SelectedDay
        days={days}
        selected={selected}
        people={people}
        dimensions={['energy']}
      />
    </section>
  );
}
