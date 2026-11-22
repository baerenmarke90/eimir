import type { TFunction } from 'i18next';
import { useCallback, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { WeeklyBriefView } from '../api/generated/models/WeeklyBriefView';
import type { WeeklyObservationView } from '../api/generated/models/WeeklyObservationView';
import {
  type InsightDay,
  type InsightModules,
  type IsoDate,
  toIsoDate,
  weekdayIndex,
} from '../client/dailyInsightsModel';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  MORE_INSIGHTS_WEEK_ROUTE,
  memoryDetailPath,
  planDetailPath,
  WISH_CREATE_ROUTE,
  wishDetailPath,
} from '../client/routes';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton, AddActionLink } from './AddAction';
import { type ChartDimension, daySummary } from './DailyInsightsCharts';
import {
  formatDayLong,
  formatWeekdayLong,
  InsightIcon,
  type InsightPerson,
  PersonLegend,
  WeekdayLabel,
} from './DailyInsightsParts';
import { MemoryPreview } from './MemoryPreview';
import './WeeklyBrief.css';

const iso = (value: Date): IsoDate => toIsoDate(value);

function listOfDays(dates: readonly IsoDate[]): string {
  const names = dates.map(formatWeekdayLong);
  return new Intl.ListFormat(resolvedLocale(), {
    style: 'long',
    type: 'conjunction',
  }).format(names);
}

function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase(resolvedLocale()) + text.slice(1);
}

function observationText(t: TFunction, fact: WeeklyObservationView): string {
  // Same weekday rendering as the weekly review card (2026-01-05 is a Monday).
  const weekday = new Intl.DateTimeFormat(resolvedLocale(), {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 0, 5 + (fact.weekday ?? 0))));
  return t(`weeklyInsights.facts.${fact.kind}`, {
    value: fact.value ?? undefined,
    weekday,
  });
}

function Headline({ brief }: { brief: WeeklyBriefView }) {
  const { t } = useTranslation();
  const goodDays = brief.goodDays.map(iso);
  const days = capitalized(listOfDays(goodDays));
  const base = `dailyInsights.brief.headline.${brief.headline}`;
  return (
    <header className="brief-headline">
      <h2>{t(`${base}.title`, { count: goodDays.length })}</h2>
      <p>{t(`${base}.body`, { days })}</p>
    </header>
  );
}

function DayStrip({
  days,
  brief,
  people,
  dimensions,
}: {
  days: readonly InsightDay[];
  brief: WeeklyBriefView;
  people: readonly InsightPerson[];
  dimensions: readonly ChartDimension[];
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const good = new Set(brief.goodDays.map(iso));
  const shared = new Set(brief.sharedDays.map(iso));
  const selectedDay = days.find((day) => day.date === selected) ?? null;
  return (
    <div className="brief-strip">
      <fieldset className="brief-days" aria-describedby={hintId}>
        <legend className="sr-only">
          {t('dailyInsights.brief.good.stripLabel')}
        </legend>
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            className="brief-day"
            data-good={good.has(day.date) || undefined}
            aria-pressed={day.date === selected}
            aria-label={`${formatDayLong(day.date)}: ${daySummary(t, day, people, dimensions)}`}
            onClick={() =>
              setSelected((current) => (current === day.date ? null : day.date))
            }
          >
            <WeekdayLabel date={day.date} />
            {people.map((person) => {
              const value = day[person.key];
              const present = value.vibe !== null || value.energy !== null;
              return (
                <span
                  key={person.key}
                  className={`insight-marker insight-marker-${person.key} brief-marker`}
                  data-empty={present ? undefined : true}
                  aria-hidden="true"
                />
              );
            })}
            <span className="brief-day-shared" aria-hidden="true">
              {shared.has(day.date) ? <InsightIcon name="calendar" /> : null}
            </span>
          </button>
        ))}
      </fieldset>
      <div className="brief-strip-legend">
        <PersonLegend people={people} compact />
        <span className="brief-legend-shared">
          <InsightIcon name="calendar" />
          {t('dailyInsights.brief.good.legendShared')}
        </span>
      </div>
      <p className="brief-day-detail" id={hintId} aria-live="polite">
        {selectedDay ? (
          <>
            <strong>{formatDayLong(selectedDay.date)}</strong>
            <span>{daySummary(t, selectedDay, people, dimensions)}</span>
            {good.has(selectedDay.date) ? (
              <span>{t('dailyInsights.brief.good.dayGood')}</span>
            ) : null}
            {shared.has(selectedDay.date) ? (
              <span>{t('dailyInsights.brief.good.dayShared')}</span>
            ) : null}
          </>
        ) : (
          t('dailyInsights.brief.good.stripHint')
        )}
      </p>
    </div>
  );
}

