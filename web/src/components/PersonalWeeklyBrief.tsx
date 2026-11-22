import { useId } from 'react';
import type { PersonalWeekdayPatternView } from '../api/generated/models/PersonalWeekdayPatternView';
import type { PersonalWeeklyBriefView } from '../api/generated/models/PersonalWeeklyBriefView';
import type { InsightDay, InsightModules } from '../client/dailyInsightsModel';
import { useTranslation } from '../i18n';
import type { ChartDimension } from './DailyInsightsCharts';
import type { InsightPerson } from './DailyInsightsParts';
import { EimirIcon } from './EimirIcon';
import { DayStrip } from './WeeklyBrief';
import './WeeklyBrief.css';

function EnergyBar({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="personal-bar-row">
      <span>{label}</span>
      <span className="personal-bar-track" aria-hidden="true">
        <span
          className="personal-bar-fill"
          data-muted={muted || undefined}
          style={{ inlineSize: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
      <strong>{t('dailyInsights.percentage', { value })}</strong>
    </div>
  );
}

/**
 * The private ("just me") brief (#2197): only the caller's own values, so it
 * can speak directly and never mentions the partner. Pro, like Einblicke.
 */
export function PersonalWeeklyBrief({
  brief,
  days,
  people,
  modules,
}: {
  brief: PersonalWeeklyBriefView;
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  modules: InsightModules;
}) {
  const { t } = useTranslation();
  const goodId = useId();
  const rhythmId = useId();
  const own = people.filter((person) => person.key === 'own');
  const dimensions: ChartDimension[] = [
    ...(modules.vibe ? (['vibe'] as const) : []),
    ...(modules.energy ? (['energy'] as const) : []),
  ];
  const weekday = (pattern: PersonalWeekdayPatternView) =>
    t(`dailyInsights.weekdayAdverb.${pattern.weekday}`);
  const base = `dailyInsights.brief.personal.headline.${brief.headline}`;
  const lower = brief.lowerWeekday;
  const higher = brief.higherWeekday;
  const energy = brief.sharedEnergy;

  return (
    <div className="weekly-brief personal-brief">
      <span className="personal-private-label">
        <EimirIcon name="lock" />
        {t('dailyInsights.brief.personal.privateLabel')}
      </span>

      <header className="brief-headline">
        <h2>
          {t(`${base}.title`, {
            count: brief.goodDays.length,
            weekdays: lower
              ? t(`dailyInsights.weekdayPlural.${lower.weekday}`)
              : '',
          })}
        </h2>
        <p>
          {t(`${base}.body`, {
            count: brief.ownDays.length,
            total: brief.elapsedDays,
          })}
        </p>
      </header>

      {energy ? (
        <section className="brief-section" aria-labelledby={goodId}>
          <h3 id={goodId} className="brief-eyebrow">
            {t('dailyInsights.brief.personal.goodTitle')}
          </h3>
          <p className="brief-statement">
            {t(
              energy.group > energy.others
                ? 'dailyInsights.brief.personal.sharedHigher'
                : 'dailyInsights.brief.personal.sharedLower',
            )}
          </p>
          <div
            className="personal-bars"
            role="img"
            aria-label={t('dailyInsights.brief.personal.barsLabel', {
              group: energy.group,
              others: energy.others,
            })}
          >
            <EnergyBar
              label={t('dailyInsights.brief.personal.withShared')}
              value={energy.group}
            />
            <EnergyBar
              label={t('dailyInsights.brief.personal.otherDays')}
              value={energy.others}
              muted
            />
          </div>
          <p className="personal-basis">
            {t('dailyInsights.brief.personal.basis', {
              count: energy.sampleDays,
            })}
          </p>
        </section>
      ) : null}

      {lower || higher ? (
        <section className="brief-section" aria-labelledby={rhythmId}>
          <h3 id={rhythmId} className="brief-eyebrow">
            {t('dailyInsights.brief.personal.rhythmTitle')}
          </h3>
          <ul className="brief-observations">
            {lower ? (
              <li>
                {t('dailyInsights.brief.personal.lowerWeekday', {
                  weekday: weekday(lower),
                  energy: lower.energy,
                  others: lower.others,
                })}
              </li>
            ) : null}
            {higher ? (
              <li>
                {t('dailyInsights.brief.personal.higherWeekday', {
                  weekday: weekday(higher),
                  energy: higher.energy,
                  others: higher.others,
                })}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="brief-section">
        <h3 className="brief-eyebrow">
          {t('dailyInsights.brief.personal.weekTitle')}
        </h3>
        <DayStrip
          days={days}
          goodDays={brief.goodDays}
          sharedDays={brief.sharedDays}
          goodLabel={t('dailyInsights.brief.personal.dayGood')}
          hint={t('dailyInsights.brief.personal.stripHint')}
          people={own}
          dimensions={dimensions}
        />
      </section>
    </div>
  );
}
