import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { RecommendationKey } from '../api/generated/models/RecommendationKey';
import type { RecommendationRating } from '../api/generated/models/RecommendationRating';
import type { WeeklyReviewView } from '../api/generated/models/WeeklyReviewView';
import { assertOnlineWrite } from '../client/connectivity';
import { useTranslation } from '../i18n';
import './WeeklyInsightCard.css';

interface Props {
  api: DailyCheckInsApi;
  instance: string;
  accountId: string;
  spaceId: string;
  monday: string;
}
/** Ephemeral, caller-scoped results. Only a deliberate action runs inference. */
export function WeeklyInsightCard(props: Props) {
  return (
    <WeeklyInsightContent
      key={JSON.stringify([
        props.instance,
        props.accountId,
        props.spaceId,
        props.monday,
      ])}
      {...props}
    />
  );
}
function WeeklyInsightContent({
  api,
  instance,
  accountId,
  spaceId,
  monday,
}: Props) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const scope = JSON.stringify([instance, accountId, spaceId, monday]);
  const [requested, setRequested] = useState(false);
  const [result, setResult] = useState<{
    scope: string;
    value: WeeklyReviewView;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  useEffect(() => () => operation.current?.abort(), []);
  const queryKey = ['weekly-insight', instance, accountId, spaceId, monday];
  const queryOptions = {
    queryKey,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.getDailyCheckInWeeklyReview(
        { spaceId, weekStart: new Date(`${monday}T00:00:00Z`) },
        { signal },
      ),
    gcTime: 0,
    retry: false as const,
  };
  const query = useQuery({
    ...queryOptions,
    enabled: requested,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  });
  const visible =
    result?.scope === scope &&
    query.data?.evidenceToken === result.value.evidenceToken &&
    !query.error &&
    !query.isFetching
      ? result.value
      : null;
  const feedback = query.data?.feedback ?? [];
  const date = (value: Date) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value);
  async function generate() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      assertOnlineWrite();
      setRequested(true);
      const fresh = await client.fetchQuery({ ...queryOptions, staleTime: 0 });
      assertOnlineWrite();
      if (controller.signal.aborted || liveScope.current !== scope) return;
      const value = await api.createDailyCheckInWeeklyReview(
        {
          spaceId,
          weeklyReviewRequest: {
            weekStart: new Date(`${monday}T00:00:00Z`),
            evidenceToken: fresh.evidenceToken,
          },
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || liveScope.current !== scope) return;
      client.setQueryData(queryKey, value);
      setResult({ scope, value });
    } catch {
      if (!controller.signal.aborted && liveScope.current === scope)
        setError(true);
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted && liveScope.current === scope)
        setBusy(false);
    }
  }
  async function rate(
    key: RecommendationKey,
    rating: RecommendationRating | null,
  ) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(false);
    try {
      assertOnlineWrite();
      const confirmed = await api.setDailyCheckInWeeklyFeedback(
        { spaceId, recommendationKey: key, weeklyFeedbackUpdate: { rating } },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || liveScope.current !== scope) return;
      client.setQueryData<WeeklyReviewView>(queryKey, (old) =>
        old
          ? {
              ...old,
              feedback: [
                ...old.feedback.filter(
                  (entry) => entry.recommendationKey !== key,
                ),
                ...(confirmed.rating === null ? [] : [confirmed]),
              ],
            }
          : old,
      );
    } catch {
      if (!controller.signal.aborted && liveScope.current === scope)
        setError(true);
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted && liveScope.current === scope)
        setBusy(false);
    }
  }
  return (
    <section className="weekly-review" aria-labelledby="weekly-review-title">
      <div className="weekly-review-intro">
        <p className="weekly-review-eyebrow">{t('weeklyInsights.eyebrow')}</p>
        <h2 id="weekly-review-title">{t('weeklyInsights.title')}</h2>
        <p>{t('weeklyInsights.intro')}</p>
      </div>
      {busy || query.isFetching ? (
        <p role="status">{t('weeklyInsights.loading')}</p>
      ) : null}
      {error || query.error ? (
        <p role="alert">{t('weeklyInsights.error')}</p>
      ) : null}
      {!visible && result && !busy && !query.isFetching && !query.error ? (
        <p role="status">{t('weeklyInsights.changed')}</p>
      ) : null}
      {visible ? (
        <div className="weekly-review-result">
          <p className="weekly-review-source">
            {t(
              visible.general
                ? 'weeklyInsights.general'
                : visible.generatedBy === 'AI'
                  ? 'weeklyInsights.ai'
                  : 'weeklyInsights.rules',
            )}
          </p>
          <p className="weekly-review-source">
            {t('weeklyInsights.range', {
              start: date(visible.historyStart),
              end: date(visible.historyEnd),
            })}
          </p>
          {visible.general ? (
            <p>{t('weeklyInsights.sparse')}</p>
          ) : (
            <>
              <ul className="weekly-review-facts">
                {visible.observations.map((fact) => (
                  <li key={fact.key}>
                    <p>
                      {t(`weeklyInsights.facts.${fact.kind}`, {
                        value: fact.value,
                        weekday: new Intl.DateTimeFormat(
                          i18n.resolvedLanguage,
                          { weekday: 'long', timeZone: 'UTC' },
                        ).format(
                          new Date(Date.UTC(2026, 0, 5 + (fact.weekday ?? 0))),
                        ),
                      })}
                    </p>
                    <small>
                      {t('weeklyInsights.samples', { count: fact.sampleCount })}
                    </small>
                  </li>
                ))}
              </ul>
              <p className="weekly-review-source">
                {t('weeklyInsights.limits')}
              </p>
            </>
          )}
          <h3>{t('weeklyInsights.recommendationsTitle')}</h3>
          <p>{t('weeklyInsights.optional')}</p>
          <ul className="weekly-review-recommendations">
            {visible.recommendations.map((key) => {
              const rating = feedback.find(
                (entry) => entry.recommendationKey === key,
              )?.rating;
              return (
                <li key={key}>
                  <h4>{t(`weeklyInsights.recommendations.${key}.title`)}</h4>
                  <p>{t(`weeklyInsights.recommendations.${key}.body`)}</p>
                  <fieldset
                    className="weekly-review-feedback"
                    aria-label={t('weeklyInsights.feedbackFor', {
                      title: t(`weeklyInsights.recommendations.${key}.title`),
                    })}
                  >
                    {(['HELPFUL', 'NOT_FITTING'] as const).map((value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={rating === value}
                        disabled={busy}
                        onClick={() =>
                          void rate(key, rating === value ? null : value)
                        }
                      >
                        {t(`weeklyInsights.ratings.${value}`)}
                      </button>
                    ))}
                  </fieldset>
                </li>
              );
            })}
          </ul>
          {visible.recommendations.length === 0 ? (
            <p>{t('weeklyInsights.allExcluded')}</p>
          ) : null}
          <p className="weekly-review-source">
            {t('weeklyInsights.feedbackPrivacy')}
          </p>
          {feedback.length > 0 ? (
            <details>
              <summary>{t('weeklyInsights.manageFeedback')}</summary>
              <ul className="weekly-review-preferences">
                {feedback.map((entry) => (
                  <li key={entry.recommendationKey}>
                    <span>
                      {t(
                        `weeklyInsights.recommendations.${entry.recommendationKey}.title`,
                      )}{' '}
                      · {t(`weeklyInsights.ratings.${entry.rating}`)}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void rate(entry.recommendationKey, null)}
                    >
                      {t('weeklyInsights.clear')}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="weekly-review-generate"
        disabled={busy || query.isFetching}
        onClick={() => void generate()}
      >
        {t(visible ? 'weeklyInsights.regenerate' : 'weeklyInsights.generate')}
      </button>
    </section>
  );
}

/** A retained private preference can be removed after a Pro downgrade. */
export function ClearWeeklyInsightFeedback({
  api,
  spaceId,
}: Pick<Props, 'api' | 'spaceId'>) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function clear() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    try {
      assertOnlineWrite();
      setState('saving');
      const keys: RecommendationKey[] = [
        'quiet_time',
        'small_plan',
        'appreciation',
        'listening',
        'own_pace',
        'keep_ritual',
      ];
      const results = await Promise.allSettled(
        keys.map((recommendationKey) =>
          api.setDailyCheckInWeeklyFeedback(
            {
              spaceId,
              recommendationKey,
              weeklyFeedbackUpdate: { rating: null },
            },
            { signal: controller.signal },
          ),
        ),
      );
      if (!controller.signal.aborted)
        setState(
          results.every((result) => result.status === 'fulfilled')
            ? 'saved'
            : 'error',
        );
    } catch {
      if (!controller.signal.aborted) setState('error');
    } finally {
      if (active.current === controller) active.current = null;
    }
  }
  return (
    <div className="weekly-feedback-clear">
      <button
        type="button"
        className="button-secondary"
        onClick={() => void clear()}
        disabled={state === 'saving'}
      >
        {t('weeklyInsights.clearAll')}
      </button>
      {state === 'saved' ? (
        <p role="status">{t('weeklyInsights.cleared')}</p>
      ) : null}
      {state === 'error' ? (
        <p role="alert">{t('weeklyInsights.clearError')}</p>
      ) : null}
    </div>
  );
}