function HighlightMoment({
  brief,
  spaceId,
  mediaApis,
}: {
  brief: WeeklyBriefView;
  spaceId: string;
  mediaApis: ReferenceApis | null;
}) {
  const { t } = useTranslation();
  const moment = brief.highlight;
  const loadImage = useCallback(
    (
      memoryId: string,
      attachmentId: string,
      signal?: AbortSignal,
      variant?: 'original' | 'thumbnail',
    ) => {
      if (!mediaApis) return Promise.reject(new Error('Media is unavailable.'));
      return loadAuthorizedStoryImageResource(
        mediaApis,
        spaceId,
        'MEMORY',
        memoryId,
        attachmentId,
        { signal, variant: variant ?? 'thumbnail' },
      );
    },
    [mediaApis, spaceId],
  );
  if (!moment) return null;
  const date = formatDayLong(iso(moment.happenedOn));
  return (
    <Link className="brief-moment" to={memoryDetailPath(moment.memoryId)}>
      {moment.attachmentId && mediaApis ? (
        <span className="brief-moment-photo">
          <MemoryPreview
            memoryId={moment.memoryId}
            attachmentId={moment.attachmentId}
            isSensitive={moment.attachmentIsSensitive ?? false}
            hasThumbnail={moment.attachmentHasThumbnail ?? false}
            loadImage={loadImage}
            loadingMode="immediate"
            resourceScopeKey={`weekly-brief:${spaceId}:${moment.memoryId}`}
          />
        </span>
      ) : null}
      <span className="brief-moment-caption">
        <strong>
          {moment.title.trim() || t('dailyInsights.brief.good.momentUntitled')}
        </strong>
        <span>
          {moment.photoCount > 0
            ? t('dailyInsights.brief.good.momentPhotos', {
                count: moment.photoCount,
                date,
              })
            : t('dailyInsights.brief.good.momentDate', { date })}
        </span>
      </span>
    </Link>
  );
}

function Impulse({
  brief,
  partnerName,
}: {
  brief: WeeklyBriefView;
  partnerName: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const [index, setIndex] = useState(0);
  const titleId = useId();
  const wishes = brief.wishes;
  if (wishes.length === 0) {
    return (
      <section className="brief-section" aria-labelledby={titleId}>
        <h3 id={titleId} className="brief-eyebrow">
          {t('dailyInsights.brief.impulse.title')}
        </h3>
        <div className="brief-impulse">
          <strong>{t('dailyInsights.brief.impulse.emptyTitle')}</strong>
          <p>{t('dailyInsights.brief.impulse.emptyBody')}</p>
          <AddActionLink
            to={WISH_CREATE_ROUTE}
            label={t('dailyInsights.brief.impulse.addWish')}
          />
        </div>
      </section>
    );
  }
  const wish = wishes[index % wishes.length];
  const since = new Intl.DateTimeFormat(resolvedLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(wish.createdOn);
  const suggested = brief.suggestedDate ? iso(brief.suggestedDate) : null;
  const openConversion = () => {
    const key = captureOrigin({
      planningConvertDraft: {
        title: wish.title,
        ...(suggested ? { plannedOn: suggested } : {}),
      },
    });
    void navigate(wishDetailPath(wish.wishId), {
      state: { taskOriginKey: key },
    });
  };
  return (
    <section className="brief-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="brief-eyebrow">
        {t('dailyInsights.brief.impulse.title')}
      </h3>
      <div className="brief-impulse" key={wish.wishId}>
        <strong className="brief-impulse-title">{wish.title}</strong>
        <span className="brief-impulse-source">
          <InsightIcon name="sparkle" />
          {wish.own
            ? t('dailyInsights.brief.impulse.sourceOwn', { date: since })
            : t('dailyInsights.brief.impulse.sourcePartner', {
                date: since,
                name: partnerName,
              })}
        </span>
        {suggested ? (
          <p>
            {t('dailyInsights.brief.impulse.rhythm', {
              weekday: t(
                `dailyInsights.weekdayAdverb.${weekdayIndex(suggested)}`,
              ),
              date: formatDayLong(suggested),
            })}
          </p>
        ) : null}
        <div className="brief-actions">
          <AddActionButton
            type="button"
            label={t('dailyInsights.brief.impulse.plan')}
            onClick={openConversion}
          />
          {wishes.length > 1 ? (
            <button
              type="button"
              className="secondary-link brief-text-button"
              onClick={() => setIndex((current) => current + 1)}
            >
              {t('dailyInsights.brief.impulse.next')}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The rule-based weekly brief (#2169): one reading flow from what did the
 * couple good, through what needs a conversation, to one idea that becomes a
 * Plan. Every statement comes from the server; nothing is inferred here.
 */
export function WeeklyBrief({
  brief,
  days,
  people,
  modules,
  spaceId,
  mediaApis,
  historySearch,
}: {
  brief: WeeklyBriefView;
  days: readonly InsightDay[];
  people: readonly InsightPerson[];
  modules: InsightModules;
  spaceId: string;
  mediaApis: ReferenceApis | null;
  /** The selected week travels to the history view. */
  historySearch: string;
}) {
  const { t } = useTranslation();
  const [basisOpen, setBasisOpen] = useState(false);
  const basisId = useId();
  const attentionId = useId();
  const goodId = useId();
  const newId = useId();
  const partnerName =
    people.find((person) => person.key === 'partner')?.name ??
    t('dailyInsights.people.partnerFallback');
  const dimensions: ChartDimension[] = [
    ...(modules.vibe ? (['vibe'] as const) : []),
    ...(modules.energy ? (['energy'] as const) : []),
  ];
  const followUp = brief.followUp;
  const observations = brief.newObservations.map((fact) => ({
    fact,
    text: observationText(t, fact),
  }));

  return (
    <div className="weekly-brief">
      <div className="brief-coverage">
        <span>
          {t('dailyInsights.brief.coverage', {
            count: brief.jointDays,
            total: brief.elapsedDays,
          })}
        </span>
        <button
          type="button"
          className="brief-text-button"
          aria-expanded={basisOpen}
          aria-controls={basisId}
          onClick={() => setBasisOpen((open) => !open)}
        >
          {t('dailyInsights.brief.basisToggle')}
        </button>
        <p id={basisId} className="brief-basis" hidden={!basisOpen}>
          {t('dailyInsights.brief.basis')}
        </p>
      </div>

      {followUp ? (
        <section
          className="brief-follow-up"
          aria-label={t('dailyInsights.brief.followUp.title')}
        >
          <p className="brief-eyebrow">
            {t('dailyInsights.brief.followUp.title')}
          </p>
          <p>
            {followUp.title
              ? t('dailyInsights.brief.followUp.body', {
                  title: followUp.title,
                  date: formatDayLong(iso(followUp.plannedOn)),
                })
              : t('dailyInsights.brief.followUp.bodyUntitled', {
                  date: formatDayLong(iso(followUp.plannedOn)),
                })}
          </p>
          <Link className="secondary-link" to={planDetailPath(followUp.planId)}>
            {t('dailyInsights.brief.followUp.open')}
          </Link>
        </section>
      ) : null}

      <Headline brief={brief} />

      <section className="brief-section" aria-labelledby={goodId}>
        <h3 id={goodId} className="brief-eyebrow">
          {t('dailyInsights.brief.good.title')}
        </h3>
        <HighlightMoment
          brief={brief}
          spaceId={spaceId}
          mediaApis={mediaApis}
        />
        <DayStrip
          days={days}
          brief={brief}
          people={people}
          dimensions={dimensions}
        />
      </section>

      {brief.attention ? (
        <section className="brief-section" aria-labelledby={attentionId}>
          <h3 id={attentionId} className="brief-eyebrow">
            {t('dailyInsights.brief.attention.title')}
          </h3>
          <p className="brief-statement">
            {t(`dailyInsights.brief.attention.${brief.attention}`, {
              count: brief.attentionDays,
              name: partnerName,
            })}
          </p>
          <p>{t('dailyInsights.brief.attention.body')}</p>
          <p className="brief-prompt">
            {t('dailyInsights.brief.attention.prompt')}
          </p>
        </section>
      ) : null}

      <Impulse brief={brief} partnerName={partnerName} />

      {observations.length > 0 ? (
        <section className="brief-section" aria-labelledby={newId}>
          <h3 id={newId} className="brief-eyebrow">
            {t('dailyInsights.brief.newPatterns.title')}
          </h3>
          <ul className="brief-observations">
            {observations.map(({ fact, text }) => (
              <li key={fact.key}>{text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        className="brief-history"
        to={{ pathname: MORE_INSIGHTS_WEEK_ROUTE, search: historySearch }}
      >
        <span>{t('dailyInsights.brief.history')}</span>
        <InsightIcon name="trend" />
      </Link>
    </div>
  );
}
